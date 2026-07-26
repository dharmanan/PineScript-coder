import { describe, expect, it } from "vitest";
// @ts-expect-error - the sweep engine is plain ESM, deliberately outside the app build.
import { liquiditySweep, structureBias, swingLevels } from "../research/preset-sweep/indicators.mjs";

type Candle = { timestamp: number; open: number; high: number; low: number; close: number; volume: number };

const candle = (index: number, open: number, high: number, low: number, close: number, volume = 1000): Candle => ({
  timestamp: index * 60000, open, high, low, close, volume
});

// A flat run long enough for pivots to have room on both sides.
const flat = (count: number, price: number, from = 0): Candle[] =>
  Array.from({ length: count }, (_, index) => candle(from + index, price, price + 0.1, price - 0.1, price));

describe("swing levels", () => {
  it("publishes a pivot only once its right-hand window has closed", () => {
    const candles = [
      ...flat(4, 100),
      candle(4, 100, 110, 99, 105), // the high
      ...flat(4, 100, 5)
    ];
    const { swingHighs } = swingLevels(candles, 3);
    expect(swingHighs).toHaveLength(1);
    expect(swingHighs[0].price).toBe(110);
    expect(swingHighs[0].pivotAt).toBe(4);
    // Three candles later, never on the pivot bar itself.
    expect(swingHighs[0].confirmedAt).toBe(7);
  });

  it("finds no pivot when the right-hand window never completes", () => {
    const candles = [...flat(4, 100), candle(4, 100, 110, 99, 105), ...flat(2, 100, 5)];
    expect(swingLevels(candles, 3).swingHighs).toHaveLength(0);
  });
});

describe("structure bias", () => {
  // Two rising highs and two rising lows: higher highs with higher lows reads bullish.
  // A low candle keeps its high under the flat run's 100.1 and a high candle keeps its
  // low above the flat run's 99.9, so neither doubles as a pivot of the opposite kind.
  const rising = [
    ...flat(3, 100),
    candle(3, 100, 100, 94, 96), // low 1
    ...flat(3, 100, 4),
    candle(7, 100, 110, 99.95, 105), // high 1
    ...flat(3, 100, 8),
    candle(11, 100, 100, 96, 98), // low 2, higher
    ...flat(3, 100, 12),
    candle(15, 100, 115, 99.95, 110), // high 2, higher
    ...flat(4, 100, 16)
  ];

  it("reads higher highs with higher lows as bullish", () => {
    const bias = structureBias(rising, 3);
    expect(bias.at(-1)).toBe(true);
  });

  it("reads lower highs with lower lows as bearish", () => {
    const falling = rising.map((item, index) => {
      const mirrored = { ...item, high: 200 - item.low, low: 200 - item.high, open: 200 - item.open, close: 200 - item.close };
      return { ...mirrored, timestamp: index * 60000 };
    });
    expect(structureBias(falling, 3).at(-1)).toBe(false);
  });

  it("stays undecided until two highs and two lows have been confirmed", () => {
    const bias = structureBias(rising, 3);
    // The second high confirms three bars after index 15.
    expect(bias[17]).toBeNull();
    expect(bias[18]).not.toBeNull();
  });

  // The whole reason for preferring structure over a moving average is that it does not
  // wait for an average to catch up, so it must never read a bar that has not closed.
  it("never changes a past value when later candles arrive", () => {
    const full = structureBias(rising, 3);
    for (let cut = 10; cut < rising.length; cut += 1) {
      const partial = structureBias(rising.slice(0, cut), 3);
      for (let index = 0; index < cut; index += 1) {
        expect(partial[index]).toBe(full[index]);
      }
    }
  });
});

describe("liquidity sweep", () => {
  // A low is set, then taken out, then price closes back above it having spent most of
  // the candle rejecting: that is a sell-side sweep and reads bullish.
  const swept = [
    ...flat(3, 100),
    candle(3, 100, 101, 95, 96), // the low being hunted
    ...flat(6, 100, 4),
    candle(10, 100, 100.5, 90, 99.5) // takes 95, closes back above, long lower wick
  ];

  it("marks a sell-side sweep as bullish", () => {
    const { bullish } = liquiditySweep(swept, 3);
    expect(bullish[10]).toBe(true);
  });

  it("ignores a break that closes beyond the level instead of rejecting it", () => {
    const broken = [...swept.slice(0, 10), candle(10, 100, 100.5, 90, 91)];
    expect(liquiditySweep(broken, 3).bullish[10]).toBe(false);
  });

  // Without the half-candle test every level crossing would count as a sweep.
  it("ignores a shallow wick that does not reject far enough", () => {
    const shallow = [...swept.slice(0, 10), candle(10, 100, 104, 94.9, 96)];
    expect(liquiditySweep(shallow, 3).bullish[10]).toBe(false);
  });

  it("cannot see a level whose pivot has not been confirmed yet", () => {
    // The low at index 3 confirms at index 6; a sweep at index 5 must not see it.
    const early = [...flat(3, 100), candle(3, 100, 101, 95, 96), candle(4, 100, 101, 99, 100), candle(5, 100, 100.5, 90, 99.5)];
    expect(liquiditySweep(early, 3).bullish[5]).toBe(false);
  });

  it("never changes a past value when later candles arrive", () => {
    const full = liquiditySweep(swept, 3);
    for (let cut = 5; cut < swept.length; cut += 1) {
      const partial = liquiditySweep(swept.slice(0, cut), 3);
      for (let index = 0; index < cut; index += 1) {
        expect(partial.bullish[index]).toBe(full.bullish[index]);
        expect(partial.bearish[index]).toBe(full.bearish[index]);
      }
    }
  });
});
