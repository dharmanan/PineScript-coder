import { describe, expect, it } from "vitest";
import {
  ema,
  runRegimeTrendV1,
  wilderAtr,
  type Candle
} from "../research/regime-trend-v1/reference-engine";

const FOUR_HOURS = 4 * 60 * 60 * 1000;

function makeTrendCandles(count: number, start = 100, growth = 1.01): Candle[] {
  const candles: Candle[] = [];
  let base = start;
  for (let index = 0; index < count; index += 1) {
    const open = base;
    const close = open * 1.005;
    candles.push({
      timestamp: index * FOUR_HOURS,
      open,
      high: open * 1.01,
      low: open * 0.99,
      close,
      volume: 1000
    });
    base *= growth;
  }
  return candles;
}

function closeTo(value: number, expected: number, digits = 10): void {
  expect(value).toBeCloseTo(expected, digits);
}

describe("Regime Trend v1 reference calculations", () => {
  it("calculates EMA recursively from the first completed value", () => {
    const result = ema([10, 12, 14], 3);
    expect(result).toEqual([10, 11, 12.5]);
  });

  it("calculates Wilder ATR with an SMA seed followed by RMA updates", () => {
    const candles: Candle[] = [
      { timestamp: 0, open: 10, high: 12, low: 9, close: 11, volume: 1 },
      { timestamp: FOUR_HOURS, open: 11, high: 14, low: 10, close: 13, volume: 1 },
      { timestamp: 2 * FOUR_HOURS, open: 13, high: 15, low: 12, close: 14, volume: 1 },
      { timestamp: 3 * FOUR_HOURS, open: 14, high: 18, low: 13, close: 17, volume: 1 }
    ];
    const result = wilderAtr(candles, 3);
    expect(result[0]).toBeUndefined();
    expect(result[1]).toBeUndefined();
    closeTo(result[2] as number, (3 + 4 + 3) / 3);
    closeTo(result[3] as number, (((3 + 4 + 3) / 3) * 2 + 5) / 3);
  });
});

describe("Regime Trend v1 synthetic execution", () => {
  it("enters a valid breakout on the next candle open and freezes signal ATR", () => {
    const candles = makeTrendCandles(205);
    const result = runRegimeTrendV1(candles);

    expect(result.signals.length).toBe(1);
    expect(result.openPosition).not.toBeNull();

    const signal = result.signals[0];
    const position = result.openPosition!;
    expect(position.signalIndex).toBe(signal.signalIndex);
    expect(position.entryIndex).toBe(signal.signalIndex + 1);
    expect(position.entryTimestamp).toBe(candles[signal.signalIndex + 1].timestamp);
    closeTo(position.entryFill, candles[signal.signalIndex + 1].open * 1.0005);
    closeTo(position.entryAtr, signal.atr);
    closeTo(position.initialStop, position.entryFill - 2.5 * signal.atr);
  });

  it("excludes the current candle from the Donchian breakout level", () => {
    const candles = makeTrendCandles(200);
    const signalCandle = candles[199];
    const previousTwentyHigh = Math.max(...candles.slice(179, 199).map((candle) => candle.high));

    expect(signalCandle.high).toBeGreaterThan(signalCandle.close);
    expect(signalCandle.close).toBeGreaterThan(previousTwentyHigh);

    const withFillBar = [...candles, {
      ...candles[199],
      timestamp: 200 * FOUR_HOURS,
      open: candles[199].close,
      high: candles[199].close * 1.01,
      low: candles[199].close * 0.99,
      close: candles[199].close * 1.005
    }];
    const result = runRegimeTrendV1(withFillBar);
    expect(result.signals[0].signalIndex).toBe(199);
    closeTo(result.signals[0].breakoutLevel, previousTwentyHigh);
  });

  it("does not create duplicate entries while a position is already open", () => {
    const candles = makeTrendCandles(230);
    const result = runRegimeTrendV1(candles);

    expect(result.signals).toHaveLength(1);
    expect(result.trades).toHaveLength(0);
    expect(result.openPosition).not.toBeNull();
  });

  it("never moves an active trailing stop downward", () => {
    const candles = makeTrendCandles(215);
    const result = runRegimeTrendV1(candles);

    expect(result.stopUpdates.length).toBeGreaterThan(1);
    for (const update of result.stopUpdates) {
      expect(update.activeStop).toBeGreaterThanOrEqual(update.previousStop);
    }
  });

  it("records adverse slippage and both commissions on a stop exit", () => {
    const candles = makeTrendCandles(202);
    const baseline = runRegimeTrendV1(candles);
    expect(baseline.openPosition).not.toBeNull();
    const stop = baseline.openPosition!.activeStop;

    const stopBar: Candle = {
      timestamp: 202 * FOUR_HOURS,
      open: stop * 1.01,
      high: stop * 1.02,
      low: stop * 0.99,
      close: stop,
      volume: 1000
    };
    const result = runRegimeTrendV1([...candles, stopBar], { datasetHash: "fixture-hash", symbol: "TESTUSDT" });

    expect(result.trades).toHaveLength(1);
    const trade = result.trades[0];
    expect(trade.exit_reason).toBe("trailing_stop");
    closeTo(trade.exit_fill, trade.raw_exit_reference * 0.9995);
    closeTo(trade.entry_fee, trade.entry_fill * trade.quantity * 0.001);
    closeTo(trade.exit_fee, trade.exit_fill * trade.quantity * 0.001);
    closeTo(
      trade.net_pnl,
      (trade.exit_fill - trade.entry_fill) * trade.quantity - trade.entry_fee - trade.exit_fee
    );
    expect(trade.dataset_hash).toBe("fixture-hash");
    expect(trade.symbol).toBe("TESTUSDT");
  });

  it("does not rewrite earlier signals when future candles are appended", () => {
    const base = makeTrendCandles(210);
    const extended = [...base, ...makeTrendCandles(20, base[base.length - 1].close * 1.01).map((candle, index) => ({
      ...candle,
      timestamp: (base.length + index) * FOUR_HOURS
    }))];

    const baseResult = runRegimeTrendV1(base);
    const extendedResult = runRegimeTrendV1(extended);

    expect(extendedResult.signals.slice(0, baseResult.signals.length)).toEqual(baseResult.signals);
  });
});
