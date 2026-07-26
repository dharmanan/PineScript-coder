import { compilePine as compileBase } from "./compiler-v25";
import { buildBehaviorPlan } from "./behavior-plan";
import type { PlanFilter } from "./behavior-plan";
import type { StrategyConfig } from "./types";

// Hard constraints, never scored: outside these the trade is impossible, not merely weaker.
const MANDATORY = new Set(["confirmation", "session"]);

// Weights follow the Kohen Dive V5.3 scheme: regime and momentum carry the signal,
// confirmation-style filters contribute but never veto on their own.
const WEIGHTS: Record<string, number> = {
  ema_trend: 30,
  supertrend: 30,
  htf_bias: 25,
  // Replaces htf_bias and answers the same question, so it carries the same weight: a
  // different one would change the score as well as where the bias came from.
  structure_bias: 25,
  adx: 25,
  divergence: 25,
  rsi: 15,
  macd: 15,
  vwap: 15,
  long_ma: 10,
  volume: 10
};

const expressionFor = (filter: PlanFilter, direction: "long" | "short"): string | undefined =>
  direction === "long" ? filter.longExpression : filter.shortExpression;

const scoreLine = (
  filters: PlanFilter[],
  direction: "long" | "short"
): { raw: string; total: number } | null => {
  const parts: string[] = [];
  let total = 0;
  for (const filter of filters) {
    const weight = WEIGHTS[filter.id];
    const expression = expressionFor(filter, direction);
    if (!weight || !expression) continue;
    parts.push(`((${expression}) ? ${weight} : 0)`);
    total += weight;
  }
  return parts.length ? { raw: parts.join(" + "), total } : null;
};

const mandatoryLine = (filters: PlanFilter[], direction: "long" | "short"): string => {
  const parts = filters
    .filter((filter) => MANDATORY.has(filter.id))
    .map((filter) => expressionFor(filter, direction))
    .filter((value): value is string => Boolean(value));
  return parts.length ? parts.join(" and ") : "true";
};

export function compilePine(config: StrategyConfig): string {
  let code = compileBase(config);

  if (config.outputMode !== "indicator" || config.direction === "spot_buy_exit") return code;

  const filters = buildBehaviorPlan(config).entry.filters;
  const long = scoreLine(filters, "long");
  if (!long) return code;

  const allowShort = config.direction === "long_short";
  const short = allowShort ? scoreLine(filters, "short") : null;
  if (allowShort && !short) return code;

  code = replaceRequired(
    code,
    'showRiskOutcomeLabels = input.bool(true, "Show stop/target outcome labels")',
    'showRiskOutcomeLabels = input.bool(true, "Show stop/target outcome labels")\n' +
      `signalMode = input.string("${config.signalMode === "score" ? "Score" : "All filters"}", "Signal mode", options=["All filters", "Score"])\n` +
      `scoreThreshold = input.int(${config.scoreThreshold}, "Minimum signal score", minval=0, maxval=100)\n` +
      `triggerWindow = input.int(${config.triggerWindow}, "Trigger window (bars)", minval=1)`,
    "stop/target outcome label input"
  );

  const block: string[] = [
    "",
    "// === Signal score ===",
    "// Every filter contributes points instead of vetoing the signal. The entry trigger",
    "// stays mandatory, so a score only decides whether a triggered setup is good enough.",
    `longScoreRaw = ${long.raw}`,
    `longScore = math.round(100.0 * longScoreRaw / ${long.total})`,
    `longScoreOk = ${mandatoryLine(filters, "long")} and longScore >= scoreThreshold`
  ];
  if (short) {
    block.push(
      `shortScoreRaw = ${short.raw}`,
      `shortScore = math.round(100.0 * shortScoreRaw / ${short.total})`,
      `shortScoreOk = ${mandatoryLine(filters, "short")} and shortScore >= scoreThreshold`
    );
  }
  block.push("");

  code = replaceRequired(
    code,
    "var int lastSignalBar = na",
    `${block.join("\n")}var int lastSignalBar = na`,
    "signal cooldown state"
  );

  // A trigger is a one-bar event while the filters move slowly, so demanding both on the
  // same candle discards setups that become valid a bar or two later. ta.barssince is 0 on
  // the bar the trigger fires, so a window of 1 is the original same-bar rule.
  const windowLines = [
    "longTriggerAge = ta.barssince(longTrigger)",
    "longTriggerActive = not na(longTriggerAge) and longTriggerAge < triggerWindow"
  ];
  if (short) {
    windowLines.push(
      "shortTriggerAge = ta.barssince(shortTrigger)",
      "shortTriggerActive = not na(shortTriggerAge) and shortTriggerAge < triggerWindow"
    );
  }
  code = replaceRequired(
    code,
    "var int lastSignalBar = na",
    `${windowLines.join("\n")}\nvar int lastSignalBar = na`,
    "signal cooldown state"
  );

  code = replaceRequired(
    code,
    "longSetup and longTrigger",
    '(signalMode == "Score" ? longScoreOk : longSetup) and longTriggerActive',
    "long signal composition"
  );
  if (short) {
    code = replaceRequired(
      code,
      "shortSetup and shortTrigger",
      '(signalMode == "Score" ? shortScoreOk : shortSetup) and shortTriggerActive',
      "short signal composition"
    );
  }

  if (!config.execution.showDashboard) return code;

  const cells = [...code.matchAll(/^    table\.cell\(dashboard, \d+, (\d+),.*$/gm)];
  if (!cells.length) throw new Error("Compiler transform anchor missing: dashboard cells");
  const lastCell = cells[cells.length - 1];
  const row = Math.max(...cells.map((cell) => Number(cell[1]))) + 1;
  const style = "bgcolor=color.new(color.rgb(15, 23, 42), 8), text_size=size.normal";
  const scores = short
    ? '"L " + str.tostring(longScore) + " / S " + str.tostring(shortScore)'
    : '"L " + str.tostring(longScore)';
  // The row states whether scoring is actually driving entries, so an unchanged
  // chart is never ambiguous between "mode is off" and "the change did nothing".
  const value = `${scores} + (signalMode == "Score" ? " - min " + str.tostring(scoreThreshold) : " - OFF")`;
  const valueColor = 'signalMode == "Score" ? color.white : color.gray';

  code = code.replace(
    /var table dashboard = table\.new\(position\.top_right, 2, (\d+), border_width=1(, force_overlay=true)?\)/,
    (_match, rows: string, overlay: string | undefined) =>
      `var table dashboard = table.new(position.top_right, 2, ${Number(rows) + 1}, border_width=1${overlay ?? ""})`
  );

  return code.replace(
    lastCell[0],
    `${lastCell[0]}\n` +
      `    table.cell(dashboard, 0, ${row}, "Signal score", text_color=color.white, ${style})\n` +
      `    table.cell(dashboard, 1, ${row}, ${value}, text_color=${valueColor}, ${style})`
  );
}

function replaceRequired(source: string, search: string, replacement: string, label: string): string {
  if (!source.includes(search)) throw new Error(`Compiler transform anchor missing: ${label}`);
  return source.replace(search, replacement);
}
