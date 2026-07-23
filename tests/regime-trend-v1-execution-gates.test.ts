import { describe, expect, it } from "vitest";
import {
  ema,
  runRegimeTrendV1,
  type Candle
} from "../research/regime-trend-v1/reference-engine";

const FOUR_HOURS = 4 * 60 * 60 * 1000;

function candle(index: number, open: number, high: number, low: number, close: number): Candle {
  return { timestamp: index * FOUR_HOURS, open, high, low, close, volume: 1000 };
}

function makeTrendCandles(count: number, start = 100, growth = 1.01): Candle[] {
  const candles: Candle[] = [];
  let base = start;
  for (let index = 0; index < count; index += 1) {
    const open = base;
    const close = open * 1.005;
    candles.push(candle(index, open, open * 1.01, open * 0.99, close));
    base *= growth;
  }
  return candles;
}

function makeLowVolatilityTrend(count: number): Candle[] {
  const candles: Candle[] = [];
  let base = 100;
  for (let index = 0; index < count; index += 1) {
    const open = base;
    const close = open * 1.0006;
    candles.push(candle(index, open, open * 1.0008, open * 0.9996, close));
    base *= 1.0008;
  }
  return candles;
}

function makeBearishBreakoutFixture(): Candle[] {
  const candles: Candle[] = [];
  let base = 300;
  for (let index = 0; index < 199; index += 1) {
    const open = base;
    const close = open * 0.997;
    candles.push(candle(index, open, open * 1.004, open * 0.993, close));
    base *= 0.995;
  }
  const previousHigh = Math.max(...candles.slice(179).map((item) => item.high));
  const breakoutClose = previousHigh * 1.02;
  candles.push(candle(199, breakoutClose * 0.995, breakoutClose * 1.01, breakoutClose * 0.99, breakoutClose));
  candles.push(candle(200, breakoutClose, breakoutClose * 1.01, breakoutClose * 0.99, breakoutClose));
  return candles;
}

function buildEntryWithInitialStop(): { candles: Candle[]; stop: number } {
  const signalHistory = makeTrendCandles(200);
  const signalResult = runRegimeTrendV1([
    ...signalHistory,
    candle(200, signalHistory[199].close, signalHistory[199].close * 1.002, signalHistory[199].close * 0.998, signalHistory[199].close)
  ]);
  expect(signalResult.openPosition).not.toBeNull();
  expect(signalResult.openPosition!.trailingActivated).toBe(false);
  return { candles: signalHistory.concat(candle(200, signalHistory[199].close, signalHistory[199].close * 1.002, signalHistory[199].close * 0.998, signalHistory[199].close)), stop: signalResult.openPosition!.activeStop };
}

describe("Regime Trend v1 entry rejection gates", () => {
  it("rejects a breakout when the bullish EMA regime is absent", () => {
    const result = runRegimeTrendV1(makeBearishBreakoutFixture());
    expect(result.signals).toHaveLength(0);
    expect(result.openPosition).toBeNull();
  });

  it("rejects an otherwise bullish sequence when no close exceeds the previous Donchian high", () => {
    const candles = makeTrendCandles(205);
    candles[198] = { ...candles[198], high: candles[198].high * 10 };
    const result = runRegimeTrendV1(candles);
    expect(result.signals).toHaveLength(0);
  });

  it("rejects a breakout below the normalized ATR floor", () => {
    const result = runRegimeTrendV1(makeLowVolatilityTrend(205));
    expect(result.signals).toHaveLength(0);
    expect(result.openPosition).toBeNull();
  });
});

describe("Regime Trend v1 stop and exit ordering", () => {
  it("uses the frozen initial stop before any trailing activation", () => {
    const fixture = buildEntryWithInitialStop();
    const stopBar = candle(201, fixture.stop * 1.01, fixture.stop * 1.02, fixture.stop * 0.99, fixture.stop * 1.005);
    const result = runRegimeTrendV1([...fixture.candles, stopBar]);

    expect(result.trades).toHaveLength(1);
    expect(result.trades[0].exit_reason).toBe("initial_stop");
    expect(result.trades[0].raw_exit_reference).toBeCloseTo(fixture.stop, 10);
    expect(result.trades[0].exit_fill).toBeCloseTo(fixture.stop * 0.9995, 10);
  });

  it("fills a gap stop from the adverse candle open", () => {
    const fixture = buildEntryWithInitialStop();
    const gapOpen = fixture.stop * 0.98;
    const gapBar = candle(201, gapOpen, gapOpen * 1.02, gapOpen * 0.99, gapOpen * 1.01);
    const result = runRegimeTrendV1([...fixture.candles, gapBar]);

    expect(result.trades).toHaveLength(1);
    expect(result.trades[0].exit_reason).toBe("initial_stop");
    expect(result.trades[0].raw_exit_reference).toBeCloseTo(gapOpen, 10);
    expect(result.trades[0].exit_fill).toBeCloseTo(gapOpen * 0.9995, 10);
  });

  it("executes a pending trend exit at the next open before inspecting that candle's later low", () => {
    const fixture = buildEntryWithInitialStop();
    const closes = fixture.candles.map((item) => item.close);
    const ema50 = ema(closes, 50);
    const fast = ema50[ema50.length - 1] as number;
    const triggerClose = Math.max(fixture.stop * 1.1, fast * 0.99);
    expect(triggerClose).toBeLessThan(fast);

    const trigger = candle(201, triggerClose * 1.02, triggerClose * 1.03, Math.max(fixture.stop * 1.01, triggerClose * 0.99), triggerClose);
    const exitOpen = Math.max(fixture.stop * 1.05, triggerClose * 0.995);
    const exitBar = candle(202, exitOpen, exitOpen * 1.01, fixture.stop * 0.95, exitOpen * 0.99);
    const result = runRegimeTrendV1([...fixture.candles, trigger, exitBar]);

    expect(result.trades).toHaveLength(1);
    expect(result.trades[0].exit_reason).toBe("trend_exit");
    expect(result.trades[0].raw_exit_reference).toBeCloseTo(exitOpen, 10);
    expect(result.trades[0].exit_fill).toBeCloseTo(exitOpen * 0.9995, 10);
  });

  it("gives a gap stop priority when the pending trend-exit candle opens below the active stop", () => {
    const fixture = buildEntryWithInitialStop();
    const closes = fixture.candles.map((item) => item.close);
    const fast = ema(closes, 50).at(-1) as number;
    const triggerClose = Math.max(fixture.stop * 1.1, fast * 0.99);
    const trigger = candle(201, triggerClose * 1.02, triggerClose * 1.03, Math.max(fixture.stop * 1.01, triggerClose * 0.99), triggerClose);
    const gapOpen = fixture.stop * 0.97;
    const exitBar = candle(202, gapOpen, gapOpen * 1.02, gapOpen * 0.99, gapOpen * 1.01);
    const result = runRegimeTrendV1([...fixture.candles, trigger, exitBar]);

    expect(result.trades).toHaveLength(1);
    expect(result.trades[0].exit_reason).toBe("initial_stop");
    expect(result.trades[0].raw_exit_reference).toBeCloseTo(gapOpen, 10);
  });
});

describe("Regime Trend v1 recursive stability", () => {
  it("keeps stable-period signals identical when equivalent warm-up candles are prepended", () => {
    const core = makeTrendCandles(450);
    const firstClose = core[0].close;
    const warmup: Candle[] = Array.from({ length: 300 }, (_, index) => ({
      timestamp: (index - 300) * FOUR_HOURS,
      open: firstClose,
      high: firstClose * 1.01,
      low: firstClose * 0.99,
      close: firstClose,
      volume: 1000
    }));
    const shiftedCore = core.map((item, index) => ({ ...item, timestamp: index * FOUR_HOURS }));

    const baseResult = runRegimeTrendV1(shiftedCore);
    const prependedResult = runRegimeTrendV1([...warmup, ...shiftedCore]);
    const stableTimestamp = shiftedCore[300].timestamp;

    expect(prependedResult.signals.filter((signal) => signal.signalTimestamp >= stableTimestamp))
      .toEqual(baseResult.signals.filter((signal) => signal.signalTimestamp >= stableTimestamp));
  });
});
