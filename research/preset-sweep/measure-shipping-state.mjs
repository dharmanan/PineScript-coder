// The shipping state of every preset, both profiles, every symbol, every period. This is
// the reference the review plan is built on: no search, no tuning, just what the product
// currently does, measured the same way for all of them.
//
// Output is written as markdown so the plan document can hold the numbers directly.
import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildBehaviorPlan, presets } from "./generated/preset-config.mjs";
import { TIMEFRAMES, aggregate, intervalMs, splitContiguous } from "./data.mjs";
import { loadAll, partitionOf, partitionsFor } from "./dataset.mjs";
import { buildSeries, buildSignals, simulate } from "./engine.mjs";

const PARTITIONS = partitionsFor("july");
const PERIODS = ["development", "validation", "holdout", "july"];
const LABELS = {
  development: "2019-2022",
  validation: "2023-2025",
  holdout: "2026 Oca-Haz",
  july: "2026 Temmuz"
};

const { bySymbol } = await loadAll();
const symbols = [...bySymbol.keys()].sort();

// The win-rate profile is applied the same way the compiler applies it: only the fields a
// profile is allowed to move, everything else stays as the preset ships.
const withWinRate = (preset) => {
  const profile = preset.winRateProfile;
  if (!profile) return null;
  return {
    ...preset,
    signalMode: profile.signalMode,
    scoreThreshold: profile.scoreThreshold,
    triggerWindow: profile.triggerWindow,
    risk: {
      ...preset.risk,
      riskReward: profile.riskReward,
      breakEvenAtR: profile.breakEvenAtR,
      trailStartR: profile.trailStartR,
      trailDistanceR: profile.trailDistanceR
    }
  };
};

const measure = (preset) => {
  const timeframe = TIMEFRAMES.find((item) => item.id === preset.chartTimeframe);
  if (!timeframe) return null;
  const plan = buildBehaviorPlan(preset);
  const perSymbol = new Map(symbols.map((symbol) => [symbol, Object.fromEntries(PERIODS.map((period) => [period, []]))]));

  for (const symbol of symbols) {
    const segments = splitContiguous(aggregate(bySymbol.get(symbol), timeframe.factor), intervalMs(timeframe))
      .filter((segment) => segment.length >= 300);
    for (const segment of segments) {
      const series = buildSeries(preset, segment);
      const signals = buildSignals(preset, plan, segment, {
        signalMode: preset.signalMode === "score" ? "score" : "all",
        scoreThreshold: preset.scoreThreshold, series, triggerWindow: preset.triggerWindow
      });
      for (const trade of simulate(preset, segment, signals, {
        riskReward: preset.risk.riskReward, costPerSide: 0.01,
        breakEvenAtR: preset.risk.breakEvenAtR || null,
        trailStartR: preset.risk.trailStartR || null,
        trailDistanceR: preset.risk.trailDistanceR || null
      })) {
        const period = partitionOf(trade.entryTimestamp, PARTITIONS);
        if (!period) continue;
        perSymbol.get(symbol)[period].push(trade.netR);
      }
    }
  }
  return { perSymbol };
};

const stat = (values) => {
  if (!values.length) return null;
  const wins = values.filter((value) => value > 0).length;
  return {
    trades: values.length,
    winRate: wins / values.length,
    expectancy: values.reduce((a, b) => a + b, 0) / values.length,
    net: values.reduce((a, b) => a + b, 0)
  };
};
const cell = (s) => (s ? `${s.trades}t · %${(s.winRate * 100).toFixed(1)} · ${(s.expectancy >= 0 ? "+" : "") + s.expectancy.toFixed(3)}R` : "—");

const measurable = presets.filter(
  (preset) => preset.direction !== "spot_buy_exit" && preset.risk.stopMode !== "none" && preset.risk.takeProfitMode !== "none"
);

const lines = [];
for (const preset of measurable) {
  const money = measure(preset);
  const winRateConfig = withWinRate(preset);
  const winRate = winRateConfig ? measure(winRateConfig) : null;
  if (!money) continue;

  lines.push(`### ${preset.name}\n`);
  lines.push(`\`${preset.presetId}\` · ${preset.chartTimeframe} dakika · tetikleyici penceresi ${preset.triggerWindow} · ATR×${preset.risk.atrMultiple}`);
  lines.push("");
  lines.push(`**Para profili:** risk/ödül ${preset.risk.riskReward}${preset.risk.breakEvenAtR ? `, başabaş ${preset.risk.breakEvenAtR}R` : ""}${preset.risk.trailStartR ? `, trailing ${preset.risk.trailStartR}/${preset.risk.trailDistanceR}` : ""}`);
  if (winRateConfig) {
    lines.push(`**İsabet profili:** risk/ödül ${winRateConfig.risk.riskReward}${winRateConfig.risk.trailStartR ? `, trailing ${winRateConfig.risk.trailStartR}/${winRateConfig.risk.trailDistanceR}` : ""}${winRateConfig.signalMode === "score" ? `, skor ${winRateConfig.scoreThreshold}` : ""}, pencere ${winRateConfig.triggerWindow}`);
  }
  lines.push("");
  // Rule 1: no pooled row. One line per symbol, every period on it, for each profile in turn.
  for (const [title, result] of [["Para profili", money], ["İsabet profili", winRate]]) {
    if (!result) continue;
    lines.push(`**${title}** — her sembol ayrı, sembolleri toplayan bir satır yok:`);
    lines.push("");
    lines.push(`| Sembol | ${PERIODS.map((period) => LABELS[period]).join(" | ")} |`);
    lines.push(`|---|${PERIODS.map(() => "---").join("|")}|`);
    for (const symbol of symbols) {
      lines.push(`| ${symbol} | ${PERIODS.map((period) => cell(stat(result.perSymbol.get(symbol)[period]))).join(" | ")} |`);
    }
    lines.push("");
  }
  lines.push("");
}

const path = join(dirname(fileURLToPath(import.meta.url)), "shipping-state.md");
await writeFile(path, `${lines.join("\n")}\n`, "utf8");
console.log(`Written to ${path}`);
console.log(lines.join("\n"));
