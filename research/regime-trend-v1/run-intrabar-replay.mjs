import { mkdir, readFile, writeFile } from "node:fs/promises";
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
  INTRABAR_TARGETS_ATR,
  replayTrade5m,
  summarizeReplayResults
} from "./intrabar-replay-tools.mjs";
import { parseArchiveCsv, sha256File } from "./five-minute-data-tools.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const data4hDirectory = join(scriptDirectory, "data");
const data5mDirectory = join(scriptDirectory, "data-5m");
const data5mCsvDirectory = join(data5mDirectory, "csv");
const outputDirectory = join(scriptDirectory, "results");
const HOLDOUT_START_MS = Date.parse("2025-01-01T00:00:00.000Z");

function quarterId(timestamp) {
  const date = new Date(timestamp);
  return `${date.getUTCFullYear()}-Q${Math.floor(date.getUTCMonth() / 3) + 1}`;
}

function emptyTargetBucket() {
  return Object.fromEntries(
    INTRABAR_TARGETS_ATR.map((target) => [String(target), { baselineTrades: [], results: [] }])
  );
}

function summarizeBucket(bucket) {
  return Object.fromEntries(
    INTRABAR_TARGETS_ATR.map((target) => {
      const item = bucket[String(target)];
      return [String(target), summarizeReplayResults(item.baselineTrades, item.results)];
    })
  );
}

function groupSummary(rows, keyFn) {
  const groups = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (!groups.has(key)) groups.set(key, emptyTargetBucket());
    const bucket = groups.get(key);
    for (const target of INTRABAR_TARGETS_ATR) {
      bucket[String(target)].baselineTrades.push(row.trade);
      bucket[String(target)].results.push(row.results[String(target)]);
    }
  }
  return Object.fromEntries(
    [...groups.entries()].map(([key, bucket]) => [key, summarizeBucket(bucket)])
  );
}

async function loadFiveMinuteMap(symbol, manifest) {
  const entries = manifest.files
    .filter((file) => file.symbol === symbol)
    .sort((left, right) => left.month.localeCompare(right.month));
  if (entries.length !== manifest.months.length) {
    throw new Error(`Incomplete 5m manifest for ${symbol}: ${entries.length}/${manifest.months.length}`);
  }

  const candleByTimestamp = new Map();
  for (const entry of entries) {
    const path = join(data5mCsvDirectory, entry.file);
    const actualSha = await sha256File(path);
    if (actualSha !== entry.csv_sha256) throw new Error(`5m CSV SHA-256 mismatch: ${entry.file}`);
    const csv = await readFile(path, "utf8");
    for (const candle of parseArchiveCsv(csv)) {
      if (candle.timestamp >= HOLDOUT_START_MS) {
        throw new Error(`5m data would open final holdout: ${entry.file}`);
      }
      if (candleByTimestamp.has(candle.timestamp)) {
        throw new Error(`Duplicate 5m timestamp for ${symbol}: ${candle.timestamp}`);
      }
      candleByTimestamp.set(candle.timestamp, candle);
    }
  }
  return candleByTimestamp;
}

async function main() {
  const manifest4h = JSON.parse(
    await readFile(join(data4hDirectory, "dataset-manifest.json"), "utf8")
  );
  const manifest5m = JSON.parse(
    await readFile(join(data5mDirectory, "five-minute-manifest.json"), "utf8")
  );
  if (manifest5m.final_holdout_opened !== false) throw new Error("5m manifest holdout flag is not false");
  if (Date.parse(manifest5m.requested_end_exclusive) !== HOLDOUT_START_MS) {
    throw new Error("5m manifest end does not match frozen holdout boundary");
  }

  const { runRegimeTrendV1 } = await import(
    pathToFileURL(join(scriptDirectory, "reference-engine.ts")).href
  );
  await mkdir(outputDirectory, { recursive: true });

  const rowsByPartition = Object.fromEntries(RESEARCH_PARTITIONS.map((item) => [item.id, []]));

  for (const file of manifest4h.files) {
    console.log(`Loading ${file.symbol} 5m candles...`);
    const candleByTimestamp = await loadFiveMinuteMap(file.symbol, manifest5m);
    console.log(`${file.symbol}: loaded ${candleByTimestamp.size} 5m candles`);

    const csv4h = await readFile(join(data4hDirectory, file.file), "utf8");
    if (sha256(csv4h) !== file.sha256) throw new Error(`4h SHA-256 mismatch for ${file.symbol}`);
    const all4h = parseCsvCandles(csv4h, { endExclusive: HOLDOUT_START_MS });

    for (const partition of RESEARCH_PARTITIONS) {
      if (partition.endExclusive > HOLDOUT_START_MS) {
        throw new Error(`Partition ${partition.id} would open final holdout`);
      }
      const candles = filterPartition(all4h, partition);
      for (const segment of splitContiguousCandles(candles)) {
        if (segment.length < 201) continue;
        const baseline = runRegimeTrendV1(segment, {
          datasetHash: file.sha256,
          symbol: file.symbol,
          implementationVersion: "typescript-reference-v1.1.0-5m-replay"
        });
        for (const trade of baseline.trades) {
          const results = Object.fromEntries(
            INTRABAR_TARGETS_ATR.map((target) => [
              String(target),
              replayTrade5m(trade, baseline.stopUpdates, candleByTimestamp, target)
            ])
          );
          rowsByPartition[partition.id].push({ symbol: file.symbol, trade, results });
        }
      }
    }
  }

  const report = {
    schema_version: 1,
    strategy_id: "regime-trend-v1",
    generated_at: new Date().toISOString(),
    holdout_opened: false,
    holdout_start: new Date(HOLDOUT_START_MS).toISOString(),
    replay_interval: "5m",
    targets_atr: INTRABAR_TARGETS_ATR,
    partitions: RESEARCH_PARTITIONS.map((partition) => {
      const rows = rowsByPartition[partition.id];
      const aggregateBucket = emptyTargetBucket();
      for (const row of rows) {
        for (const target of INTRABAR_TARGETS_ATR) {
          aggregateBucket[String(target)].baselineTrades.push(row.trade);
          aggregateBucket[String(target)].results.push(row.results[String(target)]);
        }
      }
      return {
        id: partition.id,
        start: new Date(partition.start).toISOString(),
        end_exclusive: new Date(partition.endExclusive).toISOString(),
        trades: rows.length,
        aggregate: summarizeBucket(aggregateBucket),
        by_symbol: groupSummary(rows, (row) => row.symbol),
        by_quarter: groupSummary(rows, (row) => quarterId(row.trade.exit_timestamp)),
        rows: rows.map((row) => ({
          symbol: row.symbol,
          entry_timestamp: row.trade.entry_timestamp,
          baseline_exit_timestamp: row.trade.exit_timestamp,
          baseline_net_pnl: row.trade.net_pnl,
          results: Object.fromEntries(
            INTRABAR_TARGETS_ATR.map((target) => {
              const result = row.results[String(target)];
              return [String(target), {
                classification: result.classification,
                timestamp: result.timestamp,
                lower_net_pnl: result.lower_trade.net_pnl,
                upper_net_pnl: result.upper_trade.net_pnl
              }];
            })
          )
        }))
      };
    })
  };

  const reportPath = join(outputDirectory, "intrabar-replay-report.json");
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  for (const partition of report.partitions) {
    console.log(`${partition.id}: trades=${partition.trades}`);
    for (const target of INTRABAR_TARGETS_ATR) {
      const item = partition.aggregate[String(target)];
      const counts = item.counts;
      console.log(
        `  ${target.toFixed(2)} ATR: target=${counts.TARGET_FIRST}, stop=${counts.STOP_FIRST}, ` +
        `ambiguous=${counts.AMBIGUOUS_SAME_5M}, baseline=${counts.BASELINE_EXIT}, gap=${counts.DATA_GAP}, ` +
        `netΔ=[${item.lower_bound_net_change.toFixed(6)}, ${item.upper_bound_net_change.toFixed(6)}], ` +
        `PF=[${item.lower_bound_metrics.profit_factor?.toFixed(3) ?? "n/a"}, ` +
        `${item.upper_bound_metrics.profit_factor?.toFixed(3) ?? "n/a"}]`
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
