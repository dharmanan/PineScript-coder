import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";
import { sha256 } from "./dataset-tools.mjs";
import {
  RESEARCH_PARTITIONS,
  buyAndHoldReturn,
  filterPartition,
  parseCsvCandles,
  splitContiguousCandles,
  summarizeTrades,
  tradeLedgerToCsv
} from "./backtest-tools.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const dataDirectory = join(scriptDirectory, "data");
const outputDirectory = join(scriptDirectory, "results");
const HOLDOUT_START_MS = Date.parse("2025-01-01T00:00:00.000Z");

async function loadReferenceEngine() {
  const moduleUrl = pathToFileURL(join(scriptDirectory, "reference-engine.ts")).href;
  return import(moduleUrl);
}

async function main() {
  const manifestPath = join(dataDirectory, "dataset-manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
    throw new Error("Manifest contains no files");
  }

  const { runRegimeTrendV1 } = await loadReferenceEngine();
  await mkdir(outputDirectory, { recursive: true });

  const report = {
    schema_version: 1,
    strategy_id: "regime-trend-v1",
    generated_at: new Date().toISOString(),
    holdout_opened: false,
    holdout_start: new Date(HOLDOUT_START_MS).toISOString(),
    partitions: []
  };

  for (const partition of RESEARCH_PARTITIONS) {
    if (partition.endExclusive > HOLDOUT_START_MS) {
      throw new Error(`Partition ${partition.id} would open the final holdout`);
    }

    const partitionTrades = [];
    const symbolReports = [];

    for (const file of manifest.files) {
      const csvPath = join(dataDirectory, file.file);
      const csv = await readFile(csvPath, "utf8");
      if (sha256(csv) !== file.sha256) {
        throw new Error(`SHA-256 mismatch for ${file.symbol}`);
      }

      const allCandles = parseCsvCandles(csv, { endExclusive: HOLDOUT_START_MS });
      const partitionCandles = filterPartition(allCandles, partition);
      const segments = splitContiguousCandles(partitionCandles);
      const trades = [];
      let unresolvedSegments = 0;

      for (const segment of segments) {
        if (segment.length < 201) continue;
        const result = runRegimeTrendV1(segment, {
          datasetHash: file.sha256,
          symbol: file.symbol
        });
        trades.push(...result.trades);
        if (result.openPosition) unresolvedSegments += 1;
      }

      partitionTrades.push(...trades);
      symbolReports.push({
        symbol: file.symbol,
        candles: partitionCandles.length,
        contiguous_segments: segments.length,
        unresolved_segments: unresolvedSegments,
        buy_and_hold_return: buyAndHoldReturn(partitionCandles),
        metrics: summarizeTrades(trades)
      });

      await writeFile(
        join(outputDirectory, `${partition.id}-${file.symbol}-trades.csv`),
        tradeLedgerToCsv(trades),
        "utf8"
      );
    }

    report.partitions.push({
      id: partition.id,
      start: new Date(partition.start).toISOString(),
      end_exclusive: new Date(partition.endExclusive).toISOString(),
      aggregate_metrics: summarizeTrades(partitionTrades),
      symbols: symbolReports
    });

    await writeFile(
      join(outputDirectory, `${partition.id}-all-trades.csv`),
      tradeLedgerToCsv(partitionTrades),
      "utf8"
    );
  }

  const reportPath = join(outputDirectory, "development-validation-report.json");
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  for (const partition of report.partitions) {
    const metrics = partition.aggregate_metrics;
    console.log(
      `${partition.id}: trades=${metrics.closed_trades}, ` +
      `net=${metrics.total_net_pnl.toFixed(6)}, ` +
      `PF=${metrics.profit_factor === null ? "n/a" : metrics.profit_factor.toFixed(3)}, ` +
      `winRate=${metrics.win_rate === null ? "n/a" : (metrics.win_rate * 100).toFixed(2) + "%"}`
    );
  }
  console.log(`Report written to ${reportPath}`);
  console.log("Final holdout was not opened.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
