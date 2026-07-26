import { compilePine as compileBase } from "./compiler-v23";
import type { StrategyConfig } from "./types";

const MARKET = "Market (next open)";
const LIMIT = "Limit (pullback)";

// Distance from the signal-bar close to the stop, frozen when the signal fires.
const riskDistance = (config: StrategyConfig, direction: "long" | "short"): string => {
  switch (config.risk.stopMode) {
    case "atr":
      return "atrValue * atrMultiple";
    case "percent":
      return "close * stopPercent";
    case "swing":
      return direction === "long"
        ? "close - ta.lowest(low, swingLen)"
        : "ta.highest(high, swingLen) - close";
    default:
      throw new Error(`Unsupported stop mode for realistic fill: ${config.risk.stopMode}`);
  }
};

const targetLine = (config: StrategyConfig, direction: "long" | "short", price: string): string => {
  const sign = direction === "long" ? "+" : "-";
  switch (config.risk.takeProfitMode) {
    case "risk_reward":
      return `    riskTarget := ${price} ${sign} pendingRisk * riskReward`;
    case "percent":
      return `    riskTarget := ${price} * (1 ${sign} takeProfitPercent)`;
    default:
      return "    riskTarget := na";
  }
};

const fillBlock = (config: StrategyConfig, direction: "long" | "short"): string => {
  const long = direction === "long";
  const code = long ? 1 : -1;
  const name = long ? "long" : "short";
  const state = long ? "ACTIVE LONG" : "ACTIVE SHORT";
  const price = `${name}FillPrice`;
  // A gap through the limit fills at the open, which is the price actually available.
  const limitPrice = long ? "math.min(open, pendingLimit)" : "math.max(open, pendingLimit)";
  const touched = long ? "low <= pendingLimit" : "high >= pendingLimit";

  return [
    `${price} = entryUsesLimit ? ${limitPrice} : open`,
    `${name}FillReady = pendingDirection == ${code} and riskDirection == 0 and pendingRisk > 0 and (not entryUsesLimit or ${touched})`,
    `if ${name}FillReady`,
    `    riskEntry := ${price}`,
    `    riskDirection := ${code}`,
    "    riskStartedBar := bar_index",
    "    riskStartedTime := time",
    `    riskState := "${state}"`,
    `    riskStop := ${price} ${long ? "-" : "+"} pendingRisk`,
    targetLine(config, direction, price),
    "    riskUnit := pendingRisk",
    "    riskBestR := 0.0",
    "    pendingDirection := 0",
    "    pendingRisk := na"
  ].join("\n");
};

const armBlock = (config: StrategyConfig, direction: "long" | "short"): string => {
  const long = direction === "long";
  const signal = long ? "acceptedLongSignal" : "acceptedShortSignal";
  return [
    `if ${signal} and riskDirection == 0`,
    `    pendingDirection := ${long ? 1 : -1}`,
    `    pendingRisk := ${riskDistance(config, direction)}`,
    `    pendingLimit := close ${long ? "-" : "+"} pendingRisk * limitPullback`,
    "    pendingExpires := bar_index + limitExpiryBars"
  ].join("\n");
};

export function compilePine(config: StrategyConfig): string {
  let code = compileBase(config);

  // A signal is only visible once its candle has closed, so the earliest honest
  // market fill is the next candle's open. A limit order can fill inside a candle
  // because its price is fixed in advance, not discovered from that candle.
  const realisticEntry =
    config.outputMode === "indicator" &&
    config.direction !== "spot_buy_exit" &&
    config.risk.stopMode !== "none";

  if (!realisticEntry) return code;

  code = replaceRequired(
    code,
    'showRiskOutcomeLabels = input.bool(true, "Show stop/target outcome labels")',
    'showRiskOutcomeLabels = input.bool(true, "Show stop/target outcome labels")\n' +
      `entryType = input.string("${MARKET}", "Entry type", options=["${MARKET}", "${LIMIT}"])\n` +
      'limitPullback = input.float(0.5, "Limit pullback (x risk)", minval=0, step=0.1)\n' +
      'limitExpiryBars = input.int(5, "Limit order expiry (bars)", minval=1)\n' +
      `breakEvenAtR = input.float(${config.risk.breakEvenAtR}, "Break-even at (R), 0 = off", minval=0, step=0.5)\n` +
      `trailStartR = input.float(${config.risk.trailStartR}, "Trail starts at (R), 0 = off", minval=0, step=0.5)\n` +
      `trailDistanceR = input.float(${config.risk.trailDistanceR}, "Trail distance (R)", minval=0.1, step=0.5)`,
    "stop/target outcome label input"
  );

  code = replaceRequired(
    code,
    'var string lastRiskOutcome = "NONE"',
    'var string lastRiskOutcome = "NONE"\n' +
      "var int pendingDirection = 0\n" +
      "var float pendingRisk = na\n" +
      "var float pendingLimit = na\n" +
      "var int pendingExpires = na\n" +
      "var float riskUnit = na\n" +
      "var float riskBestR = 0.0",
    "risk outcome state"
  );

  const directions: Array<"long" | "short"> =
    config.direction === "long_short" ? ["long", "short"] : ["long"];

  const fills: string[] = [`entryUsesLimit = entryType == "${LIMIT}"`];
  for (const direction of directions) {
    const signal = direction === "long" ? "acceptedLongSignal" : "acceptedShortSignal";
    const pattern = new RegExp(`^if ${signal} and riskDirection == 0\\n(?:    .*\\n)+`, "m");
    const match = code.match(pattern);
    if (!match) throw new Error(`Compiler transform anchor missing: ${signal} risk entry block`);
    code = code.replace(match[0], `${armBlock(config, direction)}\n`);
    fills.push(fillBlock(config, direction));
  }

  // An unfilled limit order is cancelled once it expires, so a stale level never
  // fills days later. Checked after the fills so the expiry bar can still trade.
  fills.push(
    "if pendingDirection != 0 and entryUsesLimit and not na(pendingExpires) and bar_index > pendingExpires",
    "    pendingDirection := 0",
    "    pendingRisk := na"
  );

  // Pending orders resolve before anything else on the bar, so a position opened at
  // this candle can also be reversed or stopped out on the same candle.
  const reversalAnchor = "oppositeSignalReversal = ";
  const armAnchor = `if ${directions[0] === "long" ? "acceptedLongSignal" : "acceptedShortSignal"} and riskDirection == 0`;
  const insertBefore = code.includes(reversalAnchor) ? reversalAnchor : armAnchor;
  code = replaceRequired(code, insertBefore, `${fills.join("\n")}\n\n${insertBefore}`, "pending fill insertion point");

  // The position now exists from its fill candle, so that candle's range can resolve it.
  code = replaceRequired(
    code,
    "riskCanResolve = riskDirection != 0 and not na(riskStartedBar) and bar_index > riskStartedBar",
    "riskCanResolve = riskDirection != 0 and not na(riskStartedBar) and bar_index >= riskStartedBar",
    "risk resolution guard"
  );

  // The outcome is scored against the risk taken at entry. Without this the counter would
  // divide by the moved stop, so a break-even exit would read as a full loss.
  code = code
    .replace(
      "outcomeRiskUnit = riskDirection == 1 ? riskEntry - riskStop : riskStop - riskEntry",
      "outcomeRiskUnit = riskUnit"
    )
    .replace(
      "reversalRiskUnit = riskDirection == 1 ? riskEntry - riskStop : riskStop - riskEntry",
      "reversalRiskUnit = riskUnit"
    );

  // A closed position releases its frozen unit along with everything else.
  code = code.replaceAll("    riskStartedTime := na", "    riskStartedTime := na\n    riskUnit := na");

  // Stop management runs after the resolution check, so a favourable excursion tightens
  // the stop for the next candle rather than the one that produced it. A candle cannot
  // prove the excursion came before the stop touch.
  const management = [
    "",
    "// === Stop management ===",
    "if riskDirection != 0 and not na(riskUnit) and riskUnit > 0",
    "    riskExcursion = riskDirection == 1 ? (high - riskEntry) / riskUnit : (riskEntry - low) / riskUnit",
    "    if riskExcursion > riskBestR",
    "        riskBestR := riskExcursion",
    "    if breakEvenAtR > 0 and riskBestR >= breakEvenAtR",
    "        riskStop := riskDirection == 1 ? math.max(riskStop, riskEntry) : math.min(riskStop, riskEntry)",
    "    if trailStartR > 0 and riskBestR >= trailStartR",
    "        riskTrailed = riskDirection == 1 ? riskEntry + (riskBestR - trailDistanceR) * riskUnit : riskEntry - (riskBestR - trailDistanceR) * riskUnit",
    "        riskStop := riskDirection == 1 ? math.max(riskStop, riskTrailed) : math.min(riskStop, riskTrailed)",
    ""
  ].join("\n");

  const lastRelease = code.lastIndexOf("    riskUnit := na");
  if (lastRelease === -1) throw new Error("Compiler transform anchor missing: risk release");
  const insertAt = code.indexOf("\n", lastRelease) + 1;
  return `${code.slice(0, insertAt)}${management}${code.slice(insertAt)}`;
}

function replaceRequired(source: string, search: string, replacement: string, label: string): string {
  if (!source.includes(search)) throw new Error(`Compiler transform anchor missing: ${label}`);
  return source.replace(search, replacement);
}
