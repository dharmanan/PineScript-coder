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
  const bySymbolTrades = new Map();
  for (const symbol of symbols) {
    const symbolPlain = [];
    const symbolIntra = [];
    bySymbolTrades.set(symbol, { plain: symbolPlain, intra: symbolIntra });
    const { candles, groups } = aggregateWithGroups(bySymbol.get(symbol), timeframe.factor);
    const bounds = splitContiguous(candles, intervalMs(timeframe));
    let offset = 0;
    for (const segment of bounds) {
      const segmentGroups = groups.slice(offset, offset + segment.length);
      offset += segment.length;
      if (segment.length < MIN_SEGMENT) continue;
      const signals = buildSignals(preset, plan, segment, options);
      const plainTrades = simulate(preset, segment, signals, exits);
      const intraTrades = simulate(preset, segment, signals, { ...exits, intrabar: segmentGroups });
      plain.push(...plainTrades);
      intra.push(...intraTrades);
      symbolPlain.push(...plainTrades);
      symbolIntra.push(...intraTrades);
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

  // Rule 1 of the review plan: symbols are never pooled. This file used to print one row per
  // preset over all four symbols and close with an ALL row over every preset as well, so the two
  // most prominent numbers on the page were the two that cannot show intrabar resolution helping
  // one symbol while it hurts another. One line per symbol, and no total.
  for (const symbol of symbols) {
    const trades = bySymbolTrades.get(symbol);
    const before = summarize(evaluated(trades.plain));
    const after = summarize(evaluated(trades.intra));
    const ambBefore = evaluated(trades.plain).filter((trade) => trade.reason === "ambiguous").length;
    const ambAfter = evaluated(trades.intra).filter((trade) => trade.reason === "ambiguous").length;
    console.log(
      `${preset.presetId.padEnd(27)} ${symbol.replace("USDT", "").padStart(5)} ${String(before.trades).padStart(6)}  ` +
      `${String(ambBefore).padStart(5)}->${String(ambAfter).padEnd(4)} ` +
      `${(before.expectancy_r ?? 0).toFixed(4).padStart(9)}R  ${(after.expectancy_r ?? 0).toFixed(4).padStart(9)}R  ` +
      `${(((after.expectancy_r ?? 0) - (before.expectancy_r ?? 0))).toFixed(4).padStart(9)}R`
    );
  }
}

console.log("-".repeat(94));
console.log(`${totals.resolved} of ${totals.ambiguous} both-touched candles were settled by their five-minute candles.`);
