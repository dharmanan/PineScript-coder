import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";

export const FIVE_MINUTES_MS = 5 * 60 * 1000;
export const FIVE_MINUTE_START_MS = Date.parse("2019-01-01T00:00:00.000Z");
export const FIVE_MINUTE_END_EXCLUSIVE_MS = Date.parse("2025-01-01T00:00:00.000Z");
export const FIVE_MINUTE_SYMBOLS = Object.freeze(["BTCUSDT", "ETHUSDT", "BNBUSDT"]);
export const BINANCE_ARCHIVE_BASE = "https://data.binance.vision/data/spot/monthly/klines";

export function monthId(timestamp) {
  const date = new Date(timestamp);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function monthBounds(id) {
  if (!/^\d{4}-\d{2}$/.test(id)) throw new Error(`Invalid month id: ${id}`);
  const [year, month] = id.split("-").map(Number);
  if (month < 1 || month > 12) throw new Error(`Invalid month id: ${id}`);
  const start = Date.UTC(year, month - 1, 1);
  const endExclusive = Date.UTC(year, month, 1);
  return { start, endExclusive };
}

export function listMonthIds(start = FIVE_MINUTE_START_MS, endExclusive = FIVE_MINUTE_END_EXCLUSIVE_MS) {
  if (!Number.isFinite(start) || !Number.isFinite(endExclusive) || endExclusive <= start) {
    throw new Error("Invalid month range");
  }
  const months = [];
  let cursor = Date.UTC(new Date(start).getUTCFullYear(), new Date(start).getUTCMonth(), 1);
  while (cursor < endExclusive) {
    months.push(monthId(cursor));
    const date = new Date(cursor);
    cursor = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
  }
  return months;
}

export function archiveFileName(symbol, month) {
  return `${symbol}-5m-${month}.zip`;
}

export function archiveUrl(symbol, month) {
  const fileName = archiveFileName(symbol, month);
  return `${BINANCE_ARCHIVE_BASE}/${symbol}/5m/${fileName}`;
}

export function checksumUrl(symbol, month) {
  return `${archiveUrl(symbol, month)}.CHECKSUM`;
}

export function parseChecksum(text, expectedFileName) {
  const match = text.trim().match(/^([a-fA-F0-9]{64})\s+\*?(.+)$/);
  if (!match) throw new Error(`Invalid checksum file for ${expectedFileName}`);
  const [, hash, fileName] = match;
  if (fileName.trim() !== expectedFileName) {
    throw new Error(`Checksum filename mismatch: ${fileName.trim()} !== ${expectedFileName}`);
  }
  return hash.toLowerCase();
}

export async function sha256File(path) {
  const hash = createHash("sha256");
  await new Promise((resolve, reject) => {
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  return hash.digest("hex");
}

export function parseArchiveCsv(csv) {
  const lines = csv.trim().split(/\r?\n/);
  const candles = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (!lines[index].trim()) continue;
    const columns = lines[index].split(",");
    if (columns.length < 7) throw new Error(`Invalid 5m CSV row ${index + 1}`);
    if (!/^\d+$/.test(columns[0].trim())) {
      if (index === 0) continue;
      throw new Error(`Unexpected 5m CSV header at row ${index + 1}`);
    }
    const openTime = Number(columns[0]);
    const open = Number(columns[1]);
    const high = Number(columns[2]);
    const low = Number(columns[3]);
    const close = Number(columns[4]);
    const volume = Number(columns[5]);
    const closeTime = Number(columns[6]);
    if ([openTime, open, high, low, close, volume, closeTime].some((value) => !Number.isFinite(value))) {
      throw new Error(`Non-finite 5m CSV value at row ${index + 1}`);
    }
    candles.push({ timestamp: openTime, open, high, low, close, volume, closeTime });
  }
  if (candles.length === 0) throw new Error("5m archive contains no candle rows");
  return candles;
}

export function validateArchiveCandles(candles, month) {
  const { start, endExclusive } = monthBounds(month);
  const gaps = [];
  const shortenedCloses = [];
  let missingIntervalCount = 0;

  for (let index = 0; index < candles.length; index += 1) {
    const candle = candles[index];
    if (candle.timestamp % FIVE_MINUTES_MS !== 0) {
      throw new Error(`Unaligned 5m candle at ${candle.timestamp}`);
    }
    if (candle.timestamp < start || candle.timestamp >= endExclusive) {
      throw new Error(`5m candle outside ${month}: ${candle.timestamp}`);
    }
    if (candle.open <= 0 || candle.high <= 0 || candle.low <= 0 || candle.close <= 0 || candle.volume < 0) {
      throw new Error(`Invalid positive 5m OHLCV values at ${candle.timestamp}`);
    }
    if (
      candle.high < Math.max(candle.open, candle.close) ||
      candle.low > Math.min(candle.open, candle.close) ||
      candle.low > candle.high
    ) {
      throw new Error(`Invalid 5m OHLC bounds at ${candle.timestamp}`);
    }
    const expectedClose = candle.timestamp + FIVE_MINUTES_MS - 1;
    if (candle.closeTime < candle.timestamp || candle.closeTime > expectedClose) {
      throw new Error(`Invalid 5m close time at ${candle.timestamp}`);
    }
    if (candle.closeTime !== expectedClose) {
      shortenedCloses.push({
        open_time: candle.timestamp,
        close_time: candle.closeTime,
        expected_close_time: expectedClose,
        shortened_by_ms: expectedClose - candle.closeTime
      });
    }
    if (index > 0) {
      const previous = candles[index - 1];
      const delta = candle.timestamp - previous.timestamp;
      if (delta <= 0) throw new Error(`Duplicate or unordered 5m candle at ${candle.timestamp}`);
      if (delta !== FIVE_MINUTES_MS) {
        const missing = Math.max(0, Math.round(delta / FIVE_MINUTES_MS) - 1);
        missingIntervalCount += missing;
        gaps.push({ after: previous.timestamp, before: candle.timestamp, missing_intervals: missing });
      }
    }
  }

  const leadingMissing = Math.max(0, Math.round((candles[0].timestamp - start) / FIVE_MINUTES_MS));
  const trailingMissing = Math.max(
    0,
    Math.round((endExclusive - (candles.at(-1).timestamp + FIVE_MINUTES_MS)) / FIVE_MINUTES_MS)
  );
  missingIntervalCount += leadingMissing + trailingMissing;

  return {
    row_count: candles.length,
    first_open_time: candles[0].timestamp,
    last_open_time: candles.at(-1).timestamp,
    internal_gap_count: gaps.length,
    missing_interval_count: missingIntervalCount,
    leading_missing_intervals: leadingMissing,
    trailing_missing_intervals: trailingMissing,
    shortened_close_count: shortenedCloses.length,
    gaps,
    shortened_closes: shortenedCloses
  };
}
