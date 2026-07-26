// Does entering inside the candle beat entering after it closed?
//
// Kohen found this on a SOL chart: price broke a resistance early inside a large hourly
// candle, and the indicator entered at the next hour's open — near the top of the move — and
// stopped out. The break was visible when it happened; the script only looked once the hour
// was over. Every number this project has produced describes that later entry, so this is not
// a tuning question, it is whether the entry model itself is wrong.
//
// Same preset, same candles, same filters, same stop and target. One difference: whether the
// entry is the next chart candle's open or the lower-timeframe close where the level broke.
//
// Usage: --preset=breakout_momentum [--partitions=july] [--profile=money|winrate]
import { buildBehaviorPlan, presets } from "./generated/preset-config.mjs";
import { TIMEFRAMES, aggregateWithGroups, intervalMs, splitContiguous } from "./data.mjs";
import { loadAll, partitionOf, partitionsFor } from "./dataset.mjs";
import { buildIntrabarSignals, buildSeries, buildSignals, simulate } from "./engine.mjs";

const arg = (name, fallback) => process.argv.find((item) => item.startsWith(`--${name}=`))?.split("=")[1] ?? fallback;
const target = arg("preset");
if (!target) throw new Error("Usage: --preset=<presetId> [--partitions=july] [--profile=money|winrate]");
const shipped = presets.find((item) => item.presetId === target);
if (!shipped) throw new Error(`Unknown preset: ${target}`);

const PARTITIONS = partitionsFor(arg("partitions", "july"));
const PERIODS = Object.keys(PARTITIONS);
const MIN_SEGMENT = 300;
const profileName = arg("profile", "money");

// The win-rate profile moves the reward target and the exit management, so it has to be
// applied here too — measuring the money profile and reporting it as the product would skip
// the half of the product most people will use.
const profile = shipped.winRateProfile;
const config = profileName === "winrate" && profile
  ? {
      ...shipped,
      signalMode: profile.signalMode, scoreThreshold: profile.scoreThreshold, triggerWindow: profile.triggerWindow,
      risk: {
        ...shipped.risk,
        riskReward: profile.riskReward, breakEvenAtR: profile.breakEvenAtR,
        trailStartR: profile.trailStartR, trailDistanceR: profile.trailDistanceR
      }
    }
  : shipped;

const { bySymbol } = await loadAll();
const symbols = [...bySymbol.keys()].sort();
const timeframe = TIMEFRAMES.find((item) => item.id === config.chartTimeframe);
if (!timeframe) throw new Error(`Unsupported chart timeframe: ${config.chartTimeframe}`);

const plan = buildBehaviorPlan(config);
const exits = {
  riskReward: config.risk.riskReward, costPerSide: 0.01,
  breakEvenAtR: config.risk.breakEvenAtR || null,
  trailStartR: config.risk.trailStartR || null,
  trailDistanceR: config.risk.trailDistanceR || null
};

const blank = () => Object.fromEntries(PERIODS.map((period) => [period, []]));
const chartClose = new Map(symbols.map((symbol) => [symbol, blank()]));
const intrabar = new Map(symbols.map((symbol) => [symbol, blank()]));
// How far the two entries sat apart, in units of the trade's own risk. This is the number
// that says whether the old model was merely late or badly late.
const slippage = [];

for (const symbol of symbols) {
  const { candles, groups } = aggregateWithGroups(bySymbol.get(symbol), timeframe.factor);
  const interval = intervalMs(timeframe);
  // splitContiguous works on candles alone, so the groups are carried along by timestamp.
  const groupAt = new Map(candles.map((candle, position) => [candle.timestamp, groups[position]]));

  for (const segment of splitContiguous(candles, interval).filter((part) => part.length >= MIN_SEGMENT)) {
    const segmentGroups = segment.map((candle) => groupAt.get(candle.timestamp) ?? []);
    const series = buildSeries(config, segment);

    const closeSignals = buildSignals(config, plan, segment, {
      signalMode: config.signalMode === "score" ? "score" : "all",
      scoreThreshold: config.scoreThreshold, series, triggerWindow: config.triggerWindow
    });
    for (const trade of simulate(config, segment, closeSignals, exits)) {
      const period = partitionOf(trade.entryTimestamp, PARTITIONS);
      if (period) chartClose.get(symbol)[period].push(trade.netR);
    }

    const { entries } = buildIntrabarSignals(config, plan, segment, segmentGroups, { series });
    for (const trade of simulate(config, segment, closeSignals, { ...exits, intrabarEntries: entries })) {
      const period = partitionOf(trade.entryTimestamp, PARTITIONS);
      if (period) intrabar.get(symbol)[period].push(trade.netR);
    }

    // Both models on the same candle: how much better was the price, measured in R.
    for (let index = 0; index + 1 < segment.length; index += 1) {
      const entry = entries[index];
      if (!entry) continue;
      const atr = series.atr[index - 1];
      if (!atr) continue;
      const risk = atr * config.risk.atrMultiple;
      const laterOpen = segment[index + 1].open;
      slippage.push(entry.direction === 1 ? (laterOpen - entry.price) / risk : (entry.price - laterOpen) / risk);
    }
  }
}

const stat = (values) => {
  if (!values.length) return null;
  const wins = values.filter((value) => value > 0).length;
  return { trades: values.length, winRate: wins / values.length, expectancy: values.reduce((a, b) => a + b, 0) / values.length };
};
const cell = (s) => (s ? `${String(s.trades).padStart(5)}t %${(s.winRate * 100).toFixed(1).padStart(5)} ${(s.expectancy >= 0 ? "+" : "") + s.expectancy.toFixed(3)}R` : "        —         ");
const totals = (source, period) => stat(symbols.flatMap((symbol) => source.get(symbol)[period]));

console.log(`${shipped.name} — GIRIS ANI: mum kapanisi vs mum ici`);
console.log(`${config.chartTimeframe}dk grafik, mum ici ${timeframe.factor} adet 5dk mum | profil: ${profileName} | rr ${config.risk.riskReward}`);
console.log(`Tetikleyici: ${plan.entry.trigger.id} | filtreler: ${plan.entry.filters.map((f) => f.id).join(", ")}\n`);

console.log(`  ${"".padEnd(16)} ${PERIODS.map((p) => p.padEnd(18)).join(" | ")}`);
console.log(`  ${"mum kapanisi".padEnd(16)} ${PERIODS.map((p) => cell(totals(chartClose, p))).join(" | ")}`);
console.log(`  ${"mum ici".padEnd(16)} ${PERIODS.map((p) => cell(totals(intrabar, p))).join(" | ")}`);

console.log("\nsembol sembol:");
for (const symbol of symbols) {
  console.log(`  ${symbol}`);
  console.log(`    ${"mum kapanisi".padEnd(14)} ${PERIODS.map((p) => cell(stat(chartClose.get(symbol)[p]))).join(" | ")}`);
  console.log(`    ${"mum ici".padEnd(14)} ${PERIODS.map((p) => cell(stat(intrabar.get(symbol)[p]))).join(" | ")}`);
}

const better = slippage.filter((value) => value > 0).length;
const average = slippage.reduce((left, right) => left + right, 0) / (slippage.length || 1);
console.log(`\nGiris fiyati farki, ${slippage.length} sinyalde:`);
console.log(`  mum ici girisin daha iyi oldugu oran: %${((100 * better) / (slippage.length || 1)).toFixed(1)}`);
console.log(`  ortalama kazanc: ${average >= 0 ? "+" : ""}${average.toFixed(3)}R islem basina`);
console.log("  (pozitif = mum ici giris daha iyi fiyat aldi, riskin kati olarak)");
