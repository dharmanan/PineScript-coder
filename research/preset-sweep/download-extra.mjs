import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { listMonthIds } from "../regime-trend-v1/five-minute-data-tools.mjs";
import { ensureArchive, extractAndValidate } from "./archive-tools.mjs";

// Fills the gaps around the original 2019-2024 set: a symbol the first download never
// covered, and the months that have closed since. Months that do not exist, because a
// symbol was not listed yet or the month has not finished, are skipped rather than failed.
const directory = dirname(fileURLToPath(import.meta.url));
const root = join(directory, "data-extra");
const archiveDirectory = join(root, "archives");
const csvDirectory = join(root, "csv");
const manifestPath = join(root, "extra-manifest.json");

const REQUESTS = [
  { symbol: "SOLUSDT", from: "2020-08-01", to: "2027-01-01" },
  { symbol: "BTCUSDT", from: "2026-01-01", to: "2027-01-01" },
  { symbol: "ETHUSDT", from: "2026-01-01", to: "2027-01-01" },
  { symbol: "BNBUSDT", from: "2026-01-01", to: "2027-01-01" }
];

await mkdir(archiveDirectory, { recursive: true });
await mkdir(csvDirectory, { recursive: true });

console.log("Source: https://data.binance.vision/data/spot/monthly/klines\n");

const files = [];
const skipped = [];
for (const request of REQUESTS) {
  const months = listMonthIds(Date.parse(`${request.from}T00:00:00.000Z`), Date.parse(`${request.to}T00:00:00.000Z`));
  let downloaded = 0;
  for (const month of months) {
    const archive = await ensureArchive(archiveDirectory, request.symbol, month);
    if (!archive) {
      skipped.push(`${request.symbol} ${month}`);
      continue;
    }
    const entry = await extractAndValidate(csvDirectory, request.symbol, month, archive.zipPath);
    files.push({ ...entry, archive_sha256: archive.expectedSha256 });
    downloaded += 1;
  }
  const own = files.filter((entry) => entry.symbol === request.symbol);
  const rows = own.reduce((sum, entry) => sum + entry.row_count, 0);
  console.log(`${request.symbol}: ${downloaded} months, ${rows.toLocaleString()} candles`);
}

await writeFile(
  manifestPath,
  `${JSON.stringify({
    schema_version: 1,
    purpose: "symbols and months missing from the original 2019-2024 download",
    source: "Binance public data monthly spot klines",
    source_base: "https://data.binance.vision/data/spot/monthly/klines",
    interval: "5m",
    generated_at: new Date().toISOString(),
    requests: REQUESTS,
    skipped_months: skipped,
    files
  }, null, 2)}\n`,
  "utf8"
);

const rows = files.reduce((sum, entry) => sum + entry.row_count, 0);
console.log(`\n${files.length} files, ${rows.toLocaleString()} candles`);
console.log(`${skipped.length} months unavailable (not listed yet or not finished)`);
console.log(`Manifest written to ${manifestPath}`);
