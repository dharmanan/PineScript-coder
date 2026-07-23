import { compilePine as compileBase } from "./compiler-v17";
import type { StrategyConfig } from "./types";

export function compilePine(config: StrategyConfig): string {
  let code = compileBase(config);
  const alignStrategyDivergence =
    config.outputMode === "strategy" &&
    config.momentum.divergenceEnabled;

  if (!alignStrategyDivergence) return code;

  const legacyDivergencePattern = /\/\/ Confirmed pivot-based RSI divergence\. Pivots appear after right-side bars complete\.[\s\S]*?bearishDivergence = .*\n/;
  if (!legacyDivergencePattern.test(code)) {
    throw new Error("Compiler transform anchor missing: strategy legacy divergence calculations");
  }

  const pivot = config.momentum.divergencePivot;
  const confirmedRegularDivergence = `// Confirmed regular RSI divergence shared with Indicator mode.
divPivotLeft = input.int(${pivot}, "Divergence pivot left", minval=1)
divPivotRight = input.int(${pivot}, "Divergence pivot right", minval=1)
divRangeMinimum = input.int(5, "Divergence minimum pivot range", minval=1)
divRangeMaximum = input.int(60, "Divergence maximum pivot range", minval=2)
divPivotLowFound = not na(ta.pivotlow(rsiValue, divPivotLeft, divPivotRight))
divPivotHighFound = not na(ta.pivothigh(rsiValue, divPivotLeft, divPivotRight))
divInRange(condition) =>
    divBarsSince = ta.barssince(condition)
    divRangeMinimum <= divBarsSince and divBarsSince <= divRangeMaximum
divPreviousLowInRange = divInRange(divPivotLowFound[1])
divRsiHigherLow = rsiValue[divPivotRight] > ta.valuewhen(divPivotLowFound, rsiValue[divPivotRight], 1) and divPreviousLowInRange
divPriceLowerLow = low[divPivotRight] < ta.valuewhen(divPivotLowFound, low[divPivotRight], 1)
bullishDivergence = divPriceLowerLow and divRsiHigherLow and divPivotLowFound
divPreviousHighInRange = divInRange(divPivotHighFound[1])
divRsiLowerHigh = rsiValue[divPivotRight] < ta.valuewhen(divPivotHighFound, rsiValue[divPivotRight], 1) and divPreviousHighInRange
divPriceHigherHigh = high[divPivotRight] > ta.valuewhen(divPivotHighFound, high[divPivotRight], 1)
bearishDivergence = divPriceHigherHigh and divRsiLowerHigh and divPivotHighFound
`;

  code = code.replace(legacyDivergencePattern, confirmedRegularDivergence);
  return code;
}
