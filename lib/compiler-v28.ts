import { compilePine as compileBase } from "./compiler-v27";
import type { StrategyConfig } from "./types";

// Swing-structure bias, the one ICT mechanism that beat the higher-timeframe average on
// development, validation and the 2026 holdout at once (research/preset-sweep,
// run-sweep-ict.mjs). It answers the same question as htfBull — which side is allowed —
// but reads the last two confirmed highs and lows instead of waiting for an average to
// turn, so it flips on the structural break rather than after it.
//
// ta.pivothigh(left, right) publishes a pivot `right` bars after it formed, never on the
// bar itself, so nothing here reads a candle that has not closed.
export function compilePine(config: StrategyConfig): string {
  const code = compileBase(config);

  if (config.biasSource !== "swing_structure") return code;
  if (config.outputMode !== "indicator" && config.outputMode !== "strategy") return code;
  if (!code.includes("structureBull")) return code;

  const lookback = Math.max(1, Math.round(config.swingLookback));
  const anchor = code.match(/^atrLen = input\.int\([^\n]*\)$/m);
  if (!anchor) throw new Error("Compiler transform anchor missing: ATR length input");

  const inputs = [
    anchor[0],
    `swingLookback = input.int(${lookback}, "Swing pivot lookback", minval=1)`
  ].join("\n");

  const block = [
    "",
    "// === Swing structure bias ===",
    "// A pivot is only known once its right-hand window closes, which is exactly when",
    "// ta.pivothigh reports it. Holding the last two of each gives the classic reading:",
    "// higher highs with higher lows is bullish, lower highs with lower lows is bearish.",
    "swingHighPivot = ta.pivothigh(high, swingLookback, swingLookback)",
    "swingLowPivot = ta.pivotlow(low, swingLookback, swingLookback)",
    "var float lastSwingHigh = na",
    "var float prevSwingHigh = na",
    "var float lastSwingLow = na",
    "var float prevSwingLow = na",
    "if not na(swingHighPivot)",
    "    prevSwingHigh := lastSwingHigh",
    "    lastSwingHigh := swingHighPivot",
    "if not na(swingLowPivot)",
    "    prevSwingLow := lastSwingLow",
    "    lastSwingLow := swingLowPivot",
    "structureReady = not na(lastSwingHigh) and not na(prevSwingHigh) and not na(lastSwingLow) and not na(prevSwingLow)",
    "higherHighs = structureReady and lastSwingHigh > prevSwingHigh",
    "higherLows = structureReady and lastSwingLow > prevSwingLow",
    "lowerHighs = structureReady and lastSwingHigh < prevSwingHigh",
    "lowerLows = structureReady and lastSwingLow < prevSwingLow",
    "// When highs and lows disagree the reading falls back to where price sits inside the",
    "// last swing range, so a bias exists whenever two of each have formed.",
    "structureMid = structureReady ? lastSwingLow + (lastSwingHigh - lastSwingLow) / 2 : na",
    "structureBull = not structureReady ? false :",
    "     higherHighs and higherLows ? true :",
    "     lowerHighs and lowerLows ? false :",
    "     higherHighs or higherLows ? true :",
    "     lowerHighs or lowerLows ? false :",
    "     close > structureMid",
    "structureBear = structureReady and not structureBull",
    ""
  ].join("\n");

  const withInputs = code.replace(anchor[0], inputs);
  return withStructureRow(insertBlock(withInputs, block), config);
}

// Pine resolves top to bottom, so the block has to precede every line that reads it — and
// the first of those is longSetup, not the signal state further down. Anchoring on the
// filter section header puts it after the inputs and calculations it depends on and before
// longSetup, longScoreRaw and everything else.
function insertBlock(code: string, block: string): string {
  const anchor = "// === Filters and triggers ===";
  if (!code.includes(anchor)) throw new Error("Compiler transform anchor missing: filters and triggers section");
  return code.replace(anchor, `${block}${anchor}`);
}

// The dashboard already reports the higher-timeframe bias for presets that use one; this
// replaces it with what actually gates the signal, so the panel never explains a decision
// the script did not make.
function withStructureRow(code: string, config: StrategyConfig): string {
  if (!config.execution.showDashboard) return code;

  const cells = [...code.matchAll(/^    table\.cell\(dashboard, \d+, (\d+),.*$/gm)];
  if (!cells.length) throw new Error("Compiler transform anchor missing: dashboard cells");
  const lastCell = cells[cells.length - 1];
  const row = Math.max(...cells.map((cell) => Number(cell[1]))) + 1;
  const style = "bgcolor=color.new(color.rgb(15, 23, 42), 8), text_size=size.normal";
  const value = 'not structureReady ? "FORMING" : structureBull ? "BULL" : "BEAR"';
  const colour = 'not structureReady ? color.gray : structureBull ? color.lime : color.red';

  const grown = code.replace(
    /var table dashboard = table\.new\(position\.top_right, 2, (\d+), border_width=1(, force_overlay=true)?\)/,
    (_match, rows: string, overlay: string | undefined) =>
      `var table dashboard = table.new(position.top_right, 2, ${Number(rows) + 1}, border_width=1${overlay ?? ""})`
  );

  return grown.replace(
    lastCell[0],
    `${lastCell[0]}\n` +
      `    table.cell(dashboard, 0, ${row}, "Structure", text_color=color.white, ${style})\n` +
      `    table.cell(dashboard, 1, ${row}, ${value}, text_color=${colour}, ${style})`
  );
}
