import { describe, expect, it } from "vitest";
import {
  applyProfitProtection,
  solveRawFloor,
  summarizeCandidate
} from "../research/regime-trend-v1/profit-protection-tools.mjs";

const H4 = 4 * 60 * 60 * 1000;

function candle(index: number, open: number, high: number, low: number, close: number) {
  return { timestamp: index * H4, open, high, low, close, volume: 100 };
}

function trade(overrides = {}) {
  return {
    strategy_id: "regime-trend-v1",
    implementation_version: "test",
    dataset_hash: "hash",
    symbol: "TESTUSDT",
    timeframe: "4h",
    direction: "long",
    signal_timestamp: 0,
    entry_timestamp: 0,
    raw_entry_open: 100,
    entry_fill: 100,
    entry_atr: 2,
    initial_stop: 95,
    exit_timestamp: 4 * H4,
    raw_exit_reference: 96,
    exit_fill: 95.952,
    exit_reason: "initial_stop",
    quantity: 0.01,
    entry_fee: 0.001,
    exit_fee: 0.00095952,
    gross_pnl: -0.04048,
    net_pnl: -0.04243952,
    net_return: -0.04243952,
    bars_held: 4,
    ...overrides
  };
}

const candidate = { id: "test", activationAtr: 1, floorAtr: 0.25 };

describe("Regime Trend v1 profit protection", () => {
  it("solves a raw floor that realizes the requested net ATR at an exact touch", () => {
    const source = trade();
    const rawFloor = solveRawFloor(source, 0.25);
    const exitFill = rawFloor * (1 - 0.0005);
    const exitFee = exitFill * source.quantity * 0.001;
    const net = (exitFill - source.entry_fill) * source.quantity - source.entry_fee - exitFee;
    expect(net * source.entry_fill / source.entry_atr).toBeCloseTo(0.25, 10);
  });

  it("activates only after a completed close and applies the floor on the next candle", () => {
    const data = [
      candle(0, 100, 103, 99, 102.2),
      candle(1, 102, 104, 101, 103),
      candle(2, 103, 104, 99, 100),
      candle(3, 100, 101, 97, 98),
      candle(4, 98, 99, 95, 96)
    ];
    const result = applyProfitProtection(trade(), data, candidate);
    expect(result.activated).toBe(true);
    expect(result.exitedEarlier).toBe(true);
    expect(result.trade.exit_timestamp).toBe(2 * H4);
    expect(result.trade.net_pnl).toBeGreaterThan(0);
  });

  it("does not use the activation candle low before the close signal exists", () => {
    const data = [
      candle(0, 100, 103, 95, 102.2),
      candle(1, 103, 105, 102, 104),
      candle(2, 104, 105, 103, 104),
      candle(3, 104, 105, 103, 104),
      candle(4, 104, 105, 103, 104)
    ];
    const result = applyProfitProtection(trade({ exit_fill: 104, net_pnl: 0.038 }), data, candidate);
    expect(result.activated).toBe(true);
    expect(result.exitedEarlier).toBe(false);
  });

  it("uses the candle open when price gaps below the floor", () => {
    const data = [
      candle(0, 100, 103, 99, 102.5),
      candle(1, 99, 100, 98, 99),
      candle(2, 98, 99, 97, 98),
      candle(3, 97, 98, 96, 97),
      candle(4, 96, 97, 95, 96)
    ];
    const result = applyProfitProtection(trade(), data, candidate);
    expect(result.trade.raw_exit_reference).toBe(99);
    expect(result.trade.exit_reason).toBe("profit_protection_gap");
  });

  it("retains the baseline trade when activation never occurs", () => {
    const source = trade();
    const data = [
      candle(0, 100, 101, 99, 100),
      candle(1, 100, 101, 99, 100),
      candle(2, 100, 101, 98, 99),
      candle(3, 99, 100, 97, 98),
      candle(4, 98, 99, 95, 96)
    ];
    const result = applyProfitProtection(source, data, candidate);
    expect(result.activated).toBe(false);
    expect(result.trade).toBe(source);
  });

  it("summarizes saved losers and preserved winners", () => {
    const losing = trade();
    const winning = trade({ exit_timestamp: 5 * H4, net_pnl: 0.1, exit_fill: 110 });
    const summary = summarizeCandidate(
      [losing, winning],
      [
        { trade: { ...losing, net_pnl: 0.01 }, activated: true, exitedEarlier: true },
        { trade: winning, activated: true, exitedEarlier: false }
      ]
    );
    expect(summary.losing_to_winning).toBe(1);
    expect(summary.winners_preserved_90pct).toBe(1);
    expect(summary.activation_count).toBe(2);
  });
});
