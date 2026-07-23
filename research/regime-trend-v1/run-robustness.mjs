import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { sha256 } from "./dataset-tools.mjs";
import {
  VALIDATION_START_MS,
  VALIDATION_END_EXCLUSIVE_MS,
  filterPartition,
  parseCsvCandles,
  splitContiguousCandles,
  summarizeTrades
} from "./backtest-tools.mjs";
import {
  PARAMETER_NEIGHBORS,
  buildQuarterReports,
  evaluateDoubledCostGate,
  evaluateNeighborhoodGate,
  evaluateOverallRobustness,
  evaluateQuarterGate,
  evaluateSymbolDistribution
} from "./robustness-tools.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const dataDirectory = join(scriptDirectory, "data");
const outputDirectory = join(scriptDirectory, "results");
const HOLDOUT_START_MS = Date.parse("2025-01-01T00:00:00.000Z");

async function loadReferenceEngine() {
  return import(pathToFileURL(join(scriptDirectory, "reference-engine.ts")).href);
}

async function loadValidationDatasets() {
  const manifest = JSON.parse(await readFile(join(dataDirectory, "dataset-manifest.json"), "utf8"));
  const datasets = [];

  for (const file of manifest.files) {
    const csv = await readFile(join(dataDirectory, file.file), "utf8");
    if (sha256(csv) !== file.sha256) throw new Error(`SHA-256 mismatch for ${file.symbol}`);
    const allCandles = parseCsvCandles(csv, { endExclusive: HOLDOUT_START_MS });
    const validationCandles = filterPartition(allCandles, {
      start: VALIDATION_START_MS,
      endExclusive: VALIDATION_END_EXCLUSIVE_MS
    });
    datasets.push({
      symbol: file.symbol,
      datasetHash: file.sha256,
      candles: validationCandles,
      segments: splitContiguousCandles(validationCandles)
    });
  }
  return datasets;
}

function runAcrossDatasets(runRegimeTrendV1, datasets, parameters, implementationVersion) {
  const allTrades = [];
  const symbols = [];

  for (const dataset of datasets) {
    const trades = [];
    for (const segment of dataset.segments) {
      if (segment.length < 201) continue;
      const result = runRegimeTrendV1(segment, {
        datasetHash: dataset.datasetHash,
        symbol: dataset.symbol,
        parameters,
        implementationVersion
      });
      trades.push(...result.trades);
    }
    allTrades.push(...trades);
    symbols.push({ symbol: dataset.symbol, metrics: summarizeTrades(trades) });
  }

  return { trades: allTrades, symbols, metrics: summarizeTrades(allTrades) };
}

async function main() {
  if (VALIDATION_END_EXCLUSIVE_MS > HOLDOUT_START_MS) {
    throw new Error("Robustness runner would open the final holdout");
  }

  const { runRegimeTrendV1 } = await loadReferenceEngine();
  const datasets = await loadValidationDatasets();
  await mkdir(outputDirectory, { recursive: true });

  const baseline = runAcrossDatasets(
    runRegimeTrendV1,
    datasets,
    undefined,
    "typescript-reference-v1.1.0-baseline"
  );

  const quarters = buildQuarterReports(baseline.trades);
  const doubledCosts = runAcrossDatasets(
    runRegimeTrendV1,
    datasets,
    { commission: 0.002, slippage: 0.001 },
    "typescript-reference-v1.1.0-double-cost"
  );

  const neighborReports = PARAMETER_NEIGHBORS.map((neighbor) => {
    const result = runAcrossDatasets(
      runRegimeTrendV1,
      datasets,
      neighbor.parameters,
      `typescript-reference-v1.1.0-${neighbor.id}`
    );
    return {
      id: neighbor.id,
      parameters: neighbor.parameters,
      metrics: result.metrics
    };
  });

  const gates = {
    symbol_distribution: evaluateSymbolDistribution(baseline.symbols),
    chronological_blocks: evaluateQuarterGate(quarters),
    doubled_costs: evaluateDoubledCostGate(doubledCosts.metrics),
    parameter_neighborhood: evaluateNeighborhoodGate(neighborReports)
  };
  const overall = evaluateOverallRobustness(gates);

  const report = {
    schema_version: 1,
    strategy_id: "regime-trend-v1",
    generated_at: new Date().toISOString(),
    holdout_opened: false,
    validation_start: new Date(VALIDATION_START_MS).toISOString(),
    validation_end_exclusive: new Date(VALIDATION_END_EXCLUSIVE_MS).toISOString(),
    baseline: {
      metrics: baseline.metrics,
      symbols: baseline.symbols
    },
    quarters,
    doubled_costs: {
      parameters: { commission: 0.002, slippage: 0.001 },
      metrics: doubledCosts.metrics
    },
    parameter_neighbors: neighborReports,
    gates,
    overall
  };

  const reportPath = join(outputDirectory, "robustness-report.json");
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(`symbol_distribution: ${gates.symbol_distribution.passed ? "PASS" : "FAIL"}`);
  console.log(
    `chronological_blocks: ${gates.chronological_blocks.passed ? "PASS" : "FAIL"} ` +
    `(${gates.chronological_blocks.positive_quarters}/8 positive quarters)`
  );
  console.log(
    `doubled_costs: ${gates.doubled_costs.passed ? "PASS" : "FAIL"} ` +
    `(net=${gates.doubled_costs.total_net_pnl.toFixed(6)}, ` +
    `PF=${gates.doubled_costs.profit_factor === null ? "n/a" : gates.doubled_costs.profit_factor.toFixed(3)})`
  );
  console.log(
    `parameter_neighborhood: ${gates.parameter_neighborhood.passed ? "PASS" : "FAIL"} ` +
    `(${gates.parameter_neighborhood.positive_neighbors}/12 positive, ` +
    `median PF=${gates.parameter_neighborhood.median_profit_factor === null ? "n/a" : gates.parameter_neighborhood.median_profit_factor.toFixed(3)})`
  );
  console.log(`overall: ${overall.classification}`);
  console.log(`Report written to ${reportPath}`);
  console.log("Final holdout was not opened.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
