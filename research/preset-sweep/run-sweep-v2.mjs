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

// Five minutes was dropped from the first sweep before the trigger window, trailing
// stops and high reward targets existed, so it was never tested in its current form.
const argTimeframes = process.argv.find((item) => item.startsWith("--timeframes="));
const SWEEP_TIMEFRAMES = argTimeframes ? argTimeframes.split("=")[1].split(",") : ["30", "60"];
const REPORT_NAME = process.argv.find((item) => item.startsWith("--out="))?.split("=")[1] ?? "preset-sweep-v2-report.json";
const SIGNAL_MODES = [
  { id: "all", options: { signalMode: "all" } },
  { id: "score-75", options: { signalMode: "score", scoreThreshold: 75 } },
  { id: "score-85", options: { signalMode: "score", scoreThreshold: 85 } }
];
const TRIGGER_WINDOWS = [1, 3, 5, 10];
// Reward targets below 2 were never swept before, which quietly put every hit rate above
// roughly 50% out of reach: break-even hit rate is 1/(1+rr), so a 60% hit rate needs a
// target under 0.75R to have anywhere to live. Overridable so that band can be measured.
const argRr = process.argv.find((item) => item.startsWith("--rr="));
const RISK_REWARDS = argRr ? argRr.split("=")[1].split(",").map(Number) : [2, 2.5, 3, 3.5, 4, 5, 6];
const EXITS = [
  { id: "plain", options: {} },
  { id: "be-1.0", options: { breakEvenAtR: 1 } },
  { id: "be-1.5", options: { breakEvenAtR: 1.5 } },
  { id: "trail-1.5/1.0", options: { trailStartR: 1.5, trailDistanceR: 1 } },
  { id: "trail-2.0/1.5", options: { trailStartR: 2, trailDistanceR: 1.5 } },
  { id: "be-1.0+trail-2.0/1.5", options: { breakEvenAtR: 1, trailStartR: 2, trailDistanceR: 1.5 } }
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
for (const symbol of symbols) {
  const candles = bySymbol.get(symbol);
  console.log(`  ${symbol}: ${candles.length.toLocaleString()} five-minute candles, ` +
    `${new Date(candles[0].timestamp).toISOString().slice(0, 10)} -> ${new Date(candles.at(-1).timestamp).toISOString().slice(0, 10)}`);
}
console.log(`\nGrid: ${measurable.length} presets x ${SWEEP_TIMEFRAMES.length} tf x ${SIGNAL_MODES.length} modes ` +
  `x ${TRIGGER_WINDOWS.length} windows x ${RISK_REWARDS.length} rr x ${EXITS.length} exits`);
console.log(`Commission ${COST_PER_SIDE}% per side. Holdout ${new Date(PARTITIONS.holdout.start).toISOString().slice(0, 10)} onward stays closed.\n`);

// Nine thousand configurations cannot each keep their trades in memory, so every result
// is folded into running counters as it is produced. Nothing is stored that the report
// does not print.
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
  gross_r: acc.gross_r,
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
  // Symbols are kept split by partition as well as in total, because a total hides the
  // case the user cares about: one symbol carrying a configuration that the others sink.
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
        const series = buildSeries(preset, segment);
        for (const mode of SIGNAL_MODES) {
          for (const triggerWindow of TRIGGER_WINDOWS) {
            const signals = buildSignals(preset, plan, segment, { ...mode.options, series, triggerWindow });
            if (!signals.long.some(Boolean) && !signals.short.some(Boolean)) continue;
            for (const riskReward of RISK_REWARDS) {
              for (const exit of EXITS) {
                const trades = simulate(preset, segment, signals, {
                  riskReward, costPerSide: COST_PER_SIDE, ...exit.options
                });
                record(`${preset.presetId}|${timeframeId}|${mode.id}|w${triggerWindow}|${riskReward}|${exit.id}`, symbol, trades);
              }
            }
          }
        }
      }
    }
    done += 1;
    console.log(`  ${preset.presetId} @ ${timeframe.label} done (${done} preset-timeframes)`);
  }
}

// A configuration is only interesting if it works in most periods, not if one quarter
// carried it. Symbols in this market are near-copies of each other, so time is the only
// axis along which the evidence is close to independent.
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
    preset: parts[0], timeframe: parts[1], signal_mode: parts[2],
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
  timeframes: SWEEP_TIMEFRAMES, signal_modes: SIGNAL_MODES.map((mode) => mode.id),
  trigger_windows: TRIGGER_WINDOWS, risk_rewards: RISK_REWARDS, exits: EXITS.map((exit) => exit.id),
  holdout_opened: false,
  rows
}, null, 2)}\n`, "utf8");

// Selection uses development only, and the pre-registered gate is quarter consistency.
const eligible = rows.filter((row) =>
  row.development.trades >= 150 &&
  row.development.expectancy_r > 0 &&
  row.quarters.quarters >= 8 &&
  row.quarters.quarter_hit_rate >= 0.6
);
eligible.sort((left, right) => right.development.expectancy_r - left.development.expectancy_r);

console.log(`\n${rows.length} configurations, ${eligible.length} pass the development gate (>=150 trades, positive, >=60% of quarters positive)`);
console.log("\nTop 20 by development expectancy (validation shown, never used to rank):");
for (const row of eligible.slice(0, 20)) {
  const d = row.development;
  const v = row.validation;
  console.log(
    `${row.preset.padEnd(26)} ${row.timeframe.padStart(2)}m ${row.signal_mode.padEnd(8)} w${String(row.trigger_window).padEnd(2)} ` +
    `rr=${String(row.risk_reward).padEnd(3)} ${row.exit.padEnd(20)} | ` +
    `dev ${String(d.trades).padStart(5)}t ${(100 * d.win_rate).toFixed(1).padStart(5)}% ${d.expectancy_r.toFixed(4).padStart(8)}R ` +
    `q${(100 * row.quarters.quarter_hit_rate).toFixed(0).padStart(3)}% | ` +
    `val ${String(v.trades).padStart(5)}t ${v.trades ? (100 * v.win_rate).toFixed(1).padStart(5) : "  n/a"}% ${v.trades ? v.expectancy_r.toFixed(4).padStart(8) : "     n/a"}R`
  );
}
console.log(`\nReport written to ${path}`);
