import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  FIVE_MINUTE_END_EXCLUSIVE_MS,
  FIVE_MINUTE_START_MS,
  FIVE_MINUTE_SYMBOLS,
  archiveFileName,
  archiveUrl,
  checksumUrl,
  listMonthIds,
  parseArchiveCsv,
  parseChecksum,
  sha256File,
  validateArchiveCandles
} from "./five-minute-data-tools.mjs";

const execFileAsync = promisify(execFile);
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const rootDirectory = join(scriptDirectory, "data-5m");
const archiveDirectory = join(rootDirectory, "archives");
const csvDirectory = join(rootDirectory, "csv");
const manifestPath = join(rootDirectory, "five-minute-manifest.json");

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
  if (!response.ok || !response.body) {
    throw new Error(`Download failed: ${url} HTTP ${response.status}`);
  }
  await pipeline(response.body, createWriteStream(partPath));
  await rename(partPath, destination);
}

async function ensureArchive(symbol, month) {
  const fileName = archiveFileName(symbol, month);
  const zipPath = join(archiveDirectory, fileName);
  const checksumText = await fetchText(checksumUrl(symbol, month));
  const expectedSha256 = parseChecksum(checksumText, fileName);

  if (await exists(zipPath)) {
    const actual = await sha256File(zipPath);
    if (actual === expectedSha256) return { zipPath, expectedSha256, reused: true };
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

async function extractAndValidate(symbol, month, zipPath) {
  const csvName = `${symbol}-5m-${month}.csv`;
  const csvPath = join(csvDirectory, csvName);
  const { stdout } = await execFileAsync("unzip", ["-p", zipPath], {
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024
  });
  const candles = parseArchiveCsv(stdout);
  const validation = validateArchiveCandles(candles, month);
  await writeFile(csvPath, stdout.endsWith("\n") ? stdout : `${stdout}\n`, "utf8");
  return {
    symbol,
    month,
    interval: "5m",
    file: csvName,
    csv_sha256: await sha256File(csvPath),
    ...validation,
    gaps: validation.gaps.map((gap) => ({
      after: new Date(gap.after).toISOString(),
      before: new Date(gap.before).toISOString(),
      missing_intervals: gap.missing_intervals
    })),
    preopen_closes: validation.preopen_closes.map((item) => ({
      open_time: new Date(item.open_time).toISOString(),
      close_time: new Date(item.close_time).toISOString(),
      expected_close_time: new Date(item.expected_close_time).toISOString(),
      precedes_open_by_ms: item.precedes_open_by_ms
    })),
    shortened_closes: validation.shortened_closes.map((item) => ({
      open_time: new Date(item.open_time).toISOString(),
      close_time: new Date(item.close_time).toISOString(),
      expected_close_time: new Date(item.expected_close_time).toISOString(),
      shortened_by_ms: item.shortened_by_ms
    })),
    extended_closes: validation.extended_closes.map((item) => ({
      open_time: new Date(item.open_time).toISOString(),
      close_time: new Date(item.close_time).toISOString(),
      expected_close_time: new Date(item.expected_close_time).toISOString(),
      extended_by_ms: item.extended_by_ms
    }))
  };
}

async function main() {
  await mkdir(archiveDirectory, { recursive: true });
  await mkdir(csvDirectory, { recursive: true });

  const months = listMonthIds();
  const files = [];
  const total = FIVE_MINUTE_SYMBOLS.length * months.length;
  let completed = 0;

  for (const symbol of FIVE_MINUTE_SYMBOLS) {
    for (const month of months) {
      completed += 1;
      const label = `[${completed}/${total}] ${symbol} ${month}`;
      console.log(`${label}: checking archive...`);
      const archive = await ensureArchive(symbol, month);
      console.log(`${label}: ${archive.reused ? "reused" : "downloaded"}; validating CSV...`);
      const entry = await extractAndValidate(symbol, month, archive.zipPath);
      files.push({ ...entry, archive_sha256: archive.expectedSha256 });
      console.log(
        `${label}: rows=${entry.row_count}, missing=${entry.missing_interval_count}, ` +
        `irregular_close=${entry.irregular_close_count} ` +
        `(preopen=${entry.preopen_close_count}, shortened=${entry.shortened_close_count}, ` +
        `extended=${entry.extended_close_count})`
      );
    }
  }

  const manifest = {
    schema_version: 3,
    strategy_id: "regime-trend-v1",
    source: "Binance public data monthly spot klines",
    source_base: "https://data.binance.vision/data/spot/monthly/klines",
    interval: "5m",
    generated_at: new Date().toISOString(),
    requested_start: new Date(FIVE_MINUTE_START_MS).toISOString(),
    requested_end_exclusive: new Date(FIVE_MINUTE_END_EXCLUSIVE_MS).toISOString(),
    final_holdout_opened: false,
    symbols: FIVE_MINUTE_SYMBOLS,
    months,
    close_time_policy:
      "record pre-open, shortened, or extended close_time anomalies; replay ordering uses open_time and OHLC",
    files
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(`Manifest written to ${manifestPath}`);
  console.log("Final holdout was not downloaded.");
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  try {
    if (await exists(manifestPath)) JSON.parse(await readFile(manifestPath, "utf8"));
  } catch {
    await rm(manifestPath, { force: true });
  }
  process.exitCode = 1;
});
