import { describe, expect, it } from "vitest";
import { confirmedRegularDivergence } from "../research/preset-sweep/engine.mjs";

const HALF_HOUR = 30 * 60 * 1000;

const candle = (index: number, low = 100, high = 110) => ({
  timestamp: index * HALF_HOUR,
  open: 105,
  high,
  low,
  close: 105,
  volume: 1
});

describe("preset sweep RSI divergence parity", () => {
  it("uses RSI pivots and samples price there without requiring a price pivot", () => {
    const rsi = [50, 40, 30, 40, 55, 50, 45, 40, 35, 45, 50];
    const candles = rsi.map((_, index) =>
      candle(index, index === 2 ? 90 : index === 7 ? 80 : index === 8 ? 85 : 100)
    );

    const divergence = confirmedRegularDivergence(candles, rsi, 1);

    // The second RSI pivot is confirmed at index 9. Its sampled price (85) is below
    // the previous RSI pivot's price (90), even though index 8 is not a price pivot
    // because index 7 printed a lower low.
    expect(divergence.bullish[9]).toBe(true);
  });

  it("applies Pine's minimum and maximum previous-pivot range", () => {
    const rsi = [50, 40, 30, 40, 55, 50, 45, 40, 35, 45, 50];
    const candles = rsi.map((_, index) =>
      candle(index, index === 2 ? 90 : index === 8 ? 85 : 100)
    );

    expect(confirmedRegularDivergence(candles, rsi, 1, 5, 60).bullish[9]).toBe(true);
    expect(confirmedRegularDivergence(candles, rsi, 1, 6, 60).bullish[9]).toBe(false);
    expect(confirmedRegularDivergence(candles, rsi, 1, 1, 4).bullish[9]).toBe(false);
  });

  it("supports separate left and right pivot widths for research candidates", () => {
    const rsi = [60, 55, 45, 30, 40, 50, 55, 48, 40, 35, 38, 45, 50];
    const candles = rsi.map((_, index) =>
      candle(index, index === 3 ? 90 : index === 9 ? 85 : 100)
    );

    const divergence = confirmedRegularDivergence(candles, rsi, {
      left: 2,
      right: 1,
      rangeMinimum: 4,
      rangeMaximum: 60
    });

    expect(divergence.bullish[10]).toBe(true);
  });
});
