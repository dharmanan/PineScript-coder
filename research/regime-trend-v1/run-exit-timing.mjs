import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { sha256 } from "./dataset-tools.mjs";
import {
  RESEARCH_PARTITIONS,
  filterPartition,
  parseCsvCandles,
  splitContiguousCandles
} from "./backtest-tools.mjs";
import {
  EXIT_TIMING_THRESHOLDS_ATR,
  EXIT_TIMING_WINDOWS_BARS,
  analyzeExitTiming,
  summarizeExitTimingRows
} from "./exit-timing-tools.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const dataDirectory = join(scriptDirectory, "data");
const outputDirectory = join(scriptDirectory, "results");
const HOLDOUT_START_MS = Date.parse("2025-01-01T00:00:00.000Z");

function groupRows(rows, keyFn) {
  const groups = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return Object.fromEntries(
    [...groups.entries()].map(([key, group]) => [key, summarizeExitTimingRows(group)])
  );
}

async function main() {
  const { runRegimeTrendV1 } = await import(
    pathToFileURL(join(scriptDirectory, "reference-engine.ts")).href
  );
  const manifest = JSON.parse(await readFile(join(dataDirectory, "dataset-manifest.json"), "utf8"));
  await mkdir(outputDirectory, { recursive: true });

  const report = {
    schema_version: 1,
    strategy_id: "regime-trend-v1",
    generated_at: new Date().toISOString(),
    holdout_opened: false,
    holdout_start: new Date(HOLDOUT_START_MS).toISOString(),
    thresholds_atr: EXIT_TIMING_THRESHOLDS_ATR,
    timing_windows_bars: EXIT_TIMING_WINDOWS_BARS,
    partitions: []
  };

  for (const partition of RESEARCH_PARTITIONS) {
    if (partition.endExclusive > HOLDOUT_START_MS) {
      throw new Error(`Partition ${partition.id} would open final holdout`);
    }

    const rows = [];
    for (const file of manifest.files) {
      const csv = await readFile(join(dataDirectory, file.file), "utf8");
      if (sha256(csv) !== file.sha256) throw new Error(`SHA-256 mismatch for ${file.symbol}`);
      const candles = filterPartition(
        parseCsvCandles(csv, { endExclusive: HOLDOUT_START_MS }),
        partition
      );

      for (const segment of splitContiguousCandles(candles)) {
        if (segment.length < 201) continue;
        const result = runRegimeTrendV1(segment, {
          datasetHash: file.sha256,
          symbol: file.symbol,
          implementationVersion: "typescript-reference-v1.1.0-exit-timing"
        });
        for (const trade of result.trades) {
          rows.push({
            symbol: file.symbol,
            exit_reason: trade.exit_reason,
            winning_trade: trade.net_pnl > 0,
            trade,
            timing: analyzeExitTiming(trade, segment)
          });
        }
      }
    }

    const winners = rows.filter((row) => row.winning_trade);
    const losers = rows.filter((row) => !row.winning_trade);
    const partitionReport = {
      id: partition.id,
      start: new Date(partition.start).toISOString(),
      end_exclusive: new Date(partition.endExclusive).toISOString(),
      all: summarizeExitTimingRows(rows),
      winners: summarizeExitTimingRows(winners),
      losers: summarizeExitTimingRows(losers),
      by_symbol: groupRows(rows, (row) => row.symbol),
      by_exit_reason: groupRows(rows, (row) => row.exit_reason),
      rows
    };
    report.partitions.push(partitionReport);
  }

  const reportPath = join(outputDirectory, "exit-timing-report.json");
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  for (const partition of report.partitions) {
    console.log(`${partition.id}: trades=${partition.all.trades}`);
    for (const threshold of EXIT_TIMING_THRESHOLDS_ATR) {
      const item = partition.losers.thresholds[String(threshold)];
      console.log(
        `  losers ${threshold.toFixed(2)} ATR: ` +
        `high-touch=${item.high_touch.reached_count}/${partition.losers.trades}, ` +
        `close-confirm=${item.close_confirmation.reached_count}/${partition.losers.trades}, ` +
        `median-high-bars=${item.high_touch.median_bars_to_reach ?? "n/a"}`
      );
    }
  }
  console.log(`Report written to ${reportPath}`);
  console.log("Final holdout was not opened.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
