import { describe, expect, it } from "vitest";
import {
  buyAndHoldReturn,
  filterPartition,
  parseCsvCandles,
  splitContiguousCandles,
  summarizeTrades,
  tradeLedgerToCsv
} from "../research/regime-trend-v1/backtest-tools.mjs";
import { CSV_HEADER, FOUR_HOURS_MS } from "../research/regime-trend-v1/dataset-tools.mjs";

function csvRow(index: number, price = 100): string {
  const openTime = index * FOUR_HOURS_MS;
  return [openTime, price, price + 2, price - 2, price + 1, 10, openTime + FOUR_HOURS_MS - 1].join(",");
}

function trade(netPnl: number, exitTimestamp: number, symbol = "TESTUSDT") {
  return {
    strategy_id: "regime-trend-v1",
    implementation_version: "typescript-reference-v1.0.1",
    dataset_hash: "hash",
    symbol,
    timeframe: "4h",
    direction: "long",
    signal_timestamp: 0,
    entry_timestamp: 1,
    raw_entry_open: 100,
    entry_fill: 100.05,
    entry_atr: 2,
    initial_stop: 95.05,
    exit_timestamp: exitTimestamp,
    raw_exit_reference: 101,
    exit_fill: 100.95,
    exit_reason: "trend_exit",
    quantity: 1 / 100.05,
    entry_fee: 0.001,
    exit_fee: 0.001,
    gross_pnl: netPnl + 0.002,
    net_pnl: netPnl,
    net_return: netPnl,
    bars_held: 2
  };
}

describe("Regime Trend v1 backtest tools", () => {
  it("parses only rows before the holdout boundary", () => {
    const csv = `${CSV_HEADER}\n${csvRow(0)}\n${csvRow(1)}\n${csvRow(2)}\n`;
    const candles = parseCsvCandles(csv, { endExclusive: 2 * FOUR_HOURS_MS });
    expect(candles).toHaveLength(2);
    expect(candles.at(-1)?.timestamp).toBe(FOUR_HOURS_MS);
  });

  it("splits candles at a missing interval", () => {
    const csv = `${CSV_HEADER}\n${csvRow(0)}\n${csvRow(1)}\n${csvRow(3)}\n`;
    const segments = splitContiguousCandles(parseCsvCandles(csv));
    expect(segments.map((segment) => segment.length)).toEqual([2, 1]);
  });

  it("filters chronological partitions", () => {
    const csv = `${CSV_HEADER}\n${csvRow(0)}\n${csvRow(1)}\n${csvRow(2)}\n`;
    const candles = parseCsvCandles(csv);
    const filtered = filterPartition(candles, {
      start: FOUR_HOURS_MS,
      endExclusive: 3 * FOUR_HOURS_MS
    });
    expect(filtered.map((item) => item.timestamp)).toEqual([FOUR_HOURS_MS, 2 * FOUR_HOURS_MS]);
  });

  it("calculates expectancy, profit factor and drawdown deterministically", () => {
    const metrics = summarizeTrades([
      trade(0.1, 1),
      trade(-0.05, 2),
      trade(0.02, 3)
    ]);
    expect(metrics.closed_trades).toBe(3);
    expect(metrics.winning_trades).toBe(2);
    expect(metrics.total_net_pnl).toBeCloseTo(0.07, 12);
    expect(metrics.average_net_pnl).toBeCloseTo(0.07 / 3, 12);
    expect(metrics.profit_factor).toBeCloseTo(2.4, 12);
    expect(metrics.max_drawdown_normalized_units).toBeCloseTo(0.05, 12);
  });

  it("reports buy-and-hold return and stable ledger columns", () => {
    const candles = [
      { timestamp: 0, open: 100, high: 102, low: 98, close: 101, volume: 1 },
      { timestamp: FOUR_HOURS_MS, open: 101, high: 112, low: 100, close: 110, volume: 1 }
    ];
    expect(buyAndHoldReturn(candles)).toBeCloseTo(0.1, 12);
    const csv = tradeLedgerToCsv([trade(0.1, 2)]);
    expect(csv).toContain("strategy_id,implementation_version,dataset_hash");
    expect(csv).toContain("regime-trend-v1,typescript-reference-v1.0.1,hash");
  });
});
