import { compilePine as compileBase } from "./compiler-v28";
import type { StrategyConfig } from "./types";

// Where a script's drawings land should not depend on which pane TradingView happens to put
// the indicator in. The nine presets that carry an integrated RSI pane already have that
// guarantee: compiler-v14 declares them overlay=false and pins every drawing to the main
// chart with force_overlay=true, so the price visuals stay on the candles no matter what the
// saved layout does with the pane.
//
// Every other script — Supertrend Volume, and any custom configuration — declared
// overlay=true and pinned nothing, which reads as equivalent but is not: overlay=true only
// sets where the indicator opens. Once it sits in a separate pane, whether from a saved
// layout or from being added to an existing one, the supertrend, stop and target lines, the
// LONG/SHORT labels and the dashboard all move into that pane and plot against its own
// scale. It was the one preset whose appearance could go wrong, and it did.
//
// This gives those scripts the same pin. It does not touch the declaration, so nothing
// changes about where an indicator opens; it only stops the drawings from following it.
const appendForceOverlay = (line: string): string =>
  line.includes("force_overlay=") ? line : `${line.slice(0, -1)}, force_overlay=true)`;

export function compilePine(config: StrategyConfig): string {
  const code = compileBase(config);

  if (config.outputMode !== "indicator") return code;
  // Anything already on the pane path was pinned by compiler-v14; leaving it alone keeps the
  // RSI plots themselves in the pane, which is where they belong.
  if (!code.includes("overlay=true, max_labels_count=500, max_lines_count=500)")) return code;

  let pinned = 0;
  let pinnedCode = code.replace(/^(bgcolor|plot|plotshape)\(.*\)$/gm, (line) => {
    pinned += 1;
    return appendForceOverlay(line);
  });

  pinnedCode = pinnedCode.replace(/^\s*label\.new\(.*\)$/gm, (line) => {
    pinned += 1;
    return appendForceOverlay(line);
  });

  if (pinned === 0) throw new Error("Compiler transform anchor missing: main-chart visuals");

  if (config.execution.showDashboard) {
    const tablePattern = /var table dashboard = table\.new\(position\.top_right, 2, (\d+), border_width=1\)/;
    if (!tablePattern.test(pinnedCode)) {
      throw new Error("Compiler transform anchor missing: dashboard table");
    }
    pinnedCode = pinnedCode.replace(
      tablePattern,
      "var table dashboard = table.new(position.top_right, 2, $1, border_width=1, force_overlay=true)"
    );
  }

  return pinnedCode;
}
