// One shot at July 2026. Every candidate this session produced is listed below, fixed
// before the data was loaded, and each is measured once. No search, no ranking, no second
// pass — the entire value of this partition is that nothing has been fitted to it, and that
// property is destroyed by the first configuration chosen after seeing the result.
//
// Sample warning, stated up front so it is not discovered afterwards: July is 25 days. Even
// the busiest preset produces a few dozen trades per symbol here, which is enough to catch a
// candidate that is outright broken and not enough to promote one that looks good.
import { buildBehaviorPlan, presets } from "./generated/preset-config.mjs";
import { TIMEFRAMES, aggregate, intervalMs, splitContiguous } from "./data.mjs";
import { loadAll, partitionOf, partitionsFor } from "./dataset.mjs";
import { buildSeries, buildSignals, simulate } from "./engine.mjs";

const PARTITIONS = partitionsFor("july");
const { bySymbol } = await loadAll();
const symbols = [...bySymbol.keys()].sort();
const byId = (id) => presets.find((preset) => preset.presetId === id);

// Each candidate: the preset it applies to, what changes, and why it is here.
const CANDIDATES = [
  { preset: "balanced_intraday", id: "simdiki urun", change: (p) => p },
  { preset: "fast_ema_scalper", id: "simdiki urun", change: (p) => p },
  { preset: "vwap_session_trader", id: "simdiki urun", change: (p) => p },
  { preset: "swing_trend_4h", id: "simdiki urun (yapisal bias)", change: (p) => p },
  { preset: "supertrend_volume", id: "simdiki urun", change: (p) => p },
  { preset: "breakout_momentum", id: "simdiki urun", change: (p) => p },
  { preset: "rsi_divergence_reversal", id: "simdiki urun", change: (p) => p },
  { preset: "selective_multi_timeframe", id: "simdiki urun", change: (p) => p },
  { preset: "long_term_trend_guard", id: "simdiki urun", change: (p) => p },

  // Looked good on the 2026 holdout but failed the development or validation gate.
  { preset: "selective_multi_timeframe", id: "hacim 0.8", change: (p) => ({ ...p, volume: { ...p.volume, multiplier: 0.8 } }) },
  { preset: "breakout_momentum", id: "2023+ secimi: adx30 atr2", change: (p) => ({ ...p, momentum: { ...p.momentum, adxThreshold: 30 }, volume: { ...p.volume, multiplier: 1.5 }, execution: { ...p.execution, cooldownBars: 0 }, risk: { ...p.risk, atrMultiple: 2 } }) },
  { preset: "supertrend_volume", id: "atr 3.0", change: (p) => ({ ...p, risk: { ...p.risk, atrMultiple: 3 } }) },
  { preset: "fast_ema_scalper", id: "atr 3.0", change: (p) => ({ ...p, risk: { ...p.risk, atrMultiple: 3 } }) },

  // The high hit-rate band, which only exists below rr 2.
  { preset: "swing_trend_4h", id: "rr 0.5 (yuksek isabet)", change: (p) => ({ ...p, triggerWindow: 5, risk: { ...p.risk, riskReward: 0.5 } }) },
  { preset: "selective_multi_timeframe", id: "rr 1.5 (dengeli)", change: (p) => ({ ...p, risk: { ...p.risk, riskReward: 1.5, trailStartR: 0, trailDistanceR: 1 } }) },
  { preset: "balanced_intraday", id: "rr 1.25", change: (p) => ({ ...p, triggerWindow: 10, risk: { ...p.risk, riskReward: 1.25 } }) }
];

// The ICT triggers, applied to every preset, because their pattern was consistent across
// presets rather than tied to one.
const ICT = [
  { id: "fvg girisi", biasSource: "htf", triggerSource: "fvg_return" },
  { id: "supurme girisi", biasSource: "htf", triggerSource: "sweep_reversal" },
  { id: "order block girisi", biasSource: "htf", triggerSource: "order_block_retest" }
];

const measure = (preset, options = {}) => {
  const timeframe = TIMEFRAMES.find((item) => item.id === preset.chartTimeframe);
  if (!timeframe) return null;
  const plan = buildBehaviorPlan(preset);
  const buckets = { holdout: [], july: [] };
  const perSymbol = new Map(symbols.map((symbol) => [symbol, { holdout: [], july: [] }]));

  for (const symbol of symbols) {
    const segments = splitContiguous(aggregate(bySymbol.get(symbol), timeframe.factor), intervalMs(timeframe))
      .filter((segment) => segment.length >= 300);
    for (const segment of segments) {
      const series = buildSeries(preset, segment, { structural: true });
      const signals = buildSignals(preset, plan, segment, {
        signalMode: preset.signalMode === "score" ? "score" : "all",
        scoreThreshold: preset.scoreThreshold, series, triggerWindow: preset.triggerWindow,
        biasSource: options.biasSource ?? "htf", triggerSource: options.triggerSource ?? "preset"
      });
      for (const trade of simulate(preset, segment, signals, {
        riskReward: preset.risk.riskReward, costPerSide: 0.01,
        breakEvenAtR: preset.risk.breakEvenAtR || null,
        trailStartR: preset.risk.trailStartR || null,
        trailDistanceR: preset.risk.trailDistanceR || null
      })) {
        const partition = partitionOf(trade.entryTimestamp, PARTITIONS);
        if (partition !== "holdout" && partition !== "july") continue;
        buckets[partition].push(trade.netR);
        perSymbol.get(symbol)[partition].push(trade.netR);
      }
    }
  }
  return { buckets, perSymbol };
};

const stat = (values) => {
  if (!values.length) return null;
  const wins = values.filter((value) => value > 0).length;
  return { trades: values.length, winRate: wins / values.length, expectancy: values.reduce((a, b) => a + b, 0) / values.length };
};
const show = (s) => (s ? `${String(s.trades).padStart(3)}t %${(s.winRate * 100).toFixed(1).padStart(5)} ${(s.expectancy >= 0 ? "+" : "") + s.expectancy.toFixed(3)}R` : "  islem yok      ");

console.log("TEMMUZ 2026 (1-25) — hicbir konfigurasyonun gormedigi veri");
console.log("Ocak-Haziran holdout yaninda gosteriliyor: ayni ayar, iki ayri donem.\n");

const results = [];
for (const candidate of CANDIDATES) {
  const base = byId(candidate.preset);
  if (!base) continue;
  const result = measure(candidate.change(base));
  if (!result) continue;
  results.push({ preset: candidate.preset, id: candidate.id, result });
}
for (const preset of presets.filter((p) => p.direction !== "spot_buy_exit" && p.risk.stopMode !== "none" && p.risk.takeProfitMode !== "none")) {
  for (const variant of ICT) {
    const result = measure(preset, variant);
    if (result) results.push({ preset: preset.presetId, id: variant.id, result });
  }
}

let current = null;
for (const row of results) {
  if (row.preset !== current) { console.log(`\n${row.preset}`); current = row.preset; }
  const july = stat(row.result.buckets.july);
  const holdout = stat(row.result.buckets.holdout);
  const positive = symbols.filter((s) => {
    const own = stat(row.result.perSymbol.get(s).july);
    return own && own.trades >= 5 && own.expectancy > 0;
  });
  const usable = symbols.filter((s) => (stat(row.result.perSymbol.get(s).july)?.trades ?? 0) >= 5);
  console.log(`   ${row.id.padEnd(28)} Oca-Haz ${show(holdout)} | TEMMUZ ${show(july)} | ${positive.length}/${usable.length} sembol artida`);
}
