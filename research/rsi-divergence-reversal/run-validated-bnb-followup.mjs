// Forward test for the only profile accepted by the frozen public-benchmark study.
//
// The profile was selected on 2019-2022 and accepted on 2023-2024. This runner
// does not select or tune anything: it only measures that already-frozen BNBUSDT
// 30-minute profile on later, previously unused calendar partitions.
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { aggregate } from "../preset-sweep/data.mjs";
import { loadAll } from "../preset-sweep/dataset.mjs";
import { summarize } from "./reference-engine.mjs";
import {
  BENCHMARK_CANDIDATES,
  prepareBenchmarkFeatures,
  runBenchmarkCandidate
} from "./public-benchmark-tools.mjs";

const directory = dirname(fileURLToPath(import.meta.url));
const resultDirectory = join(directory, "results");
const SYMBOL = "BNBUSDT";
const THIRTY_MINUTES = 30 * 60 * 1000;
const WARMUP_BARS = 500;
const candidate = BENCHMARK_CANDIDATES.find(
  (item) => item.id === "ema-confirmed-regular__swing-rr-1.8"
);
if (!candidate) throw new Error("Frozen BNB benchmark candidate is missing");

const WINDOWS = Object.freeze({
  "2025-forward": {
    start: Date.parse("2025-01-01T00:00:00Z"),
    endExclusive: Date.parse("2026-01-01T00:00:00Z")
  },
  "2026-h1-forward": {
    start: Date.parse("2026-01-01T00:00:00Z"),
    endExclusive: Date.parse("2026-07-01T00:00:00Z")
  },
  "2026-july-forward": {
    start: Date.parse("2026-07-01T00:00:00Z"),
    endExclusive: Date.parse("2026-08-01T00:00:00Z")
  }
});
const COSTS = Object.freeze({
  normal: { commission: 0.001, slippage: 0.0005 },
  stress: { commission: 0.002, slippage: 0.001 }
});

function splitExact(candles) {
  if (!candles.length) return [];
  const output = [[candles[0]]];
  for (let index = 1; index < candles.length; index += 1) {
    if (candles[index].timestamp - candles[index - 1].timestamp === THIRTY_MINUTES) {
      output.at(-1).push(candles[index]);
    } else {
      output.push([candles[index]]);
    }
  }
  return output;
}

function contextsFor(candles, window) {
  const first = candles.findIndex((item) => item.timestamp >= window.start);
  if (first < 0) return [];
  const selected = candles
    .slice(Math.max(0, first - WARMUP_BARS))
    .filter((item) => item.timestamp < window.endExclusive);
  return splitExact(selected)
    .filter((segment) => segment.some((item) => item.timestamp >= window.start))
    .map((segment) => ({ candles: segment, features: prepareBenchmarkFeatures(segment) }));
}

function evaluate(contexts, window, costs) {
  const trades = contexts.flatMap((context) =>
    runBenchmarkCandidate(context.candles, context.features, candidate, {
      symbol: SYMBOL,
      tradeStart: window.start,
      tradeEndExclusive: window.endExclusive,
      ...costs
    }).trades
  );
  return { ...summarize(trades), wins: trades.filter((trade) => trade.net_return > 0).length };
}

const { bySymbol, provenance } = await loadAll();
const fiveMinute = bySymbol.get(SYMBOL);
if (!fiveMinute?.length) throw new Error(`${SYMBOL} data is missing`);
const candles = aggregate(fiveMinute, 6);

const periods = {};
for (const [name, window] of Object.entries(WINDOWS)) {
  const contexts = contextsFor(candles, window);
  periods[name] = Object.fromEntries(
    Object.entries(COSTS).map(([costName, costs]) => [
      costName,
      evaluate(contexts, window, costs)
    ])
  );
}

const report = {
  schema_version: 1,
  study_id: "rsi-divergence-validated-bnb-forward-v1",
  selection: "none; frozen candidate from public-benchmark-study-report.json",
  symbol: SYMBOL,
  timeframe: "30m",
  candidate,
  provenance,
  costs: COSTS,
  periods
};

await mkdir(resultDirectory, { recursive: true });
const outputPath = join(resultDirectory, "validated-bnb-followup-report.json");
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.log(`${SYMBOL} 30m — ${candidate.id}`);
for (const [name, result] of Object.entries(periods)) {
  for (const [costName, metrics] of Object.entries(result)) {
    const winRate = metrics.closed_trades ? 100 * metrics.wins / metrics.closed_trades : 0;
    console.log(
      `${name.padEnd(20)} ${costName.padEnd(6)} ` +
      `${String(metrics.closed_trades).padStart(3)} trades ` +
      `${winRate.toFixed(1).padStart(5)}% win ` +
      `net ${metrics.total_net_return_units.toFixed(6).padStart(10)} ` +
      `PF ${(metrics.profit_factor ?? 0).toFixed(3)}`
    );
  }
}
console.log(`Report written to ${outputPath}`);
