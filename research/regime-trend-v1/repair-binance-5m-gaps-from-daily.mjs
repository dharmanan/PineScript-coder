import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  dailyArchiveFileName,
  dailyArchiveUrl,
  dailyChecksumUrl,
  insertRawKlineRows,
  selectRawKlineRows,
  unresolvedTargetsFromReport
} from "./daily-gap-repair-tools.mjs";
import {
  parseArchiveCsv,
  parseChecksum,
  sha256File,
  validateArchiveCandles
} from "./five-minute-data-tools.mjs";

const execFileAsync = promisify(execFile);
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const rootDirectory = join(scriptDirectory, "data-5m");
const csvDirectory = join(rootDirectory, "csv");
const repairDirectory = join(rootDirectory, "daily-repair");
const manifestPath = join(rootDirectory, "five-minute-manifest.json");
const reportPath = join(
  scriptDirectory,
  "results",
  "target-triggered-ratchet-corrected-report.json"
);
const repairReportPath = join(rootDirectory, "daily-gap-repair-report.json");

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

async function ensureDailyArchive(symbol, day) {
  const fileName = dailyArchiveFileName(symbol, day);
  const zipPath = join(repairDirectory, fileName);
  const checksumText = await fetchText(dailyChecksumUrl(symbol, day));
  const expectedSha256 = parseChecksum(checksumText, fileName);

  if (!(await exists(zipPath)) || (await sha256File(zipPath)) !== expectedSha256) {
    await rm(zipPath, { force: true });
    await downloadFile(dailyArchiveUrl(symbol, day), zipPath);
  }

  const actualSha256 = await sha256File(zipPath);
  if (actualSha256 !== expectedSha256) {
    await rm(zipPath, { force: true });
    throw new Error(`SHA-256 mismatch for ${fileName}: ${actualSha256} !== ${expectedSha256}`);
  }

  return { fileName, zipPath, sha256: expectedSha256 };
}

async function extractZipText(zipPath) {
  const { stdout } = await execFileAsync("unzip", ["-p", zipPath], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024
  });
  return stdout;
}

function hashText(text) {
  return createHash("sha256").update(text).digest("hex");
}

async function main() {
  await mkdir(repairDirectory, { recursive: true });

  const correctedReport = JSON.parse(await readFile(reportPath, "utf8"));
  const targets = unresolvedTargetsFromReport(correctedReport);
  if (targets.length === 0) {
    console.log("No unresolved 5m DATA_GAP targets found.");
    return;
  }

  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (manifest.final_holdout_opened !== false) {
    throw new Error("5m holdout flag is not false");
  }

  const byArchive = new Map();
  for (const target of targets) {
    const key = `${target.symbol}:${target.day}`;
    if (!byArchive.has(key)) byArchive.set(key, []);
    byArchive.get(key).push(target);
  }

  const found = [];
  const notFound = [];
  const archiveEvidence = [];

  for (const archiveTargets of byArchive.values()) {
    const { symbol, day } = archiveTargets[0];
    console.log(`Checking official daily archive: ${symbol} ${day}`);
    const archive = await ensureDailyArchive(symbol, day);
    const csv = await extractZipText(archive.zipPath);
    const selected = selectRawKlineRows(
      csv,
      archiveTargets.map((target) => target.timestamp)
    );

    archiveEvidence.push({
      symbol,
      day,
      file: archive.fileName,
      archive_sha256: archive.sha256,
      requested_timestamps: archiveTargets.map((target) => target.timestamp_iso),
      found_timestamps: [...selected.keys()].map((timestamp) => new Date(timestamp).toISOString())
    });

    for (const target of archiveTargets) {
      const raw = selected.get(target.timestamp);
      if (raw) found.push({ ...target, raw });
      else notFound.push(target);
    }
  }

  const foundByMonthlyFile = new Map();
  for (const item of found) {
    const key = `${item.symbol}:${item.month}`;
    if (!foundByMonthlyFile.has(key)) foundByMonthlyFile.set(key, []);
    foundByMonthlyFile.get(key).push(item);
  }

  const repairs = [];
  for (const monthlyItems of foundByMonthlyFile.values()) {
    const { symbol, month } = monthlyItems[0];
    const entry = manifest.files.find(
      (file) => file.symbol === symbol && file.month === month
    );
    if (!entry) throw new Error(`Missing manifest entry for ${symbol} ${month}`);

    const csvPath = join(csvDirectory, entry.file);
    const originalCsv = await readFile(csvPath, "utf8");
    if (hashText(originalCsv) !== entry.csv_sha256) {
      throw new Error(`Pre-repair CSV SHA mismatch: ${entry.file}`);
    }

    const result = insertRawKlineRows(
      originalCsv,
      monthlyItems.map((item) => ({ timestamp: item.timestamp, raw: item.raw }))
    );
    const candles = parseArchiveCsv(result.csv);
    const validation = validateArchiveCandles(candles, month);
    await writeFile(csvPath, result.csv, "utf8");

    Object.assign(entry, {
      csv_sha256: await sha256File(csvPath),
      row_count: validation.row_count,
      first_open_time: validation.first_open_time,
      last_open_time: validation.last_open_time,
      internal_gap_count: validation.internal_gap_count,
      missing_interval_count: validation.missing_interval_count,
      leading_missing_intervals: validation.leading_missing_intervals,
      trailing_missing_intervals: validation.trailing_missing_intervals,
      irregular_close_count: validation.irregular_close_count,
      preopen_close_count: validation.preopen_close_count,
      shortened_close_count: validation.shortened_close_count,
      extended_close_count: validation.extended_close_count,
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
    });

    repairs.push({
      symbol,
      month,
      file: entry.file,
      inserted_timestamps: result.inserted.map((timestamp) => new Date(timestamp).toISOString()),
      already_present_timestamps: result.alreadyPresent.map((timestamp) =>
        new Date(timestamp).toISOString()
      ),
      remaining_missing_intervals: validation.missing_interval_count,
      csv_sha256: entry.csv_sha256
    });
  }

  manifest.schema_version = Math.max(Number(manifest.schema_version) || 0, 4);
  manifest.daily_gap_repair = {
    performed_at: new Date().toISOString(),
    source_base: "https://data.binance.vision/data/spot/daily/klines",
    requested_count: targets.length,
    found_count: found.length,
    not_found_count: notFound.length,
    archive_evidence: archiveEvidence
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  const repairReport = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    source: "Binance public data daily spot klines",
    final_holdout_opened: false,
    requested: targets.map(({ raw, ...item }) => item),
    found: found.map(({ raw, ...item }) => item),
    not_found: notFound,
    archives: archiveEvidence,
    repairs
  };
  await writeFile(repairReportPath, `${JSON.stringify(repairReport, null, 2)}\n`, "utf8");

  console.log(`Requested unique gaps: ${targets.length}`);
  console.log(`Found in official daily archives: ${found.length}`);
  console.log(`Not found in official daily archives: ${notFound.length}`);
  for (const item of notFound) {
    console.log(`  NOT_FOUND ${item.symbol} ${item.timestamp_iso}`);
  }
  for (const repair of repairs) {
    console.log(
      `  REPAIRED ${repair.symbol} ${repair.month}: inserted=${repair.inserted_timestamps.length}, ` +
        `remainingMissing=${repair.remaining_missing_intervals}`
    );
  }
  console.log(`Repair report written to ${repairReportPath}`);
  console.log("Final holdout was not opened.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
