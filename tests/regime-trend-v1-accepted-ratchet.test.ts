import { describe, expect, it } from "vitest";
import {
  ACCEPTED_RATCHET,
  applyAcceptedRatchet5m
} from "../research/regime-trend-v1/accepted-ratchet-tools.mjs";

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

describe("Regime Trend v1 accepted +2 ATR break-even ratchet", () => {
  it("freezes the accepted candidate", () => {
    expect(ACCEPTED_RATCHET).toEqual({
      id: "touch-2.00-lock-0.00",
      activationAtr: 2,
      floorAtr: 0
    });
    expect(Object.isFrozen(ACCEPTED_RATCHET)).toBe(true);
  });

  it("activates on +2 ATR and exits from the next 5m candle when binding", () => {
    const result = applyAcceptedRatchet5m(
      trade(),
      [],
      map([
        candle(0, { high: 121, low: 95 }),
        candle(FIVE, { open: 101, high: 103, low: 99 }),
        candle(2 * FIVE, { open: 103, high: 104, low: 102 }),
        candle(3 * FIVE, { open: 103, high: 104, low: 102 })
      ])
    );

    expect(result.classification).toBe("RATCHET_EXIT");
    expect(result.overlay.activated).toBe(true);
    expect(result.overlay.trade.exit_timestamp).toBe(FIVE);
  });

  it("keeps the baseline result when a required 5m candle is missing", () => {
    const original = trade();
    const result = applyAcceptedRatchet5m(original, [], map([candle(0)]));

    expect(result.classification).toBe("DATA_GAP");
    expect(result.baseline_trade).toBe(original);
    expect(result.overlay_trade).toBe(original);
  });
});
