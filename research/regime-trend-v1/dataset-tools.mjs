import { createHash } from "node:crypto";

export const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;
export const DATASET_START_MS = Date.parse("2019-01-01T00:00:00.000Z");
export const DATASET_END_EXCLUSIVE_MS = Date.parse("2026-07-01T00:00:00.000Z");
export const DATASET_SYMBOLS = Object.freeze(["BTCUSDT", "ETHUSDT", "BNBUSDT"]);
export const BINANCE_SPOT_API_BASE = "https://api.binance.com";
export const CSV_HEADER = "open_time,open,high,low,close,volume,close_time";

export function parseBinanceKline(row) {
  if (!Array.isArray(row) || row.length < 7) throw new Error("Invalid Binance kline row");
  const candle = {
    openTime: Number(row[0]),
    open: Number(row[1]),
    high: Number(row[2]),
    low: Number(row[3]),
    close: Number(row[4]),
    volume: Number(row[5]),
    closeTime: Number(row[6])
  };
  if (Object.values(candle).some((value) => !Number.isFinite(value))) {
    throw new Error("Kline contains a non-finite value");
  }
  return candle;
}

export function validateCandles(candles, options = {}) {
  const intervalMs = options.intervalMs ?? FOUR_HOURS_MS;
  const expectedStart = options.expectedStart;
  const expectedEndExclusive = options.expectedEndExclusive;
  const gapPolicy = options.gapPolicy ?? "reject";
  if (!Array.isArray(candles) || candles.length === 0) throw new Error("Dataset contains no candles");
  if (gapPolicy !== "reject" && gapPolicy !== "record") throw new Error(`Invalid gap policy: ${gapPolicy}`);

  const gaps = [];
  const duplicates = [];
  const shortenedCloses = [];

  for (let index = 0; index < candles.length; index += 1) {
    const candle = candles[index];
    const intervalEnd = candle.openTime + intervalMs - 1;
    if (candle.openTime % intervalMs !== 0) throw new Error(`Unaligned candle at ${candle.openTime}`);
    if (candle.closeTime < candle.openTime || candle.closeTime > intervalEnd) {
      throw new Error(`Invalid close time at ${candle.openTime}`);
    }
    if (candle.closeTime !== intervalEnd) {
      shortenedCloses.push({
        open_time: candle.openTime,
        close_time: candle.closeTime,
        expected_close_time: intervalEnd,
        shortened_by_ms: intervalEnd - candle.closeTime
      });
    }
    if (candle.open <= 0 || candle.high <= 0 || candle.low <= 0 || candle.close <= 0 || candle.volume < 0) {
      throw new Error(`Invalid positive OHLCV values at ${candle.openTime}`);
    }
    if (
      candle.high < Math.max(candle.open, candle.close) ||
      candle.low > Math.min(candle.open, candle.close) ||
      candle.low > candle.high
    ) {
      throw new Error(`Invalid OHLC bounds at ${candle.openTime}`);
    }
    if (index > 0) {
      const previous = candles[index - 1];
      const delta = candle.openTime - previous.openTime;
      if (delta === 0) duplicates.push(candle.openTime);
      else if (delta !== intervalMs) {
        gaps.push({
          after: previous.openTime,
          before: candle.openTime,
          delta,
          missing_intervals: Math.max(0, Math.round(delta / intervalMs) - 1)
        });
      }
    }
  }

  if (duplicates.length > 0) throw new Error(`Duplicate candles: ${duplicates.join(",")}`);
  if (gaps.length > 0 && gapPolicy === "reject") {
    throw new Error(`Missing candle intervals: ${JSON.stringify(gaps.slice(0, 5))}`);
  }
  if (expectedStart !== undefined && candles[0].openTime !== expectedStart) {
    throw new Error(`Unexpected first candle: ${candles[0].openTime}; expected ${expectedStart}`);
  }
  if (expectedEndExclusive !== undefined && candles.at(-1).openTime + intervalMs !== expectedEndExclusive) {
    throw new Error(`Unexpected dataset end: ${candles.at(-1).openTime + intervalMs}; expected ${expectedEndExclusive}`);
  }

  return {
    rowCount: candles.length,
    firstOpenTime: candles[0].openTime,
    lastOpenTime: candles.at(-1).openTime,
    duplicateCount: 0,
    gapCount: gaps.length,
    missingIntervalCount: gaps.reduce((sum, gap) => sum + gap.missing_intervals, 0),
    shortenedCloseCount: shortenedCloses.length,
    gaps,
    shortenedCloses
  };
}

export function candlesToCsv(candles) {
  const lines = candles.map((candle) => [
    candle.openTime,
    candle.open,
    candle.high,
    candle.low,
    candle.close,
    candle.volume,
    candle.closeTime
  ].join(","));
  return `${CSV_HEADER}\n${lines.join("\n")}\n`;
}

export function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

export async function fetchKlineRange({
  symbol,
  startTime,
  endExclusive,
  fetchImpl = fetch,
  baseUrl = BINANCE_SPOT_API_BASE
}) {
  const candles = [];
  let cursor = startTime;
  while (cursor < endExclusive) {
    const endTime = Math.min(endExclusive - 1, cursor + FOUR_HOURS_MS * 1000 - 1);
    const url = new URL("/api/v3/klines", baseUrl);
    url.searchParams.set("symbol", symbol);
    url.searchParams.set("interval", "4h");
    url.searchParams.set("startTime", String(cursor));
    url.searchParams.set("endTime", String(endTime));
    url.searchParams.set("limit", "1000");

    const response = await fetchImpl(url);
    if (!response.ok) throw new Error(`Binance request failed for ${symbol}: HTTP ${response.status}`);
    const rows = await response.json();
    if (!Array.isArray(rows) || rows.length === 0) throw new Error(`Binance returned no rows for ${symbol} at ${cursor}`);
    const page = rows.map(parseBinanceKline).filter((candle) => candle.openTime < endExclusive);
    if (page.length === 0) throw new Error(`Binance page had no usable rows for ${symbol} at ${cursor}`);
    candles.push(...page);
    const nextCursor = page.at(-1).openTime + FOUR_HOURS_MS;
    if (nextCursor <= cursor) throw new Error(`Pagination did not advance for ${symbol}`);
    cursor = nextCursor;
  }
  return candles;
}

export function buildManifestEntry({ symbol, fileName, csv, validation }) {
  return {
    symbol,
    market: "spot",
    exchange: "Binance",
    interval: "4h",
    timezone: "UTC",
    file: fileName,
    sha256: sha256(csv),
    row_count: validation.rowCount,
    first_open_time: new Date(validation.firstOpenTime).toISOString(),
    last_open_time: new Date(validation.lastOpenTime).toISOString(),
    duplicate_count: validation.duplicateCount,
    gap_count: validation.gapCount,
    missing_interval_count: validation.missingIntervalCount,
    shortened_close_count: validation.shortenedCloseCount,
    gaps: validation.gaps.map((gap) => ({
      after: new Date(gap.after).toISOString(),
      before: new Date(gap.before).toISOString(),
      missing_intervals: gap.missing_intervals
    })),
    shortened_closes: validation.shortenedCloses.map((item) => ({
      open_time: new Date(item.open_time).toISOString(),
      close_time: new Date(item.close_time).toISOString(),
      expected_close_time: new Date(item.expected_close_time).toISOString(),
      shortened_by_ms: item.shortened_by_ms
    }))
  };
}
