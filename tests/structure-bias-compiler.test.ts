import { describe, expect, it } from "vitest";
import { compilePine } from "../lib/compiler";
import { defaultConfig } from "../lib/defaults";
import { presets } from "../lib/presets";
import { buildBehaviorPlan } from "../lib/behavior-plan";
import { explainConfig } from "../lib/explain";
import { toPublicIndicatorConfig } from "../lib/public-indicator-config";
import type { StrategyConfig } from "../lib/types";

const indicator = (config: StrategyConfig) => compilePine(toPublicIndicatorConfig(config));
const structural: StrategyConfig = { ...defaultConfig, biasSource: "swing_structure" };

describe("swing structure bias", () => {
  it("is off by default, so no preset changed unless it was measured to be better", () => {
    expect(defaultConfig.biasSource).toBe("higher_timeframe");
    const adopted = presets.filter((preset) => preset.biasSource === "swing_structure");
    expect(adopted.map((preset) => preset.presetId)).toEqual(["swing_trend_4h"]);
  });

  it("emits nothing when the preset uses a higher-timeframe average", () => {
    const code = indicator(defaultConfig);
    expect(code).not.toContain("structureBull");
    expect(code).not.toContain("ta.pivothigh(high, swingLookback");
  });

  describe("generated script", () => {
    const code = indicator(structural);

    it("derives the bias from confirmed pivots", () => {
      expect(code).toContain("swingHighPivot = ta.pivothigh(high, swingLookback, swingLookback)");
      expect(code).toContain("swingLowPivot = ta.pivotlow(low, swingLookback, swingLookback)");
    });

    // ta.pivothigh reports a pivot only after its right-hand window closes. Reading `high`
    // or `close` directly for the swing levels would look better on history and fail live.
    it("never reads an unconfirmed candle for a swing level", () => {
      expect(code).not.toMatch(/lastSwingHigh := (high|close)\b/);
      expect(code).not.toMatch(/lastSwingLow := (low|close)\b/);
      expect(code).toContain("lastSwingHigh := swingHighPivot");
      expect(code).toContain("lastSwingLow := swingLowPivot");
    });

    it("keeps the previous level so two of each can be compared", () => {
      expect(code).toContain("prevSwingHigh := lastSwingHigh");
      expect(code).toContain("prevSwingLow := lastSwingLow");
    });

    it("holds no bias until two highs and two lows exist", () => {
      expect(code).toContain(
        "structureReady = not na(lastSwingHigh) and not na(prevSwingHigh) and not na(lastSwingLow) and not na(prevSwingLow)"
      );
      expect(code).toContain("structureBull = not structureReady ? false :");
      expect(code).toContain("structureBear = structureReady and not structureBull");
    });

    it("reads higher highs with higher lows as bullish", () => {
      expect(code).toContain("higherHighs and higherLows ? true :");
      expect(code).toContain("lowerHighs and lowerLows ? false :");
    });

    it("declares the lookback input before the pivots read it", () => {
      expect(code.indexOf('swingLookback = input.int(')).toBeLessThan(code.indexOf("ta.pivothigh(high, swingLookback"));
    });

    // Pine resolves top to bottom, so every reader has to come after the definition. An
    // earlier version anchored the block too low and TradingView rejected the script with
    // "Undeclared identifier structureBull", so this checks every reader, not just one.
    it("declares structureBull and structureBear before anything reads them", () => {
      const definitions = {
        structureBull: code.indexOf("structureBull = not structureReady"),
        structureBear: code.indexOf("structureBear = structureReady and not structureBull")
      };
      expect(definitions.structureBull).toBeGreaterThan(-1);
      expect(definitions.structureBear).toBeGreaterThan(-1);

      const lines = code.split("\n");
      const offsets: number[] = [];
      let running = 0;
      for (const line of lines) { offsets.push(running); running += line.length + 1; }

      for (const [name, definedAt] of Object.entries(definitions)) {
        lines.forEach((line, index) => {
          // The definition itself, and structureBear's own line, legitimately mention it.
          if (offsets[index] === definedAt) return;
          if (name === "structureBull" && offsets[index] === definitions.structureBear) return;
          if (line.trim().startsWith("//")) return;
          if (!new RegExp(`\\b${name}\\b`).test(line)) return;
          expect(offsets[index], `${name} read on line ${index + 1} before it is declared: ${line.trim()}`)
            .toBeGreaterThan(definedAt);
        });
      }
    });

    it("declares the block before the first filter that consumes it", () => {
      const declared = code.indexOf("structureBull = not structureReady");
      const longSetup = code.indexOf("longSetup = ");
      const scoreLine = code.indexOf("longScoreRaw = ");
      expect(longSetup).toBeGreaterThan(declared);
      expect(scoreLine).toBeGreaterThan(declared);
    });

    it("names the structural state on the dashboard", () => {
      expect(code).toContain('"Structure", text_color=color.white');
      expect(code).toContain('not structureReady ? "FORMING" : structureBull ? "BULL" : "BEAR"');
    });
  });

  describe("it replaces the higher-timeframe gate rather than joining it", () => {
    const plan = buildBehaviorPlan(structural);
    const ids = plan.entry.filters.map((filter) => filter.id);

    it("puts structure in the filter list", () => {
      expect(ids).toContain("structure_bias");
    });

    // Two directional vetoes at once is a different configuration from the one measured,
    // and would be more selective than either.
    it("drops the higher-timeframe filter", () => {
      expect(ids).not.toContain("htf_bias");
    });

    it("carries the same score weight the higher-timeframe filter had", () => {
      const scored = compilePine(toPublicIndicatorConfig({ ...structural, signalMode: "score" }));
      const line = scored.split("\n").find((row) => row.startsWith("longScoreRaw = "));
      expect(line).toContain("((structureBull) ? 25 : 0)");
    });

    // The higher timeframe is still computed and plotted, so it stays in the plan — but
    // claiming it blocks counter-trend signals would describe a rule the script dropped.
    it("stops claiming the higher timeframe blocks anything", () => {
      expect(plan.higherTimeframe?.blocksCounterTrend).toBe(false);
      expect(buildBehaviorPlan(defaultConfig).higherTimeframe?.blocksCounterTrend).toBe(true);
    });
  });

  describe("the plain-language description matches what the script does", () => {
    const text = explainConfig(structural).join(" ");

    it("says the bias comes from swing structure", () => {
      expect(text).toContain("Direction comes from swing structure");
      expect(text).toContain("higher highs with higher lows read bullish");
    });

    it("states the confirmation delay that keeps it honest", () => {
      expect(text).toContain(`only confirmed once ${structural.swingLookback} later candles have closed`);
    });

    it("describes the higher timeframe as context rather than a gate", () => {
      expect(text).toContain("shown for context only; swing structure decides which side is allowed");
      expect(text).not.toContain("Bearish bias blocks long signals and bullish bias blocks short signals. The D bias");
    });

    it("still describes the gate for a preset that uses the higher timeframe", () => {
      const text = explainConfig(defaultConfig).join(" ");
      expect(text).toContain("Bearish bias blocks long signals");
      expect(text).not.toContain("Direction comes from swing structure");
    });
  });

  describe("4H Swing Trend, the preset the measurement moved", () => {
    const preset = presets.find((item) => item.presetId === "swing_trend_4h") as StrategyConfig;

    it("carries the setting the sweep selected", () => {
      expect(preset.biasSource).toBe("swing_structure");
      expect(preset.chartTimeframe).toBe("30");
      expect(preset.triggerWindow).toBe(5);
      expect(preset.risk.riskReward).toBe(6);
      expect(preset.risk.breakEvenAtR).toBe(0);
      expect(preset.risk.trailStartR).toBe(0);
    });

    it("gates its signals on structure, not on the daily average", () => {
      const code = indicator(preset);
      expect(code).toContain("structureBull");
      const long = code.split("\n").find((row) => row.startsWith("longSetup = "));
      expect(long).toContain("structureBull");
      expect(long).not.toContain("htfBull");
    });
  });
});
