import { describe, expect, it } from "vitest";
import {
  analyzePostExit,
  analyzeTradePath,
  classifyAtrOpportunity,
  classifyCounterfactual,
  netLongReturn,
  netShortReturn,
  summarizeForensicRows
} from "../research/regime-trend-v1/forensic-tools.mjs";

const HOUR4 = 4 * 60 * 60 * 1000;

function candles(opens: number[]) {
  return opens.map((open, index) => ({
    timestamp: index * HOUR4,
    open,
    high: open * 1.02,
    low: open * 0.98,
    close: open,
    volume: 100
  }));
}

function trade(overrides = {}) {
  return {
    symbol: "TESTUSDT",
    entry_timestamp: 0,
    exit_timestamp: 2 * HOUR4,
    entry_fill: 100,
    entry_atr: 2,
    raw_exit_reference: 98,
    exit_fill: 97.95,
    net_pnl: -0.01,
    ...overrides
  };
}

describe("Regime Trend v1 forensic tools", () => {
  it("classifies downward follow-through as a short reversal", () => {
    const longResult = netLongReturn(100, 90);
    const shortResult = netShortReturn(100, 90);
    expect(longResult).toBeLessThan(0);
    expect(shortResult).toBeGreaterThan(0);
    expect(classifyCounterfactual(longResult, shortResult)).toBe("SHORT_REVERSAL");
  });

  it("classifies upward recovery as a long recovery", () => {
    const longResult = netLongReturn(100, 110);
    const shortResult = netShortReturn(100, 110);
    expect(longResult).toBeGreaterThan(0);
    expect(shortResult).toBeLessThan(0);
    expect(classifyCounterfactual(longResult, shortResult)).toBe("LONG_RECOVERY");
  });

  it("classifies small movement consumed by costs as no trade", () => {
    const longResult = netLongReturn(100, 100.1);
    const shortResult = netShortReturn(100, 100.1);
    expect(longResult).toBeLessThanOrEqual(0);
    expect(shortResult).toBeLessThanOrEqual(0);
    expect(classifyCounterfactual(longResult, shortResult)).toBe("NO_TRADE");
  });

  it("requires a fixed ATR magnitude before calling an opportunity", () => {
    expect(classifyAtrOpportunity(0.2, -0.4, 0.25)).toBe("NO_TRADE");
    expect(classifyAtrOpportunity(0.6, -0.8, 0.5)).toBe("LONG_RECOVERY");
    expect(classifyAtrOpportunity(-0.8, 1.1, 1)).toBe("SHORT_REVERSAL");
  });

  it("excludes the exit candle high from conservative MFE", () => {
    const data = [
      { timestamp: 0, open: 100, high: 101, low: 99, close: 100, volume: 100 },
      { timestamp: HOUR4, open: 100, high: 101.5, low: 99, close: 100, volume: 100 },
      { timestamp: 2 * HOUR4, open: 98, high: 110, low: 97, close: 108, volume: 100 }
    ];
    const result = analyzeTradePath(trade(), data);
    expect(result.mfe_atr).toBeLessThan(1);
    expect(result.mfe_atr_upper_bound).toBeGreaterThanOrEqual(5);
    expect(result.gave_back_favorable_excursion).toBe(false);
  });

  it("flags a loss only when completed pre-exit candles achieved one ATR MFE", () => {
    const data = [
      { timestamp: 0, open: 100, high: 103, low: 99, close: 102, volume: 100 },
      { timestamp: HOUR4, open: 102, high: 104, low: 101, close: 103, volume: 100 },
      { timestamp: 2 * HOUR4, open: 98, high: 99, low: 97, close: 98, volume: 100 }
    ];
    const result = analyzeTradePath(trade(), data);
    expect(result.mfe_atr).toBeGreaterThanOrEqual(1);
    expect(result.gave_back_favorable_excursion).toBe(true);
  });

  it("starts the counterfactual on the candle after the actual exit", () => {
    const data = candles([100, 99, 98, 100, 90, 88, 87]);
    const result = analyzePostExit(trade(), data, [1, 3]);
    expect(result[1]?.entry_timestamp).toBe(3 * HOUR4);
    expect(result[1]?.exit_timestamp).toBe(4 * HOUR4);
    expect(result[1]?.classification).toBe("SHORT_REVERSAL");
    expect(result[3]?.exit_timestamp).toBe(6 * HOUR4);
  });

  it("excludes the fixed-horizon exit candle range from excursion calculations", () => {
    const data = [
      ...candles([100, 99, 98]),
      { timestamp: 3 * HOUR4, open: 100, high: 101, low: 99, close: 100, volume: 100 },
      { timestamp: 4 * HOUR4, open: 90, high: 130, low: 70, close: 100, volume: 100 }
    ];
    const result = analyzePostExit(trade(), data, [1]);
    expect(result[1]?.downward_excursion_atr).toBeCloseTo(0.5);
    expect(result[1]?.upward_excursion_atr).toBeCloseTo(0.5);
  });

  it("returns an unavailable horizon rather than crossing the dataset end", () => {
    const result = analyzePostExit(trade(), candles([100, 99, 98, 97]), [3]);
    expect(result[3]).toBeNull();
  });

  it("aggregates base classes and ATR-threshold opportunities", () => {
    const rows = [
      {
        counterfactuals: {
          3: {
            classification: "SHORT_REVERSAL",
            threshold_classifications: { "0.25": "SHORT_REVERSAL", "0.5": "NO_TRADE", "1": "NO_TRADE" },
            short_net_return: 0.1,
            long_net_return: -0.1,
            short_net_atr: 0.4,
            long_net_atr: -0.4,
            downward_excursion_atr: 2,
            upward_excursion_atr: 0.5,
            short_reward_to_adverse_excursion: 0.8,
            long_reward_to_adverse_excursion: null
          }
        }
      },
      {
        counterfactuals: {
          3: {
            classification: "LONG_RECOVERY",
            threshold_classifications: { "0.25": "LONG_RECOVERY", "0.5": "LONG_RECOVERY", "1": "NO_TRADE" },
            short_net_return: -0.1,
            long_net_return: 0.1,
            short_net_atr: -0.7,
            long_net_atr: 0.7,
            downward_excursion_atr: 0.5,
            upward_excursion_atr: 2,
            short_reward_to_adverse_excursion: null,
            long_reward_to_adverse_excursion: 1.4
          }
        }
      },
      {
        counterfactuals: {
          3: {
            classification: "NO_TRADE",
            threshold_classifications: { "0.25": "NO_TRADE", "0.5": "NO_TRADE", "1": "NO_TRADE" },
            short_net_return: -0.01,
            long_net_return: -0.01,
            short_net_atr: -0.1,
            long_net_atr: -0.1,
            downward_excursion_atr: 0.2,
            upward_excursion_atr: 0.2,
            short_reward_to_adverse_excursion: null,
            long_reward_to_adverse_excursion: null
          }
        }
      }
    ];
    const summary = summarizeForensicRows(rows, [3])[3];
    expect(summary.eligible).toBe(3);
    expect(summary.short_reversal_count).toBe(1);
    expect(summary.long_recovery_count).toBe(1);
    expect(summary.no_trade_count).toBe(1);
    expect(summary.thresholds["0.5"].short_reversal_count).toBe(0);
    expect(summary.thresholds["0.5"].long_recovery_count).toBe(1);
    expect(summary.thresholds["0.5"].no_trade_count).toBe(2);
  });
});
