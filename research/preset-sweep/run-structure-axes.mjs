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
import { createReporter } from "./report.mjs";

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
  return { perSymbol };
};

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

// Only the axes this preset actually uses. Sweeping an ADX threshold on a preset with ADX
// switched off measures nothing and pads the table with rows that all say the same number,
// which is how a reader stops reading the table.
const CHART_TIMEFRAMES = ["30", "60", "240"];
const AXES = [
  ...(base.entryTrigger === "breakout" || base.trend.breakoutLength !== 20
    ? [["kirilma uzunlugu", [10, 20, 30, 50].filter((v) => v !== base.trend.breakoutLength)
        .map((v) => [`breakout ${v}`, variant({ trend: { breakoutLength: v } })])]]
    : []),
  ["grafik zaman dilimi", CHART_TIMEFRAMES.filter((v) => v !== base.chartTimeframe)
    .map((v) => [`chart ${v}dk`, variant({ chartTimeframe: v })])],
  ...(base.trend.emaEnabled
    ? [["EMA cifti", [[9, 21], [20, 50], [50, 100]]
        .filter(([f, s]) => f !== base.trend.emaFast || s !== base.trend.emaSlow)
        .map(([f, s]) => [`ema ${f}/${s}`, variant({ trend: { emaFast: f, emaSlow: s } })])]]
    : []),
  ...(base.trend.longMaEnabled
    ? [["uzun MA", [50, 100, 200].filter((v) => v !== base.trend.longMaLength)
        .map((v) => [`uzun MA ${v}`, variant({ trend: { longMaLength: v } })])]]
    : []),
  ...(base.momentum.macdEnabled ? [["MACD", [["macd kapali", variant({ momentum: { macdEnabled: false } })]]]] : []),
  ...(base.momentum.rsiEnabled ? [["RSI esikleri", [
    ["rsi 50/50", variant({ momentum: { rsiLong: 50, rsiShort: 50 } })],
    ["rsi 60/40", variant({ momentum: { rsiLong: 60, rsiShort: 40 } })]
  ]]] : []),
  ["stop onayi", [[base.risk.stopTrigger === "close" ? "stop wick" : "stop kapanis",
    variant({ risk: { stopTrigger: base.risk.stopTrigger === "close" ? "wick" : "close" } })]]],
  // The pivot lookback behind the swing-structure gate: how many bars either side of a high or
  // low have to be lower or higher before it counts as a pivot. It decides how quickly the bias
  // turns, which for a structure-gated preset is the same kind of defining number that the
  // channel length is for a breakout — and it has never been measured, on any preset.
  ...(base.biasSource === "swing_structure"
    ? [["swing pivot lookback", [2, 3, 5, 8].filter((v) => v !== base.swingLookback)
        .map((v) => [`pivot ${v}`, variant({ swingLookback: v })])]]
    : []),
  // Structure replaces the higher-timeframe gate rather than joining it, so on a
  // structure-gated preset the higher-timeframe settings are inert. Measuring them would
  // produce a table of identical rows.
  ...(base.higherTimeframe.enabled && base.biasSource !== "swing_structure"
    ? [["ust zaman dilimi", [
        ["htf uzunluk 50", variant({ higherTimeframe: { length: 50 } })],
        ["htf uzunluk 200", variant({ higherTimeframe: { length: 200 } })],
        ["htf gunluk", variant({ higherTimeframe: { timeframe: "D" } })]
      ].filter(([, config]) =>
        config.higherTimeframe.length !== base.higherTimeframe.length ||
        config.higherTimeframe.timeframe !== base.higherTimeframe.timeframe)]]
    : [["ust zaman dilimi (kapali, aciliyor)", [
        ["htf 4sa ema100", variant({ higherTimeframe: { ...base.higherTimeframe, enabled: true, timeframe: "240", method: "ema", length: 100 } })],
        ["htf gunluk ema200", variant({ higherTimeframe: { ...base.higherTimeframe, enabled: true, timeframe: "D", method: "ema", length: 200 } })]
      ]]]),
  // Never measured on any preset, and the one axis unique to VWAP Session Trader: it only
  // trades a New York equities session while crypto trades every hour of every day. Turning
  // it off is not a tweak, it is asking whether the restriction was ever worth having.
  ...(base.execution.sessionEnabled
    ? [["seans kisiti", [
        ["seans KAPALI (7/24)", variant({ execution: { sessionEnabled: false } })],
        ["seans 0800-1700 NY", variant({ execution: { session: "0800-1700" } })],
        ["seans 0000-2400 UTC", variant({ execution: { session: "0000-2400", sessionTimezone: "UTC" } })]
      ]]]
    : []),
  ...(base.momentum.adxEnabled
    ? [["ADX esigi", [15, 20, 25, 30].filter((v) => v !== base.momentum.adxThreshold)
        .map((v) => [`adx ${v}`, variant({ momentum: { adxThreshold: v } })])]]
    : []),
  // Which filters are earning their keep. Every preset stacks several directional gates that
  // answer the same question — is the trend up — and correlated gates mostly duplicate each
  // other's information while each one still gets a veto. A filter whose removal costs nothing
  // was buying nothing; one whose removal multiplies the trade count without hurting expectancy
  // was the binding constraint. Never measured on any preset before.
  ["filtre kaldirma", [
    ...(base.trend.emaEnabled ? [["ema trendi KAPALI", variant({ trend: { emaEnabled: false } })]] : []),
    ...(base.trend.longMaEnabled ? [["uzun MA KAPALI", variant({ trend: { longMaEnabled: false } })]] : []),
    ...(base.momentum.adxEnabled ? [["ADX KAPALI", variant({ momentum: { adxEnabled: false } })]] : []),
    ...(base.momentum.macdEnabled ? [["MACD KAPALI", variant({ momentum: { macdEnabled: false } })]] : []),
    ...(base.momentum.rsiEnabled ? [["RSI KAPALI", variant({ momentum: { rsiEnabled: false } })]] : []),
    ...(base.volume.enabled ? [["hacim KAPALI", variant({ volume: { enabled: false } })]] : []),
    ...(base.trend.vwapEnabled ? [["VWAP filtresi KAPALI", variant({ trend: { vwapEnabled: false } })]] : [])
  ]],
  ["hacim carpani", [0.8, 1, 1.25, 1.5, 2].filter((v) => v !== base.volume.multiplier)
    .map((v) => [`hacim ${v}`, variant({ volume: { multiplier: v } })])],
  ["ATR carpani", [1.5, 2, 2.5, 3].filter((v) => v !== base.risk.atrMultiple)
    .map((v) => [`atr ${v}`, variant({ risk: { atrMultiple: v } })])]
];

// Single-variable results do not add up on their own: two axes that each help alone can
// overlap, cancel or double-count. The pairings that looked worth having after the isolated
// pass are therefore measured as their own explicit configurations, not inferred.
// Filled in per preset once the single-variable pass shows which axes are worth pairing.
// Left empty rather than guessed: a combination measured before the isolated results are in
// is a search, and this file exists to avoid searching.
const combosFor = (presetId) => ({
  // Volume 0.8 was the only isolated axis in this preset's whole sweep that raised both the hit
  // rate and the trade count on all four symbols at once, so every pairing starts from it. The
  // long moving average is measurably dead here — its off row is byte-identical to the reference
  // on every symbol and every period — so pairing it costs nothing and removes a control that
  // claims to do something. ADX off is the axis that actually opens the sample: it is the only
  // other row that leaves all four symbols readable, and unlike the 30-minute chart it does not
  // cut ETH's hit rate by twenty-four points to get there.
  selective_multi_timeframe: [
    ["hacim0.8 + uzunMA kapali", variant({ volume: { multiplier: 0.8 }, trend: { longMaEnabled: false } })],
    ["hacim0.8 + ADX kapali", variant({ volume: { multiplier: 0.8 }, momentum: { adxEnabled: false } })],
    ["hacim0.8 + uzunMA + ADX kapali", variant({
      volume: { multiplier: 0.8 }, trend: { longMaEnabled: false }, momentum: { adxEnabled: false }
    })],
    ["hacim0.8 + adx 15", variant({ volume: { multiplier: 0.8 }, momentum: { adxThreshold: 15 } })],
    ["hacim0.8 + atr 1.5", variant({ volume: { multiplier: 0.8 }, risk: { atrMultiple: 1.5 } })],
    ["hacim0.8 + chart 30dk", variant({ volume: { multiplier: 0.8 }, chartTimeframe: "30" })]
  ],
  breakout_momentum: [
    ["kirilma10 + adx30", variant({ trend: { breakoutLength: 10 }, momentum: { adxThreshold: 30 } })],
    ["kirilma10 + adx30 + kapanis stop", variant({
      trend: { breakoutLength: 10 }, momentum: { adxThreshold: 30 }, risk: { stopTrigger: "close" }
    })],
    ["kirilma10 + htf200", variant({ trend: { breakoutLength: 10 }, higherTimeframe: { length: 200 } })],
    ["kirilma10 + adx30 + htf200", variant({
      trend: { breakoutLength: 10 }, momentum: { adxThreshold: 30 }, higherTimeframe: { length: 200 }
    })]
  ],
  // The session restriction is the one axis that moved this preset from losing on all four
  // symbols to winning on three, so every pairing starts from having it off.
  vwap_session_trader: [
    // The form the product ships: the session filter stays wired up and visible so a user can
    // narrow it, but its default window covers the whole day. Pine's session parser only
    // accepts hours 00-23, so the honest 24-hour spelling is 0000-2359. This row exists to
    // prove that spelling is identical to having no session at all — otherwise "we kept the
    // setting, it just does nothing by default" would be a claim rather than a measurement.
    ["seans 0000-2359 ACIK (urun)", variant({ execution: { sessionEnabled: true, session: "0000-2359" } })],
    ["seans 09:30-16:00 (eski)", variant({ execution: { sessionEnabled: true, session: "0930-1600", sessionTimezone: "America/New_York" } })],
    ["seans yok", variant({ execution: { sessionEnabled: false } })],
    ["seans yok + hacim 1.25", variant({ execution: { sessionEnabled: false }, volume: { multiplier: 1.25 } })],
    ["seans yok + hacim 1.5", variant({ execution: { sessionEnabled: false }, volume: { multiplier: 1.5 } })],
    ["seans yok + atr 2.5", variant({ execution: { sessionEnabled: false }, risk: { atrMultiple: 2.5 } })],
    ["seans yok + htf 4sa", variant({
      execution: { sessionEnabled: false },
      higherTimeframe: { ...base.higherTimeframe, enabled: true, timeframe: "240", method: "ema", length: 100 }
    })],
    ["seans yok + chart 30dk", variant({ execution: { sessionEnabled: false }, chartTimeframe: "30" })],
    ["seans yok + hacim1.25 + atr2.5", variant({
      execution: { sessionEnabled: false }, volume: { multiplier: 1.25 }, risk: { atrMultiple: 2.5 }
    })]
  ],
  // Pivot 5 was the only isolated axis that both raised the trade count and left more than two
  // symbols with a sample worth reading, so every pairing starts from it. The rest of the
  // combinations attack the trade count directly, because on this preset the sample size is the
  // problem: 57 trades on the holdout across four symbols is ten to seventeen each.
  swing_trend_4h: [
    ["pivot 5", variant({ swingLookback: 5 })],
    ["pivot 5 + atr 2", variant({ swingLookback: 5, risk: { atrMultiple: 2 } })],
    ["pivot 5 + kapanis stop", variant({ swingLookback: 5, risk: { stopTrigger: "close" } })],
    ["pivot 5 + uzun MA kapali", variant({ swingLookback: 5, trend: { longMaEnabled: false } })],
    ["pivot 5 + ema trendi kapali", variant({ swingLookback: 5, trend: { emaEnabled: false } })],
    ["pivot 5 + ema 20/50", variant({ swingLookback: 5, trend: { emaFast: 20, emaSlow: 50 } })],
    ["pivot 5 + adx 15", variant({ swingLookback: 5, momentum: { adxThreshold: 15 } })],
    ["pivot 5 + uzunMA kapali + ema 20/50", variant({
      swingLookback: 5, trend: { longMaEnabled: false, emaFast: 20, emaSlow: 50 }
    })]
  ]
}[presetId] ?? []);
const COMBOS = combosFor(base.presetId);

const reporter = createReporter({ symbols, periods: PERIODS });
const { holdoutKey } = reporter;

const report = (label, result) => {
  reporter.block(label, result);
  return result;
};

// A variant counts as an improvement only where the user's own criterion is met: on that one
// symbol, its hit rate and its trade count both hold up. Averaging the four symbols would let a
// single strong symbol carry three weak ones, which is the failure this whole file guards.
const gainedSymbols = (result, reference) =>
  reporter.compare(result, reference, holdoutKey).filter((c) => c.mark === "^").map((c) => c.symbol);

console.log(`${base.name} · ${base.chartTimeframe} dakika · kirilma ${base.trend.breakoutLength} · EMA ${base.trend.emaFast}/${base.trend.emaSlow} · ADX ${base.momentum.adxThreshold} · ATR×${base.risk.atrMultiple} · rr ${base.risk.riskReward}`);
console.log(`Layout: ${LAYOUT} — ${PERIODS.join(" | ")}`);
console.log("Tek degiskenli: her satirda preset'in kendi ayarlarindan SADECE biri degisiyor.");
console.log("Her satir tek bir sembol. Sembolleri toplayan bir sayi bu ciktida yok.\n");
reporter.head();

const referenceResult = measure(base);
report("referans (urun)", referenceResult);

const all = [];
const better = [];
for (const [axis, variants] of AXES) {
  if (!variants.length) continue;
  console.log(`\n${axis}:`);
  for (const [label, config] of variants) {
    const result = report(label, measure(config));
    all.push([label, result]);
    const gained = gainedSymbols(result, referenceResult);
    if (gained.length >= 2) better.push([label, gained]);
  }
}

console.log("\nkombinasyonlar (tek degiskenli degil — acikca olculen bilesikler):");
for (const [label, config] of COMBOS) {
  const result = report(label, measure(config));
  all.push([label, result]);
  const gained = gainedSymbols(result, referenceResult);
  if (gained.length >= 2) better.push([label, gained]);
}

reporter.summary(all, referenceResult);

console.log("\n=== en az iki sembolde hem isabet hem islem sayisi referanstan iyi ===");
if (!better.length) console.log("  yok");
for (const [label, gained] of better) console.log(`  ${label.padEnd(24)} ${gained.join(", ")}`);

console.log("\n=== okunabilir ornekleme sahip sembol sayisi (holdout, >=15 islem) ===");
for (const [label, result] of [["referans", referenceResult], ...all]) {
  const read = reporter.readable(result);
  const won = reporter.sound(result);
  console.log(`  ${label.padEnd(24)} okunabilir ${read.length}/${symbols.length}  artida ${won.length}  ${won.map((s) => s.replace(/USDT?$/, "")).join(" ")}`);
}
