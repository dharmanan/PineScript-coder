// RSI Divergence Reversal structure study.
//
// This runner exists separately from run-structure-axes because divergence has defining
// axes that no generic preset owns: RSI pivot geometry, the allowed distance between pivots
// and the RSI period. It measures the shipped win-rate exit while moving exactly one
// structural field at a time. Symbols are never pooled.
//
// Selection policy:
//   1. Rank on 2023-2024 development only.
//   2. Print validation only for the development-selected finalists.
//   3. Keep 2026 Jan-Jun and July closed until a structure is frozen.
//
// Usage:
//   safe-node research/preset-sweep/run-rsi-divergence-structure.mjs
import { buildBehaviorPlan, presets } from "./generated/preset-config.mjs";
import { TIMEFRAMES, aggregate, intervalMs, splitContiguous } from "./data.mjs";
import { loadAll, partitionOf } from "./dataset.mjs";
import { buildSeries, buildSignals, simulate } from "./engine.mjs";
import { cell, stat } from "./report.mjs";

const target = presets.find((item) => item.presetId === "rsi_divergence_reversal");
if (!target?.winRateProfile) throw new Error("RSI Divergence Reversal win-rate profile is missing");

const PARTITIONS = Object.freeze({
  legacy: {
    start: Date.parse("2019-01-01T00:00:00Z"),
    endExclusive: Date.parse("2023-01-01T00:00:00Z")
  },
  development: {
    start: Date.parse("2023-01-01T00:00:00Z"),
    endExclusive: Date.parse("2025-01-01T00:00:00Z")
  },
  validation: {
    start: Date.parse("2025-01-01T00:00:00Z"),
    endExclusive: Date.parse("2026-01-01T00:00:00Z")
  },
  holdout: {
    start: Date.parse("2026-01-01T00:00:00Z"),
    endExclusive: Date.parse("2026-07-01T00:00:00Z")
  },
  july: {
    start: Date.parse("2026-07-01T00:00:00Z"),
    endExclusive: Date.parse("2026-08-01T00:00:00Z")
  }
});
const PERIODS = Object.keys(PARTITIONS);
const MIN_SEGMENT = 300;
const profile = target.winRateProfile;

const asWinRate = (config) => ({
  ...config,
  signalMode: profile.signalMode,
  scoreThreshold: profile.scoreThreshold,
  triggerWindow: profile.triggerWindow,
  risk: {
    ...config.risk,
    riskReward: profile.riskReward,
    breakEvenAtR: profile.breakEvenAtR,
    trailStartR: profile.trailStartR,
    trailDistanceR: profile.trailDistanceR
  }
});

const patch = (changes = {}) => asWinRate({
  ...target,
  ...changes,
  momentum: { ...target.momentum, ...(changes.momentum ?? {}) },
  risk: { ...target.risk, ...(changes.risk ?? {}) },
  execution: { ...target.execution, ...(changes.execution ?? {}) }
});

const CANDIDATES = [
  ["referans", patch()],
  ...["5", "15", "60", "240"].map((timeframe) => [
    `zaman ${timeframe}dk`,
    patch({ chartTimeframe: timeframe })
  ]),
  ...[7, 9, 21].map((length) => [
    `rsi uzunluk ${length}`,
    patch({ momentum: { rsiLength: length } })
  ]),
  ...[
    [2, 2],
    [3, 3],
    [8, 8],
    [10, 10],
    [3, 5],
    [5, 3]
  ].map(([left, right]) => [
    `pivot ${left}/${right}`,
    patch({ momentum: { divergencePivotLeft: left, divergencePivotRight: right } })
  ]),
  ...[
    [2, 30],
    [5, 30],
    [10, 60],
    [5, 90],
    [5, 120]
  ].map(([minimum, maximum]) => [
    `range ${minimum}-${maximum}`,
    patch({
      momentum: {
        divergenceRangeMinimum: minimum,
        divergenceRangeMaximum: maximum
      }
    })
  ]),
  ...[
    [30, 70],
    [35, 65],
    [45, 55],
    [50, 50],
    [0, 100]
  ].map(([long, short]) => [
    long === 0 ? "RSI teyidi kapali" : `RSI teyidi ${long}/${short}`,
    patch({ momentum: { rsiLong: long, rsiShort: short } })
  ]),
  ...[0, 2, 10].map((bars) => [
    `cooldown ${bars}`,
    patch({ execution: { cooldownBars: bars } })
  ]),
  ...[1.5, 2.5, 3].map((multiple) => [
    `ATR ${multiple}`,
    patch({ risk: { atrMultiple: multiple } })
  ]),
  ["stop kapanis", patch({ risk: { stopTrigger: "close" } })]
];

const { bySymbol } = await loadAll();
const symbols = [...bySymbol.keys()].sort();
const windows = new Map();

const windowsFor = (timeframeId) => {
  if (windows.has(timeframeId)) return windows.get(timeframeId);
  const timeframe = TIMEFRAMES.find((item) => item.id === timeframeId);
  if (!timeframe) throw new Error(`Unsupported timeframe: ${timeframeId}`);
  const built = new Map(symbols.map((symbol) => [
    symbol,
    splitContiguous(aggregate(bySymbol.get(symbol), timeframe.factor), intervalMs(timeframe))
      .filter((segment) => segment.length >= MIN_SEGMENT)
  ]));
  windows.set(timeframeId, built);
  return built;
};

const measure = (config) => {
  const plan = buildBehaviorPlan(config);
  const perSymbol = new Map(symbols.map((symbol) => [
    symbol,
    Object.fromEntries(PERIODS.map((period) => [period, []]))
  ]));

  for (const symbol of symbols) {
    for (const segment of windowsFor(config.chartTimeframe).get(symbol)) {
      const series = buildSeries(config, segment);
      const signals = buildSignals(config, plan, segment, {
        signalMode: config.signalMode === "score" ? "score" : "all",
        scoreThreshold: config.scoreThreshold,
        triggerWindow: config.triggerWindow,
        series
      });
      const trades = simulate(config, segment, signals, {
        riskReward: config.risk.riskReward,
        costPerSide: 0.01,
        breakEvenAtR: config.risk.breakEvenAtR || null,
        trailStartR: config.risk.trailStartR || null,
        trailDistanceR: config.risk.trailDistanceR || null
      });
      for (const trade of trades) {
        const period = partitionOf(trade.entryTimestamp, PARTITIONS);
        if (period) perSymbol.get(symbol)[period].push(trade.netR);
      }
    }
  }
  return { perSymbol };
};

const stats = (result, period) =>
  Object.fromEntries(symbols.map((symbol) => [symbol, stat(result.perSymbol.get(symbol)[period])]));

const developmentRank = (result, reference) => {
  const current = stats(result, "development");
  const baseline = stats(reference, "development");
  const values = symbols.map((symbol) => current[symbol]);
  const improvedBoth = symbols.filter((symbol) =>
    current[symbol] &&
    baseline[symbol] &&
    current[symbol].winRate > baseline[symbol].winRate &&
    current[symbol].trades >= baseline[symbol].trades
  ).length;
  const positive = values.filter((item) => item?.expectancy > 0).length;
  const minWinRate = Math.min(...values.map((item) => item?.winRate ?? 0));
  const minTrades = Math.min(...values.map((item) => item?.trades ?? 0));
  return { improvedBoth, positive, minWinRate, minTrades };
};

const compareRank = (left, right) =>
  right.rank.improvedBoth - left.rank.improvedBoth ||
  right.rank.positive - left.rank.positive ||
  right.rank.minWinRate - left.rank.minWinRate ||
  right.rank.minTrades - left.rank.minTrades;

const printPeriod = (label, result, period) => {
  console.log(`  ${label} — ${period}`);
  for (const symbol of symbols) {
    console.log(`    ${symbol.replace("USDT", "").padEnd(4)} ${cell(stat(result.perSymbol.get(symbol)[period]))}`);
  }
};

console.log("RSI DIVERGENCE REVERSAL — YAPI EKSENLERI");
console.log("Secim: yalniz 2023-2024 development. Semboller havuzlanmaz.");
console.log(`Profil sabit: rr ${profile.riskReward}, trail ${profile.trailStartR}/${profile.trailDistanceR}\n`);

const measured = [];
for (const [label, config] of CANDIDATES) {
  console.log(`Olculuyor: ${label}`);
  measured.push({ label, config, result: measure(config) });
}

const reference = measured[0].result;
for (const item of measured) item.rank = developmentRank(item.result, reference);
const finalists = measured.slice(1).sort(compareRank).slice(0, 10);

console.log("\nREFERANS");
printPeriod("referans", reference, "development");
printPeriod("referans", reference, "validation");

console.log("\nDEVELOPMENT SECIMI — ilk 10");
for (const item of finalists) {
  const rank = item.rank;
  console.log(
    `\n${item.label} | ikisi de iyilesen ${rank.improvedBoth}/4 | ` +
    `artida ${rank.positive}/4 | min isabet %${(100 * rank.minWinRate).toFixed(1)} | min islem ${rank.minTrades}`
  );
  printPeriod(item.label, item.result, "development");
}

console.log("\nDOGRULAMA — yalniz development finalistleri");
for (const item of finalists) {
  printPeriod(item.label, item.result, "validation");
}

console.log("\n2026 KAPALI");
console.log("Bir yapi development ve validation okumasi ile dondurulmeden holdout ve July yazdirilmaz.");
