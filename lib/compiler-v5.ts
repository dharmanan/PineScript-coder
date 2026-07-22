import { compilePine as compileBase } from "./compiler-v4";
import type { StrategyConfig } from "./types";

export function compilePine(config: StrategyConfig): string {
  let code = compileBase(config);
  if (config.outputMode === "strategy" || (config.risk.stopMode === "none" && config.risk.takeProfitMode === "none")) return code;

  const oldBlock = `if riskCanResolve and (riskStopHit or riskTargetHit)
    lastRiskOutcome := riskAmbiguous ? "AMBIGUOUS" : riskStopHit ? "STOP HIT" : "TARGET HIT"
    riskState := lastRiskOutcome
    if showRiskOutcomeLabels
        label.new(bar_index, close, lastRiskOutcome, style=label.style_label_left, color=riskStopHit ? color.red : color.green, textcolor=color.white, size=size.small)`;

  const newBlock = `if riskCanResolve and (riskStopHit or riskTargetHit)
    lastRiskOutcome := riskAmbiguous ? "AMBIGUOUS" : riskStopHit ? "STOP HIT" : "TARGET HIT"
    riskState := lastRiskOutcome
    outcomePrice = riskAmbiguous ? math.avg(riskStop, riskTarget) : riskStopHit ? riskStop : riskTarget
    if showRiskOutcomeLabels
        label.new(bar_index, outcomePrice, lastRiskOutcome, style=label.style_label_left, color=riskStopHit ? color.red : color.green, textcolor=color.white, size=size.small)`;

  if (!code.includes(oldBlock)) throw new Error("Compiler transform anchor missing: risk outcome label block");
  return code.replace(oldBlock, newBlock);
}
