import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { aggregate5mTo15m, splitContiguous, summarize } from "./reference-engine.mjs";
import {
  BENCHMARK_CANDIDATES,
  aggregate15m,
  prepareBenchmarkFeatures,
  runBenchmarkCandidate
} from "./public-benchmark-tools.mjs";
import { parseArchiveCsv, sha256File } from "../regime-trend-v1/five-minute-data-tools.mjs";

const directory = dirname(fileURLToPath(import.meta.url));
const sourceDirectory = join(directory, "..", "regime-trend-v1", "data-5m");
const csvDirectory = join(sourceDirectory, "csv");
const manifestPath = join(sourceDirectory, "five-minute-manifest.json");
const resultDirectory = join(directory, "results");
const HOLDOUT = Date.parse("2025-01-01T00:00:00.000Z");
const DEVELOPMENT = { start: Date.parse("2019-01-01T00:00:00.000Z"), end: Date.parse("2023-01-01T00:00:00.000Z") };
const VALIDATION = { start: Date.parse("2023-01-01T00:00:00.000Z"), end: HOLDOUT };
const TIMEFRAMES = Object.freeze([
  { id: "15m", factor: 1 },
  { id: "30m", factor: 2 },
  { id: "1h", factor: 4 }
]);
const NORMAL = Object.freeze({ commission: 0.001, slippage: 0.0005 });
const STRESS = Object.freeze({ commission: 0.002, slippage: 0.001 });

async function loadSymbol(symbol, manifest) {
  const entries = manifest.files.filter((entry) => entry.symbol === symbol).sort((a, b) => a.month.localeCompare(b.month));
  const five = [];
  for (const entry of entries) {
    const path = join(csvDirectory, entry.file);
    if (await sha256File(path) !== entry.csv_sha256) throw new Error(`CSV SHA mismatch: ${entry.file}`);
    for (const candle of parseArchiveCsv(await readFile(path, "utf8"))) {
      if (candle.timestamp >= HOLDOUT) throw new Error(`Final holdout opened by ${entry.file}`);
      five.push(candle);
    }
  }
  five.sort((a, b) => a.timestamp - b.timestamp);
  return aggregate5mTo15m(five);
}

function segments(candles, window, warmup = 500) {
  const first = candles.findIndex((item) => item.timestamp >= window.start);
  if (first < 0) return [];
  const selected = candles.slice(Math.max(0, first - warmup)).filter((item) => item.timestamp < window.end);
  return splitContiguous(selected).filter((segment) => segment.some((item) => item.timestamp >= window.start));
}

function merge(trades) {
  const metrics = summarize(trades);
  const directions = {};
  const exits = {};
  for (const trade of trades) {
    directions[trade.direction] = (directions[trade.direction] ?? 0) + 1;
    exits[trade.exit_reason] = (exits[trade.exit_reason] ?? 0) + 1;
  }
  return { ...metrics, direction_counts: directions, exit_reason_counts: exits };
}

function evaluate(contexts, candidate, window, costs) {
  const trades = [];
  for (const context of contexts) {
    const result = runBenchmarkCandidate(context.candles, context.features, candidate, {
      symbol: context.symbol,
      tradeStart: window.start,
      tradeEndExclusive: window.end,
      ...costs
    });
    trades.push(...result.trades);
  }
  return { metrics: merge(trades), trades };
}

function score(metrics) {
  const pf = metrics.profit_factor ?? 0;
  const tradePenalty = metrics.closed_trades < 40 ? (40 - metrics.closed_trades) / 40 : 0;
  return metrics.total_net_return_units + Math.min(pf, 2) * 0.75 - metrics.max_drawdown_return_units * 0.5 - tradePenalty;
}

function gates(normal, stress) {
  return {
    at_least_30_validation_trades: normal.closed_trades >= 30,
    normal_positive: normal.total_net_return_units > 0,
    normal_pf_at_least_1_10: (normal.profit_factor ?? 0) >= 1.1,
    stress_positive: stress.total_net_return_units > 0,
    stress_pf_at_least_1_02: (stress.profit_factor ?? 0) >= 1.02,
    drawdown_below_0_5: normal.max_drawdown_return_units < 0.5,
    passed: normal.closed_trades >= 30 && normal.total_net_return_units > 0 &&
      (normal.profit_factor ?? 0) >= 1.1 && stress.total_net_return_units > 0 &&
      (stress.profit_factor ?? 0) >= 1.02 && normal.max_drawdown_return_units < 0.5
  };
}

async function main() {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (manifest.final_holdout_opened !== false || Date.parse(manifest.requested_end_exclusive) !== HOLDOUT) {
    throw new Error("Holdout boundary mismatch");
  }

  const markets = [];
  for (const symbol of manifest.symbols) {
    console.log(`Loading ${symbol}...`);
    const base = await loadSymbol(symbol, manifest);
    for (const timeframe of TIMEFRAMES) {
      const candles = aggregate15m(base, timeframe.factor);
      const developmentContexts = segments(candles, DEVELOPMENT).map((part) => ({ symbol, candles: part, features: prepareBenchmarkFeatures(part) }));
      const validationContexts = segments(candles, VALIDATION).map((part) => ({ symbol, candles: part, features: prepareBenchmarkFeatures(part) }));
      markets.push({ symbol, timeframe: timeframe.id, developmentContexts, validationContexts });
      console.log(`${symbol} ${timeframe.id}: ${candles.length} complete candles`);
    }
  }

  const reports = [];
  for (const market of markets) {
    console.log(`\nSelecting ${market.symbol} ${market.timeframe}...`);
    const ranking = BENCHMARK_CANDIDATES.map((candidate) => {
      const development = evaluate(market.developmentContexts, candidate, DEVELOPMENT, NORMAL);
      return { candidate, development, score: score(development.metrics) };
    }).sort((a, b) => b.score - a.score);

    const finalists = ranking.slice(0, 5).map((item) => {
      const validation = evaluate(market.validationContexts, item.candidate, VALIDATION, NORMAL);
      const stress = evaluate(market.validationContexts, item.candidate, VALIDATION, STRESS);
      return {
        candidate: item.candidate,
        development: item.development.metrics,
        validation: validation.metrics,
        stress: stress.metrics,
        gates: gates(validation.metrics, stress.metrics),
        validationTrades: validation.trades
      };
    });
    const accepted = finalists.filter((item) => item.gates.passed)
      .sort((a, b) => b.validation.total_net_return_units - a.validation.total_net_return_units)[0] ?? null;
    reports.push({
      symbol: market.symbol,
      timeframe: market.timeframe,
      top_development: ranking.slice(0, 10).map((item, index) => ({ rank: index + 1, candidate: item.candidate, score: item.score, metrics: item.development.metrics })),
      validation_finalists: finalists.map(({ validationTrades, ...item }) => item),
      accepted_profile: accepted ? {
        candidate: accepted.candidate,
        development: accepted.development,
        validation: accepted.validation,
        stress: accepted.stress,
        gates: accepted.gates
      } : null
    });
    console.log(`Accepted: ${accepted?.candidate.id ?? "NONE"}`);
  }

  const acceptedProfiles = reports.filter((item) => item.accepted_profile);
  const report = {
    schema_version: 1,
    study_id: "rsi-divergence-public-benchmarks-v1",
    source: "independent implementations of publicly described RSI divergence strategy families",
    candidate_count_per_market: BENCHMARK_CANDIDATES.length,
    markets_tested: reports.length,
    normal_costs: NORMAL,
    stress_costs: STRESS,
    final_holdout_opened: false,
    accepted_profile_count: acceptedProfiles.length,
    preset_update_authorized: acceptedProfiles.length > 0,
    results: reports
  };

  await mkdir(resultDirectory, { recursive: true });
  await writeFile(join(resultDirectory, "public-benchmark-study-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log("\nACCEPTED PROFILES");
  for (const item of acceptedProfiles) {
    const p = item.accepted_profile;
    console.log(`${item.symbol} ${item.timeframe}: ${p.candidate.id}, validation net=${p.validation.total_net_return_units.toFixed(6)}, PF=${p.validation.profit_factor?.toFixed(3)}, stress net=${p.stress.total_net_return_units.toFixed(6)}, PF=${p.stress.profit_factor?.toFixed(3)}`);
  }
  if (!acceptedProfiles.length) console.log("NONE");
  console.log(`Report written to ${join(resultDirectory, "public-benchmark-study-report.json")}`);
  console.log("Final holdout was not opened.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
