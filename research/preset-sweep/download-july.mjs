// Downloads July 2026 from Binance's daily archive. The monthly archive for a month is not
// published until the month ends, so the current month is only reachable one day at a time.
//
// This exists because the 2026 holdout has now been read four times and cannot settle any
// remaining question. July is data no configuration in this project has ever seen.
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ensureDailyArchive, extractAndValidateDaily } from "./archive-tools.mjs";
import { listDayIds } from "./archive-tools.mjs";

const directory = dirname(fileURLToPath(import.meta.url));
const root = join(directory, "data-july");
const archiveDirectory = join(root, "archives");
const csvDirectory = join(root, "csv");
const manifestPath = join(root, "july-manifest.json");

const SYMBOLS = ["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT"];
const FROM = Date.parse("2026-07-01T00:00:00Z");
const TO = Date.parse("2026-08-01T00:00:00Z");

await mkdir(archiveDirectory, { recursive: true });
await mkdir(csvDirectory, { recursive: true });

console.log("Source: https://data.binance.vision/data/spot/daily/klines");
console.log(`Range: ${new Date(FROM).toISOString().slice(0, 10)} -> ${new Date(TO).toISOString().slice(0, 10)} (days not yet published are skipped)\n`);

const files = [];
const skipped = [];
for (const symbol of SYMBOLS) {
  let downloaded = 0;
  let rows = 0;
  for (const day of listDayIds(FROM, TO)) {
    const archive = await ensureDailyArchive(archiveDirectory, symbol, day);
    if (!archive) { skipped.push(`${symbol} ${day}`); continue; }
    const entry = await extractAndValidateDaily(csvDirectory, symbol, day, archive.zipPath);
    files.push({ ...entry, archive_sha256: archive.expectedSha256 });
    downloaded += 1;
    rows += entry.row_count;
  }
  console.log(`${symbol}: ${downloaded} days, ${rows.toLocaleString()} candles`);
}

const converted = files.reduce((sum, entry) => sum + entry.microsecond_rows_converted, 0);
await writeFile(
  manifestPath,
  `${JSON.stringify({
    generated_at: new Date().toISOString(),
    source: "https://data.binance.vision/data/spot/daily/klines",
    interval: "5m",
    symbols: SYMBOLS,
    microsecond_rows_converted: converted,
    files
  }, null, 2)}\n`,
  "utf8"
);

console.log(`\n${files.length} files verified against their published SHA-256.`);
console.log(`Microsecond timestamps normalised: ${converted.toLocaleString()} rows.`);
if (skipped.length) console.log(`Not published yet: ${skipped.length} day-symbol pairs (last: ${skipped.at(-1)})`);
console.log(`Manifest: ${manifestPath}`);
