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
  applyTargetTriggeredRatchet,
  summarizeRatchetCandidate
} from "./target-triggered-ratchet-tools.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const data4hDirectory = join(scriptDirectory, "data");
const data5mDirectory = join(scriptDirectory, "data-5m");
const data5mCsvDirectory = join(data5mDirectory, "csv");
const outputDirectory = join(scriptDirectory, "results");
const HOLDOUT_START_MS = Date.parse("2025-01-01T00:00:00.000Z");

async function loadFiveMinuteMap(symbol, manifest) {
  const entries = manifest.files
    .filter((file) => file.symbol === symbol)
    .sort((a, b) => a.month.localeCompare(b.month));
  if (entries.length !== manifest.months.length) {
    throw new Error(`Incomplete 5m manifest for ${symbol}: ${entries.length}/${manifest.months.length}`);
  }
  const candleByTimestamp = new Map();
  for (const entry of entries) {
    const path = join(data5mCsvDirectory, entry.file);
    if (await sha256File(path) !== entry.csv_sha256) throw new Error(`5m CSV SHA mismatch: ${entry.file}`);
    for (const candle of parseArchiveCsv(await readFile(path, "utf8"))) {
      if (candle.timestamp >= HOLDOUT_START_MS) throw new Error(`5m data opens holdout: ${entry.file}`);
      if (candleByTimestamp.has(candle.timestamp)) throw new Error(`Duplicate 5m timestamp: ${symbol} ${candle.timestamp}`);
      candleByTimestamp.set(candle.timestamp, candle);
    }
  }
  return candleByTimestamp;
}

function summarizeRows(rows, costMode) {
  return Object.fromEntries(
    TARGET_TRIGGERED_RATCHET_CANDIDATES.map((candidate) => {
      const results = rows.map((row) =>
        applyTargetTriggeredRatchet(
          row.trade,
          row.stopUpdates,
          row.candleByTimestamp,
          candidate,
          costMode === "doubled" ? { commission: 0.002, slippage: 0.001 } : undefined
        )
      );
      return [candidate.id, summarizeRatchetCandidate(rows.map((row) => row.trade), results)];
    })
  );
}

function bySymbol(rows, costMode) {
  const symbols = [...new Set(rows.map((row) => row.symbol))];
  return Object.fromEntries(symbols.map((symbol) => [symbol, summarizeRows(rows.filter((row) => row.symbol === symbol), costMode)]));
}

async function main() {
  const manifest4h = JSON.parse(await readFile(join(data4hDirectory, "dataset-manifest.json"), "utf8"));
  const manifest5m = JSON.parse(await readFile(join(data5mDirectory, "five-minute-manifest.json"), "utf8"));
  if (manifest5m.final_holdout_opened !== false) throw new Error("5m holdout flag is not false");
  if (Date.parse(manifest5m.requested_end_exclusive) !== HOLDOUT_START_MS) throw new Error("5m holdout boundary mismatch");

  const { runRegimeTrendV1 } = await import(pathToFileURL(join(scriptDirectory, "reference-engine.ts")).href);
  const rowsByPartition = Object.fromEntries(RESEARCH_PARTITIONS.map((partition) => [partition.id, []]));

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
          implementationVersion: "typescript-reference-v1.1.0-5m-ratchet"
        });
        for (const trade of baseline.trades) {
          rowsByPartition[partition.id].push({
            symbol: file.symbol,
            trade,
            stopUpdates: baseline.stopUpdates,
            candleByTimestamp
          });
        }
      }
    }
  }

  const report = {
    schema_version: 1,
    strategy_id: "regime-trend-v1",
    generated_at: new Date().toISOString(),
    holdout_opened: false,
    candidates: TARGET_TRIGGERED_RATCHET_CANDIDATES,
    partitions: RESEARCH_PARTITIONS.map((partition) => {
      const rows = rowsByPartition[partition.id];
      return {
        id: partition.id,
        trades: rows.length,
        normal_costs: summarizeRows(rows, "normal"),
        doubled_costs: summarizeRows(rows, "doubled"),
        by_symbol_normal_costs: bySymbol(rows, "normal")
      };
    })
  };

  await mkdir(outputDirectory, { recursive: true });
  const reportPath = join(outputDirectory, "target-triggered-ratchet-report.json");
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  for (const partition of report.partitions) {
    console.log(`${partition.id}: trades=${partition.trades}`);
    for (const candidate of TARGET_TRIGGERED_RATCHET_CANDIDATES) {
      const normal = partition.normal_costs[candidate.id];
      const doubled = partition.doubled_costs[candidate.id];
      console.log(
        `  ${candidate.id}: netΔ=${normal.net_pnl_change.toFixed(6)}, ` +
        `PF=${normal.baseline_metrics.profit_factor?.toFixed(3) ?? "n/a"}→${normal.overlay_metrics.profit_factor?.toFixed(3) ?? "n/a"}, ` +
        `DD=${normal.baseline_metrics.max_drawdown_normalized_units.toFixed(6)}→${normal.overlay_metrics.max_drawdown_normalized_units.toFixed(6)}, ` +
        `activated=${normal.activation_count}, ratchetExit=${normal.ratchet_exit_count}, ` +
        `preserved=${normal.winners_preserved_90pct}/${normal.baseline_winners}, doubledNetΔ=${doubled.net_pnl_change.toFixed(6)}`
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
