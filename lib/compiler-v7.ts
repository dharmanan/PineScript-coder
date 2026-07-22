import { compilePine as compileBase } from "./compiler-v6";
import type { StrategyConfig } from "./types";

export function compilePine(config: StrategyConfig): string {
  let code = compileBase(config);
  const hasVisualRisk = config.outputMode === "indicator" && (config.risk.stopMode !== "none" || config.risk.takeProfitMode !== "none");
  if (!hasVisualRisk || config.direction !== "long_short") return code;

  const anchor = "if longSignal\n    riskEntry := close";
  const reversalBlock = `oppositeSignalReversal = (riskDirection == 1 and shortSignal) or (riskDirection == -1 and longSignal)
if oppositeSignalReversal
    lastRiskOutcome := "REVERSED"
    riskState := lastRiskOutcome
    if showRiskOutcomeLabels
        label.new(bar_index, close, lastRiskOutcome, style=label.style_label_left, color=color.orange, textcolor=color.white, size=size.small)
    riskEntry := na
    riskStop := na
    riskTarget := na
    riskDirection := 0
    riskStartedBar := na

if longSignal
    riskEntry := close`;

  if (!code.includes(anchor)) throw new Error("Compiler transform anchor missing: long risk entry");
  return code.replace(anchor, reversalBlock);
}
