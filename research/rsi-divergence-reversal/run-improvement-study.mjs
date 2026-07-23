import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  aggregate5mTo15m,
  splitContiguous,
  summarize
} from "./reference-engine.mjs";
import {
  CANDIDATES,
  candidateScore,
  prepareFeatures,
  runCandidate
} from "./improvement-tools.mjs";
import {
  parseArchiveCsv,
  sha256File
} from "../regime-trend-v1/five-minute-data-tools.mjs";

const directory = dirname(fileURLToPath(import.meta.url));
const sourceDirectory = join(directory, "..", "regime-trend-v1", "data-5m");
const csvDirectory = join(sourceDirectory, "csv");
const manifestPath = join(sourceDirectory, "five-minute-manifest.json");
const resultDirectory = join(directory, "results");
const HOLDOUT = Date.parse("2025-01-01T00:00:00.000Z");
const WARMUP_BARS = 400;
const TOP_COUNT = 5;

const partitions = Object.freeze({
  development: {
    id: "development",
    start: Date.parse("2019-01-01T00:00:00.000Z"),
    endExclusive: Date.parse("2023-01-01T00:00:00.000Z")
  },
  validation: {
    id: "validation",
    start: Date.parse("2023-01-01T00:00:00.000Z"),
    endExclusive: HOLDOUT
  }
});

const costs = Object.freeze({
  commission: 0.001,
  slippage: 0.0005,
  intrabarPolicy: "tradingview_path"
});

async function loadSymbol(symbol, manifest) {
  const entries = manifest.files
    .filter((entry) => entry.symbol === symbol)
    .sort((left, right) => left.month.localeCompare(right.month));
  const fiveMinute = [];
  for (const entry of entries) {
    const path = join(csvDirectory, entry.file);
    const actualSha = await sha256File(path);
    if (actualSha !== entry.csv_sha256) throw new Error(`CSV SHA mismatch: ${entry.file}`);
    for (const candle of parseArchiveCsv(await readFile(path, "utf8"))) {
      if (candle.timestamp >= HOLDOUT) throw new Error(`Final holdout opened by ${entry.file}`);
      fiveMinute.push(candle);
    }
  }
  fiveMinute.sort((left, right) => left.timestamp - right.timestamp);
  return aggregate5mTo15m(fiveMinute);
}

function partitionSegments(candles, partition) {
  const firstInside = candles.findIndex((candle) => candle.timestamp >= partition.start);
  if (firstInside === -1) return [];
  const startIndex = Math.max(0, firstInside - WARMUP_BARS);
  const selected = candles.slice(startIndex).filter((candle) => candle.timestamp < partition.endExclusive);
  return splitContiguous(selected).filter((segment) =>
    segment.some((candle) => candle.timestamp >= partition.start && candle.timestamp < partition.endExclusive)
  );
}

function mergeMetrics(trades) {
  const metrics = summarize(trades);
  const directions = {};
  const exits = {};
  for (const trade of trades) {
    directions[trade.direction] = (directions[trade.direction] ?? 0) + 1;
    exits[trade.exit_reason] = (exits[trade.exit_reason] ?? 0) + 1;
  }
  return {
    ...metrics,
    direction_counts: directions,
    exit_reason_counts: exits
  };
}

function evaluateCandidate(candidate, symbolContexts, partition) {
  const combined = [];
  const bySymbol = {};
  for (const [symbol, contexts] of Object.entries(symbolContexts)) {
    const trades = [];
    for (const context of contexts[partition.id]) {
      const result = runCandidate(context.candles, context.features, candidate, {
        symbol,
        tradeStart: partition.start,
        tradeEndExclusive: partition.endExclusive,
        ...costs
      });
      trades.push(...result.trades);
    }
    bySymbol[symbol] = mergeMetrics(trades);
    combined.push(...trades);
  }
  return {
    candidate_id: candidate.id,
    combined: mergeMetrics(combined),
    by_symbol: bySymbol,
    trades: combined
  };
}

function validationGates(result) {
  const symbolsPositive = Object.values(result.by_symbol)
    .filter((metrics) => metrics.total_net_return_units > 0).length;
  const metrics = result.combined;
  return {
    at_least_100_trades: metrics.closed_trades >= 100,
    positive_net: metrics.total_net_return_units > 0,
    profit_factor_above_one: (metrics.profit_factor ?? 0) > 1,
    positive_on_two_symbols: symbolsPositive >= 2,
    drawdown_below_one: metrics.max_drawdown_return_units < 1,
    passed: metrics.closed_trades >= 100 &&
      metrics.total_net_return_units > 0 &&
      (metrics.profit_factor ?? 0) > 1 &&
      symbolsPositive >= 2 &&
      metrics.max_drawdown_return_units < 1
  };
}

function compact(result) {
  return {
    candidate_id: result.candidate_id,
    combined: result.combined,
    by_symbol: result.by_symbol
  };
}

function ledgerCsv(trades) {
  const fields = [
    "candidate_id", "symbol", "direction", "entry_timestamp", "entry_fill",
    "entry_atr", "initial_stop", "target", "exit_timestamp", "exit_fill",
    "exit_reason", "net_return", "bars_held", "ambiguous_intrabar"
  ];
  return `${fields.join(",")}\n${trades.map((trade) =>
    fields.map((field) => trade[field]).join(",")
  ).join("\n")}\n`;
}

async function main() {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (manifest.final_holdout_opened !== false) throw new Error("Source holdout flag is not false");
  if (Date.parse(manifest.requested_end_exclusive) !== HOLDOUT) throw new Error("Holdout boundary mismatch");

  const symbolContexts = {};
  for (const symbol of manifest.symbols) {
    console.log(`Loading ${symbol}...`);
    const candles = await loadSymbol(symbol, manifest);
    symbolContexts[symbol] = {};
    for (const partition of Object.values(partitions)) {
      symbolContexts[symbol][partition.id] = partitionSegments(candles, partition).map((segment) => ({
        candles: segment,
        features: prepareFeatures(segment)
      }));
    }
    console.log(`${symbol}: ${candles.length} complete 15m candles`);
  }

  console.log(`Evaluating ${CANDIDATES.length} frozen development candidates...`);
  const development = CANDIDATES.map((candidate) => {
    const result = evaluateCandidate(candidate, symbolContexts, partitions.development);
    return {
      candidate,
      result,
      score: candidateScore(result.combined)
    };
  }).sort((left, right) => right.score - left.score);

  const top = development.slice(0, TOP_COUNT);
  const validation = top.map((item) => {
    const result = evaluateCandidate(item.candidate, symbolContexts, partitions.validation);
    return {
      candidate: item.candidate,
      development: item.result,
      development_score: item.score,
      validation: result,
      gates: validationGates(result)
    };
  });

  const accepted = validation
    .filter((item) => item.gates.passed)
    .sort((left, right) =>
      right.validation.combined.total_net_return_units - left.validation.combined.total_net_return_units
    )[0] ?? null;

  const report = {
    schema_version: 1,
    study_id: "rsi-divergence-reversal-improvement-v1",
    generated_at: new Date().toISOString(),
    source: "checksum-verified Binance Spot 5m archives aggregated to complete 15m candles",
    candidate_count: CANDIDATES.length,
    selection_policy: "rank all frozen candidates on development only; validate the top five without reranking parameters",
    costs,
    partitions,
    final_holdout_opened: false,
    development_ranking: development.map((item, index) => ({
      rank: index + 1,
      score: item.score,
      candidate: item.candidate,
      result: compact(item.result)
    })),
    validation_finalists: validation.map((item) => ({
      candidate: item.candidate,
      development_score: item.development_score,
      development: compact(item.development),
      validation: compact(item.validation),
      gates: item.gates
    })),
    accepted_candidate: accepted ? {
      candidate: accepted.candidate,
      development: compact(accepted.development),
      validation: compact(accepted.validation),
      gates: accepted.gates
    } : null,
    preset_update_authorized: Boolean(accepted)
  };

  await mkdir(resultDirectory, { recursive: true });
  await writeFile(
    join(resultDirectory, "improvement-study-report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8"
  );
  for (const finalist of validation) {
    await writeFile(
      join(resultDirectory, `finalist-${finalist.candidate.id}-validation-ledger.csv`),
      ledgerCsv(finalist.validation.trades),
      "utf8"
    );
  }

  console.log("\nTOP DEVELOPMENT CANDIDATES");
  for (const item of top) {
    const m = item.result.combined;
    console.log(`${item.candidate.id}: score=${item.score.toFixed(6)}, trades=${m.closed_trades}, net=${m.total_net_return_units.toFixed(6)}, PF=${m.profit_factor?.toFixed(3) ?? "n/a"}, DD=${m.max_drawdown_return_units.toFixed(6)}`);
  }

  console.log("\nVALIDATION");
  for (const item of validation) {
    const m = item.validation.combined;
    console.log(`${item.candidate.id}: ${item.gates.passed ? "PASS" : "FAIL"}, trades=${m.closed_trades}, net=${m.total_net_return_units.toFixed(6)}, PF=${m.profit_factor?.toFixed(3) ?? "n/a"}, WR=${m.win_rate === null ? "n/a" : (100 * m.win_rate).toFixed(2) + "%"}, DD=${m.max_drawdown_return_units.toFixed(6)}`);
  }

  console.log(`\nAccepted candidate: ${accepted?.candidate.id ?? "NONE"}`);
  console.log(`Report written to ${join(resultDirectory, "improvement-study-report.json")}`);
  console.log("Final holdout was not opened.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
