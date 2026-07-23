import { describe, expect, it } from "vitest";
import { compilePine } from "../lib/compiler";
import { presets } from "../lib/presets";
import type { StrategyConfig } from "../lib/types";

const rsiPanePresetNames = [
  "Balanced Intraday",
  "Fast EMA Scalper",
  "VWAP Session Trader",
  "4H Swing Trend",
  "Spot Accumulation",
  "Breakout Momentum",
  "RSI Divergence Reversal",
  "Selective Multi-Timeframe",
  "Long-Term Trend Guard"
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
