import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DATASET_END_EXCLUSIVE_MS,
  DATASET_START_MS,
  DATASET_SYMBOLS,
  buildManifestEntry,
  candlesToCsv,
  fetchKlineRange,
  validateCandles
} from "./dataset-tools.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const outputDirectory = join(scriptDirectory, "data");

async function main() {
  await mkdir(outputDirectory, { recursive: true });
  const files = [];

  for (const symbol of DATASET_SYMBOLS) {
    console.log(`Downloading ${symbol} 4h candles...`);
    const candles = await fetchKlineRange({
      symbol,
      startTime: DATASET_START_MS,
      endExclusive: DATASET_END_EXCLUSIVE_MS
    });
    const validation = validateCandles(candles, {
      expectedStart: DATASET_START_MS,
      expectedEndExclusive: DATASET_END_EXCLUSIVE_MS
    });
    const fileName = `${symbol}-4h-2019-01-01_2026-06-30.csv`;
    const csv = candlesToCsv(candles);
    await writeFile(join(outputDirectory, fileName), csv, "utf8");
    files.push(buildManifestEntry({ symbol, fileName, csv, validation }));
    console.log(`Validated ${symbol}: ${validation.rowCount} rows`);
  }

  const manifest = {
    schema_version: 1,
    strategy_id: "regime-trend-v1",
    source: "Binance Spot REST /api/v3/klines",
    generated_at: new Date().toISOString(),
    requested_start: new Date(DATASET_START_MS).toISOString(),
    requested_end_exclusive: new Date(DATASET_END_EXCLUSIVE_MS).toISOString(),
    files
  };
  await writeFile(
    join(outputDirectory, "dataset-manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8"
  );
  console.log(`Manifest written to ${join(outputDirectory, "dataset-manifest.json")}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
