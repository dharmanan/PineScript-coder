import { describe, expect, it } from "vitest";
import {
  applyTargetTriggeredRatchet,
  TARGET_TRIGGERED_RATCHET_CANDIDATES
} from "../research/regime-trend-v1/target-triggered-ratchet-tools.mjs";

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
    exit_timestamp: 3 * FIVE,
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

describe("Regime Trend v1 target-triggered ratchet", () => {
  it("freezes exactly five candidates", () => {
    expect(TARGET_TRIGGERED_RATCHET_CANDIDATES).toHaveLength(5);
  });

  it("activates after target touch and applies the floor only on the next 5m candle", () => {
    const candidate = TARGET_TRIGGERED_RATCHET_CANDIDATES.find((item) => item.id === "touch-1.50-lock-0.00")!;
    const candles = map([
      candle(0, { high: 116, low: 95 }),
      candle(FIVE, { open: 101, high: 102, low: 99 }),
      candle(2 * FIVE)
    ]);
    const result = applyTargetTriggeredRatchet(trade(), [], candles, candidate);
    expect(result.activated).toBe(true);
    expect(result.classification).toBe("RATCHET_EXIT");
    expect(result.timestamp).toBe(FIVE);
  });

  it("does not retroactively apply a ratchet inside the activation candle", () => {
    const candidate = TARGET_TRIGGERED_RATCHET_CANDIDATES[0];
    const candles = map([
      candle(0, { high: 116, low: 89 })
    ]);
    const result = applyTargetTriggeredRatchet(
      trade({ exit_timestamp: FIVE, exit_reason: "initial_stop" }),
      [],
      candles,
      candidate
    );
    expect(result.classification).toBe("BASELINE_STOP");
    expect(result.activated).toBe(false);
  });

  it("keeps the baseline trend exit when activated but the floor is not touched", () => {
    const candidate = TARGET_TRIGGERED_RATCHET_CANDIDATES[2];
    const candles = map([
      candle(0, { high: 121, low: 95 }),
      candle(FIVE, { high: 125, low: 101 }),
      candle(2 * FIVE, { high: 130, low: 102 })
    ]);
    const result = applyTargetTriggeredRatchet(trade(), [], candles, candidate);
    expect(result.classification).toBe("ACTIVATED_BASELINE_EXIT");
    expect(result.trade.net_pnl).toBe(trade().net_pnl);
  });

  it("returns DATA_GAP instead of inventing a missing 5m candle", () => {
    const candidate = TARGET_TRIGGERED_RATCHET_CANDIDATES[0];
    const result = applyTargetTriggeredRatchet(trade(), [], map([candle(0)]), candidate);
    expect(result.classification).toBe("DATA_GAP");
  });
});
