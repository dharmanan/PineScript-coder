import { compilePine as compileBase } from "./compiler-v15";
import type { StrategyConfig } from "./types";

export function compilePine(config: StrategyConfig): string {
  let code = compileBase(config);
  const refineDivergenceReversal =
    config.presetId === "rsi_divergence_reversal" &&
    config.outputMode === "indicator";

  if (!refineDivergenceReversal) return code;

  const divergenceRsiInput = `divRsiLength = input.int(${config.momentum.rsiLength}, "Divergence RSI period", minval=1)`;
  const divergenceRsiCalculation = "divRsi = ta.rsi(close, divRsiLength)";
  if (!code.includes(divergenceRsiInput) || !code.includes(divergenceRsiCalculation)) {
    throw new Error("Compiler transform anchor missing: divergence RSI consistency");
  }

  code = code
    .replace(divergenceRsiInput, "// Divergence reuses the main RSI period and source.")
    .replace(divergenceRsiCalculation, "divRsi = rsiValue");

  const longRiskEntryPattern = /^if longSignal\n(?=    riskEntry := close$)/m;
  const shortRiskEntryPattern = /^if shortSignal\n(?=    riskEntry := close$)/m;
  if (!longRiskEntryPattern.test(code) || !shortRiskEntryPattern.test(code)) {
    throw new Error("Compiler transform anchor missing: indicator risk entry lifecycle");
  }

  code = code
    .replace(longRiskEntryPattern, "if longSignal and riskDirection == 0\n")
    .replace(shortRiskEntryPattern, "if shortSignal and riskDirection == 0\n");

  return code;
}
