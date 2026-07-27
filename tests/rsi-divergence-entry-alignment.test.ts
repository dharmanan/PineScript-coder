import { describe, expect, it } from "vitest";
import { compilePine } from "../lib/compiler";
import { presets } from "../lib/presets";
import type { StrategyConfig } from "../lib/types";
import { legacyRsiConfig } from "./helpers/legacy-rsi-config";

const rsiPanePresetNames = [
  "Balanced Intraday",
  "Fast EMA Scalper",
  "VWAP Reclaim",
  "Swing Structure Trend",
  "Breakout Momentum",
  "Selective Multi-Timeframe",
  "Long-Term Trend Guard"
] as const;

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

const findPreset = (name: string): StrategyConfig => {
  const preset = presets.find((item) => item.name === name);
  expect(preset, `Missing preset: ${name}`).toBeDefined();
  return clone(preset!);
};

describe("RSI divergence entry alignment", () => {
  it("uses the same regular divergence events for pane labels and entries in the generic compiler", () => {
    const code = compilePine(legacyRsiConfig("indicator"));

    expect(code).toContain("bullishDivergence = divRegularBullAlert");
    expect(code).toContain("bearishDivergence = divRegularBearAlert");
    expect(code).toContain("longSetup = rsiValue >= rsiLongLevel and bullishDivergence and confirmationOk");
    expect(code).toContain("shortSetup = rsiValue <= rsiShortLevel and bearishDivergence and confirmationOk");
    expect(code).not.toContain("pricePivotLow = ta.pivotlow(low, 5, 5)");
    expect(code.indexOf("// === Integrated RSI divergence pane ===")).toBeLessThan(
      code.indexOf("// === Filters and triggers ===")
    );
  });

  for (const name of rsiPanePresetNames) {
    it(`aligns panel and entry divergence for ${name}`, () => {
      const config = findPreset(name);
      config.outputMode = "indicator";
      config.momentum.divergenceEnabled = true;

      const code = compilePine(config);

      expect(code).toContain("// === Integrated RSI divergence pane ===");
      expect(code).toContain("// === Entry divergence aliases ===");
      expect(code).toContain("bullishDivergence = divRegularBullAlert");
      expect(code).toContain("bearishDivergence = divRegularBearAlert");
      expect(code).not.toContain("// Confirmed pivot-based RSI divergence. Pivots appear after right-side bars complete.");
      expect(code.indexOf("// === Integrated RSI divergence pane ===")).toBeLessThan(
        code.indexOf("// === Filters and triggers ===")
      );
    });
  }

  it("keeps the generic strategy output separate from the integrated indicator pane", () => {
    const code = compilePine(legacyRsiConfig("strategy"));

    expect(code).toContain("bullishDivergence =");
    expect(code).not.toContain("// === Integrated RSI divergence pane ===");
  });
});
