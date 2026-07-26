// Buy the break, or buy the retest?
//
// The intrabar measurement produced one clean number: across 2659 breakout signals, entering
// the moment the level broke gave a better price only 45% of the time. Breakouts pull back.
// That is an argument for the opposite of entering earlier — for waiting, with a resting order
// below the break, which is what the limit-pullback entry does.
//
// Market entry is the next chart candle's open, always filled. A limit entry rests a fraction
// of the risk back from the signal candle's close and only fills if price returns to it inside
// the expiry. Two consequences to keep in view while reading this:
//
//   1. Fewer trades, because some signals never come back. Reported as the fill rate.
//   2. The trades that do fill are not a random sample of the trades that would have been
//      taken. Price returning to the level is itself information. A limit entry that looks
//      better may only be selecting differently, not entering better, and the trade count is
//      the first place that shows.
//
// Usage: --preset=breakout_momentum [--partitions=july] [--profile=money|winrate]
import { buildBehaviorPlan, presets } from "./generated/preset-config.mjs";
import { TIMEFRAMES, aggregate, intervalMs, splitContiguous } from "./data.mjs";
import { loadAll, partitionOf, partitionsFor } from "./dataset.mjs";
import { buildSeries, buildSignals, simulate } from "./engine.mjs";

const arg = (name, fallback) => process.argv.find((item) => item.startsWith(`--${name}=`))?.split("=")[1] ?? fallback;
const target = arg("preset");
if (!target) throw new Error("Usage: --preset=<presetId> [--partitions=july] [--profile=money|winrate]");
const shipped = presets.find((item) => item.presetId === target);
if (!shipped) throw new Error(`Unknown preset: ${target}`);

const PARTITIONS = partitionsFor(arg("partitions", "july"));
const PERIODS = Object.keys(PARTITIONS);
const MIN_SEGMENT = 300;
const profileName = arg("profile", "money");

const profile = shipped.winRateProfile;
const config = profileName === "winrate" && profile
  ? {
      ...shipped,
      signalMode: profile.signalMode, scoreThreshold: profile.scoreThreshold, triggerWindow: profile.triggerWindow,
      risk: {
        ...shipped.risk,
        riskReward: profile.riskReward, breakEvenAtR: profile.breakEvenAtR,
        trailStartR: profile.trailStartR, trailDistanceR: profile.trailDistanceR
      }
    }
  : shipped;

const { bySymbol } = await loadAll();
const symbols = [...bySymbol.keys()].sort();
const timeframe = TIMEFRAMES.find((item) => item.id === config.chartTimeframe);
if (!timeframe) throw new Error(`Unsupported chart timeframe: ${config.chartTimeframe}`);

const plan = buildBehaviorPlan(config);
const exits = {
  riskReward: config.risk.riskReward, costPerSide: 0.01,
  breakEvenAtR: config.risk.breakEvenAtR || null,
  trailStartR: config.risk.trailStartR || null,
  trailDistanceR: config.risk.trailDistanceR || null
};

// Signals and indicators are identical across every entry type, so they are built once and
// only the fill rule changes. That is what makes this a single-variable comparison.
const prepared = new Map();
let signalCount = 0;
for (const symbol of symbols) {
  const candles = aggregate(bySymbol.get(symbol), timeframe.factor);
  const parts = [];
  for (const segment of splitContiguous(candles, intervalMs(timeframe)).filter((part) => part.length >= MIN_SEGMENT)) {
    const series = buildSeries(config, segment);
    const signals = buildSignals(config, plan, segment, {
      signalMode: config.signalMode === "score" ? "score" : "all",
      scoreThreshold: config.scoreThreshold, series, triggerWindow: config.triggerWindow
    });
    for (let index = 0; index < segment.length; index += 1) {
      if (signals.long[index] || signals.short[index]) signalCount += 1;
    }
    parts.push({ segment, signals });
  }
  prepared.set(symbol, parts);
}

const VARIANTS = [
  ["market", { entryType: "market" }],
  ["limit 0.25xR, 5 mum", { entryType: "limit", limitPullback: 0.25, limitExpiryBars: 5 }],
  ["limit 0.5xR, 5 mum", { entryType: "limit", limitPullback: 0.5, limitExpiryBars: 5 }],
  ["limit 0.75xR, 5 mum", { entryType: "limit", limitPullback: 0.75, limitExpiryBars: 5 }],
  ["limit 0.5xR, 3 mum", { entryType: "limit", limitPullback: 0.5, limitExpiryBars: 3 }],
  ["limit 0.5xR, 10 mum", { entryType: "limit", limitPullback: 0.5, limitExpiryBars: 10 }]
];

const measure = (entryOptions) => {
  const perSymbol = new Map(symbols.map((symbol) => [symbol, Object.fromEntries(PERIODS.map((p) => [p, []]))]));
  let filled = 0;
  for (const symbol of symbols) {
    for (const { segment, signals } of prepared.get(symbol)) {
      for (const trade of simulate(config, segment, signals, { ...exits, ...entryOptions })) {
        filled += 1;
        const period = partitionOf(trade.entryTimestamp, PARTITIONS);
        if (period) perSymbol.get(symbol)[period].push(trade.netR);
      }
    }
  }
  return {
    perSymbol,
    filled,
    totals: Object.fromEntries(PERIODS.map((p) => [p, symbols.flatMap((s) => perSymbol.get(s)[p])]))
  };
};

const stat = (values) => {
  if (!values.length) return null;
  const wins = values.filter((value) => value > 0).length;
  return { trades: values.length, winRate: wins / values.length, expectancy: values.reduce((a, b) => a + b, 0) / values.length };
};
const cell = (s) => (s ? `${String(s.trades).padStart(5)}t %${(s.winRate * 100).toFixed(1).padStart(5)} ${(s.expectancy >= 0 ? "+" : "") + s.expectancy.toFixed(3)}R` : "        —         ");
const holdoutKey = PERIODS.includes("holdout") ? "holdout" : PERIODS.at(-1);
const positives = (result) =>
  symbols.filter((s) => { const x = stat(result.perSymbol.get(s)[holdoutKey]); return x && x.trades >= 15 && x.expectancy > 0; }).length;

console.log(`${shipped.name} — GIRIS TIPI: market vs limit`);
console.log(`${config.chartTimeframe}dk | profil: ${profileName} | rr ${config.risk.riskReward} | tetikleyici: ${plan.entry.trigger.id}`);
console.log(`Toplam sinyal: ${signalCount} (giris tipinden bagimsiz)\n`);
console.log(`  ${"".padEnd(21)} ${PERIODS.map((p) => p.padEnd(18)).join(" | ")} | dolum | artida`);

const results = [];
for (const [label, entryOptions] of VARIANTS) {
  const result = measure(entryOptions);
  results.push([label, result]);
  const rate = `%${((100 * result.filled) / signalCount).toFixed(0)}`.padStart(5);
  console.log(`  ${label.padEnd(21)} ${PERIODS.map((p) => cell(stat(result.totals[p]))).join(" | ")} | ${rate} | ${positives(result)}/4`);
}

const base = results[0][1];
const beats = (result) => PERIODS.filter((p) => {
  const a = stat(result.totals[p])?.expectancy;
  const b = stat(base.totals[p])?.expectancy;
  return a !== undefined && b !== undefined && a > b;
});
console.log("\nmarket'i kac donemde geciyor:");
for (const [label, result] of results.slice(1)) {
  const won = beats(result);
  console.log(`  ${label.padEnd(21)} ${won.length}/${PERIODS.length}${won.length ? "  (" + won.join(", ") + ")" : ""}`);
}

console.log(`\nsembol sembol, ${holdoutKey}:`);
for (const [label, result] of results) {
  console.log(`  ${label.padEnd(21)} ` + symbols.map((s) => {
    const x = stat(result.perSymbol.get(s)[holdoutKey]);
    return `${s.slice(0, 3)} ${x ? (x.expectancy >= 0 ? "+" : "") + x.expectancy.toFixed(3) + `(${x.trades}t)` : "—"}`;
  }).join("  "));
}
