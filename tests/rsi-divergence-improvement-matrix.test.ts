import { describe, expect, it } from "vitest";
import {
  CANDIDATES,
  RISK_VARIANTS,
  SIGNAL_VARIANTS,
  candidateScore,
  ema
} from "../research/rsi-divergence-reversal/improvement-tools.mjs";

describe("RSI divergence improvement matrix", () => {
  it("freezes exactly 80 predeclared candidates", () => {
    expect(SIGNAL_VARIANTS).toHaveLength(10);
    expect(RISK_VARIANTS).toHaveLength(4);
    expect(CANDIDATES).toHaveLength(80);
    expect(new Set(CANDIDATES.map((candidate) => candidate.id)).size).toBe(80);
    expect(CANDIDATES.every((candidate) => Object.isFrozen(candidate))).toBe(true);
  });

  it("contains both reverse and hold execution modes for every signal and risk pair", () => {
    for (const signal of SIGNAL_VARIANTS) {
      for (const risk of RISK_VARIANTS) {
        const prefix = `${signal.id}__${risk.id}__`;
        expect(CANDIDATES.some((candidate) => candidate.id === `${prefix}reverse`)).toBe(true);
        expect(CANDIDATES.some((candidate) => candidate.id === `${prefix}hold`)).toBe(true);
      }
    }
  });

  it("calculates a deterministic EMA seed and continuation", () => {
    expect(ema([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4]);
  });

  it("rejects undersized samples during development ranking", () => {
    expect(candidateScore({
      closed_trades: 59,
      total_net_return_units: 10,
      profit_factor: 3,
      max_drawdown_return_units: 0.1
    })).toBe(Number.NEGATIVE_INFINITY);
  });
});
