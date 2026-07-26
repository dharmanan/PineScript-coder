import { readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { inflateRawSync } from "node:zlib";
import { join } from "node:path";
import {
  archiveFileName, archiveUrl, checksumUrl, parseArchiveCsv, parseChecksum, sha256File, validateArchiveCandles
} from "../regime-trend-v1/five-minute-data-tools.mjs";

export async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

// Binance monthly archives hold a single deflated CSV. Reading it with node:zlib keeps
// the run free of an external unzip binary, which the build container does not carry.
export function readSingleZipEntry(buffer) {
  let eocd = -1;
  for (let offset = buffer.length - 22; offset >= 0; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) { eocd = offset; break; }
  }
  if (eocd === -1) throw new Error("Not a ZIP archive: end of central directory not found");
  if (buffer.readUInt16LE(eocd + 10) !== 1) throw new Error("Expected exactly one file inside the archive");

  const central = buffer.readUInt32LE(eocd + 16);
  if (buffer.readUInt32LE(central) !== 0x02014b50) throw new Error("Corrupt ZIP central directory");
  const method = buffer.readUInt16LE(central + 10);
  const compressedSize = buffer.readUInt32LE(central + 20);
  const uncompressedSize = buffer.readUInt32LE(central + 24);
  const localOffset = buffer.readUInt32LE(central + 42);

  if (buffer.readUInt32LE(localOffset) !== 0x04034b50) throw new Error("Corrupt ZIP local header");
  const dataStart = localOffset + 30 + buffer.readUInt16LE(localOffset + 26) + buffer.readUInt16LE(localOffset + 28);
  const data = buffer.subarray(dataStart, dataStart + compressedSize);

  const output = method === 0 ? Buffer.from(data) : method === 8 ? inflateRawSync(data) : null;
  if (!output) throw new Error(`Unsupported ZIP compression method ${method}`);
  if (output.length !== uncompressedSize) throw new Error(`ZIP size mismatch: ${output.length} != ${uncompressedSize}`);
  return output.toString("utf8");
}

// Binance switched its kline archives from millisecond to microsecond timestamps during
// 2025. Left alone, every later candle would sit a hundred thousand years in the future
// and silently fall outside every window. Archives are normalised back to milliseconds so
// files from either era are interchangeable downstream.
const MILLISECOND_CEILING = 1e14;

export function normaliseTimestamps(csv) {
  let converted = 0;
  const output = csv.split("\n").map((line) => {
    if (!line.trim()) return line;
    const columns = line.split(",");
    if (columns.length < 7 || !/^\d+$/.test(columns[0].trim())) return line;
    if (Number(columns[0]) <= MILLISECOND_CEILING) return line;
    converted += 1;
    columns[0] = String(Math.floor(Number(columns[0]) / 1000));
    columns[6] = String(Math.floor(Number(columns[6]) / 1000));
    return columns.join(",");
  });
  return { csv: output.join("\n"), converted };
}

async function fetchText(url) {
  const response = await fetch(url, { redirect: "follow" });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Download failed: ${url} HTTP ${response.status}`);
  return response.text();
}

async function downloadFile(url, destination) {
  const partPath = `${destination}.part`;
  await rm(partPath, { force: true });
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok || !response.body) throw new Error(`Download failed: ${url} HTTP ${response.status}`);
  await pipeline(response.body, createWriteStream(partPath));
  await rename(partPath, destination);
}

// Binance publishes a checksum next to every archive. A file that does not match it is
// deleted rather than used, so a truncated or tampered download cannot enter a result.
// A month that does not exist yet, or predates a listing, returns null instead of failing.
export async function ensureArchive(archiveDirectory, symbol, month) {
  const fileName = archiveFileName(symbol, month);
  const zipPath = join(archiveDirectory, fileName);
  const checksumText = await fetchText(checksumUrl(symbol, month));
  if (checksumText === null) return null;
  const expectedSha256 = parseChecksum(checksumText, fileName);

  if (await exists(zipPath)) {
    if ((await sha256File(zipPath)) === expectedSha256) return { zipPath, expectedSha256, reused: true };
    await rm(zipPath, { force: true });
  }

  await downloadFile(archiveUrl(symbol, month), zipPath);
  const actual = await sha256File(zipPath);
  if (actual !== expectedSha256) {
    await rm(zipPath, { force: true });
    throw new Error(`SHA-256 mismatch for ${fileName}: ${actual} !== ${expectedSha256}`);
  }
  return { zipPath, expectedSha256, reused: false };
}

export async function extractAndValidate(csvDirectory, symbol, month, zipPath) {
  const csvName = `${symbol}-5m-${month}.csv`;
  const csvPath = join(csvDirectory, csvName);
  const { csv, converted } = normaliseTimestamps(readSingleZipEntry(await readFile(zipPath)));
  const validation = validateArchiveCandles(parseArchiveCsv(csv), month);
  await writeFile(csvPath, csv.endsWith("\n") ? csv : `${csv}\n`, "utf8");
  return {
    symbol,
    month,
    interval: "5m",
    file: csvName,
    csv_sha256: await sha256File(csvPath),
    microsecond_rows_converted: converted,
    row_count: validation.row_count,
    first_open_time: validation.first_open_time,
    last_open_time: validation.last_open_time,
    internal_gap_count: validation.internal_gap_count,
    missing_interval_count: validation.missing_interval_count
  };
}

// Binance publishes a month's archive only after the month ends, but it also publishes one
// archive per day, the day after. Reaching the current month therefore means the daily
// endpoint, not the monthly one. Same layout, same checksum convention, different path.
const BINANCE_DAILY_BASE = "https://data.binance.vision/data/spot/daily/klines";

export const dailyFileName = (symbol, day) => `${symbol}-5m-${day}.zip`;
const dailyUrl = (symbol, day) => `${BINANCE_DAILY_BASE}/${symbol}/5m/${dailyFileName(symbol, day)}`;

export function listDayIds(fromMs, toExclusiveMs) {
  const days = [];
  for (let at = fromMs; at < toExclusiveMs; at += 86400000) {
    days.push(new Date(at).toISOString().slice(0, 10));
  }
  return days;
}

// Mirrors ensureArchive: a day that is not published yet returns null instead of throwing,
// and a file whose hash does not match the published checksum is deleted rather than used.
export async function ensureDailyArchive(archiveDirectory, symbol, day) {
  const fileName = dailyFileName(symbol, day);
  const zipPath = join(archiveDirectory, fileName);
  const checksumText = await fetchText(`${dailyUrl(symbol, day)}.CHECKSUM`);
  if (checksumText === null) return null;
  const expectedSha256 = parseChecksum(checksumText, fileName);

  if (await exists(zipPath)) {
    if ((await sha256File(zipPath)) === expectedSha256) return { zipPath, expectedSha256, reused: true };
    await rm(zipPath, { force: true });
  }

  await downloadFile(dailyUrl(symbol, day), zipPath);
  const actual = await sha256File(zipPath);
  if (actual !== expectedSha256) {
    await rm(zipPath, { force: true });
    throw new Error(`SHA-256 mismatch for ${fileName}: ${actual} !== ${expectedSha256}`);
  }
  return { zipPath, expectedSha256, reused: false };
}

// A daily archive holds one day of candles. The month-level validator would reject it for
// being short, so validation here checks what is actually knowable: every row belongs to
// the requested day, timestamps rise, and microsecond stamps are normalised the same way.
export async function extractAndValidateDaily(csvDirectory, symbol, day, zipPath) {
  const csvName = `${symbol}-5m-${day}.csv`;
  const csvPath = join(csvDirectory, csvName);
  const { csv, converted } = normaliseTimestamps(readSingleZipEntry(await readFile(zipPath)));
  const candles = parseArchiveCsv(csv);

  if (!candles.length) throw new Error(`${csvName}: no candles`);
  let previous = -Infinity;
  for (const candle of candles) {
    const stamp = new Date(candle.timestamp).toISOString().slice(0, 10);
    if (stamp !== day) throw new Error(`${csvName}: row dated ${stamp} in the ${day} archive`);
    if (candle.timestamp <= previous) throw new Error(`${csvName}: timestamps out of order at ${stamp}`);
    previous = candle.timestamp;
  }

  await writeFile(csvPath, csv.endsWith("\n") ? csv : `${csv}\n`, "utf8");
  return {
    symbol, day, interval: "5m", file: csvName,
    csv_sha256: await sha256File(csvPath),
    microsecond_rows_converted: converted,
    row_count: candles.length
  };
}
