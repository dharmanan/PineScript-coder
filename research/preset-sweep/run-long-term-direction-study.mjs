// Long-Term Trend Guard: one-axis direction A/B.
//
// Control: the shipping long-only direction.
// Candidate: the same setup allowed to take both long and short signals.
//
// Entry trigger, chart timeframe, filters, risk and both measured exit profiles remain
// unchanged. Results are always reported per symbol and per partition; symbols are never pooled.
import { buildBehaviorPlan, presets } from "./generated/preset-config.mjs";
import { TIMEFRAMES, aggregate, intervalMs, splitContiguous } from "./data.mjs";
import { loadAll, partitionOf, partitionsFor } from "./dataset.mjs";
import { buildSeries, buildSignals, simulate, summarize } from "./engine.mjs";

const productPreset = presets.find((item) => item.presetId === "long_term_trend_guard");
if (!productPreset) throw new Error("Long-Term Trend Guard preset is missing");
if (!productPreset.winRateProfile) throw new Error("Long-Term Trend Guard win-rate profile is missing");

const base = { ...productPreset, direction: "long_only" };
const candidate = { ...base, direction: "long_short" };
const partitions = partitionsFor("july");
const periods = Object.keys(partitions);

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
const windowCache = new Map();
const windowsFor = (timeframeId) => {
  if (windowCache.has(timeframeId)) return windowCache.get(timeframeId);
  const timeframe = TIMEFRAMES.find((item) => item.id === timeframeId);
  if (!timeframe) throw new Error(`Unsupported timeframe: ${timeframeId}`);
  const windows = new Map(symbols.map((symbol) => [
    symbol,
    splitContiguous(aggregate(bySymbol.get(symbol), timeframe.factor), intervalMs(timeframe))
      .filter((segment) => segment.length >= 300)
  ]));
  windowCache.set(timeframeId, windows);
  return windows;
};

const measure = (config, profile) => {
  const plan = buildBehaviorPlan(config);
  const perSymbol = new Map(symbols.map((symbol) => [
    symbol,
    Object.fromEntries(periods.map((period) => [period, []]))
  ]));

  for (const symbol of symbols) {
    for (const segment of windowsFor(config.chartTimeframe).get(symbol)) {
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
  const longTrades = trades.filter((trade) => trade.direction === 1);
  const shortTrades = trades.filter((trade) => trade.direction === -1);
  return `${result.wins}/${result.losses} · ${result.trades}t (L${longTrades.length}/S${shortTrades.length}) · ` +
    `%${(result.win_rate * 100).toFixed(1)} · ${result.net_r >= 0 ? "+" : ""}${result.net_r.toFixed(2)}R · ` +
    `PF ${pf} · DD ${result.max_drawdown_r.toFixed(2)}R`;
};

console.log("Long-Term Trend Guard · isolated direction A/B");
console.log(`Data: ${provenance.map((item) => item.source).join(", ")}`);
console.log(`Fixed: ${base.chartTimeframe}m · ${base.entryTrigger} · EMA ${base.trend.emaFast}/${base.trend.emaSlow} · ` +
  `HTF ${base.higherTimeframe.timeframe} ${base.higherTimeframe.method.toUpperCase()} ${base.higherTimeframe.length} · ATR×${base.risk.atrMultiple}`);
console.log("Only changed axis: long_only -> long_short\n");

for (const profile of profiles) {
  const control = measure(base, profile);
  const longShort = measure(candidate, profile);
  console.log(`=== ${profile.id} · rr ${profile.riskReward} · score ${profile.scoreThreshold} · window ${profile.triggerWindow} ===`);
  for (const symbol of symbols) {
    console.log(`\n${symbol}`);
    for (const period of periods) {
      console.log(`  ${period.padEnd(11)} control    ${cell(control.get(symbol)[period])}`);
      console.log(`  ${"".padEnd(11)} long+short ${cell(longShort.get(symbol)[period])}`);
    }
  }
  console.log("");
}

const traceSymbol = process.argv.find((item) => item.startsWith("--trace="))?.split("=")[1];
if (traceSymbol) {
  if (!symbols.includes(traceSymbol)) throw new Error(`Unknown trace symbol: ${traceSymbol}`);
  const profile = profiles.find((item) => item.id === "WIN RATE");
  const trades = measure(candidate, profile).get(traceSymbol).holdout
    .toSorted((left, right) => left.entryTimestamp - right.entryTimestamp);
  console.log(`=== TRACE ${traceSymbol} · WIN RATE · 2026-01-01 to 2026-07-01 ===`);
  for (const [index, trade] of trades.entries()) {
    const entry = new Date(trade.entryTimestamp).toISOString().replace(".000Z", "Z");
    const exit = new Date(trade.exitTimestamp).toISOString().replace(".000Z", "Z");
    console.log(
      `${String(index + 1).padStart(2)} · ${trade.direction === 1 ? "LONG " : "SHORT"} · ` +
      `${entry} -> ${exit} · ${trade.reason.padEnd(9)} · ${trade.netR >= 0 ? "+" : ""}${trade.netR.toFixed(3)}R`
    );
  }
}

if (process.argv.includes("--score-study")) {
  const profile = profiles.find((item) => item.id === "WIN RATE");
  console.log("=== SCORE AXIS · LONG/SHORT · WIN RATE ===");
  for (const threshold of [85, 90, 95]) {
    const result = measure(candidate, { ...profile, scoreThreshold: threshold });
    console.log(`\nminimum score ${threshold}`);
    for (const symbol of symbols) {
      for (const period of periods) {
        console.log(`  ${symbol.padEnd(9)} ${period.padEnd(11)} ${cell(result.get(symbol)[period])}`);
      }
    }
  }
}

if (process.argv.includes("--timeframe-study")) {
  const profile = profiles.find((item) => item.id === "WIN RATE");
  console.log("=== CHART TIMEFRAME AXIS · LONG/SHORT · SCORE 85 · WIN RATE ===");
  for (const chartTimeframe of ["30", "60"]) {
    const config = { ...candidate, chartTimeframe };
    const result = measure(config, profile);
    console.log(`\nchart ${chartTimeframe}m`);
    for (const symbol of symbols) {
      for (const period of periods) {
        console.log(`  ${symbol.padEnd(9)} ${period.padEnd(11)} ${cell(result.get(symbol)[period])}`);
      }
    }
  }
}
