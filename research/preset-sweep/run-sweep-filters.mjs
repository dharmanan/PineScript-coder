// The filter thresholds were never measured. ADX 20-22, volume 1.0-1.5x, cooldown 5 bars
// and the ATR stop multiple are all hand-picked numbers that have been carried since the
// first version, and every sweep so far held them still while tuning everything around
// them. This sweeps the numbers themselves, one preset's own chart timeframe at a time.
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildBehaviorPlan, presets } from "./generated/preset-config.mjs";
import { TIMEFRAMES, aggregate, intervalMs, splitContiguous } from "./data.mjs";
import { loadAll, partitionOf, partitionsFor, quarterOf } from "./dataset.mjs";
import { buildSeries, buildSignals, simulate } from "./engine.mjs";

const directory = dirname(fileURLToPath(import.meta.url));
const resultDirectory = join(directory, "results");
const COST_PER_SIDE = Number(process.env.SWEEP_COST ?? 0.01);
const MIN_SEGMENT = 300;
const REPORT_NAME = process.argv.find((item) => item.startsWith("--out="))?.split("=")[1] ?? "preset-sweep-filters.json";
// "classic" selects on 2019-2022, "modern" on 2023-2024 with 2025 as validation. The 2026
// holdout is the same in both, so the two runs are directly comparable.
const LAYOUT = process.argv.find((item) => item.startsWith("--partitions="))?.split("=")[1] ?? "classic";
const PARTITIONS = partitionsFor(LAYOUT);

const ADX = [15, 20, 25, 30];
const VOLUME = [0.8, 1, 1.25, 1.5];
const COOLDOWN = [0, 3, 5, 10];
const ATR_MULTIPLE = [1.5, 2, 2.5, 3];
const RISK_REWARDS = [1.25, 1.5, 2, 3, 6];

const measurable = presets.filter(
  (preset) =>
    preset.direction !== "spot_buy_exit" &&
    preset.risk.stopMode !== "none" &&
    preset.risk.takeProfitMode !== "none"
);

const { bySymbol } = await loadAll();
const symbols = [...bySymbol.keys()].sort();
console.log(`Grid: ${measurable.length} presets x ${ADX.length} adx x ${VOLUME.length} volume x ${COOLDOWN.length} cooldown x ${ATR_MULTIPLE.length} atr x ${RISK_REWARDS.length} rr`);
console.log(`Layout ${LAYOUT}: development ${new Date(PARTITIONS.development.start).toISOString().slice(0,10)} -> ${new Date(PARTITIONS.development.endExclusive).toISOString().slice(0,10)}`);
console.log(`Each preset on its own chart timeframe. Commission ${COST_PER_SIDE}% per side.\n`);

const blank = () => ({ trades: 0, wins: 0, net_r: 0, profit: 0, loss: 0 });
const fold = (acc, trade) => {
  acc.trades += 1;
  acc.net_r += trade.netR;
  if (trade.netR > 0) { acc.wins += 1; acc.profit += trade.netR; } else { acc.loss += Math.abs(trade.netR); }
};
const finish = (acc) => ({
  trades: acc.trades, wins: acc.wins,
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
    own = { development: blank(), validation: blank(), holdout: blank() };
    entry.bySymbol.set(symbol, own);
  }
  for (const trade of trades) {
    const partition = partitionOf(trade.entryTimestamp, PARTITIONS);
    if (!partition) continue;
    fold(entry[partition], trade);
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
for (const preset of measurable) {
  const timeframe = TIMEFRAMES.find((item) => item.id === preset.chartTimeframe);
  if (!timeframe) continue;

  for (const symbol of symbols) {
    const segments = splitContiguous(aggregate(bySymbol.get(symbol), timeframe.factor), intervalMs(timeframe))
      .filter((segment) => segment.length >= MIN_SEGMENT);

    for (const segment of segments) {
      for (const atrMultiple of ATR_MULTIPLE) {
        // Only the stop distance depends on the ATR multiple, so the indicator series are
        // rebuilt once per multiple rather than once per combination.
        const risked = { ...preset, risk: { ...preset.risk, atrMultiple } };
        const series = buildSeries(risked, segment);

        for (const adxThreshold of ADX) {
          for (const multiplier of VOLUME) {
            for (const cooldownBars of COOLDOWN) {
              const config = {
                ...risked,
                momentum: { ...risked.momentum, adxThreshold },
                volume: { ...risked.volume, multiplier },
                execution: { ...risked.execution, cooldownBars }
              };
              const plan = buildBehaviorPlan(config);
              const signals = buildSignals(config, plan, segment, {
                signalMode: config.signalMode === "score" ? "score" : "all",
                scoreThreshold: config.scoreThreshold,
                series, triggerWindow: config.triggerWindow
              });
              if (!signals.long.some(Boolean) && !signals.short.some(Boolean)) continue;

              for (const riskReward of RISK_REWARDS) {
                const trades = simulate(config, segment, signals, { riskReward, costPerSide: COST_PER_SIDE });
                record(`${preset.presetId}|adx${adxThreshold}|vol${multiplier}|cd${cooldownBars}|atr${atrMultiple}|${riskReward}`, symbol, trades);
              }
            }
          }
        }
      }
    }
  }
  done += 1;
  console.log(`  ${preset.presetId} done (${done}/${measurable.length})`);
}

const quarterStats = (quarters) => {
  const usable = [...quarters.values()].filter((bucket) => bucket.trades >= 10);
  const positive = usable.filter((bucket) => bucket.net_r > 0);
  return { quarters: usable.length, quarter_hit_rate: usable.length ? positive.length / usable.length : null };
};

const rows = [];
for (const [key, value] of buckets) {
  const parts = key.split("|");
  rows.push({
    preset: parts[0],
    adx: Number(parts[1].slice(3)),
    volume: Number(parts[2].slice(3)),
    cooldown: Number(parts[3].slice(2)),
    atr_multiple: Number(parts[4].slice(3)),
    risk_reward: Number(parts[5]),
    development: finish(value.development),
    validation: finish(value.validation),
    holdout: finish(value.holdout),
    quarters: quarterStats(value.quarters),
    by_symbol: Object.fromEntries([...value.bySymbol].map(([symbol, acc]) => [symbol, {
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
  symbols, partitions: PARTITIONS, layout: LAYOUT,
  axes: { adx: ADX, volume: VOLUME, cooldown: COOLDOWN, atr_multiple: ATR_MULTIPLE, risk_rewards: RISK_REWARDS },
  rows
}, null, 2)}\n`, "utf8");

console.log(`\n${rows.length} configurations written to ${path}`);
