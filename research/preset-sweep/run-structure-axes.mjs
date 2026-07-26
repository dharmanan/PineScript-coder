// The axes no sweep has ever touched, one variable at a time.
//
// Every sweep so far moved the reward target, the exit management, the trigger window, the
// signal mode and the four filter thresholds. What none of them moved is the shape of the
// setup itself: how long the breakout channel is, which averages define the trend, whether
// MACD is required, how a stop is confirmed, which higher timeframe gates the side, and
// which chart the whole thing runs on. Those are the numbers that decide what the preset
// *is*, and they have been hand-picked since the first version.
//
// Single-variable only, per rule 4 of the review plan: the preset keeps every one of its own
// settings and exactly one changes, so a result cannot be a confounder in disguise. Reported
// per symbol and per period, never pooled across symbols.
//
// Not covered: limit-pullback entry. The Pine script offers it, the simulation engine only
// models market-on-next-open, and teaching it limit fills would change every number this
// project has produced. That axis needs its own decision, not a quiet addition here.
//
// Usage: --preset=breakout_momentum [--partitions=july|modern|classic]
import { buildBehaviorPlan, presets } from "./generated/preset-config.mjs";
import { TIMEFRAMES, aggregate, intervalMs, splitContiguous } from "./data.mjs";
import { loadAll, partitionOf, partitionsFor } from "./dataset.mjs";
import { buildSeries, buildSignals, simulate } from "./engine.mjs";

const arg = (name, fallback) => process.argv.find((item) => item.startsWith(`--${name}=`))?.split("=")[1] ?? fallback;
const target = arg("preset");
if (!target) throw new Error("Usage: --preset=<presetId> [--partitions=july|modern|classic]");
const base = presets.find((item) => item.presetId === target);
if (!base) throw new Error(`Unknown preset: ${target}`);

const LAYOUT = arg("partitions", "july");
const PARTITIONS = partitionsFor(LAYOUT);
const PERIODS = Object.keys(PARTITIONS);
const MIN_SEGMENT = 300;

const { bySymbol } = await loadAll();
const symbols = [...bySymbol.keys()].sort();

// Aggregating five-minute candles is the expensive step and the timeframe axis only has a
// few values, so each one is built once and shared by every variant that uses it.
const windowCache = new Map();
const windowsFor = (timeframeId) => {
  if (windowCache.has(timeframeId)) return windowCache.get(timeframeId);
  const timeframe = TIMEFRAMES.find((item) => item.id === timeframeId);
  if (!timeframe) throw new Error(`Unsupported timeframe: ${timeframeId}`);
  const built = new Map(symbols.map((symbol) => [
    symbol,
    splitContiguous(aggregate(bySymbol.get(symbol), timeframe.factor), intervalMs(timeframe))
      .filter((segment) => segment.length >= MIN_SEGMENT)
  ]));
  windowCache.set(timeframeId, built);
  return built;
};

const measure = (config) => {
  const plan = buildBehaviorPlan(config);
  const perSymbol = new Map(symbols.map((s) => [s, Object.fromEntries(PERIODS.map((p) => [p, []]))]));
  for (const symbol of symbols) {
    for (const segment of windowsFor(config.chartTimeframe).get(symbol)) {
      const series = buildSeries(config, segment);
      const signals = buildSignals(config, plan, segment, {
        signalMode: config.signalMode === "score" ? "score" : "all",
        scoreThreshold: config.scoreThreshold, series, triggerWindow: config.triggerWindow
      });
      for (const trade of simulate(config, segment, signals, {
        riskReward: config.risk.riskReward, costPerSide: 0.01,
        breakEvenAtR: config.risk.breakEvenAtR || null,
        trailStartR: config.risk.trailStartR || null,
        trailDistanceR: config.risk.trailDistanceR || null
      })) {
        const period = partitionOf(trade.entryTimestamp, PARTITIONS);
        if (period) perSymbol.get(symbol)[period].push(trade.netR);
      }
    }
  }
  const totals = Object.fromEntries(PERIODS.map((p) => [p, symbols.flatMap((s) => perSymbol.get(s)[p])]));
  return { totals, perSymbol };
};

const stat = (values) => {
  if (!values.length) return null;
  const wins = values.filter((v) => v > 0).length;
  return { trades: values.length, winRate: wins / values.length, expectancy: values.reduce((a, b) => a + b, 0) / values.length };
};
const cell = (s) => (s ? `${String(s.trades).padStart(5)}t %${(s.winRate * 100).toFixed(1).padStart(5)} ${(s.expectancy >= 0 ? "+" : "") + s.expectancy.toFixed(3)}R` : "        —         ");

// Deep enough for the nested groups a preset config actually uses; each variant is built
// from the shipping config so an unlisted field can never drift between variants.
const variant = (patch) => ({
  ...base,
  ...patch,
  trend: { ...base.trend, ...(patch.trend ?? {}) },
  momentum: { ...base.momentum, ...(patch.momentum ?? {}) },
  volume: { ...base.volume, ...(patch.volume ?? {}) },
  risk: { ...base.risk, ...(patch.risk ?? {}) },
  execution: { ...base.execution, ...(patch.execution ?? {}) },
  higherTimeframe: { ...base.higherTimeframe, ...(patch.higherTimeframe ?? {}) }
});

const AXES = [
  ["kirilma uzunlugu", [10, 30, 50].map((v) => [`breakout ${v}`, variant({ trend: { breakoutLength: v } })])],
  ["grafik zaman dilimi", ["30", "240"].filter((v) => v !== base.chartTimeframe)
    .map((v) => [`chart ${v}dk`, variant({ chartTimeframe: v })])],
  ["EMA cifti", [[9, 21], [50, 100]].map(([f, s]) => [`ema ${f}/${s}`, variant({ trend: { emaFast: f, emaSlow: s } })])],
  ["MACD", [["macd kapali", variant({ momentum: { macdEnabled: false } })]]],
  ["stop onayi", [["stop kapanis", variant({ risk: { stopTrigger: "close" } })]]],
  ["ust zaman dilimi", [
    ["htf uzunluk 50", variant({ higherTimeframe: { length: 50 } })],
    ["htf uzunluk 200", variant({ higherTimeframe: { length: 200 } })],
    ["htf gunluk", variant({ higherTimeframe: { timeframe: "D" } })]
  ]],
  ["ADX esigi (A'dan teyit)", [20, 25, 30].filter((v) => v !== base.momentum.adxThreshold)
    .map((v) => [`adx ${v}`, variant({ momentum: { adxThreshold: v } })])]
];

// Single-variable results do not add up on their own: two axes that each help alone can
// overlap, cancel or double-count. The pairings that looked worth having after the isolated
// pass are therefore measured as their own explicit configurations, not inferred.
const COMBOS = [
  ["kirilma10 + adx30", variant({ trend: { breakoutLength: 10 }, momentum: { adxThreshold: 30 } })],
  ["kirilma10 + adx30 + kapanis stop", variant({
    trend: { breakoutLength: 10 }, momentum: { adxThreshold: 30 }, risk: { stopTrigger: "close" }
  })],
  ["kirilma10 + htf200", variant({ trend: { breakoutLength: 10 }, higherTimeframe: { length: 200 } })],
  ["kirilma10 + adx30 + htf200", variant({
    trend: { breakoutLength: 10 }, momentum: { adxThreshold: 30 }, higherTimeframe: { length: 200 }
  })]
];

const positives = (result, period) =>
  symbols.filter((s) => { const x = stat(result.perSymbol.get(s)[period]); return x && x.trades >= 15 && x.expectancy > 0; }).length;
const usable = (result, period) =>
  symbols.filter((s) => (stat(result.perSymbol.get(s)[period])?.trades ?? 0) >= 15).length;

const report = (label, result, referenceLast) => {
  const last = PERIODS.at(-1);
  const row = PERIODS.map((p) => cell(stat(result.totals[p]))).join(" | ");
  const holdout = PERIODS.includes("holdout") ? "holdout" : last;
  const mark = referenceLast === undefined ? "  <<< REFERANS"
    : (stat(result.totals[holdout])?.expectancy ?? -99) > referenceLast ? "  ^" : "";
  console.log(`  ${label.padEnd(22)} ${row} | ${positives(result, holdout)}/${usable(result, holdout)}${mark}`);
  return result;
};

console.log(`${base.name} · ${base.chartTimeframe} dakika · kirilma ${base.trend.breakoutLength} · EMA ${base.trend.emaFast}/${base.trend.emaSlow} · ADX ${base.momentum.adxThreshold} · ATR×${base.risk.atrMultiple} · rr ${base.risk.riskReward}`);
console.log(`Layout: ${LAYOUT} — ${PERIODS.join(" | ")}`);
console.log("Tek degiskenli: her satirda preset'in kendi ayarlarindan SADECE biri degisiyor.");
console.log("Son kolon: holdout'ta artida olan sembol / anlamli sembol (>=15 islem). ^ = referanstan iyi.\n");

const referenceResult = measure(base);
report("referans (urun)", referenceResult);
const holdoutKey = PERIODS.includes("holdout") ? "holdout" : PERIODS.at(-1);
const referenceHoldout = stat(referenceResult.totals[holdoutKey])?.expectancy ?? 0;

const better = [];
for (const [axis, variants] of AXES) {
  if (!variants.length) continue;
  console.log(`\n${axis}:`);
  for (const [label, config] of variants) {
    const result = report(label, measure(config), referenceHoldout);
    const beats = PERIODS.filter((p) => {
      const a = stat(result.totals[p])?.expectancy;
      const b = stat(referenceResult.totals[p])?.expectancy;
      return a !== undefined && b !== undefined && a > b;
    });
    if (beats.length >= PERIODS.length - 1) better.push([label, beats]);
  }
}

console.log("\nkombinasyonlar (tek degiskenli degil — acikca olculen bilesikler):");
const comboResults = [];
for (const [label, config] of COMBOS) {
  const result = report(label, measure(config), referenceHoldout);
  comboResults.push([label, result]);
  const beats = PERIODS.filter((p) => {
    const a = stat(result.totals[p])?.expectancy;
    const b = stat(referenceResult.totals[p])?.expectancy;
    return a !== undefined && b !== undefined && a > b;
  });
  if (beats.length >= PERIODS.length - 1) better.push([label, beats]);
}

console.log(`\n=== ${PERIODS.length - 1} donem veya fazlasinda referansi geceler ===`);
if (!better.length) console.log("  yok");
for (const [label, beats] of better) console.log(`  ${label.padEnd(22)} ${beats.join(", ")}`);

console.log("\nSembol sembol detay, referans ve one cikanlar (holdout):");
const detail = (label, result) => {
  console.log(`  ${label.padEnd(22)} ` + symbols.map((s) => {
    const x = stat(result.perSymbol.get(s)[holdoutKey]);
    return `${s.slice(0, 3)} ${x ? (x.expectancy >= 0 ? "+" : "") + x.expectancy.toFixed(3) + `(${x.trades}t)` : "—"}`;
  }).join("  "));
};
detail("referans", referenceResult);
for (const [axis, variants] of AXES) {
  for (const [label, config] of variants) {
    if (better.some(([l]) => l === label)) detail(label, measure(config));
  }
}
for (const [label, result] of comboResults) detail(label, result);
