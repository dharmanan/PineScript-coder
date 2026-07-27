import { describe, expect, it } from "vitest";
import { compilePine } from "../lib/compiler";
import { presets } from "../lib/presets";
import type { StrategyConfig } from "../lib/types";

const rsiPanePresetNames = [
  "Balanced Intraday",
  "Fast EMA Scalper",
  "VWAP Reclaim",
  "Swing Structure Trend",
  "Spot Accumulation",
  "Breakout Momentum",
  "Selective Multi-Timeframe",
  "Long-Term Trend Guard"
] as const;

const hiddenEnabledPresetNames = [
  "Swing Structure Trend",
  "Selective Multi-Timeframe",
  "Long-Term Trend Guard"
] as const;

const hiddenDisabledPresetNames = [
  "Balanced Intraday",
  "Fast EMA Scalper",
  "VWAP Reclaim",
  "Spot Accumulation",
  "Breakout Momentum"
] as const;

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

const findPreset = (name: string): StrategyConfig => {
  const preset = presets.find((item) => item.name === name);
  expect(preset, `Missing preset: ${name}`).toBeDefined();
  return clone(preset!);
};

describe("RSI pane preset coverage", () => {
  for (const name of rsiPanePresetNames) {
    it(`generates the integrated RSI pane for ${name}`, () => {
      const config = findPreset(name);
      config.outputMode = "indicator";

      const code = compilePine(config);

      expect(code).toContain(`indicator("${name}", overlay=false`);
      expect(code).toContain("// === Integrated RSI divergence pane ===");
      expect(code).toContain('plot(divRsi, "RSI divergence"');
      expect(code).not.toContain("strategy.entry");
      expect(code).not.toContain("strategy.exit");
    });
  }

  it("uses the configured RSI length and divergence pivot strength", () => {
    const config = findPreset("Balanced Intraday");
    config.outputMode = "indicator";
    config.momentum.rsiLength = 21;
    config.momentum.divergencePivot = 7;

    const code = compilePine(config);

    expect(code).toContain('divRsiLength = input.int(21, "Divergence RSI period"');
    expect(code).toContain('divPivotLeft = input.int(7, "Divergence pivot left"');
    expect(code).toContain('divPivotRight = input.int(7, "Divergence pivot right"');
    expect(code).not.toContain('divRsiLength = input.int(14, "Divergence RSI period"');
    expect(code).not.toContain('divPivotLeft = input.int(5, "Divergence pivot left"');
    expect(code).not.toContain('divPivotRight = input.int(5, "Divergence pivot right"');
  });

  for (const name of hiddenEnabledPresetNames) {
    it(`enables hidden divergence by default for ${name}`, () => {
      const config = findPreset(name);
      config.outputMode = "indicator";

      const code = compilePine(config);

      expect(code).toContain('showHiddenBullDiv = input.bool(true, "Show hidden bullish divergence")');
      expect(code).toContain('showHiddenBearDiv = input.bool(true, "Show hidden bearish divergence")');
    });
  }

  for (const name of hiddenDisabledPresetNames) {
    it(`disables hidden divergence by default for ${name}`, () => {
      const config = findPreset(name);
      config.outputMode = "indicator";

      const code = compilePine(config);

      expect(code).toContain('showHiddenBullDiv = input.bool(false, "Show hidden bullish divergence")');
      expect(code).toContain('showHiddenBearDiv = input.bool(false, "Show hidden bearish divergence")');
    });
  }

  it("keeps the RSI pane after the editable script name changes", () => {
    const config = findPreset("Balanced Intraday");
    config.outputMode = "indicator";
    config.name = "My Renamed Indicator";

    const code = compilePine(config);

    expect(config.presetId).toBe("balanced_intraday");
    expect(code).toContain('indicator("My Renamed Indicator", overlay=false');
    expect(code).toContain("// === Integrated RSI divergence pane ===");
  });

  it("keeps Supertrend Volume panel-free while RSI and divergence are disabled", () => {
    const config = findPreset("Supertrend Volume");
    config.outputMode = "indicator";

    expect(config.momentum.rsiEnabled).toBe(false);
    expect(config.momentum.divergenceEnabled).toBe(false);

    const code = compilePine(config);

    expect(code).toContain('indicator("Supertrend Volume", overlay=true');
    expect(code).not.toContain("// === Integrated RSI divergence pane ===");
    expect(code).not.toContain("divRsiLength");
  });
});
