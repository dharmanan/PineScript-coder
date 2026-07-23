import { describe, expect, it } from "vitest";
import {
  TARGET_TRIGGERED_RATCHET_CANDIDATES,
  compareTradeWithRatchet5m
} from "../research/regime-trend-v1/target-triggered-ratchet-corrected-tools.mjs";

const FIVE = 5 * 60 * 1000;

function trade(overrides = {}) {
  return {
    strategy_id: "regime-trend-v1",
    implementation_version: "test",
    dataset_hash: "test",
    symbol: "TESTUSDT",
    timeframe: "4h",
    direction: "long",
    signal_timestamp: -4 * 60 * 60 * 1000,
    entry_timestamp: 0,
    raw_entry_open: 100,
    entry_fill: 100,
    entry_atr: 10,
    initial_stop: 90,
    exit_timestamp: 4 * FIVE,
    raw_exit_reference: 100,
    exit_fill: 99.95,
    exit_reason: "trend_exit",
    quantity: 0.01,
    entry_fee: 0.001,
    exit_fee: 0.0009995,
    gross_pnl: -0.0005,
    net_pnl: -0.0024995,
    net_return: -0.0024995,
    bars_held: 0,
    ...overrides
  };
}

function candle(timestamp: number, overrides = {}) {
  return {
    timestamp,
    open: 100,
    high: 102,
    low: 98,
    close: 100,
    volume: 1,
    ...overrides
  };
}

function map(candles: ReturnType<typeof candle>[]) {
  return new Map(candles.map((item) => [item.timestamp, item]));
}

describe("Regime Trend v1 corrected ratchet comparison", () => {
  it("marks a ratchet exit only when the ratchet floor is binding", () => {
    const candidate = TARGET_TRIGGERED_RATCHET_CANDIDATES.find(
      (item) => item.id === "touch-2.00-lock-0.00"
    )!;
    const candles = map([
      candle(0, { high: 121, low: 95 }),
      candle(FIVE, { open: 101, high: 103, low: 99 }),
      candle(2 * FIVE, { open: 102, high: 104, low: 101 }),
      candle(3 * FIVE, { open: 103, high: 104, low: 102 })
    ]);
    const result = compareTradeWithRatchet5m(trade(), [], candles, candidate);
    expect(result.classification).toBe("RATCHET_EXIT");
    expect(result.overlay_trade.net_pnl).toBeGreaterThan(result.baseline_trade.net_pnl);
  });

  it("does not call an original stop after activation a ratchet exit", () => {
    const candidate = TARGET_TRIGGERED_RATCHET_CANDIDATES[2];
    const candles = map([
      candle(0, { high: 121, low: 95 }),
      candle(FIVE, { open: 95, high: 96, low: 89 }),
      candle(2 * FIVE),
      candle(3 * FIVE)
    ]);
    const result = compareTradeWithRatchet5m(
      trade({ exit_timestamp: 0, exit_reason: "initial_stop" }),
      [],
      candles,
      candidate
    );
    expect(["BASELINE_STOP", "BASELINE_STOP_AFTER_ACTIVATION"]).toContain(result.classification);
  });

  it("keeps identical baseline exits identical when ratchet never binds", () => {
    const candidate = TARGET_TRIGGERED_RATCHET_CANDIDATES[2];
    const candles = map([
      candle(0, { high: 121, low: 95 }),
      candle(FIVE, { open: 103, high: 125, low: 102 }),
      candle(2 * FIVE, { open: 104, high: 126, low: 103 }),
      candle(3 * FIVE, { open: 105, high: 127, low: 104 })
    ]);
    const result = compareTradeWithRatchet5m(trade(), [], candles, candidate);
    expect(result.classification).toBe("ACTIVATED_BASELINE_EXIT");
    expect(result.overlay_trade.net_pnl).toBe(result.baseline_trade.net_pnl);
  });

  it("returns DATA_GAP for a missing expected candle", () => {
    const candidate = TARGET_TRIGGERED_RATCHET_CANDIDATES[2];
    const result = compareTradeWithRatchet5m(trade(), [], map([candle(0)]), candidate);
    expect(result.classification).toBe("DATA_GAP");
  });
});
