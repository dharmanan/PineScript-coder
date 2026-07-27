import { describe, expect, it } from "vitest";
import { presets } from "../lib/presets";
import { compilePine } from "../lib/compiler";
import { validateConfig } from "../lib/validator";
import { toPublicIndicatorConfig } from "../lib/public-indicator-config";
import { declares, declaresString } from "./helpers/pine-input";
import type { SignalMode, StrategyConfig } from "../lib/types";

// The settings the preset sweep selected on 2019-2022 development data. Changing a
// preset default without re-running the sweep should break this test, not slip by.
const MEASURED: Record<string, {
  timeframe: string; signalMode: SignalMode; score: number; window: number;
  riskReward: number; breakEven: number; trailStart: number; trailDistance: number;
}> = {
  balanced_intraday: { timeframe: "30", signalMode: "all_filters", score: 60, window: 1, riskReward: 5, breakEven: 0, trailStart: 0, trailDistance: 1 },
  fast_ema_scalper: { timeframe: "30", signalMode: "all_filters", score: 60, window: 5, riskReward: 6, breakEven: 1, trailStart: 0, trailDistance: 1 },
  vwap_session_trader: { timeframe: "60", signalMode: "all_filters", score: 60, window: 3, riskReward: 6, breakEven: 0, trailStart: 0, trailDistance: 1 },
  swing_trend_4h: { timeframe: "30", signalMode: "all_filters", score: 60, window: 5, riskReward: 6, breakEven: 0, trailStart: 0, trailDistance: 1 },
  supertrend_volume: { timeframe: "30", signalMode: "all_filters", score: 60, window: 10, riskReward: 5, breakEven: 0, trailStart: 0, trailDistance: 1 },
  breakout_momentum: { timeframe: "60", signalMode: "all_filters", score: 60, window: 3, riskReward: 6, breakEven: 0, trailStart: 0, trailDistance: 1 },
  selective_multi_timeframe: { timeframe: "60", signalMode: "all_filters", score: 60, window: 3, riskReward: 6, breakEven: 0, trailStart: 2, trailDistance: 1.5 },
  long_term_trend_guard: { timeframe: "30", signalMode: "all_filters", score: 60, window: 5, riskReward: 6, breakEven: 1, trailStart: 0, trailDistance: 1 }
};

const byId = (id: string) => presets.find((preset) => preset.presetId === id) as StrategyConfig;

describe("measured preset defaults", () => {
  it("covers every preset except the unmeasurable spot one", () => {
    const measurable = presets.filter(
      (preset) => preset.direction !== "spot_buy_exit" && preset.researchProfile === undefined
    );
    expect(measurable).toHaveLength(8);
    expect(Object.keys(MEASURED).sort()).toEqual(measurable.map((preset) => preset.presetId).sort());
  });

  for (const [id, expected] of Object.entries(MEASURED)) {
    describe(id, () => {
      const preset = byId(id);

      it("carries the setting the sweep selected", () => {
        expect(preset.chartTimeframe).toBe(expected.timeframe);
        expect(preset.signalMode).toBe(expected.signalMode);
        expect(preset.scoreThreshold).toBe(expected.score);
        expect(preset.triggerWindow).toBe(expected.window);
        expect(preset.risk.riskReward).toBe(expected.riskReward);
        expect(preset.risk.breakEvenAtR).toBe(expected.breakEven);
        expect(preset.risk.trailStartR).toBe(expected.trailStart);
        expect(preset.risk.trailDistanceR).toBe(expected.trailDistance);
      });

      it("is a configuration the product accepts", () => {
        const errors = validateConfig(preset).filter((issue) => issue.level === "error");
        expect(errors).toEqual([]);
      });

      it("keeps the higher timeframe above the chart timeframe", () => {
        if (!preset.higherTimeframe.enabled) return;
        const minutes = (value: string) =>
          value === "D" ? 1440 : value === "W" ? 10080 : value === "M" ? 43200 : Number(value);
        expect(minutes(preset.higherTimeframe.timeframe)).toBeGreaterThan(minutes(preset.chartTimeframe));
      });

      it("generates the selected mode and threshold into the script", () => {
        const code = compilePine(toPublicIndicatorConfig(preset));
        const mode = expected.signalMode === "score" ? "Score" : "All filters";
        expect(code).toMatch(declaresString("signalMode", mode, "Signal mode"));
        expect(code).toMatch(declares("scoreThreshold", expected.score, "Minimum signal score"));
        expect(code).toMatch(declares("riskReward", expected.riskReward, "Risk/reward"));
        expect(code).toContain(`expectedChartTimeframe = input.timeframe("${expected.timeframe}"`);
        expect(code).toMatch(declares("triggerWindow", expected.window, "Trigger window (bars)"));
        expect(code).toMatch(declares("breakEvenAtR", expected.breakEven, "Break-even at (R), 0 = off"));
        expect(code).toMatch(declares("trailStartR", expected.trailStart, "Trail starts at (R), 0 = off"));
      });
    });
  }

  it("keeps the locked Long-Term Trend Guard direction and win-rate score", () => {
    const preset = byId("long_term_trend_guard");
    expect(preset.direction).toBe("long_short");
    expect(preset.chartTimeframe).toBe("30");
    expect(preset.winRateProfile?.scoreThreshold).toBe(85);
  });
});
