// How often each preset actually fires, per symbol per month. A preset can be profitable
// and still be unusable if it produces a handful of trades a year.
import { buildBehaviorPlan, presets } from "./generated/preset-config.mjs";
import { TIMEFRAMES, aggregate, intervalMs, splitContiguous } from "./data.mjs";
import { loadAll } from "./dataset.mjs";
import { buildSeries, buildSignals, simulate } from "./engine.mjs";

const { bySymbol } = await loadAll();
const measurable = presets.filter((p) => p.direction !== "spot_buy_exit" && p.risk.stopMode !== "none" && p.risk.takeProfitMode !== "none");
console.log("Preset basina, SEMBOL BASINA aylik islem sayisi (2019-2026, tam veri):\n");
const rows = [];
for (const preset of measurable) {
  const timeframe = TIMEFRAMES.find((t) => t.id === preset.chartTimeframe);
  if (!timeframe) continue;
  const plan = buildBehaviorPlan(preset);
  const per = [];
  for (const symbol of [...bySymbol.keys()].sort()) {
    const segments = splitContiguous(aggregate(bySymbol.get(symbol), timeframe.factor), intervalMs(timeframe)).filter((s) => s.length >= 300);
    let trades = 0, months = 0;
    for (const segment of segments) {
      const series = buildSeries(preset, segment);
      const signals = buildSignals(preset, plan, segment, { signalMode: preset.signalMode === "score" ? "score" : "all", scoreThreshold: preset.scoreThreshold, series, triggerWindow: preset.triggerWindow });
      trades += simulate(preset, segment, signals, { riskReward: preset.risk.riskReward, costPerSide: 0.01, breakEvenAtR: preset.risk.breakEvenAtR || null, trailStartR: preset.risk.trailStartR || null, trailDistanceR: preset.risk.trailDistanceR || null }).length;
      months += (segment.at(-1).timestamp - segment[0].timestamp) / (30 * 86400000);
    }
    per.push(months > 0 ? trades / months : 0);
  }
  const mean = per.reduce((a, b) => a + b, 0) / per.length;
  rows.push({ id: preset.presetId, tf: preset.chartTimeframe, mean, per });
}
rows.sort((a, b) => a.mean - b.mean);
for (const r of rows) {
  console.log(`${r.id.padEnd(26)} ${r.tf.padStart(3)}dk  ${r.mean.toFixed(1).padStart(5)} islem/ay  (yilda ~${Math.round(r.mean * 12)})`);
}
