// Long-Term Trend Guard: one-axis entry-trigger A/B.
//
// Control: the shipping EMA 50/100 crossover.
// Candidate: price reclaiming EMA 50 after a pullback.
//
// Direction, chart timeframe, filters, risk and both measured exit profiles remain unchanged.
// Results are always reported per symbol and per partition; symbols are never pooled.
import { buildBehaviorPlan, presets } from "./generated/preset-config.mjs";
import { TIMEFRAMES, aggregate, intervalMs, splitContiguous } from "./data.mjs";
import { loadAll, partitionOf, partitionsFor } from "./dataset.mjs";
import { buildSeries, buildSignals, simulate, summarize } from "./engine.mjs";

const productPreset = presets.find((item) => item.presetId === "long_term_trend_guard");
if (!productPreset) throw new Error("Long-Term Trend Guard preset is missing");
if (!productPreset.winRateProfile) throw new Error("Long-Term Trend Guard win-rate profile is missing");

const base = { ...productPreset, direction: "long_only" };
const candidate = { ...base, entryTrigger: "pullback_reclaim" };
const partitions = partitionsFor("july");
const periods = Object.keys(partitions);
const timeframe = TIMEFRAMES.find((item) => item.id === base.chartTimeframe);
if (!timeframe) throw new Error(`Unsupported timeframe: ${base.chartTimeframe}`);

const profiles = [
  {
    id: "MONEY",
    signalMode: base.signalMode === "score" ? "score" : "all",
    scoreThreshold: base.scoreThreshold,
    triggerWindow: base.triggerWindow,
    riskReward: base.risk.riskReward,
    breakEvenAtR: base.risk.breakEvenAtR || null,
    trailStartR: base.risk.trailStartR || null,
    trailDistanceR: base.risk.trailDistanceR || null
  },
  {
    id: "WIN RATE",
    signalMode: base.winRateProfile.signalMode === "score" ? "score" : "all",
    scoreThreshold: base.winRateProfile.scoreThreshold,
    triggerWindow: base.winRateProfile.triggerWindow,
    riskReward: base.winRateProfile.riskReward,
    breakEvenAtR: base.winRateProfile.breakEvenAtR || null,
    trailStartR: base.winRateProfile.trailStartR || null,
    trailDistanceR: base.winRateProfile.trailDistanceR || null
  }
];

const { bySymbol, provenance } = await loadAll();
const symbols = [...bySymbol.keys()].sort();
const windows = new Map(symbols.map((symbol) => [
  symbol,
  splitContiguous(aggregate(bySymbol.get(symbol), timeframe.factor), intervalMs(timeframe))
    .filter((segment) => segment.length >= 300)
]));

const measure = (config, profile) => {
  const plan = buildBehaviorPlan(config);
  const perSymbol = new Map(symbols.map((symbol) => [
    symbol,
    Object.fromEntries(periods.map((period) => [period, []]))
  ]));

  for (const symbol of symbols) {
    for (const segment of windows.get(symbol)) {
      const series = buildSeries(config, segment);
      const signals = buildSignals(config, plan, segment, {
        signalMode: profile.signalMode,
        scoreThreshold: profile.scoreThreshold,
        triggerWindow: profile.triggerWindow,
        series
      });
      const trades = simulate(config, segment, signals, {
        riskReward: profile.riskReward,
        costPerSide: 0.01,
        breakEvenAtR: profile.breakEvenAtR,
        trailStartR: profile.trailStartR,
        trailDistanceR: profile.trailDistanceR
      });
      for (const trade of trades) {
        const period = partitionOf(trade.entryTimestamp, partitions);
        if (period) perSymbol.get(symbol)[period].push(trade);
      }
    }
  }
  return perSymbol;
};

const cell = (trades) => {
  if (!trades.length) return "—";
  const result = summarize(trades);
  const pf = result.profit_factor === null ? "N/A" : result.profit_factor.toFixed(2);
  return `${result.wins}/${result.losses} · ${result.trades}t · %${(result.win_rate * 100).toFixed(1)} · ` +
    `${result.net_r >= 0 ? "+" : ""}${result.net_r.toFixed(2)}R · PF ${pf} · DD ${result.max_drawdown_r.toFixed(2)}R`;
};

console.log("Long-Term Trend Guard · isolated entry-trigger A/B");
console.log(`Data: ${provenance.map((item) => item.source).join(", ")}`);
console.log(`Fixed: ${base.chartTimeframe}m · ${base.direction} · EMA ${base.trend.emaFast}/${base.trend.emaSlow} · ` +
  `HTF ${base.higherTimeframe.timeframe} ${base.higherTimeframe.method.toUpperCase()} ${base.higherTimeframe.length} · ATR×${base.risk.atrMultiple}`);
console.log("Only changed axis: ema_cross -> pullback_reclaim\n");

for (const profile of profiles) {
  const control = measure(base, profile);
  const reclaim = measure(candidate, profile);
  console.log(`=== ${profile.id} · rr ${profile.riskReward} · score ${profile.scoreThreshold} · window ${profile.triggerWindow} ===`);
  for (const symbol of symbols) {
    console.log(`\n${symbol}`);
    for (const period of periods) {
      console.log(`  ${period.padEnd(11)} control ${cell(control.get(symbol)[period])}`);
      console.log(`  ${"".padEnd(11)} reclaim ${cell(reclaim.get(symbol)[period])}`);
    }
  }
  console.log("");
}
