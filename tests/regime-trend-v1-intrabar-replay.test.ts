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
    exit_reason: "trend_exit",
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

function flatCandles(start: number, endExclusive: number) {
  const candles = [];
  for (let timestamp = start; timestamp < endExclusive; timestamp += FIVE) {
    candles.push(candle(timestamp));
  }
  return candles;
}

describe("Regime Trend v1 5m intrabar replay", () => {
  it("exits immediately when target is reached before a trend exit", () => {
    const candles = map([
      candle(0),
      candle(FIVE, { high: 106, low: 99 })
    ]);
    const result = replayTrade5m(trade({ exit_timestamp: 2 * FIVE }), [], candles, 0.5);
    expect(result.classification).toBe("TARGET_FIRST");
    expect(result.timestamp).toBe(FIVE);
    expect(result.lower_trade.net_pnl).toBeGreaterThan(0);
  });

  it("exits at stop when stop is reached before a trend exit", () => {
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

  it("includes the full baseline initial-stop exit candle", () => {
    const exitTimestamp = FOUR_HOURS;
    const candles = flatCandles(0, exitTimestamp + FOUR_HOURS);
    const stopTimestamp = exitTimestamp + 3 * FIVE;
    const stopCandle = candles.find((item) => item.timestamp === stopTimestamp);
    if (!stopCandle) throw new Error("missing synthetic stop candle");
    stopCandle.low = 89;

    const result = replayTrade5m(
      trade({ exit_timestamp: exitTimestamp, exit_reason: "initial_stop" }),
      [],
      map(candles),
      2
    );
    expect(result.classification).toBe("STOP_FIRST");
    expect(result.timestamp).toBe(stopTimestamp);
    expect(result.active_stop).toBe(90);
  });

  it("activates a trailing stop update at the baseline stop-exit candle open", () => {
    const updatedStop = 99;
    const stopUpdates = [
      {
        timestamp: 0,
        previousStop: 90,
        candidateStop: updatedStop,
        activeStop: updatedStop
      }
    ];
    const candles = flatCandles(0, 2 * FOUR_HOURS);
    const exitOpen = candles.find((item) => item.timestamp === FOUR_HOURS);
    if (!exitOpen) throw new Error("missing synthetic exit-open candle");
    exitOpen.low = 98;

    const result = replayTrade5m(
      trade({ exit_timestamp: FOUR_HOURS, exit_reason: "trailing_stop" }),
      stopUpdates,
      map(candles),
      2
    );
    expect(result.classification).toBe("STOP_FIRST");
    expect(result.timestamp).toBe(FOUR_HOURS);
    expect(result.active_stop).toBe(updatedStop);
  });

  it("flags a complete baseline stop candle with no target or stop as DATA_MISMATCH", () => {
    const candles = flatCandles(0, 2 * FOUR_HOURS);
    const result = replayTrade5m(
      trade({ exit_timestamp: FOUR_HOURS, exit_reason: "initial_stop" }),
      [],
      map(candles),
      2
    );
    expect(result.classification).toBe("DATA_MISMATCH");
  });
});
