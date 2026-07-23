import { describe, expect, it } from "vitest";
import {
  analyzePostExit,
  analyzeTradePath,
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

  it("measures MFE and flags a losing trade that gave back at least one ATR", () => {
    const data = candles([100, 104, 99]);
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

  it("returns an unavailable horizon rather than crossing the dataset end", () => {
    const result = analyzePostExit(trade(), candles([100, 99, 98, 97]), [3]);
    expect(result[3]).toBeNull();
  });

  it("aggregates the three counterfactual classes", () => {
    const rows = [
      { counterfactuals: { 3: { classification: "SHORT_REVERSAL", short_net_return: 0.1, long_net_return: -0.1, downward_excursion_atr: 2, upward_excursion_atr: 0.5 } } },
      { counterfactuals: { 3: { classification: "LONG_RECOVERY", short_net_return: -0.1, long_net_return: 0.1, downward_excursion_atr: 0.5, upward_excursion_atr: 2 } } },
      { counterfactuals: { 3: { classification: "NO_TRADE", short_net_return: -0.01, long_net_return: -0.01, downward_excursion_atr: 0.2, upward_excursion_atr: 0.2 } } }
    ];
    const summary = summarizeForensicRows(rows, [3])[3];
    expect(summary.eligible).toBe(3);
    expect(summary.short_reversal_count).toBe(1);
    expect(summary.long_recovery_count).toBe(1);
    expect(summary.no_trade_count).toBe(1);
  });
});
