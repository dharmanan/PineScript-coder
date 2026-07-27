// Prepares one preset's review: the two shipping profiles plus the reward targets worth
// trying, each measured on the preset's own chart timeframe, per symbol, on both the
// 2026 holdout and the unseen July data. Selection stays the user's; this only lays out
// what the alternatives actually did so a chart session tests the right two or three.
import { buildBehaviorPlan, presets } from "./generated/preset-config.mjs";
import { TIMEFRAMES, aggregate, intervalMs, splitContiguous } from "./data.mjs";
import { loadAll, partitionOf, partitionsFor } from "./dataset.mjs";
import { buildSeries, buildSignals, simulate } from "./engine.mjs";

const target = process.argv.find((item) => item.startsWith("--preset="))?.split("=")[1];
if (!target) throw new Error("Usage: --preset=<presetId>");
const base = presets.find((item) => item.presetId === target);
if (!base) throw new Error(`Unknown preset: ${target}`);

const PARTITIONS = partitionsFor("july");
const { bySymbol } = await loadAll();
const symbols = [...bySymbol.keys()].sort();
const timeframe = TIMEFRAMES.find((item) => item.id === base.chartTimeframe);

const measure = (config) => {
  const plan = buildBehaviorPlan(config);
  const per = new Map(symbols.map((symbol) => [symbol, { holdout: [], july: [] }]));
  for (const symbol of symbols) {
    const segments = splitContiguous(aggregate(bySymbol.get(symbol), timeframe.factor), intervalMs(timeframe))
      .filter((segment) => segment.length >= 300);
    for (const segment of segments) {
      const series = buildSeries(config, segment);
      const signals = buildSignals(config, plan, segment, {
        signalMode: config.signalMode === "score" ? "score" : "all",
        scoreThreshold: config.scoreThreshold, series, triggerWindow: config.triggerWindow
      });
      for (const trade of simulate(config, segment, signals, {
        riskReward: config.risk.riskReward, costPerSide: 0.01,
        breakEvenAtR: config.risk.breakEvenAtR || null,
        trailStartR: config.risk.trailStartR || null,
        trailDistanceR: config.risk.trailDistanceR || null
      })) {
        const period = partitionOf(trade.entryTimestamp, PARTITIONS);
        if (period !== "holdout" && period !== "july") continue;
        per.get(symbol)[period].push(trade.netR);
      }
    }
  }
  return { per };
};

const stat = (values) => {
  if (!values.length) return null;
  const wins = values.filter((value) => value > 0).length;
  return { trades: values.length, winRate: wins / values.length, expectancy: values.reduce((a, b) => a + b, 0) / values.length };
};
const cell = (s) => (s ? `${String(s.trades).padStart(4)}t %${(s.winRate * 100).toFixed(1).padStart(5)} ${(s.expectancy >= 0 ? "+" : "") + s.expectancy.toFixed(3)}R` : "     —          ");

const profile = base.winRateProfile;
const withWinRate = (overrides = {}) => ({
  ...base,
  signalMode: profile.signalMode, scoreThreshold: profile.scoreThreshold,
  triggerWindow: overrides.triggerWindow ?? profile.triggerWindow,
  risk: {
    ...base.risk,
    riskReward: overrides.riskReward ?? profile.riskReward,
    breakEvenAtR: overrides.breakEvenAtR ?? profile.breakEvenAtR,
    trailStartR: overrides.trailStartR ?? profile.trailStartR,
    trailDistanceR: overrides.trailDistanceR ?? profile.trailDistanceR
  }
});

const candidates = [
  { id: `PARA (su anki, rr ${base.risk.riskReward})`, config: base },
  { id: `ISABET (su anki, rr ${profile.riskReward})`, config: withWinRate() }
];
for (const rr of [1.25, 1.5, 2, 3]) {
  if (rr === profile.riskReward) continue;
  candidates.push({ id: `alternatif: rr ${rr}, trailing yok`, config: withWinRate({ riskReward: rr, trailStartR: 0 }) });
  candidates.push({ id: `alternatif: rr ${rr}, trailing 1.5/1`, config: withWinRate({ riskReward: rr, trailStartR: 1.5, trailDistanceR: 1 }) });
}

console.log(`${base.name} · ${base.chartTimeframe} dakika · pencere ${profile.triggerWindow} · ATR×${base.risk.atrMultiple}\n`);
for (const candidate of candidates) {
  const result = measure(candidate.config);
  const holdPos = symbols.filter((s) => { const x = stat(result.per.get(s).holdout); return x && x.trades >= 15 && x.expectancy > 0; });
  const holdUsable = symbols.filter((s) => (stat(result.per.get(s).holdout)?.trades ?? 0) >= 15);
  console.log(`${candidate.id}`);
  // Rule 1: no pooled line. Each symbol carries its own holdout and July.
  for (const symbol of symbols) {
    const r = result.per.get(symbol);
    console.log(`   ${symbol.replace(/USDT?$/, "").padEnd(5)} 2026 Oca-Haz ${cell(stat(r.holdout))}  |  TEMMUZ ${cell(stat(r.july))}`);
  }
  console.log(`   holdout ${holdPos.length}/${holdUsable.length} sembol okunabilir ornekle artida`);
}
