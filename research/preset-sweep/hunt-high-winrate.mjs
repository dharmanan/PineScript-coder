// Chasing a remembered result: a very high hit rate on Fast EMA Scalper at five minutes.
//
// This is a real gap rather than a re-run. Five minutes was dropped after the very first
// sweep, when the lowest reward target tried was 2 — and hit rate is bounded by the reward
// target, since break-even is 1/(1+rr). At reward 2 no configuration can show 70% and still
// make sense, so the elimination never covered the band where such a number could live.
//
// The reason to expect trouble anyway: commission is charged per trade regardless of chart
// speed, so on a five-minute chart each R is small relative to the same fixed cost. That is
// a prediction, not a result, and the point of this run is to check it.
import { buildBehaviorPlan, presets } from "./generated/preset-config.mjs";
import { TIMEFRAMES, aggregate, intervalMs, splitContiguous } from "./data.mjs";
import { loadAll, partitionOf, partitionsFor } from "./dataset.mjs";
import { buildSeries, buildSignals, simulate } from "./engine.mjs";

const target = process.argv.find((item) => item.startsWith("--preset="))?.split("=")[1] ?? "fast_ema_scalper";
const base = presets.find((item) => item.presetId === target);
if (!base) throw new Error(`Unknown preset: ${target}`);

const PARTITIONS = partitionsFor("july");
const { bySymbol } = await loadAll();
const symbols = [...bySymbol.keys()].sort();

const REWARDS = [0.5, 0.75, 1, 1.5, 2];
const CHARTS = ["5", "15", "30"];

const stat = (values) => {
  if (!values.length) return null;
  const wins = values.filter((value) => value > 0).length;
  return { trades: values.length, winRate: wins / values.length, expectancy: values.reduce((a, b) => a + b, 0) / values.length };
};
const cell = (s) => (s ? `${String(s.trades).padStart(5)}t %${(s.winRate * 100).toFixed(1).padStart(5)} ${(s.expectancy >= 0 ? "+" : "") + s.expectancy.toFixed(3)}R` : "        —          ");

console.log(`${base.name} — grafik x odul hedefi, isabet avi`);
console.log(`Basabas isabet = 1/(1+rr): rr 0.5 -> %66.7, 0.75 -> %57.1, 1 -> %50, 1.5 -> %40, 2 -> %33.3\n`);
console.log("grafik  rr     2026 Oca-Haz                      TEMMUZ                       holdout sembol");

for (const chart of CHARTS) {
  const timeframe = TIMEFRAMES.find((item) => item.id === chart);
  for (const reward of REWARDS) {
    // Trailing and break-even are switched off so the reward target is the only thing
    // moving; both would otherwise change the hit rate on their own.
    const config = {
      ...base, chartTimeframe: chart,
      risk: { ...base.risk, riskReward: reward, breakEvenAtR: 0, trailStartR: 0 }
    };
    const plan = buildBehaviorPlan(config);
    const per = new Map(symbols.map((symbol) => [symbol, { holdout: [], july: [] }]));

    for (const symbol of symbols) {
      const segments = splitContiguous(aggregate(bySymbol.get(symbol), timeframe.factor), intervalMs(timeframe))
        .filter((segment) => segment.length >= 300);
      for (const segment of segments) {
        const series = buildSeries(config, segment);
        const signals = buildSignals(config, plan, segment, {
          signalMode: "all", series, triggerWindow: config.triggerWindow
        });
        for (const trade of simulate(config, segment, signals, { riskReward: reward, costPerSide: 0.01 })) {
          const period = partitionOf(trade.entryTimestamp, PARTITIONS);
          if (period !== "holdout" && period !== "july") continue;
          per.get(symbol)[period].push(trade.netR);
        }
      }
    }

    const positive = symbols.filter((s) => { const x = stat(per.get(s).holdout); return x && x.trades >= 20 && x.expectancy > 0; });
    const usable = symbols.filter((s) => (stat(per.get(s).holdout)?.trades ?? 0) >= 20);
    // Rule 1: one line per symbol. The pooled holdout/July pair that used to sit here read
    // as a single verdict for a grid cell that four symbols can disagree about.
    for (const symbol of symbols) {
      const r = per.get(symbol);
      console.log(`${chart.padStart(4)}dk  ${String(reward).padEnd(5)} ${symbol.replace(/USDT?$/, "").padEnd(5)} ${cell(stat(r.holdout))}  ${cell(stat(r.july))}`);
    }
    console.log(`      -> ${positive.length}/${usable.length} sembol okunabilir ornekle artida`);
  }
  console.log();
}
