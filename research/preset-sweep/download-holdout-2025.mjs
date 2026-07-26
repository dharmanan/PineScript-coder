import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { inflateRawSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  FIVE_MINUTE_SYMBOLS,
  archiveFileName,
  archiveUrl,
  checksumUrl,
  listMonthIds,
  parseArchiveCsv,
  parseChecksum,
  sha256File,
  validateArchiveCandles
} from "../regime-trend-v1/five-minute-data-tools.mjs";

// The 2025 final holdout is downloaded into its own directory with its own manifest.
// It must never be mixed into the 2019-2024 development and validation data, because
// the sweep selected settings from that data and reading the holdout is a one-shot test.
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const rootDirectory = join(scriptDirectory, "data-holdout");
const archiveDirectory = join(rootDirectory, "archives");
const csvDirectory = join(rootDirectory, "csv");
const manifestPath = join(rootDirectory, "holdout-manifest.json");

const START_MS = Date.parse("2025-01-01T00:00:00.000Z");
const END_EXCLUSIVE_MS = Date.parse("2026-01-01T00:00:00.000Z");

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function fetchText(url) {
  const response = await fetch(url, { redirect: "follow" });
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

// Binance publishes a checksum next to every archive. A file that does not match it
// is deleted rather than used, so a truncated or tampered download cannot enter a result.
async function ensureArchive(symbol, month) {
  const fileName = archiveFileName(symbol, month);
  const zipPath = join(archiveDirectory, fileName);
  const expectedSha256 = parseChecksum(await fetchText(checksumUrl(symbol, month)), fileName);

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

// Binance monthly archives hold a single deflated CSV. Reading it with node:zlib keeps
// the run free of an external unzip binary, which the build container does not carry.
function readSingleZipEntry(buffer) {
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
  if (output.length !== uncompressedSize) {
    throw new Error(`ZIP size mismatch: ${output.length} != ${uncompressedSize}`);
  }
  return output.toString("utf8");
}

// Binance switched its kline archives from millisecond to microsecond timestamps during
// 2025. Left alone, every 2025 candle would sit a hundred thousand years in the future
// and silently fall outside every window. The stored CSV is normalised back to the
// millisecond format the 2019-2024 files use, so everything downstream stays identical.
const MILLISECOND_CEILING = 1e14;

function normaliseTimestamps(csv) {
  const lines = csv.split("\n");
  let converted = 0;
  const output = lines.map((line) => {
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

async function extractAndValidate(symbol, month, zipPath) {
  const csvName = `${symbol}-5m-${month}.csv`;
  const csvPath = join(csvDirectory, csvName);
  const raw = readSingleZipEntry(await readFile(zipPath));
  const { csv: stdout, converted } = normaliseTimestamps(raw);
  const candles = parseArchiveCsv(stdout);
  const validation = validateArchiveCandles(candles, month);
  for (const candle of candles) {
    if (candle.timestamp < START_MS || candle.timestamp >= END_EXCLUSIVE_MS) {
      throw new Error(`${csvName} contains a candle outside the 2025 holdout window`);
    }
  }
  await writeFile(csvPath, stdout.endsWith("\n") ? stdout : `${stdout}\n`, "utf8");
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

async function main() {
  await mkdir(archiveDirectory, { recursive: true });
  await mkdir(csvDirectory, { recursive: true });

  const months = listMonthIds(START_MS, END_EXCLUSIVE_MS);
  const total = FIVE_MINUTE_SYMBOLS.length * months.length;
  const files = [];
  let completed = 0;

  console.log(`Source: https://data.binance.vision/data/spot/monthly/klines`);
  console.log(`Window: ${new Date(START_MS).toISOString()} -> ${new Date(END_EXCLUSIVE_MS).toISOString()}`);
  console.log(`Files:  ${total} monthly archives across ${FIVE_MINUTE_SYMBOLS.join(", ")}\n`);

  for (const symbol of FIVE_MINUTE_SYMBOLS) {
    for (const month of months) {
      completed += 1;
      const label = `[${completed}/${total}] ${symbol} ${month}`;
      const archive = await ensureArchive(symbol, month);
      const entry = await extractAndValidate(symbol, month, archive.zipPath);
      files.push({ ...entry, archive_sha256: archive.expectedSha256 });
      console.log(`${label}: ${archive.reused ? "reused" : "downloaded"}, rows=${entry.row_count}, missing=${entry.missing_interval_count}${entry.microsecond_rows_converted ? `, us->ms ${entry.microsecond_rows_converted}` : ""}`);
    }
  }

  await writeFile(
    manifestPath,
    `${JSON.stringify({
      schema_version: 1,
      purpose: "final holdout, 2025 only",
      source: "Binance public data monthly spot klines",
      source_base: "https://data.binance.vision/data/spot/monthly/klines",
      interval: "5m",
      generated_at: new Date().toISOString(),
      requested_start: new Date(START_MS).toISOString(),
      requested_end_exclusive: new Date(END_EXCLUSIVE_MS).toISOString(),
      symbols: FIVE_MINUTE_SYMBOLS,
      months,
      files
    }, null, 2)}\n`,
    "utf8"
  );

  const rows = files.reduce((sum, entry) => sum + entry.row_count, 0);
  const gaps = files.reduce((sum, entry) => sum + entry.missing_interval_count, 0);
  console.log(`\n${files.length} files, ${rows.toLocaleString()} candles, ${gaps} missing intervals`);
  console.log(`Manifest written to ${manifestPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : error);
  process.exitCode = 1;
});
