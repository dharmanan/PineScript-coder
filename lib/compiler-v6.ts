import { compilePine as compileBase } from "./compiler-v5";
import type { StrategyConfig } from "./types";

export function compilePine(config: StrategyConfig): string {
  let code = compileBase(config);
  if (config.outputMode === "strategy" || (config.risk.stopMode === "none" && config.risk.takeProfitMode === "none")) return code;

  const oldLabel = 'label.new(bar_index, outcomePrice, lastRiskOutcome, style=label.style_label_left, color=riskStopHit ? color.red : color.green, textcolor=color.white, size=size.small)';
  const newLabel = 'outcomeColor = riskAmbiguous ? color.orange : riskStopHit ? color.red : color.green\n        label.new(bar_index, outcomePrice, lastRiskOutcome, style=label.style_label_left, color=outcomeColor, textcolor=color.white, size=size.small)';

  if (!code.includes(oldLabel)) throw new Error("Compiler transform anchor missing: risk outcome color");
  return code.replace(oldLabel, newLabel);
}
