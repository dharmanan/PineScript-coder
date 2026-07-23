import { describe, expect, it } from "vitest";
import { replayTrade5m } from "../research/regime-trend-v1/intrabar-replay-tools.mjs";

const FIVE = 5 * 60 * 1000;
const FOUR_HOURS = 4 * 60 * 60 * 1000;

function trade(overrides = {}) {
  return {
    strategy_id: "regime-trend-v1",
    implementation_version: "test",
    dataset_hash: "test",
    symbol: "TESTUSDT",
    timeframe: "4h",
    direction: "long",
    signal_timestamp: -FOUR_HOURS,
    entry_timestamp: 0,
    raw_entry_open: 100,
    entry_fill: 100,
    entry_atr: 10,
    initial_stop: 90,
    exit_timestamp: FOUR_HOURS,
    raw_exit_reference: 95,
    exit_fill: 94.9525,
    exit_reason: "initial_stop",
    quantity: 0.01,
    entry_fee: 0.001,
    exit_fee: 0.000949525,
    gross_pnl: -0.050475,
    net_pnl: -0.052424525,
    net_return: -0.052424525,
    bars_held: 1,
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

describe("Regime Trend v1 5m intrabar replay", () => {
  it("exits immediately when target is reached before stop", () => {
    const candles = map([
      candle(0),
      candle(FIVE, { high: 106, low: 99 })
    ]);
    const result = replayTrade5m(trade({ exit_timestamp: 2 * FIVE }), [], candles, 0.5);
    expect(result.classification).toBe("TARGET_FIRST");
    expect(result.timestamp).toBe(FIVE);
    expect(result.lower_trade.net_pnl).toBeGreaterThan(0);
  });

  it("exits at stop when stop is reached before target", () => {
    const candles = map([
      candle(0),
      candle(FIVE, { high: 104, low: 89 })
    ]);
    const result = replayTrade5m(trade({ exit_timestamp: 2 * FIVE }), [], candles, 0.5);
    expect(result.classification).toBe("STOP_FIRST");
    expect(result.lower_trade.net_pnl).toBeLessThan(0);
  });

  it("keeps lower and upper bounds when both levels occur in one 5m candle", () => {
    const candles = map([
      candle(0, { high: 106, low: 89 })
    ]);
    const result = replayTrade5m(trade({ exit_timestamp: FIVE }), [], candles, 0.5);
    expect(result.classification).toBe("AMBIGUOUS_SAME_5M");
    expect(result.lower_trade.net_pnl).toBeLessThan(result.upper_trade.net_pnl);
  });

  it("returns DATA_GAP rather than inventing a missing candle", () => {
    const candles = map([candle(0)]);
    const result = replayTrade5m(trade({ exit_timestamp: 2 * FIVE }), [], candles, 0.5);
    expect(result.classification).toBe("DATA_GAP");
    expect(result.timestamp).toBe(FIVE);
    expect(result.lower_trade).toEqual(result.upper_trade);
  });

  it("activates a 4h stop update only at the next 4h open", () => {
    const updatedStop = 99;
    const stopUpdates = [
      {
        timestamp: 0,
        previousStop: 90,
        candidateStop: updatedStop,
        activeStop: updatedStop
      }
    ];
    const path = [];
    for (let timestamp = 0; timestamp < FOUR_HOURS; timestamp += FIVE) {
      path.push(candle(timestamp, { low: 95 }));
    }
    path.push(candle(FOUR_HOURS, { low: 98, high: 102 }));

    const result = replayTrade5m(
      trade({ exit_timestamp: FOUR_HOURS + FIVE }),
      stopUpdates,
      map(path),
      2
    );
    expect(result.classification).toBe("STOP_FIRST");
    expect(result.timestamp).toBe(FOUR_HOURS);
    expect(result.active_stop).toBe(updatedStop);
  });
});
