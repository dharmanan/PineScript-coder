// The win-rate profile, re-measured against whatever structure the preset currently ships.
//
// Every win-rate profile in this project was chosen while the preset's structure was held
// still. When the structure changes — a different breakout channel, a different ADX gate, a
// different stop confirmation — the reward target and the exit management that suited the old
// shape are no longer the ones that were measured. Reading the old number against the new
// structure is the same mistake as never measuring it.
//
// This varies the reward target and the exit management together rather than the target alone.
// Those two are not separable: a trailing stop that arms at 1.5R makes every target beyond
// about 2R unreachable, so a reward grid measured at one trailing setting says nothing about
// another. Trigger window is swept afterwards, on the pairs worth keeping.
//
// Usage: --preset=breakout_momentum [--partitions=july|modern|classic] [--window=3]
import { buildBehaviorPlan, presets } from "./generated/preset-config.mjs";
import { TIMEFRAMES, aggregate, intervalMs, splitContiguous } from "./data.mjs";
import { loadAll, partitionOf, partitionsFor } from "./dataset.mjs";
import { buildSeries, buildSignals, simulate } from "./engine.mjs";

const arg = (name, fallback) => process.argv.find((item) => item.startsWith(`--${name}=`))?.split("=")[1] ?? fallback;
const target = arg("preset");
if (!target) throw new Error("Usage: --preset=<presetId> [--partitions=july] [--window=N]");
const shipped = presets.find((item) => item.presetId === target);
if (!shipped) throw new Error(`Unknown preset: ${target}`);
const profile = shipped.winRateProfile;
if (!profile) throw new Error(`Preset has no win-rate profile: ${target}`);

// A win-rate profile only means something against a specific structure, and a structure that
// is still a proposal has no business being written into lib/presets.ts to be measured. These
// named patches let a candidate structure be measured before it is a product decision.
const STRUCTURES = {
  vwap_session_trader: {
    "session-off": { execution: { sessionEnabled: false } },
    "session-off+vol1.5": { execution: { sessionEnabled: false }, volume: { multiplier: 1.5 } },
    "session-off+vol1.25": { execution: { sessionEnabled: false }, volume: { multiplier: 1.25 } }
  }
};

const structureName = arg("structure");
const patch = structureName ? STRUCTURES[target]?.[structureName] : null;
if (structureName && !patch) {
  throw new Error(
    `Unknown structure "${structureName}" for ${target}. Available: ${Object.keys(STRUCTURES[target] ?? {}).join(", ") || "none"}`
  );
}
const base = patch
  ? {
      ...shipped,
      trend: { ...shipped.trend, ...(patch.trend ?? {}) },
      momentum: { ...shipped.momentum, ...(patch.momentum ?? {}) },
      volume: { ...shipped.volume, ...(patch.volume ?? {}) },
      risk: { ...shipped.risk, ...(patch.risk ?? {}) },
      execution: { ...shipped.execution, ...(patch.execution ?? {}) },
      higherTimeframe: { ...shipped.higherTimeframe, ...(patch.higherTimeframe ?? {}) }
    }
  : shipped;

const PARTITIONS = partitionsFor(arg("partitions", "july"));
const PERIODS = Object.keys(PARTITIONS);
const MIN_SEGMENT = 300;

const { bySymbol } = await loadAll();
const symbols = [...bySymbol.keys()].sort();
const timeframe = TIMEFRAMES.find((item) => item.id === base.chartTimeframe);
if (!timeframe) throw new Error(`Unsupported chart timeframe: ${base.chartTimeframe}`);

// One aggregation for the whole run: the win-rate profile never moves the chart timeframe.
const windows = new Map(symbols.map((symbol) => [
  symbol,
  splitContiguous(aggregate(bySymbol.get(symbol), timeframe.factor), intervalMs(timeframe))
    .filter((segment) => segment.length >= MIN_SEGMENT)
]));

const measure = (config) => {
  const plan = buildBehaviorPlan(config);
  const perSymbol = new Map(symbols.map((s) => [s, Object.fromEntries(PERIODS.map((p) => [p, []]))]));
  for (const symbol of symbols) {
    for (const segment of windows.get(symbol)) {
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
  return {
    perSymbol,
    totals: Object.fromEntries(PERIODS.map((p) => [p, symbols.flatMap((s) => perSymbol.get(s)[p])]))
  };
};

const stat = (values) => {
  if (!values.length) return null;
  const wins = values.filter((v) => v > 0).length;
  return { trades: values.length, winRate: wins / values.length, expectancy: values.reduce((a, b) => a + b, 0) / values.length };
};
const cell = (s) => (s ? `${String(s.trades).padStart(5)}t %${(s.winRate * 100).toFixed(1).padStart(5)} ${(s.expectancy >= 0 ? "+" : "") + s.expectancy.toFixed(3)}R` : "        —         ");

// Only the fields a profile is allowed to move, applied the way the compiler applies them.
// Every exit field falls back to the profile's own value, so calling this with no overrides
// reproduces the shipping profile exactly. Defaulting them to zero instead — which this
// script did at first — silently measures the shipping profile without its trailing stop and
// then compares every candidate against that phantom baseline.
const asProfile = (overrides = {}) => ({
  ...base,
  signalMode: overrides.signalMode ?? profile.signalMode,
  scoreThreshold: overrides.scoreThreshold ?? profile.scoreThreshold,
  triggerWindow: overrides.triggerWindow ?? Number(arg("window", profile.triggerWindow)),
  risk: {
    ...base.risk,
    riskReward: overrides.riskReward ?? profile.riskReward,
    breakEvenAtR: overrides.breakEvenAtR ?? profile.breakEvenAtR,
    trailStartR: overrides.trailStartR ?? profile.trailStartR,
    trailDistanceR: overrides.trailDistanceR ?? profile.trailDistanceR
  }
});

// Each exit states all three fields, so a row can never inherit part of another exit's shape.
const EXITS = [
  ["trailing yok", { breakEvenAtR: 0, trailStartR: 0, trailDistanceR: 1 }],
  ["trail 1.5/1", { breakEvenAtR: 0, trailStartR: 1.5, trailDistanceR: 1 }],
  ["trail 2/1.5", { breakEvenAtR: 0, trailStartR: 2, trailDistanceR: 1.5 }],
  ["trail 1/0.5", { breakEvenAtR: 0, trailStartR: 1, trailDistanceR: 0.5 }],
  ["basabas 1R", { breakEvenAtR: 1, trailStartR: 0, trailDistanceR: 1 }],
  ["basabas1+trail2/1.5", { breakEvenAtR: 1, trailStartR: 2, trailDistanceR: 1.5 }]
];
const REWARDS = [1.25, 1.5, 2, 2.5, 3, 4];

const holdoutKey = PERIODS.includes("holdout") ? "holdout" : PERIODS.at(-1);
const positives = (result, period) =>
  symbols.filter((s) => { const x = stat(result.perSymbol.get(s)[period]); return x && x.trades >= 15 && x.expectancy > 0; }).length;
const usable = (result, period) =>
  symbols.filter((s) => (stat(result.perSymbol.get(s)[period])?.trades ?? 0) >= 15).length;

const line = (label, result) =>
  `  ${label.padEnd(26)} ${PERIODS.map((p) => cell(stat(result.totals[p]))).join(" | ")} | ${positives(result, holdoutKey)}/${usable(result, holdoutKey)}`;

console.log(`${base.name} — ISABET PROFILI, mevcut yapiya karsi yeniden olculuyor`);
console.log(`Yapi${structureName ? ` (${structureName}, ÜRÜNDE DEGIL)` : " (urun)"}: ${base.chartTimeframe}dk · ATR×${base.risk.atrMultiple} · stop ${base.risk.stopTrigger}` +
  ` · hacim ${base.volume.multiplier}x · seans ${base.execution.sessionEnabled ? base.execution.session : "yok"}`);
console.log(`Mevcut isabet profili: rr ${profile.riskReward}, trail ${profile.trailStartR || "yok"}/${profile.trailDistanceR}, pencere ${profile.triggerWindow}`);
console.log(`Pencere bu taramada: ${arg("window", profile.triggerWindow)} — Layout: ${PERIODS.join(" | ")}\n`);

const reference = measure(asProfile());
console.log("MEVCUT:");
console.log(line(`rr ${profile.riskReward} + trail ${profile.trailStartR || "yok"}`, reference));

const refByPeriod = Object.fromEntries(PERIODS.map((p) => [p, stat(reference.totals[p])?.expectancy ?? null]));
const winners = [];

// A follow-up question is usually about one exit family, and measuring the other five to
// answer it wastes most of the run. --exits=trail 1.5/1 narrows the grid to those rows.
const exitFilter = arg("exits");
for (const [exitLabel, exitPatch] of EXITS) {
  if (exitFilter && exitLabel !== exitFilter) continue;
  console.log(`\n${exitLabel}:`);
  for (const rr of REWARDS) {
    const result = measure(asProfile({ riskReward: rr, ...exitPatch }));
    const beats = PERIODS.filter((p) => {
      const a = stat(result.totals[p])?.expectancy;
      return a !== undefined && refByPeriod[p] !== null && a > refByPeriod[p];
    });
    const mark = beats.length === PERIODS.length ? "  <<< DORT DONEM" : beats.length === PERIODS.length - 1 ? "  ^^" : "";
    console.log(line(`rr ${rr}`, result) + mark);
    if (beats.length >= PERIODS.length - 1) winners.push({ label: `rr ${rr} + ${exitLabel}`, beats, result, config: { riskReward: rr, ...exitPatch } });
  }
}

console.log(`\n=== ${PERIODS.length - 1} donem veya fazlasinda mevcut profili geceler ===`);
if (!winners.length) console.log("  yok — mevcut isabet profili yeni yapida da en iyisi");
for (const w of winners) console.log(`  ${w.label.padEnd(30)} ${w.beats.join(", ")}`);

// Trigger window last, and only on what survived: sweeping it against every reward and exit
// would be a four-hundred-cell table nobody can read, and the window is the axis least likely
// to interact with how a trade is closed.
if (winners.length) {
  console.log("\ntetikleyici penceresi, ayakta kalanlar uzerinde:");
  for (const w of winners.slice(0, 4)) {
    console.log(`\n  ${w.label}`);
    for (const win of [1, 3, 5, 10]) {
      console.log(line(`   pencere ${win}`, measure(asProfile({ ...w.config, triggerWindow: win }))));
    }
  }

  console.log("\nsembol sembol, holdout:");
  const detail = (label, result) => console.log(`  ${label.padEnd(30)} ` + symbols.map((s) => {
    const x = stat(result.perSymbol.get(s)[holdoutKey]);
    return `${s.slice(0, 3)} ${x ? (x.expectancy >= 0 ? "+" : "") + x.expectancy.toFixed(3) + `(${x.trades}t)` : "—"}`;
  }).join("  "));
  detail("mevcut", reference);
  for (const w of winners.slice(0, 6)) detail(w.label, w.result);
}
