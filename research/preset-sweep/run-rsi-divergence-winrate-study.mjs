// RSI Divergence Reversal: development-selected high-win-rate study.
//
// The isolated structure pass found two useful but incomplete facts:
//   - 5m multiplies the sample and is near break-even in validation.
//   - RSI 7 raises both hit rate and trade count on every symbol in development.
// This study measures those frozen structure hypotheses against exit shapes that can
// actually serve a win-rate profile. It never executes a 2026 candle and never pools symbols.
//
// Usage:
//   safe-node research/preset-sweep/run-rsi-divergence-winrate-study.mjs
import { buildBehaviorPlan, presets } from "./generated/preset-config.mjs";
import { TIMEFRAMES, aggregate, intervalMs, splitContiguous } from "./data.mjs";
import { loadAll, partitionOf } from "./dataset.mjs";
import { buildSeries, buildSignals, simulate } from "./engine.mjs";
import { cell, stat } from "./report.mjs";

const shipped = presets.find((item) => item.presetId === "rsi_divergence_reversal");
if (!shipped) throw new Error("RSI Divergence Reversal preset is missing");

const PARTITIONS = Object.freeze({
  development: {
    start: Date.parse("2023-01-01T00:00:00Z"),
    endExclusive: Date.parse("2025-01-01T00:00:00Z")
  },
  validation: {
    start: Date.parse("2025-01-01T00:00:00Z"),
    endExclusive: Date.parse("2026-01-01T00:00:00Z")
  }
});
const END_EXCLUSIVE = PARTITIONS.validation.endExclusive;
const MIN_SEGMENT = 300;

const structure = (id, label, changes = {}) => ({
  id,
  label,
  config: {
    ...shipped,
    ...changes,
    momentum: { ...shipped.momentum, ...(changes.momentum ?? {}) },
    risk: { ...shipped.risk, ...(changes.risk ?? {}) },
    execution: { ...shipped.execution, ...(changes.execution ?? {}) }
  }
});

const STRUCTURES = [
  structure("30m", "30m referans"),
  structure("30m-rsi7", "30m + RSI 7", { momentum: { rsiLength: 7 } }),
  structure("15m", "15m", { chartTimeframe: "15" }),
  structure("15m-rsi7", "15m + RSI 7", { chartTimeframe: "15", momentum: { rsiLength: 7 } }),
  structure("5m", "5m", { chartTimeframe: "5" }),
  structure("5m-rsi7", "5m + RSI 7", { chartTimeframe: "5", momentum: { rsiLength: 7 } }),
  structure("5m-rsi7-atr1.5", "5m + RSI 7 + ATR 1.5", {
    chartTimeframe: "5",
    momentum: { rsiLength: 7 },
    risk: { atrMultiple: 1.5 }
  })
];

const REWARDS = [1, 1.25, 1.5, 2, 2.5, 3.5];
const EXITS = [
  { id: "plain", label: "trailing yok", breakEvenAtR: null, trailStartR: null, trailDistanceR: null },
  { id: "trail-1-0.5", label: "trail 1/0.5", breakEvenAtR: null, trailStartR: 1, trailDistanceR: 0.5 },
  { id: "trail-1.5-1", label: "trail 1.5/1", breakEvenAtR: null, trailStartR: 1.5, trailDistanceR: 1 },
  { id: "trail-2-1.5", label: "trail 2/1.5", breakEvenAtR: null, trailStartR: 2, trailDistanceR: 1.5 },
  { id: "be-1", label: "başabaş 1R", breakEvenAtR: 1, trailStartR: null, trailDistanceR: null }
];

const { bySymbol } = await loadAll();
const symbols = [...bySymbol.keys()].sort();
let activeTimeframe = null;
let activeWindows = null;

const windowsFor = (timeframeId) => {
  if (activeTimeframe === timeframeId && activeWindows) return activeWindows;
  const timeframe = TIMEFRAMES.find((item) => item.id === timeframeId);
  if (!timeframe) throw new Error(`Unsupported timeframe: ${timeframeId}`);
  const built = new Map(symbols.map((symbol) => [
    symbol,
    splitContiguous(
      aggregate(bySymbol.get(symbol), timeframe.factor)
        .filter((candle) => candle.timestamp < END_EXCLUSIVE),
      intervalMs(timeframe)
    ).filter((segment) => segment.length >= MIN_SEGMENT)
  ]));
  activeTimeframe = timeframeId;
  activeWindows = built;
  return built;
};

const contextsFor = (item) => {
  const config = item.config;
  const plan = buildBehaviorPlan(config);
  return new Map(symbols.map((symbol) => [
    symbol,
    windowsFor(config.chartTimeframe).get(symbol).map((candles) => {
      const series = buildSeries(config, candles);
      const signals = buildSignals(config, plan, candles, {
        signalMode: "all",
        triggerWindow: config.triggerWindow,
        series
      });
      return { candles, signals };
    })
  ]));
};

const measure = (item, contexts, reward, exit) => {
  const values = new Map(symbols.map((symbol) => [
    symbol,
    { development: [], validation: [] }
  ]));
  for (const symbol of symbols) {
    for (const context of contexts.get(symbol)) {
      const trades = simulate(item.config, context.candles, context.signals, {
        riskReward: reward,
        costPerSide: 0.01,
        breakEvenAtR: exit.breakEvenAtR,
        trailStartR: exit.trailStartR,
        trailDistanceR: exit.trailDistanceR
      });
      for (const trade of trades) {
        const period = partitionOf(trade.entryTimestamp, PARTITIONS);
        if (period) values.get(symbol)[period].push(trade.netR);
      }
    }
  }
  return {
    perSymbol: new Map(symbols.map((symbol) => [
      symbol,
      {
        development: stat(values.get(symbol).development),
        validation: stat(values.get(symbol).validation)
      }
    ]))
  };
};

const rankFor = (result, period) => {
  const values = symbols.map((symbol) => result.perSymbol.get(symbol)[period]);
  return {
    positive: values.filter((item) => item?.expectancy > 0).length,
    minWinRate: Math.min(...values.map((item) => item?.winRate ?? 0)),
    minTrades: Math.min(...values.map((item) => item?.trades ?? 0)),
    minExpectancy: Math.min(...values.map((item) => item?.expectancy ?? Number.NEGATIVE_INFINITY))
  };
};

const compareRank = (left, right) =>
  right.development.positive - left.development.positive ||
  right.development.minWinRate - left.development.minWinRate ||
  right.development.minTrades - left.development.minTrades ||
  right.development.minExpectancy - left.development.minExpectancy;

const print = (candidate, period) => {
  console.log(
    `\n${candidate.structure.label} · rr ${candidate.reward} · ${candidate.exit.label} — ${period}`
  );
  for (const symbol of symbols) {
    console.log(`  ${symbol.replace("USDT", "").padEnd(4)} ${cell(candidate.result.perSymbol.get(symbol)[period])}`);
  }
};

console.log("RSI DIVERGENCE REVERSAL — WIN-RATE YAPI + CIKIS CALISMASI");
console.log("2026 mumlari calistirilmiyor. Secim yalniz 2023-2024 development.\n");

const candidates = [];
for (const item of STRUCTURES) {
  console.log(`Sinyaller hazirlaniyor: ${item.label}`);
  const contexts = contextsFor(item);
  for (const reward of REWARDS) {
    for (const exit of EXITS) {
      const result = measure(item, contexts, reward, exit);
      candidates.push({
        structure: item,
        reward,
        exit,
        result,
        development: rankFor(result, "development")
      });
    }
  }
}

const finalists = candidates.sort(compareRank).slice(0, 16);

console.log("\nDEVELOPMENT SECIMI — ilk 16");
for (const candidate of finalists) {
  const rank = candidate.development;
  console.log(
    `\nartida ${rank.positive}/4 · min isabet %${(100 * rank.minWinRate).toFixed(1)} · ` +
    `min islem ${rank.minTrades} · min beklenti ${rank.minExpectancy.toFixed(3)}R`
  );
  print(candidate, "development");
}

console.log("\nDOGRULAMA — yalniz development finalistleri");
for (const candidate of finalists) {
  candidate.validation = rankFor(candidate.result, "validation");
  print(candidate, "validation");
  console.log(
    `  => artida ${candidate.validation.positive}/4 · ` +
    `min isabet %${(100 * candidate.validation.minWinRate).toFixed(1)} · ` +
    `min islem ${candidate.validation.minTrades} · ` +
    `min beklenti ${candidate.validation.minExpectancy.toFixed(3)}R`
  );
}

console.log("\n2026 KAPALI");
console.log("Bir yapı ve çıkış çifti doğrulamayı geçmeden 2026 çalıştırılmaz.");
