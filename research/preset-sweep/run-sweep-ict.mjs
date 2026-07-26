// Measures the two ICT mechanisms against the ones already in the product, on the same
// data, with the same gates. Two axes, crossed:
//
//   bias    — higher-timeframe moving average  vs  swing structure (HH-HL / LH-LL)
//   trigger — the preset's own trigger          vs  entry after a liquidity sweep
//
// Everything else is held still. A preset keeps its filters, its stop, its costs and its
// chart timeframe, so a difference in the result belongs to the axis and not to a bundle
// of changes made at once. Reported per symbol and per partition, never merged.
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildBehaviorPlan, presets } from "./generated/preset-config.mjs";
import { TIMEFRAMES, aggregate, intervalMs, splitContiguous } from "./data.mjs";
import { PARTITIONS, loadAll, partitionOf, quarterOf } from "./dataset.mjs";
import { buildSeries, buildSignals, simulate, timeframeMinutes } from "./engine.mjs";

const directory = dirname(fileURLToPath(import.meta.url));
const resultDirectory = join(directory, "results");
const COST_PER_SIDE = Number(process.env.SWEEP_COST ?? 0.01);
const MIN_SEGMENT = 300;

const argTimeframes = process.argv.find((item) => item.startsWith("--timeframes="));
const SWEEP_TIMEFRAMES = argTimeframes ? argTimeframes.split("=")[1].split(",") : ["30", "60"];
const REPORT_NAME = process.argv.find((item) => item.startsWith("--out="))?.split("=")[1] ?? "preset-sweep-ict.json";

// Both axes at both settings, so the untouched behaviour is measured in the same run as
// the alternatives and no comparison crosses two reports.
const VARIANTS = [
  { id: "baseline", biasSource: "htf", triggerSource: "preset" },
  { id: "structure-bias", biasSource: "structure", triggerSource: "preset" },
  { id: "sweep-entry", biasSource: "htf", triggerSource: "sweep_reversal" },
  { id: "structure+sweep", biasSource: "structure", triggerSource: "sweep_reversal" },
  { id: "fvg-entry", biasSource: "htf", triggerSource: "fvg_return" },
  { id: "structure+fvg", biasSource: "structure", triggerSource: "fvg_return" },
  { id: "ob-entry", biasSource: "htf", triggerSource: "order_block_retest" },
  { id: "structure+ob", biasSource: "structure", triggerSource: "order_block_retest" }
];
const TRIGGER_WINDOWS = [1, 3, 5];
const RISK_REWARDS = [2, 3, 4, 6];
const EXITS = [
  { id: "plain", options: {} },
  { id: "trail-1.5/1.0", options: { trailStartR: 1.5, trailDistanceR: 1 } }
];

const measurable = presets.filter(
  (preset) =>
    preset.direction !== "spot_buy_exit" &&
    preset.risk.stopMode !== "none" &&
    preset.risk.takeProfitMode !== "none"
);

const { bySymbol, provenance } = await loadAll();
const symbols = [...bySymbol.keys()].sort();
console.log("Data sources:", provenance.map((item) => `${item.source} (${item.files})`).join(", "));
console.log(`\nGrid: ${measurable.length} presets x ${SWEEP_TIMEFRAMES.length} tf x ${VARIANTS.length} variants ` +
  `x ${TRIGGER_WINDOWS.length} windows x ${RISK_REWARDS.length} rr x ${EXITS.length} exits`);
console.log(`Commission ${COST_PER_SIDE}% per side.\n`);

const blank = () => ({ trades: 0, wins: 0, net_r: 0, gross_r: 0, profit: 0, loss: 0 });
const fold = (acc, trade) => {
  acc.trades += 1;
  acc.net_r += trade.netR;
  acc.gross_r += trade.grossR;
  if (trade.netR > 0) { acc.wins += 1; acc.profit += trade.netR; } else { acc.loss += Math.abs(trade.netR); }
};
const finish = (acc) => ({
  trades: acc.trades,
  wins: acc.wins,
  losses: acc.trades - acc.wins,
  win_rate: acc.trades ? acc.wins / acc.trades : null,
  net_r: acc.net_r,
  expectancy_r: acc.trades ? acc.net_r / acc.trades : null,
  profit_factor: acc.loss ? acc.profit / acc.loss : null
});

const buckets = new Map();
const record = (key, symbol, trades) => {
  let entry = buckets.get(key);
  if (!entry) {
    entry = { development: blank(), validation: blank(), holdout: blank(), quarters: new Map(), bySymbol: new Map() };
    buckets.set(key, entry);
  }
  let own = entry.bySymbol.get(symbol);
  if (!own) {
    own = { total: blank(), development: blank(), validation: blank(), holdout: blank() };
    entry.bySymbol.set(symbol, own);
  }
  for (const trade of trades) {
    const partition = partitionOf(trade.entryTimestamp);
    if (!partition) continue;
    fold(entry[partition], trade);
    fold(own.total, trade);
    fold(own[partition], trade);
    if (partition === "holdout") continue;
    const quarter = quarterOf(trade.entryTimestamp);
    let bucket = entry.quarters.get(quarter);
    if (!bucket) { bucket = { trades: 0, net_r: 0 }; entry.quarters.set(quarter, bucket); }
    bucket.trades += 1;
    bucket.net_r += trade.netR;
  }
};

let done = 0;
for (const timeframeId of SWEEP_TIMEFRAMES) {
  const timeframe = TIMEFRAMES.find((item) => item.id === timeframeId);
  for (const preset of measurable) {
    if (preset.higherTimeframe.enabled) {
      const chart = timeframeMinutes(timeframeId);
      const higher = timeframeMinutes(preset.higherTimeframe.timeframe);
      if (chart !== null && higher !== null && higher <= chart) continue;
    }
    const plan = buildBehaviorPlan(preset);

    for (const symbol of symbols) {
      const segments = splitContiguous(aggregate(bySymbol.get(symbol), timeframe.factor), intervalMs(timeframe))
        .filter((segment) => segment.length >= MIN_SEGMENT);

      for (const segment of segments) {
        // Structural series cost the same whether one variant or four read them, so they
        // are built once per segment and shared.
        const series = buildSeries(preset, segment, { structural: true });
        for (const variant of VARIANTS) {
          for (const triggerWindow of TRIGGER_WINDOWS) {
            const signals = buildSignals(preset, plan, segment, {
              signalMode: "all", series, triggerWindow,
              biasSource: variant.biasSource, triggerSource: variant.triggerSource
            });
            if (!signals.long.some(Boolean) && !signals.short.some(Boolean)) continue;
            for (const riskReward of RISK_REWARDS) {
              for (const exit of EXITS) {
                const trades = simulate(preset, segment, signals, {
                  riskReward, costPerSide: COST_PER_SIDE, ...exit.options
                });
                record(`${preset.presetId}|${timeframeId}|${variant.id}|w${triggerWindow}|${riskReward}|${exit.id}`, symbol, trades);
              }
            }
          }
        }
      }
    }
    done += 1;
    console.log(`  ${preset.presetId} @ ${timeframe.label} done (${done})`);
  }
}

const quarterStats = (quarters) => {
  const usable = [...quarters.values()].filter((bucket) => bucket.trades >= 10);
  const positive = usable.filter((bucket) => bucket.net_r > 0);
  return {
    quarters: usable.length,
    positive_quarters: positive.length,
    quarter_hit_rate: usable.length ? positive.length / usable.length : null
  };
};

const rows = [];
for (const [key, value] of buckets) {
  const parts = key.split("|");
  rows.push({
    preset: parts[0], timeframe: parts[1], variant: parts[2],
    trigger_window: Number(parts[3].slice(1)), risk_reward: Number(parts[4]), exit: parts[5],
    development: finish(value.development),
    validation: finish(value.validation),
    holdout: finish(value.holdout),
    quarters: quarterStats(value.quarters),
    by_symbol: Object.fromEntries([...value.bySymbol].map(([symbol, acc]) => [symbol, {
      ...finish(acc.total),
      development: finish(acc.development),
      validation: finish(acc.validation),
      holdout: finish(acc.holdout)
    }]))
  });
}

await mkdir(resultDirectory, { recursive: true });
const path = join(resultDirectory, REPORT_NAME);
await writeFile(path, `${JSON.stringify({
  generated_at: new Date().toISOString(),
  cost_per_side_percent: COST_PER_SIDE,
  symbols, partitions: PARTITIONS,
  timeframes: SWEEP_TIMEFRAMES,
  variants: VARIANTS.map((variant) => variant.id),
  trigger_windows: TRIGGER_WINDOWS, risk_rewards: RISK_REWARDS, exits: EXITS.map((exit) => exit.id),
  rows
}, null, 2)}\n`, "utf8");

// The headline comparison is variant against variant on identical settings, so the
// summary pairs each variant with the baseline rather than ranking everything together.
console.log(`\n${rows.length} configurations written to ${path}\n`);
console.log("Development expectancy by variant, averaged over identical settings:");
for (const variant of VARIANTS) {
  const own = rows.filter((row) => row.variant === variant.id && row.development.trades >= 150);
  if (!own.length) { console.log(`  ${variant.id.padEnd(16)} no configuration reached 150 development trades`); continue; }
  const mean = own.reduce((sum, row) => sum + row.development.expectancy_r, 0) / own.length;
  const positive = own.filter((row) => row.development.expectancy_r > 0).length;
  const trades = own.reduce((sum, row) => sum + row.development.trades, 0) / own.length;
  console.log(`  ${variant.id.padEnd(16)} ${String(own.length).padStart(4)} configs, mean ${mean >= 0 ? "+" : ""}${mean.toFixed(4)}R, ` +
    `${((positive / own.length) * 100).toFixed(0)}% positive, ${Math.round(trades)} trades each`);
}
