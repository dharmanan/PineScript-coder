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
import { parseArchiveCsv, sha256File } from "./five-minute-data-tools.mjs";
import {
  TARGET_TRIGGERED_RATCHET_CANDIDATES,
  compareTradeWithRatchet5m,
  summarizeCorrectedRatchetCandidate
} from "./target-triggered-ratchet-corrected-tools.mjs";

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
    if (await sha256File(path) !== entry.csv_sha256) {
      throw new Error(`5m CSV SHA mismatch: ${entry.file}`);
    }
    for (const candle of parseArchiveCsv(await readFile(path, "utf8"))) {
      if (candle.timestamp >= HOLDOUT_START_MS) {
        throw new Error(`5m data opens holdout: ${entry.file}`);
      }
      if (candleByTimestamp.has(candle.timestamp)) {
        throw new Error(`Duplicate 5m timestamp: ${symbol} ${candle.timestamp}`);
      }
      candleByTimestamp.set(candle.timestamp, candle);
    }
  }
  return candleByTimestamp;
}

function compareRows(rows, candidate, costs) {
  return rows.map((row) =>
    compareTradeWithRatchet5m(
      row.trade,
      row.stopUpdates,
      row.candleByTimestamp,
      candidate,
      costs
    )
  );
}

function summarizeRows(rows, costs) {
  return Object.fromEntries(
    TARGET_TRIGGERED_RATCHET_CANDIDATES.map((candidate) => [
      candidate.id,
      summarizeCorrectedRatchetCandidate(compareRows(rows, candidate, costs))
    ])
  );
}

function grouped(rows, keyFn, costs) {
  const groups = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return Object.fromEntries(
    [...groups.entries()].map(([key, groupRows]) => [key, summarizeRows(groupRows, costs)])
  );
}

async function collectRows(manifest4h, manifest5m, parameters, implementationVersion) {
  const rowsByPartition = Object.fromEntries(
    RESEARCH_PARTITIONS.map((partition) => [partition.id, []])
  );
  const { runRegimeTrendV1 } = await import(
    pathToFileURL(join(scriptDirectory, "reference-engine.ts")).href
  );

  for (const file of manifest4h.files) {
    console.log(`Loading ${file.symbol} 5m candles...`);
    const candleByTimestamp = await loadFiveMinuteMap(file.symbol, manifest5m);
    console.log(`${file.symbol}: loaded ${candleByTimestamp.size} 5m candles`);

    const csv4h = await readFile(join(data4hDirectory, file.file), "utf8");
    if (sha256(csv4h) !== file.sha256) throw new Error(`4h SHA mismatch: ${file.symbol}`);
    const all4h = parseCsvCandles(csv4h, { endExclusive: HOLDOUT_START_MS });

    for (const partition of RESEARCH_PARTITIONS) {
      for (const segment of splitContiguousCandles(filterPartition(all4h, partition))) {
        if (segment.length < 201) continue;
        const baseline = runRegimeTrendV1(segment, {
          datasetHash: file.sha256,
          symbol: file.symbol,
          parameters,
          implementationVersion
        });
        for (const trade of baseline.trades) {
          rowsByPartition[partition.id].push({
            symbol: file.symbol,
            quarter: quarterId(trade.exit_timestamp),
            trade,
            stopUpdates: baseline.stopUpdates,
            candleByTimestamp
          });
        }
      }
    }
  }
  return rowsByPartition;
}

async function main() {
  const manifest4h = JSON.parse(
    await readFile(join(data4hDirectory, "dataset-manifest.json"), "utf8")
  );
  const manifest5m = JSON.parse(
    await readFile(join(data5mDirectory, "five-minute-manifest.json"), "utf8")
  );
  if (manifest5m.final_holdout_opened !== false) throw new Error("5m holdout flag is not false");
  if (Date.parse(manifest5m.requested_end_exclusive) !== HOLDOUT_START_MS) {
    throw new Error("5m holdout boundary mismatch");
  }

  const normalRows = await collectRows(
    manifest4h,
    manifest5m,
    { commission: 0.001, slippage: 0.0005 },
    "typescript-reference-v1.1.0-5m-ratchet-corrected-normal"
  );
  const doubledRows = await collectRows(
    manifest4h,
    manifest5m,
    { commission: 0.002, slippage: 0.001 },
    "typescript-reference-v1.1.0-5m-ratchet-corrected-doubled"
  );

  const report = {
    schema_version: 2,
    strategy_id: "regime-trend-v1",
    generated_at: new Date().toISOString(),
    holdout_opened: false,
    comparison: "5m-resolved baseline versus 5m-resolved ratchet",
    candidates: TARGET_TRIGGERED_RATCHET_CANDIDATES,
    partitions: RESEARCH_PARTITIONS.map((partition) => {
      const normal = normalRows[partition.id];
      const doubled = doubledRows[partition.id];
      return {
        id: partition.id,
        normal_trade_count: normal.length,
        doubled_trade_count: doubled.length,
        normal_costs: summarizeRows(normal, { commission: 0.001, slippage: 0.0005 }),
        doubled_costs: summarizeRows(doubled, { commission: 0.002, slippage: 0.001 }),
        by_symbol_normal_costs: grouped(normal, (row) => row.symbol, { commission: 0.001, slippage: 0.0005 }),
        by_symbol_doubled_costs: grouped(doubled, (row) => row.symbol, { commission: 0.002, slippage: 0.001 }),
        by_quarter_normal_costs: grouped(normal, (row) => row.quarter, { commission: 0.001, slippage: 0.0005 }),
        by_quarter_doubled_costs: grouped(doubled, (row) => row.quarter, { commission: 0.002, slippage: 0.001 })
      };
    })
  };

  await mkdir(outputDirectory, { recursive: true });
  const reportPath = join(outputDirectory, "target-triggered-ratchet-corrected-report.json");
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  for (const partition of report.partitions) {
    console.log(
      `${partition.id}: normalTrades=${partition.normal_trade_count}, doubledTrades=${partition.doubled_trade_count}`
    );
    for (const candidate of TARGET_TRIGGERED_RATCHET_CANDIDATES) {
      const normal = partition.normal_costs[candidate.id];
      const doubled = partition.doubled_costs[candidate.id];
      console.log(
        `  ${candidate.id}: netΔ=${normal.net_pnl_change.toFixed(6)}, ` +
        `PF=${normal.baseline_metrics.profit_factor?.toFixed(3) ?? "n/a"}→${normal.overlay_metrics.profit_factor?.toFixed(3) ?? "n/a"}, ` +
        `DD=${normal.baseline_metrics.max_drawdown_normalized_units.toFixed(6)}→${normal.overlay_metrics.max_drawdown_normalized_units.toFixed(6)}, ` +
        `ratchetExit=${normal.ratchet_exit_count}, ` +
        `preserved=${normal.winners_preserved_90pct}/${normal.baseline_winners}, ` +
        `gap=${normal.data_gap_count}, mismatch=${normal.data_mismatch_count}, ` +
        `doubledNetΔ=${doubled.net_pnl_change.toFixed(6)}`
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
