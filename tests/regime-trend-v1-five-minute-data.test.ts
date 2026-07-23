import { describe, expect, it } from "vitest";
import {
  FIVE_MINUTES_MS,
  archiveFileName,
  archiveUrl,
  checksumUrl,
  listMonthIds,
  parseArchiveCsv,
  parseChecksum,
  validateArchiveCandles
} from "../research/regime-trend-v1/five-minute-data-tools.mjs";

function csvRow(timestamp: number, overrides: Record<string, number> = {}) {
  const open = overrides.open ?? 100;
  const high = overrides.high ?? 102;
  const low = overrides.low ?? 98;
  const close = overrides.close ?? 101;
  const volume = overrides.volume ?? 10;
  const closeTime = overrides.closeTime ?? timestamp + FIVE_MINUTES_MS - 1;
  return [timestamp, open, high, low, close, volume, closeTime, 0, 0, 0, 0, 0].join(",");
}

describe("Regime Trend v1 five-minute archive tools", () => {
  it("lists only 2019-01 through 2024-12 for the frozen range", () => {
    const months = listMonthIds();
    expect(months).toHaveLength(72);
    expect(months[0]).toBe("2019-01");
    expect(months.at(-1)).toBe("2024-12");
    expect(months).not.toContain("2025-01");
  });

  it("builds official Binance monthly spot kline URLs", () => {
    expect(archiveFileName("BTCUSDT", "2024-12")).toBe("BTCUSDT-5m-2024-12.zip");
    expect(archiveUrl("BTCUSDT", "2024-12")).toBe(
      "https://data.binance.vision/data/spot/monthly/klines/BTCUSDT/5m/BTCUSDT-5m-2024-12.zip"
    );
    expect(checksumUrl("BTCUSDT", "2024-12")).toBe(`${archiveUrl("BTCUSDT", "2024-12")}.CHECKSUM`);
  });

  it("parses and verifies Binance checksum files", () => {
    const hash = "a".repeat(64);
    expect(parseChecksum(`${hash}  BTCUSDT-5m-2024-12.zip\n`, "BTCUSDT-5m-2024-12.zip")).toBe(hash);
    expect(() => parseChecksum(`${hash}  WRONG.zip`, "BTCUSDT-5m-2024-12.zip")).toThrow(
      /filename mismatch/
    );
  });

  it("parses archive CSV rows without requiring a header", () => {
    const start = Date.parse("2024-12-01T00:00:00.000Z");
    const candles = parseArchiveCsv(`${csvRow(start)}\n${csvRow(start + FIVE_MINUTES_MS)}\n`);
    expect(candles).toHaveLength(2);
    expect(candles[0].timestamp).toBe(start);
    expect(candles[1].close).toBe(101);
  });

  it("accepts the optional Binance CSV header", () => {
    const start = Date.parse("2024-12-01T00:00:00.000Z");
    const candles = parseArchiveCsv(`open_time,open,high,low,close,volume,close_time\n${csvRow(start)}\n`);
    expect(candles).toHaveLength(1);
  });

  it("records internal and boundary gaps rather than synthesizing candles", () => {
    const start = Date.parse("2024-12-01T00:00:00.000Z");
    const candles = parseArchiveCsv(
      [csvRow(start + FIVE_MINUTES_MS), csvRow(start + 3 * FIVE_MINUTES_MS)].join("\n")
    );
    const result = validateArchiveCandles(candles, "2024-12");
    expect(result.leading_missing_intervals).toBe(1);
    expect(result.internal_gap_count).toBe(1);
    expect(result.gaps[0].missing_intervals).toBe(1);
    expect(result.missing_interval_count).toBeGreaterThan(2);
  });

  it("records shortened and extended close-time anomalies without rejecting valid OHLC", () => {
    const start = Date.parse("2024-12-01T00:00:00.000Z");
    const expectedClose = start + FIVE_MINUTES_MS - 1;
    const candles = parseArchiveCsv(
      [
        csvRow(start, { closeTime: expectedClose - 1000 }),
        csvRow(start + FIVE_MINUTES_MS, {
          closeTime: start + FIVE_MINUTES_MS + FIVE_MINUTES_MS - 1 + 60_000
        })
      ].join("\n")
    );
    const result = validateArchiveCandles(candles, "2024-12");
    expect(result.irregular_close_count).toBe(2);
    expect(result.shortened_close_count).toBe(1);
    expect(result.extended_close_count).toBe(1);
    expect(result.shortened_closes[0].shortened_by_ms).toBe(1000);
    expect(result.extended_closes[0].extended_by_ms).toBe(60_000);
  });

  it("rejects a close time that precedes its open time", () => {
    const start = Date.parse("2024-12-01T00:00:00.000Z");
    const candles = parseArchiveCsv(csvRow(start, { closeTime: start - 1 }));
    expect(() => validateArchiveCandles(candles, "2024-12")).toThrow(/precedes open time/);
  });

  it("rejects malformed OHLC bounds", () => {
    const start = Date.parse("2024-12-01T00:00:00.000Z");
    const candles = parseArchiveCsv(csvRow(start, { high: 99, close: 101 }));
    expect(() => validateArchiveCandles(candles, "2024-12")).toThrow(/OHLC bounds/);
  });
});
