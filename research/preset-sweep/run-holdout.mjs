import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildBehaviorPlan, presets } from "./generated/preset-config.mjs";
import { parseArchiveCsv, sha256File } from "../regime-trend-v1/five-minute-data-tools.mjs";
import { TIMEFRAMES, aggregate, intervalMs, splitContiguous } from "./data.mjs";
import { buildSignals, simulate, summarize } from "./engine.mjs";

// One-shot test of the settings that are actually shipped in lib/presets.ts against
// 2025, a year that took no part in choosing them. Nothing here selects anything: the
// configuration is read from the product, not searched for.
const directory = dirname(fileURLToPath(import.meta.url));
const root = join(directory, "data-holdout");
const COST_PER_SIDE = Number(process.env.SWEEP_COST ?? 0.01);
const MIN_SEGMENT = 300;

async function loadSymbol(symbol, manifest) {
  const entries = manifest.files
    .filter((entry) => entry.symbol === symbol)
    .sort((left, right) => left.month.localeCompare(right.month));
  const candles = [];
  for (const entry of entries) {
    const path = join(root, "csv", entry.file);
    if ((await sha256File(path)) !== entry.csv_sha256) throw new Error(`CSV SHA-256 mismatch: ${entry.file}`);
    candles.push(...parseArchiveCsv(await readFile(path, "utf8")));
  }
  candles.sort((left, right) => left.timestamp - right.timestamp);
  return candles;
}

// Both candidate setting tables were selected on 2019-2022 development data and written
// down before the holdout was downloaded. "shipped" is what lib/presets.ts carries, which
// maximises win rate; "earning" maximises expectancy. Reporting only one would be a
// post-hoc choice, so the runner can produce either and both are published together.
const EARNING = {
  selective_multi_timeframe: { timeframe: "60", signalMode: "score", scoreThreshold: 85, riskReward: 3.5 },
  balanced_intraday: { timeframe: "60", signalMode: "all_filters", scoreThreshold: 60, riskReward: 3 },
  long_term_trend_guard: { timeframe: "30", signalMode: "score", scoreThreshold: 60, riskReward: 4 },
  vwap_session_trader: { timeframe: "60", signalMode: "all_filters", scoreThreshold: 60, riskReward: 2 },
  swing_trend_4h: { timeframe: "60", signalMode: "score", scoreThreshold: 75, riskReward: 3 },
  supertrend_volume: { timeframe: "60", signalMode: "all_filters", scoreThreshold: 60, riskReward: 2 },
  breakout_momentum: { timeframe: "60", signalMode: "score", scoreThreshold: 75, riskReward: 4 },
  fast_ema_scalper: { timeframe: "30", signalMode: "score", scoreThreshold: 75, riskReward: 4 },
  rsi_divergence_reversal: { timeframe: "60", signalMode: "score", scoreThreshold: 60, riskReward: 1 }
};

const profile = process.argv.includes("--profile=earning") ? "earning" : "shipped";
const applyProfile = (preset) => {
  if (profile !== "earning") return preset;
  const override = EARNING[preset.presetId];
  if (!override) return preset;
  return {
    ...preset,
    chartTimeframe: override.timeframe,
    signalMode: override.signalMode,
    scoreThreshold: override.scoreThreshold,
    risk: { ...preset.risk, riskReward: override.riskReward }
  };
};

const manifest = JSON.parse(await readFile(join(root, "holdout-manifest.json"), "utf8"));
const symbols = manifest.symbols;
const measurable = presets.map(applyProfile).filter(
  (preset) =>
    preset.direction !== "spot_buy_exit" &&
    preset.risk.stopMode !== "none" &&
    preset.risk.takeProfitMode !== "none"
);

console.log(`Final holdout: ${manifest.requested_start} -> ${manifest.requested_end_exclusive}`);
console.log(`Profile: ${profile === "earning" ? "earning (development-selected max expectancy)" : "shipped (lib/presets.ts, development-selected max win rate)"}. Commission ${COST_PER_SIDE}% per side.\n`);

const loaded = new Map();
for (const symbol of symbols) loaded.set(symbol, await loadSymbol(symbol, manifest));

const rows = [];
for (const preset of measurable) {
  const timeframe = TIMEFRAMES.find((item) => item.id === preset.chartTimeframe);
  if (!timeframe) {
    console.log(`${preset.presetId}: chart timeframe ${preset.chartTimeframe} is outside the sweep grid, skipped`);
    continue;
  }
  const plan = buildBehaviorPlan(preset);
  const options = preset.signalMode === "score"
    ? { signalMode: "score", scoreThreshold: preset.scoreThreshold }
    : { signalMode: "all" };

  const perSymbol = {};
  const all = [];
  for (const symbol of symbols) {
    const candles = aggregate(loaded.get(symbol), timeframe.factor);
    const trades = [];
    for (const segment of splitContiguous(candles, intervalMs(timeframe))) {
      if (segment.length < MIN_SEGMENT) continue;
      const signals = buildSignals(preset, plan, segment, options);
      trades.push(...simulate(preset, segment, signals, { riskReward: preset.risk.riskReward, costPerSide: COST_PER_SIDE }));
    }
    perSymbol[symbol] = summarize(trades);
    all.push(...trades);
  }
  rows.push({ preset, timeframe, metrics: summarize(all), perSymbol });
}

rows.sort((left, right) => (right.metrics.expectancy_r ?? -Infinity) - (left.metrics.expectancy_r ?? -Infinity));

const pct = (value) => (value === null ? "  n/a" : `${(100 * value).toFixed(1)}%`);
console.log("preset                       tf  mode        rr   trades   win     expectancy      net");
console.log("-".repeat(88));
for (const row of rows) {
  const m = row.metrics;
  const mode = row.preset.signalMode === "score" ? `score-${row.preset.scoreThreshold}` : "all";
  console.log(
    `${row.preset.presetId.padEnd(27)} ${row.preset.chartTimeframe.padStart(3)} ${mode.padEnd(11)} ` +
    `${String(row.preset.risk.riskReward).padStart(3)} ${String(m.trades).padStart(7)}  ${pct(m.win_rate)}  ` +
    `${(m.expectancy_r ?? 0).toFixed(4).padStart(9)}R ${(m.net_r).toFixed(1).padStart(9)}R`
  );
}

const totals = rows.reduce(
  (sum, row) => ({ trades: sum.trades + row.metrics.trades, wins: sum.wins + row.metrics.wins, net: sum.net + row.metrics.net_r }),
  { trades: 0, wins: 0, net: 0 }
);
console.log("-".repeat(88));
console.log(
  `${"ALL PRESETS".padEnd(27)}                     ${String(totals.trades).padStart(7)}  ` +
  `${pct(totals.trades ? totals.wins / totals.trades : null)}  ${(totals.net / totals.trades).toFixed(4).padStart(9)}R ${totals.net.toFixed(1).padStart(9)}R`
);

console.log("\nPer symbol, positive presets only:");
for (const row of rows.filter((item) => item.metrics.expectancy_r > 0)) {
  const parts = symbols.map((symbol) => {
    const m = row.perSymbol[symbol];
    return `${symbol.replace("USDT", "")} ${String(m.trades).padStart(4)}t ${pct(m.win_rate)} ${m.expectancy_r === null ? " n/a" : m.expectancy_r.toFixed(3)}R`;
  });
  console.log(`  ${row.preset.presetId.padEnd(27)} ${parts.join("  |  ")}`);
}
