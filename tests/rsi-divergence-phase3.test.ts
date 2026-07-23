import { describe, expect, it } from "vitest";
import {
  PHASE3_CANDIDATES,
  closed4hTrend
} from "../research/rsi-divergence-reversal/phase3-tools.mjs";

const FIFTEEN = 15 * 60 * 1000;

function candles(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    timestamp: index * FIFTEEN,
    open: 100 + index,
    high: 101 + index,
    low: 99 + index,
    close: 100.5 + index,
    volume: 1
  }));
}

describe("RSI divergence phase three", () => {
  it("keeps the frozen candidate matrix at 144 candidates", () => {
    expect(PHASE3_CANDIDATES).toHaveLength(144);
    expect(new Set(PHASE3_CANDIDATES.map((candidate) => candidate.id)).size).toBe(144);
  });

  it("does not expose an unfinished four-hour candle", () => {
    const source = candles(16 * 205 + 8);
    const trend = closed4hTrend(source);

    const firstIncompleteIndex = 16 * 205;
    const stateBeforeIncompleteClose = trend.state[firstIncompleteIndex + 7];
    const lastCompletedBar = trend.bars.at(-1);

    expect(lastCompletedBar).toBeDefined();
    expect(stateBeforeIncompleteClose).not.toBeNull();
    expect(stateBeforeIncompleteClose?.completedBarCloseTimestamp).toBeLessThanOrEqual(
      source[firstIncompleteIndex + 7].timestamp + FIFTEEN
    );
    expect(stateBeforeIncompleteClose?.completedBarTimestamp).not.toBe(
      source[firstIncompleteIndex].timestamp
    );
  });
});
