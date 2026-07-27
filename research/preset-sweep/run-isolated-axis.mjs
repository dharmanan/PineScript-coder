// A clean A/B test of the two axis-level findings, one variable at a time.
//
// The filter sweep suggested wider stops and looser filters are better, and it said so
// through the median of 11,520 configurations rather than through one winner — which is why
// it is worth trusting enough to test directly. This does not search: the hypothesis was
// fixed before this ran, each preset keeps every one of its own settings, and exactly one
// number changes. Reported per symbol, per partition.
import { buildBehaviorPlan, presets } from "./generated/preset-config.mjs";
import { TIMEFRAMES, aggregate, intervalMs, splitContiguous } from "./data.mjs";
import { loadAll, partitionOf } from "./dataset.mjs";
import { buildSeries, buildSignals, simulate } from "./engine.mjs";

const measurable = presets.filter(
  (preset) => preset.direction !== "spot_buy_exit" && preset.risk.stopMode !== "none" && preset.risk.takeProfitMode !== "none"
);
const { bySymbol } = await loadAll();
const symbols = [...bySymbol.keys()].sort();

const run = (preset) => {
  const timeframe = TIMEFRAMES.find((item) => item.id === preset.chartTimeframe);
  if (!timeframe) return null;
  const plan = buildBehaviorPlan(preset);
  const perSymbol = new Map(symbols.map((symbol) => [symbol, { development: [], validation: [], holdout: [] }]));

  for (const symbol of symbols) {
    const segments = splitContiguous(aggregate(bySymbol.get(symbol), timeframe.factor), intervalMs(timeframe))
      .filter((segment) => segment.length >= 300);
    for (const segment of segments) {
      const series = buildSeries(preset, segment);
      const signals = buildSignals(preset, plan, segment, {
        signalMode: preset.signalMode === "score" ? "score" : "all",
        scoreThreshold: preset.scoreThreshold, series, triggerWindow: preset.triggerWindow
      });
      const trades = simulate(preset, segment, signals, {
        riskReward: preset.risk.riskReward, costPerSide: 0.01,
        breakEvenAtR: preset.risk.breakEvenAtR || null,
        trailStartR: preset.risk.trailStartR || null,
        trailDistanceR: preset.risk.trailDistanceR || null
      });
      for (const trade of trades) {
        const partition = partitionOf(trade.entryTimestamp);
        if (!partition) continue;
        perSymbol.get(symbol)[partition].push(trade.netR);
      }
    }
  }
  return { perSymbol };
};

const stat = (values) => {
  if (!values.length) return null;
  const wins = values.filter((value) => value > 0).length;
  const sum = values.reduce((a, b) => a + b, 0);
  return { trades: values.length, winRate: wins / values.length, expectancy: sum / values.length };
};
const show = (s) => (s ? `${String(s.trades).padStart(4)}t %${(s.winRate * 100).toFixed(1).padStart(4)} ${(s.expectancy >= 0 ? "+" : "") + s.expectancy.toFixed(3)}R` : "     islem yok    ");

const CHANGES = [
  { id: "atr 3.0", apply: (p) => ({ ...p, risk: { ...p.risk, atrMultiple: 3 } }), skip: (p) => p.risk.atrMultiple === 3 },
  { id: "adx 15", apply: (p) => ({ ...p, momentum: { ...p.momentum, adxThreshold: 15 } }), skip: (p) => !p.momentum.adxEnabled || p.momentum.adxThreshold === 15 },
  { id: "hacim 0.8", apply: (p) => ({ ...p, volume: { ...p.volume, multiplier: 0.8 } }), skip: (p) => !p.volume.enabled || p.volume.multiplier === 0.8 }
];

for (const preset of measurable) {
  const base = run(preset);
  if (!base) continue;
  console.log(`\n${preset.presetId}  (${preset.chartTimeframe}dk, atr ${preset.risk.atrMultiple}, adx ${preset.momentum.adxEnabled ? preset.momentum.adxThreshold : "kapali"}, hacim ${preset.volume.enabled ? preset.volume.multiplier : "kapali"})`);
  // Rule 1: one line per symbol. A dev/val/holdout line pooled over four symbols was the
  // headline here, and it is exactly the number that hides one symbol carrying the rest.
  const bySym = (label, result) => {
    console.log(`   ${label}`);
    for (const symbol of symbols) {
      const r = result.perSymbol.get(symbol);
      console.log(`     ${symbol.replace(/USDT?$/, "").padEnd(6)} dev ${show(stat(r.development))} | val ${show(stat(r.validation))} | hld ${show(stat(r.holdout))}`);
    }
  };
  bySym("SIMDIKI", base);

  for (const change of CHANGES) {
    if (change.skip(preset)) { console.log(`   ${change.id.padEnd(10)} zaten bu degerde veya kapali`); continue; }
    const changed = run(change.apply(preset));
    bySym(change.id, changed);
    // Per symbol, because a change that only helps one symbol has not helped.
    const better = symbols.filter((symbol) => {
      const b = stat(base.perSymbol.get(symbol).holdout);
      const n = stat(changed.perSymbol.get(symbol).holdout);
      return b && n && n.trades >= 8 && n.expectancy > b.expectancy;
    });
    const usable = symbols.filter((symbol) => (stat(changed.perSymbol.get(symbol).holdout)?.trades ?? 0) >= 8);
    console.log(`              holdout'ta ${better.length}/${usable.length} sembolde daha iyi: ${better.map((s) => s.slice(0, 3)).join(", ") || "hicbiri"}`);
  }
}
