import { describe, expect, it } from "vitest";
import {
  FOUR_HOURS_MS,
  buildManifestEntry,
  candlesToCsv,
  fetchKlineRange,
  parseBinanceKline,
  sha256,
  validateCandles
} from "../research/regime-trend-v1/dataset-tools.mjs";

function row(openTime: number, price = 100, closeTime = openTime + FOUR_HOURS_MS - 1): unknown[] {
  return [
    openTime,
    String(price),
    String(price + 2),
    String(price - 2),
    String(price + 1),
    "10",
    closeTime,
    "0",
    1,
    "0",
    "0",
    "0"
  ];
}

describe("Regime Trend v1 Binance dataset tools", () => {
  it("parses and validates a contiguous 4h dataset", () => {
    const candles = [0, 1, 2].map((index) => parseBinanceKline(row(index * FOUR_HOURS_MS)));
    const result = validateCandles(candles, {
      expectedStart: 0,
      expectedEndExclusive: 3 * FOUR_HOURS_MS
    });
    expect(result).toMatchObject({
      rowCount: 3,
      firstOpenTime: 0,
      lastOpenTime: 2 * FOUR_HOURS_MS,
      duplicateCount: 0,
      gapCount: 0,
      missingIntervalCount: 0,
      shortenedCloseCount: 0
    });
  });

  it("records a shortened maintenance candle close inside its interval", () => {
    const shortenedClose = 2 * 60 * 60 * 1000 - 1;
    const candles = [parseBinanceKline(row(0, 100, shortenedClose))];
    const result = validateCandles(candles, {
      expectedStart: 0,
      expectedEndExclusive: FOUR_HOURS_MS
    });
    expect(result.shortenedCloseCount).toBe(1);
    expect(result.shortenedCloses[0]).toMatchObject({
      open_time: 0,
      close_time: shortenedClose,
      expected_close_time: FOUR_HOURS_MS - 1
    });
  });

  it("rejects missing intervals by default", () => {
    const candles = [0, 2].map((index) => parseBinanceKline(row(index * FOUR_HOURS_MS)));
    expect(() => validateCandles(candles)).toThrow("Missing candle intervals");
  });

  it("records missing intervals when the research policy requests it", () => {
    const candles = [0, 2].map((index) => parseBinanceKline(row(index * FOUR_HOURS_MS)));
    const result = validateCandles(candles, { gapPolicy: "record" });
    expect(result.gapCount).toBe(1);
    expect(result.missingIntervalCount).toBe(1);
    expect(result.gaps[0]).toMatchObject({
      after: 0,
      before: 2 * FOUR_HOURS_MS,
      missing_intervals: 1
    });
  });

  it("rejects duplicate timestamps", () => {
    const candles = [parseBinanceKline(row(0)), parseBinanceKline(row(0))];
    expect(() => validateCandles(candles)).toThrow("Duplicate candles");
  });

  it("paginates without overlapping rows", async () => {
    const allRows = Array.from({ length: 1002 }, (_, index) => row(index * FOUR_HOURS_MS, 100 + index));
    const calls: URL[] = [];
    const fetchImpl = async (input: URL | RequestInfo) => {
      const url = input instanceof URL ? input : new URL(String(input));
      calls.push(url);
      const start = Number(url.searchParams.get("startTime"));
      const page = allRows.filter((item) => Number(item[0]) >= start).slice(0, 1000);
      return new Response(JSON.stringify(page), { status: 200 });
    };

    const candles = await fetchKlineRange({
      symbol: "TESTUSDT",
      startTime: 0,
      endExclusive: 1002 * FOUR_HOURS_MS,
      fetchImpl,
      baseUrl: "https://example.test"
    });

    expect(calls).toHaveLength(2);
    expect(candles).toHaveLength(1002);
    expect(new Set(candles.map((candle) => candle.openTime)).size).toBe(1002);
    expect(Number(calls[1].searchParams.get("startTime"))).toBe(1000 * FOUR_HOURS_MS);
  });

  it("creates deterministic CSV and manifest hashes", () => {
    const candles = [parseBinanceKline(row(0))];
    const csv = candlesToCsv(candles);
    const validation = validateCandles(candles, {
      expectedStart: 0,
      expectedEndExclusive: FOUR_HOURS_MS
    });
    const entry = buildManifestEntry({
      symbol: "TESTUSDT",
      fileName: "test.csv",
      csv,
      validation
    });

    expect(csv).toContain("open_time,open,high,low,close,volume,close_time");
    expect(entry.sha256).toBe(sha256(csv));
    expect(entry.row_count).toBe(1);
    expect(entry.gap_count).toBe(0);
    expect(entry.shortened_close_count).toBe(0);
  });
});
