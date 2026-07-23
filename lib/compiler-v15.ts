import { compilePine as compileBase } from "./compiler-v14";
import type { StrategyConfig } from "./types";

export function compilePine(config: StrategyConfig): string {
  let code = compileBase(config);
  const alignDivergenceEntries = config.name === "RSI Divergence Reversal" && config.outputMode === "indicator";

  if (!alignDivergenceEntries) return code;

  const paneAnchor = "// === Integrated RSI divergence pane ===";
  const filtersAnchor = "// === Filters and triggers ===";
  const alertsAnchor = "// === Alerts ===";
  const paneStart = code.indexOf(paneAnchor);
  const alertsStart = code.indexOf(alertsAnchor);

  if (paneStart === -1 || alertsStart === -1 || alertsStart <= paneStart || !code.includes(filtersAnchor)) {
    throw new Error("Compiler transform anchor missing: aligned RSI divergence pane");
  }

  const paneBlock = code.slice(paneStart, alertsStart);
  code = code.slice(0, paneStart) + code.slice(alertsStart);

  const legacyDivergencePattern = /\/\/ Confirmed pivot-based RSI divergence\. Pivots appear after right-side bars complete\.[\s\S]*?bearishDivergence = .*\n\n/;
  if (!legacyDivergencePattern.test(code)) {
    throw new Error("Compiler transform anchor missing: legacy divergence calculations");
  }
  code = code.replace(
    legacyDivergencePattern,
    "// Entry divergence is shared with the integrated RSI pane below.\n\n"
  );

  const longSetup = "longSetup = rsiValue >= rsiLongLevel and bullishDivergence and confirmationOk";
  const shortSetup = "shortSetup = rsiValue <= rsiShortLevel and bearishDivergence and confirmationOk";
  if (!code.includes(longSetup) || !code.includes(shortSetup)) {
    throw new Error("Compiler transform anchor missing: divergence reversal entry setup");
  }

  code = code
    .replace(longSetup, "longSetup = rsiValue >= rsiLongLevel and divRegularBullAlert and confirmationOk")
    .replace(shortSetup, "shortSetup = rsiValue <= rsiShortLevel and divRegularBearAlert and confirmationOk");

  return code.replace(filtersAnchor, paneBlock + filtersAnchor);
}
