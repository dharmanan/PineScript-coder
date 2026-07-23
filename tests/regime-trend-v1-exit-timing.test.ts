import { describe, expect, it } from "vitest";
import {
  analyzeExitTiming,
  summarizeExitTimingRows
} from "../research/regime-trend-v1/exit-timing-tools.mjs";

const HOUR4 = 4 * 60 * 60 * 1000;

function makeCandles(rows: Array<{ open: number; high: number; low: number; close: number }>) {
  return rows.map((row, index) => ({
    timestamp: index * HOUR4,
    volume: 100,
    ...row
  }));
}

function makeTrade(overrides = {}) {
  return {
    symbol: "TESTUSDT",
    entry_timestamp: 0,
    exit_timestamp: 3 * HOUR4,
    entry_fill: 100,
    entry_atr: 2,
    net_pnl: -0.02,
    ...overrides
  };
}

describe("Regime Trend v1 exit timing diagnostics", () => {
  it("records first intrabar high touch and later close confirmation", () => {
    const candles = makeCandles([
      { open: 100, high: 101.2, low: 99, close: 100.4 },
      { open: 100.4, high: 102.2, low: 100, close: 101.5 },
      { open: 101.5, high: 103, low: 101, close: 102.2 },
      { open: 102.2, high: 105, low: 98, close: 99 }
    ]);
    const result = analyzeExitTiming(makeTrade(), candles, [1]);
    expect(result.first_high_touch_bars["1"]).toBe(1);
    expect(result.first_close_confirmation_bars["1"]).toBe(2);
  });

  it("excludes the actual exit candle from favorable timing", () => {
    const candles = makeCandles([
      { open: 100, high: 100.5, low: 99, close: 100 },
      { open: 100, high: 100.7, low: 99, close: 100 },
      { open: 100, high: 100.8, low: 99, close: 100 },
      { open: 100, high: 105, low: 95, close: 104 }
    ]);
    const result = analyzeExitTiming(makeTrade(), candles, [1]);
    expect(result.first_high_touch_bars["1"]).toBeNull();
    expect(result.first_close_confirmation_bars["1"]).toBeNull();
    expect(result.peak_high_mfe_atr).toBeLessThan(1);
  });

  it("treats same-candle entry and exit as no proven favorable excursion", () => {
    const candles = makeCandles([
      { open: 100, high: 110, low: 90, close: 105 }
    ]);
    const result = analyzeExitTiming(
      makeTrade({ exit_timestamp: 0 }),
      candles,
      [0.5]
    );
    expect(result.first_high_touch_bars["0.5"]).toBeNull();
    expect(result.peak_high_mfe_atr).toBe(0);
  });

  it("computes peak giveback in ATR units", () => {
    const candles = makeCandles([
      { open: 100, high: 104, low: 99, close: 103 },
      { open: 103, high: 106, low: 102, close: 105 },
      { open: 105, high: 105, low: 100, close: 101 },
      { open: 101, high: 102, low: 98, close: 99 }
    ]);
    const result = analyzeExitTiming(makeTrade({ net_pnl: -0.01 }), candles, [1]);
    expect(result.peak_high_mfe_atr).toBe(3);
    expect(result.realized_net_atr).toBe(-0.5);
    expect(result.peak_high_to_realized_giveback_atr).toBe(3.5);
  });

  it("summarizes threshold timing windows", () => {
    const rows = [
      {
        timing: {
          bars_held: 3,
          peak_high_mfe_atr: 1.2,
          peak_close_mfe_atr: 1,
          realized_net_atr: -0.2,
          peak_high_to_realized_giveback_atr: 1.4,
          peak_close_to_realized_giveback_atr: 1.2,
          first_high_touch_bars: { "1": 1 },
          first_close_confirmation_bars: { "1": 2 }
        }
      },
      {
        timing: {
          bars_held: 5,
          peak_high_mfe_atr: 0.4,
          peak_close_mfe_atr: 0.2,
          realized_net_atr: -0.5,
          peak_high_to_realized_giveback_atr: 0.9,
          peak_close_to_realized_giveback_atr: 0.7,
          first_high_touch_bars: { "1": null },
          first_close_confirmation_bars: { "1": null }
        }
      }
    ];
    const summary = summarizeExitTimingRows(rows, [1], [1, 3]);
    expect(summary.thresholds["1"].high_touch.reached_count).toBe(1);
    expect(summary.thresholds["1"].high_touch.within_windows["1"].count).toBe(1);
    expect(summary.thresholds["1"].close_confirmation.within_windows["1"].count).toBe(0);
    expect(summary.thresholds["1"].close_confirmation.within_windows["3"].count).toBe(1);
  });
});
