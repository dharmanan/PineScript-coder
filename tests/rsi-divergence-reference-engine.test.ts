import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  FIVE,
  SPEC,
  aggregate5mTo15m,
  calculateDivergence,
  resolveIntrabar
} from "../research/rsi-divergence-reversal/reference-engine.mjs";

function candle(timestamp: number, overrides: Record<string, number> = {}) {
  return {
    timestamp,
    open: 100,
    high: 101,
    low: 99,
    close: 100,
    volume: 1,
    ...overrides
  };
}

describe("RSI Divergence Reversal reference engine", () => {
  it("aggregates only complete contiguous 15m groups", () => {
    const candles = [
      candle(0, { open: 100, high: 102, low: 99, close: 101, volume: 2 }),
      candle(FIVE, { open: 101, high: 104, low: 100, close: 103, volume: 3 }),
      candle(2 * FIVE, { open: 103, high: 105, low: 102, close: 104, volume: 4 }),
      candle(3 * FIVE),
      candle(5 * FIVE)
    ];

    expect(aggregate5mTo15m(candles)).toEqual([
      {
        timestamp: 0,
        open: 100,
        high: 105,
        low: 99,
        close: 104,
        volume: 9
      }
    ]);
  });

  it("confirms regular bullish divergence only after the right pivot bars", () => {
    const candles = Array.from({ length: 9 }, (_, index) =>
      candle(index * 15 * 60 * 1000, { low: index === 2 ? 90 : index === 6 ? 85 : 100 })
    );
    const rsi = [50, 40, 30, 40, 50, 38, 32, 42, 50];
    const spec = {
      ...SPEC,
      pivotLeft: 1,
      pivotRight: 1,
      rangeMin: 3,
      rangeMax: 3
    };

    const divergence = calculateDivergence(candles, rsi, spec);
    expect(divergence.bullish[6]).toBe(false);
    expect(divergence.bullish[7]).toBe(true);
  });

  it("uses TradingView path ordering and exposes conservative ambiguity", () => {
    const position = { direction: "long", stop: 95, target: 105 };
    const bothTouched = candle(0, { open: 100, high: 105.5, low: 94 });

    expect(resolveIntrabar(position, bothTouched, "tradingview_path")).toEqual({
      price: 105,
      reason: "target",
      ambiguous: true
    });
    expect(resolveIntrabar(position, bothTouched, "conservative_stop_first")).toEqual({
      price: 95,
      reason: "stop",
      ambiguous: true
    });
  });

  it("activates stop and target only after the on-close entry bar", async () => {
    const source = await readFile(
      join(process.cwd(), "research/rsi-divergence-reversal/reference-execution.mjs"),
      "utf8"
    );
    expect(source).toContain("if (position && candle.timestamp > position.entryTimestamp)");
  });
});
