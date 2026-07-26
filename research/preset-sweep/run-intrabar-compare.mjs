import { buildBehaviorPlan, presets } from "./generated/preset-config.mjs";
import { TIMEFRAMES, aggregateWithGroups, intervalMs, splitContiguous } from "./data.mjs";
import { loadAll, partitionOf } from "./dataset.mjs";
import { buildSignals, simulate, summarize } from "./engine.mjs";

// Same settings, same candles, one difference: whether a chart candle that touched both
// the stop and the target is settled by its own five-minute candles or charged as a loss.
const COST_PER_SIDE = Number(process.env.SWEEP_COST ?? 0.01);
const MIN_SEGMENT = 300;

const measurable = presets.filter(
  (preset) =>
    preset.direction !== "spot_buy_exit" &&
    preset.risk.stopMode !== "none" &&
    preset.risk.takeProfitMode !== "none"
);

const { bySymbol } = await loadAll();
const symbols = [...bySymbol.keys()].sort();

console.log(`Commission ${COST_PER_SIDE}% per side. Settings are the shipped preset defaults.\n`);
console.log("preset                       trades  ambiguous   chart-only        intrabar        change");
console.log("-".repeat(94));

const totals = { plain: 0, intra: 0, trades: 0, ambiguous: 0, resolved: 0 };

for (const preset of measurable) {
  const timeframe = TIMEFRAMES.find((item) => item.id === preset.chartTimeframe);
  if (!timeframe) continue;
  const plan = buildBehaviorPlan(preset);
  const options = preset.signalMode === "score"
    ? { signalMode: "score", scoreThreshold: preset.scoreThreshold, triggerWindow: preset.triggerWindow }
    : { signalMode: "all", triggerWindow: preset.triggerWindow };
  const exits = {
    riskReward: preset.risk.riskReward,
    costPerSide: COST_PER_SIDE,
    breakEvenAtR: preset.risk.breakEvenAtR || null,
    trailStartR: preset.risk.trailStartR || null,
    trailDistanceR: preset.risk.trailDistanceR
  };

  const plain = [];
  const intra = [];
  for (const symbol of symbols) {
    const { candles, groups } = aggregateWithGroups(bySymbol.get(symbol), timeframe.factor);
    const bounds = splitContiguous(candles, intervalMs(timeframe));
    let offset = 0;
    for (const segment of bounds) {
      const segmentGroups = groups.slice(offset, offset + segment.length);
      offset += segment.length;
      if (segment.length < MIN_SEGMENT) continue;
      const signals = buildSignals(preset, plan, segment, options);
      plain.push(...simulate(preset, segment, signals, exits));
      intra.push(...simulate(preset, segment, signals, { ...exits, intrabar: segmentGroups }));
    }
  }

  const evaluated = (trades) => trades.filter((trade) => partitionOf(trade.entryTimestamp));
  const a = summarize(evaluated(plain));
  const b = summarize(evaluated(intra));
  const ambiguousBefore = evaluated(plain).filter((trade) => trade.reason === "ambiguous").length;
  const ambiguousAfter = evaluated(intra).filter((trade) => trade.reason === "ambiguous").length;

  totals.plain += a.net_r;
  totals.intra += b.net_r;
  totals.trades += a.trades;
  totals.ambiguous += ambiguousBefore;
  totals.resolved += ambiguousBefore - ambiguousAfter;

  console.log(
    `${preset.presetId.padEnd(27)} ${String(a.trades).padStart(6)}  ${String(ambiguousBefore).padStart(5)}->${String(ambiguousAfter).padEnd(4)} ` +
    `${(a.expectancy_r ?? 0).toFixed(4).padStart(9)}R  ${(b.expectancy_r ?? 0).toFixed(4).padStart(9)}R  ` +
    `${(((b.expectancy_r ?? 0) - (a.expectancy_r ?? 0))).toFixed(4).padStart(9)}R`
  );
}

console.log("-".repeat(94));
console.log(
  `${"ALL".padEnd(27)} ${String(totals.trades).padStart(6)}  ${String(totals.ambiguous).padStart(5)}->${String(totals.ambiguous - totals.resolved).padEnd(4)} ` +
  `${(totals.plain / totals.trades).toFixed(4).padStart(9)}R  ${(totals.intra / totals.trades).toFixed(4).padStart(9)}R  ` +
  `${((totals.intra - totals.plain) / totals.trades).toFixed(4).padStart(9)}R`
);
console.log(`\nNet across all presets: ${totals.plain.toFixed(1)}R chart-only -> ${totals.intra.toFixed(1)}R with intrabar (${(totals.intra - totals.plain >= 0 ? "+" : "")}${(totals.intra - totals.plain).toFixed(1)}R)`);
console.log(`${totals.resolved} of ${totals.ambiguous} both-touched candles were settled by their five-minute candles.`);
