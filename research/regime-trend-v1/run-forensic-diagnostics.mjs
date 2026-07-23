import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { sha256 } from "./dataset-tools.mjs";
import {
  VALIDATION_START_MS,
  VALIDATION_END_EXCLUSIVE_MS,
  filterPartition,
  parseCsvCandles,
  splitContiguousCandles
} from "./backtest-tools.mjs";
import {
  FORENSIC_ATR_THRESHOLDS,
  FORENSIC_HORIZONS,
  analyzePostExit,
  analyzeTradePath,
  summarizeForensicRows
} from "./forensic-tools.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const dataDirectory = join(scriptDirectory, "data");
const outputDirectory = join(scriptDirectory, "results");
const HOLDOUT_START_MS = Date.parse("2025-01-01T00:00:00.000Z");

function quarterId(timestamp) {
  const date = new Date(timestamp);
  return `${date.getUTCFullYear()}-Q${Math.floor(date.getUTCMonth() / 3) + 1}`;
}

function groupRows(rows, keyFn) {
  const groups = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return Object.fromEntries(
    [...groups.entries()].map(([key, group]) => [key, summarizeForensicRows(group)])
  );
}

function mfeBin(mfeAtr) {
  if (mfeAtr < 0.5) return "below_0_5_atr";
  if (mfeAtr < 1) return "0_5_to_1_atr";
  if (mfeAtr < 2) return "1_to_2_atr";
  return "at_least_2_atr";
}

function average(values) {
  const finite = values.filter(Number.isFinite);
  return finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : null;
}

async function main() {
  if (VALIDATION_END_EXCLUSIVE_MS > HOLDOUT_START_MS) {
    throw new Error("Forensic runner would open the final holdout");
  }

  const { runRegimeTrendV1 } = await import(
    pathToFileURL(join(scriptDirectory, "reference-engine.ts")).href
  );
  const manifest = JSON.parse(await readFile(join(dataDirectory, "dataset-manifest.json"), "utf8"));
  const allRows = [];

  for (const file of manifest.files) {
    const csv = await readFile(join(dataDirectory, file.file), "utf8");
    if (sha256(csv) !== file.sha256) throw new Error(`SHA-256 mismatch for ${file.symbol}`);
    const candles = filterPartition(
      parseCsvCandles(csv, { endExclusive: HOLDOUT_START_MS }),
      { start: VALIDATION_START_MS, endExclusive: VALIDATION_END_EXCLUSIVE_MS }
    );

    for (const segment of splitContiguousCandles(candles)) {
      if (segment.length < 201) continue;
      const result = runRegimeTrendV1(segment, {
        datasetHash: file.sha256,
        symbol: file.symbol,
        implementationVersion: "typescript-reference-v1.1.0-forensic-v2"
      });

      for (const trade of result.trades) {
        const path = analyzeTradePath(trade, segment);
        allRows.push({
          symbol: file.symbol,
          quarter: quarterId(trade.exit_timestamp),
          exit_reason: trade.exit_reason,
          losing_trade: trade.net_pnl < 0,
          mfe_bin: mfeBin(path.mfe_atr),
          trade,
          path,
          counterfactuals: trade.net_pnl < 0
            ? analyzePostExit(trade, segment, FORENSIC_HORIZONS, FORENSIC_ATR_THRESHOLDS)
            : {}
        });
      }
    }
  }

  const losingRows = allRows.filter((row) => row.losing_trade);
  const winners = allRows.filter((row) => !row.losing_trade);

  const report = {
    schema_version: 2,
    strategy_id: "regime-trend-v1",
    forensic_method: "conservative-intrabar-ambiguity-v2",
    generated_at: new Date().toISOString(),
    holdout_opened: false,
    validation_start: new Date(VALIDATION_START_MS).toISOString(),
    validation_end_exclusive: new Date(VALIDATION_END_EXCLUSIVE_MS).toISOString(),
    horizons_bars: FORENSIC_HORIZONS,
    opportunity_thresholds_atr: FORENSIC_ATR_THRESHOLDS,
    totals: {
      closed_trades: allRows.length,
      losing_trades: losingRows.length,
      winning_trades: winners.length,
      losing_trades_with_conservative_mfe_at_least_1_atr: losingRows.filter(
        (row) => row.path.mfe_atr >= 1
      ).length,
      losing_trades_with_optimistic_mfe_upper_bound_at_least_1_atr: losingRows.filter(
        (row) => row.path.mfe_atr_upper_bound >= 1
      ).length,
      losing_trades_with_mfe_below_0_5_atr: losingRows.filter(
        (row) => row.path.mfe_atr < 0.5
      ).length,
      average_winner_capture_ratio: average(winners.map((row) => row.path.capture_ratio)),
      average_loser_capture_ratio: average(losingRows.map((row) => row.path.capture_ratio))
    },
    losing_trade_summary: summarizeForensicRows(losingRows),
    by_mfe_bin: groupRows(losingRows, (row) => row.mfe_bin),
    by_symbol: groupRows(losingRows, (row) => row.symbol),
    by_exit_reason: groupRows(losingRows, (row) => row.exit_reason),
    by_quarter: groupRows(losingRows, (row) => row.quarter),
    rows: allRows
  };

  await mkdir(outputDirectory, { recursive: true });
  const reportPath = join(outputDirectory, "forensic-diagnostics-report-v2.json");
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(`closed trades: ${report.totals.closed_trades}`);
  console.log(`losing trades: ${report.totals.losing_trades}`);
  console.log(
    `losers with conservative >=1 ATR MFE: ` +
    `${report.totals.losing_trades_with_conservative_mfe_at_least_1_atr}`
  );
  console.log(
    `optimistic upper-bound >=1 ATR MFE: ` +
    `${report.totals.losing_trades_with_optimistic_mfe_upper_bound_at_least_1_atr}`
  );

  for (const horizon of FORENSIC_HORIZONS) {
    const item = report.losing_trade_summary[horizon];
    console.log(
      `${horizon} bars base: short=${item.short_reversal_count}/${item.eligible}, ` +
      `recovery=${item.long_recovery_count}/${item.eligible}, ` +
      `no-trade=${item.no_trade_count}/${item.eligible}`
    );
    for (const threshold of FORENSIC_ATR_THRESHOLDS) {
      const thresholdItem = item.thresholds[String(threshold)];
      console.log(
        `  >=${threshold.toFixed(2)} ATR: short=${thresholdItem.short_reversal_count}, ` +
        `recovery=${thresholdItem.long_recovery_count}, ` +
        `no-trade=${thresholdItem.no_trade_count}`
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
