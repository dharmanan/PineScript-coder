import { compilePine as compileBase } from "./compiler-v19";
import type { StrategyConfig } from "./types";

export function compilePine(config: StrategyConfig): string {
  let code = compileBase(config);
  const hasVisualRisk =
    config.outputMode === "indicator" &&
    config.direction !== "spot_buy_exit" &&
    config.risk.stopMode !== "none";

  if (!hasVisualRisk) return code;

  const outcomeInputAnchor = 'showRiskOutcomeLabels = input.bool(true, "Show stop/target outcome labels")';
  if (!code.includes(outcomeInputAnchor)) {
    throw new Error("Compiler transform anchor missing: stop confirmation input");
  }

  const defaultLabel = config.risk.stopTrigger === "close" ? "Candle close" : "Wick touch";
  code = code.replace(
    outcomeInputAnchor,
    `${outcomeInputAnchor}\nstopConfirmation = input.string("${defaultLabel}", "Stop confirmation", options=["Wick touch", "Candle close"])`
  );

  const replacements: Array<[string, string]> = [
    [
      "longStopHit = riskCanResolve and riskDirection == 1 and not na(riskStop) and low <= riskStop",
      'longStopHit = riskCanResolve and riskDirection == 1 and not na(riskStop) and (stopConfirmation == "Candle close" ? close <= riskStop : low <= riskStop)'
    ],
    [
      "shortStopHit = riskCanResolve and riskDirection == -1 and not na(riskStop) and high >= riskStop",
      'shortStopHit = riskCanResolve and riskDirection == -1 and not na(riskStop) and (stopConfirmation == "Candle close" ? close >= riskStop : high >= riskStop)'
    ]
  ];

  for (const [search, replacement] of replacements) {
    if (!code.includes(search)) {
      throw new Error(`Compiler transform anchor missing: ${search}`);
    }
    code = code.replace(search, replacement);
  }

  return code;
}
