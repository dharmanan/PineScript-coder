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
  PROFIT_PROTECTION_CANDIDATES,
  applyProfitProtection,
  summarizeCandidate
} from "./profit-protection-tools.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const dataDirectory = join(scriptDirectory, "data");
const outputDirectory = join(scriptDirectory, "results");
const HOLDOUT_START_MS = Date.parse("2025-01-01T00:00:00.000Z");

function evaluateViability(development, validation) {
  const checks = {
    development_net_improved: development.net_pnl_change > 0,
    validation_net_improved: validation.net_pnl_change > 0,
    development_pf_not_reduced:
      development.overlay_metrics.profit_factor !== null &&
      development.baseline_metrics.profit_factor !== null &&
      development.overlay_metrics.profit_factor >= development.baseline_metrics.profit_factor,
    validation_pf_not_reduced:
      validation.overlay_metrics.profit_factor !== null &&
      validation.baseline_metrics.profit_factor !== null &&
      validation.overlay_metrics.profit_factor >= validation.baseline_metrics.profit_factor,
    development_drawdown_not_increased:
      development.overlay_metrics.max_drawdown_normalized_units <=
      development.baseline_metrics.max_drawdown_normalized_units,
    validation_drawdown_not_increased:
      validation.overlay_metrics.max_drawdown_normalized_units <=
      validation.baseline_metrics.max_drawdown_normalized_units,
    development_winner_preservation:
      development.winners_preserved_90pct_rate !== null &&
      development.winners_preserved_90pct_rate >= 0.8,
    validation_winner_preservation:
      validation.winners_preserved_90pct_rate !== null &&
      validation.winners_preserved_90pct_rate >= 0.8,
    development_winner_loss_rate:
      development.baseline_winners > 0 &&
      development.winners_to_losses / development.baseline_winners <= 0.05,
    validation_winner_loss_rate:
      validation.baseline_winners > 0 &&
      validation.winners_to_losses / validation.baseline_winners <= 0.05
  };
  return { checks, passed: Object.values(checks).every(Boolean) };
}

async function main() {
  const { runRegimeTrendV1 } = await import(
    pathToFileURL(join(scriptDirectory, "reference-engine.ts")).href
  );
  const manifest = JSON.parse(await readFile(join(dataDirectory, "dataset-manifest.json"), "utf8"));
  await mkdir(outputDirectory, { recursive: true });

  const partitionData = new Map();
  for (const partition of RESEARCH_PARTITIONS) {
    if (partition.endExclusive > HOLDOUT_START_MS) {
      throw new Error(`Partition ${partition.id} would open final holdout`);
    }
    const items = [];
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
          implementationVersion: "typescript-reference-v1.1.0-profit-protection"
        });
        for (const trade of result.trades) items.push({ trade, candles: segment, symbol: file.symbol });
      }
    }
    partitionData.set(partition.id, items);
  }

  const candidates = [];
  for (const candidate of PROFIT_PROTECTION_CANDIDATES) {
    const partitions = {};
    for (const [partitionId, items] of partitionData.entries()) {
      const baselineTrades = items.map((item) => item.trade);
      const overlayResults = items.map((item) =>
        applyProfitProtection(item.trade, item.candles, candidate)
      );
      const aggregate = summarizeCandidate(baselineTrades, overlayResults);
      const bySymbol = {};
      for (const symbol of [...new Set(items.map((item) => item.symbol))]) {
        const symbolIndexes = items
          .map((item, index) => ({ item, index }))
          .filter(({ item }) => item.symbol === symbol)
          .map(({ index }) => index);
        bySymbol[symbol] = summarizeCandidate(
          symbolIndexes.map((index) => baselineTrades[index]),
          symbolIndexes.map((index) => overlayResults[index])
        );
      }
      partitions[partitionId] = { aggregate, by_symbol: bySymbol };
    }
    const viability = evaluateViability(
      partitions.development.aggregate,
      partitions.validation.aggregate
    );
    candidates.push({ candidate, partitions, viability });
  }

  const report = {
    schema_version: 1,
    strategy_id: "regime-trend-v1",
    generated_at: new Date().toISOString(),
    holdout_opened: false,
    holdout_start: new Date(HOLDOUT_START_MS).toISOString(),
    candidates
  };

  const reportPath = join(outputDirectory, "profit-protection-report.json");
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  for (const item of candidates) {
    const dev = item.partitions.development.aggregate;
    const val = item.partitions.validation.aggregate;
    console.log(item.candidate.id);
    console.log(
      `  development: netΔ=${dev.net_pnl_change.toFixed(6)}, ` +
      `PF=${dev.baseline_metrics.profit_factor?.toFixed(3)}→${dev.overlay_metrics.profit_factor?.toFixed(3)}, ` +
      `DD=${dev.baseline_metrics.max_drawdown_normalized_units.toFixed(6)}→${dev.overlay_metrics.max_drawdown_normalized_units.toFixed(6)}, ` +
      `preserved=${dev.winners_preserved_90pct}/${dev.baseline_winners}`
    );
    console.log(
      `  validation: netΔ=${val.net_pnl_change.toFixed(6)}, ` +
      `PF=${val.baseline_metrics.profit_factor?.toFixed(3)}→${val.overlay_metrics.profit_factor?.toFixed(3)}, ` +
      `DD=${val.baseline_metrics.max_drawdown_normalized_units.toFixed(6)}→${val.overlay_metrics.max_drawdown_normalized_units.toFixed(6)}, ` +
      `preserved=${val.winners_preserved_90pct}/${val.baseline_winners}`
    );
    console.log(`  viability: ${item.viability.passed ? "PASS" : "FAIL"}`);
  }
  console.log(`Report written to ${reportPath}`);
  console.log("Final holdout was not opened.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
