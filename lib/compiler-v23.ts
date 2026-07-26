import { compilePine as compileBase } from "./compiler-v22";
import type { StrategyConfig } from "./types";

const CELL_STYLE = "bgcolor=color.new(color.rgb(15, 23, 42), 8), text_size=size.normal";

const replaceRequired = (source: string, search: string, replacement: string, label: string): string => {
  if (!source.includes(search)) throw new Error(`Compiler transform anchor missing: ${label}`);
  return source.replace(search, replacement);
};

export function compilePine(config: StrategyConfig): string {
  let code = compileBase(config);

  // Outcome counting only makes sense when a resolved trade can be a win or a loss:
  // an indicator that carries both a stop and a target on a directional position.
  const canCountOutcomes =
    config.outputMode === "indicator" &&
    config.direction !== "spot_buy_exit" &&
    config.risk.stopMode !== "none" &&
    config.risk.takeProfitMode !== "none" &&
    config.execution.showDashboard;

  if (!canCountOutcomes) return code;

  code = replaceRequired(
    code,
    'showRiskOutcomeLabels = input.bool(true, "Show stop/target outcome labels")',
    'showRiskOutcomeLabels = input.bool(true, "Show stop/target outcome labels")\n' +
      'costPerSide = input.float(0.01, "Commission + slippage per side (%)", minval=0, step=0.01)\n' +
      // The window defaults to 2026 through the end of 2028 rather than to everything the
      // chart holds. Starting in 2026 keeps the count on the market the reader is actually
      // trading instead of averaging it with 2019-2021, and the upper bound sits far enough
      // ahead that the counter keeps picking up new trades as months pass — a bound that
      // expires reads as a broken indicator. The bound is exclusive, so 2029-01-01 is how
      // "through the end of 2028" is written.
      'countFrom = input.time(timestamp("2026-01-01T00:00:00+0000"), "Count trades entered from")\n' +
      'countUntil = input.time(timestamp("2029-01-01T00:00:00+0000"), "Count trades entered until")',
    "stop/target outcome label input"
  );

  code = replaceRequired(
    code,
    "var float lastOutcomePrice = na",
    "var float lastOutcomePrice = na\nvar int riskWinCount = 0\nvar int riskLossCount = 0\nvar float riskNetR = 0.0",
    "last outcome price state"
  );

  // Stop and target resolution. Ambiguous bars are charged as a full -1R loss so the
  // counter never reports a win the chart cannot prove. A trade counts as a win only
  // when it is still positive after both sides of the commission.
  // A close-confirmed stop already closed beyond the level, so the fill is the close and
  // the loss is larger than one unit. Recording the level instead would flatter every
  // close-confirmed configuration.
  code = code.replace(
    "outcomePrice = riskAmbiguous ? math.avg(riskStop, riskTarget) : riskStopHit ? riskStop : riskTarget",
    'outcomeStopFill = stopConfirmation == "Candle close" ? close : riskStop\n' +
      "    outcomePrice = riskAmbiguous ? outcomeStopFill : riskStopHit ? outcomeStopFill : riskTarget"
  );

  code = replaceRequired(
    code,
    "lastOutcomePrice := outcomePrice",
    "lastOutcomePrice := outcomePrice\n" +
      "    outcomeRiskUnit = riskDirection == 1 ? riskEntry - riskStop : riskStop - riskEntry\n" +
      "    outcomeGrossR = riskAmbiguous ? -1.0 : (riskDirection == 1 ? (outcomePrice - riskEntry) / outcomeRiskUnit : (riskEntry - outcomePrice) / outcomeRiskUnit)\n" +
      "    outcomeR = outcomeRiskUnit > 0 ? outcomeGrossR - costPerSide / 100.0 * (riskEntry + outcomePrice) / outcomeRiskUnit : na\n" +
      "    countOutcome = not na(outcomeR) and not na(riskStartedTime) and riskStartedTime >= countFrom and riskStartedTime < countUntil\n" +
      "    riskNetR := riskNetR + (countOutcome ? outcomeR : 0.0)\n" +
      "    riskWinCount := riskWinCount + (countOutcome and outcomeR > 0 ? 1 : 0)\n" +
      "    riskLossCount := riskLossCount + (countOutcome and outcomeR <= 0 ? 1 : 0)",
    "resolved outcome price"
  );

  // Opposite-signal reversals close a position without touching stop or target.
  // They are scored by their realized sign so the counter covers every closed trade.
  if (code.includes('lastRiskOutcome := "REVERSED"')) {
    code = replaceRequired(
      code,
      "lastOutcomePrice := close",
      "lastOutcomePrice := close\n" +
        "    reversalRiskUnit = riskDirection == 1 ? riskEntry - riskStop : riskStop - riskEntry\n" +
        "    reversalGrossR = riskDirection == 1 ? (close - riskEntry) / reversalRiskUnit : (riskEntry - close) / reversalRiskUnit\n" +
        "    reversalR = reversalRiskUnit > 0 ? reversalGrossR - costPerSide / 100.0 * (riskEntry + close) / reversalRiskUnit : na\n" +
        "    countReversal = not na(reversalR) and not na(riskStartedTime) and riskStartedTime >= countFrom and riskStartedTime < countUntil\n" +
        "    riskNetR := riskNetR + (countReversal ? reversalR : 0.0)\n" +
        "    riskWinCount := riskWinCount + (countReversal and reversalR > 0 ? 1 : 0)\n" +
        "    riskLossCount := riskLossCount + (countReversal and reversalR <= 0 ? 1 : 0)",
      "reversal outcome price"
    );
  }

  code = code.replace(
    /var table dashboard = table\.new\(position\.top_right, 2, (\d+), border_width=1(, force_overlay=true)?\)/,
    (_match, rows: string, overlay: string | undefined) =>
      `var table dashboard = table.new(position.top_right, 2, ${Number(rows) + 2}, border_width=1${overlay ?? ""})`
  );

  const resultDateValue = /^    table\.cell\(dashboard, 1, (\d+), na\(lastOutcomeTime\).*\)$/m;
  const match = code.match(resultDateValue);
  if (!match) throw new Error("Compiler transform anchor missing: dashboard result date row");

  const countRow = Number(match[1]) + 1;
  const rateRow = countRow + 1;
  const resolved = "(riskWinCount + riskLossCount)";
  const netR = `(riskNetR >= 0 ? "+" : "") + str.tostring(riskNetR, "#.##") + "R"`;

  const replacement =
    `${match[0]}\n` +
    `    table.cell(dashboard, 0, ${countRow}, "Wins / Losses", text_color=color.white, ${CELL_STYLE})\n` +
    `    table.cell(dashboard, 1, ${countRow}, str.tostring(riskWinCount) + " / " + str.tostring(riskLossCount), text_color=color.white, ${CELL_STYLE})\n` +
    `    table.cell(dashboard, 0, ${rateRow}, "Win rate (net)", text_color=color.white, ${CELL_STYLE})\n` +
    `    table.cell(dashboard, 1, ${rateRow}, ${resolved} > 0 ? str.tostring(100.0 * riskWinCount / ${resolved}, "#.#") + "%  (" + ${netR} + ")" : "NO DATA", text_color=${resolved} == 0 ? color.gray : riskNetR > 0 ? color.lime : riskNetR < 0 ? color.red : color.white, ${CELL_STYLE})`;

  return code.replace(match[0], replacement);
}
