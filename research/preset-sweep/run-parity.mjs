import { buildBehaviorPlan, presets } from "./generated/preset-config.mjs";
import { TIMEFRAMES, aggregate, intervalMs, splitContiguous } from "./data.mjs";
import { loadAll } from "./dataset.mjs";
import { buildSignals, simulate, summarize, timeframeMinutes } from "./engine.mjs";

// Compares one exact configuration over one exact date window, so a TradingView
// panel reading and the sweep can be held against the same candles.
const args = Object.fromEntries(
  process.argv.slice(2)
    .filter((item) => item.startsWith("--"))
    .map((item) => {
      const [key, ...rest] = item.slice(2).split("=");
      return [key, rest.join("=")];
    })
);

const need = (key) => {
  if (!args[key]) throw new Error(`Missing --${key}`);
  return args[key];
};

const presetId = need("preset");
const timeframeId = need("timeframe");
const symbol = need("symbol");
const costPerSide = Number(args.cost ?? 0.01);
const from = Date.parse(`${need("from")}T00:00:00.000Z`);
const toExclusive = Date.parse(`${need("to")}T00:00:00.000Z`);

const base = presets.find((item) => item.presetId === presetId);
if (!base) throw new Error(`Unknown preset: ${presetId}`);
// A parity run does not have to use the recommended setting; it only has to use the
// same setting on both sides. Raising the higher timeframe lets a preset be checked
// on a chart the data provider can actually reach.
let preset = args.htf
  ? { ...base, higherTimeframe: { ...base.higherTimeframe, timeframe: args.htf } }
  : base;
// Wick or close confirmation changes how often a stop fires, which at a high reward
// target is the difference between a winner and a loser, so it must be selectable.
if (args.stopTrigger) preset = { ...preset, risk: { ...preset.risk, stopTrigger: args.stopTrigger } };
const timeframe = TIMEFRAMES.find((item) => item.id === timeframeId);
if (!timeframe) throw new Error(`Unknown timeframe: ${timeframeId}`);

// The product refuses a higher timeframe that is not above the chart timeframe,
// so the sweep must refuse it too rather than measure something unshippable.
if (preset.higherTimeframe.enabled) {
  const chart = timeframeMinutes(timeframe.id);
  const higher = timeframeMinutes(preset.higherTimeframe.timeframe);
  if (chart !== null && higher !== null && higher <= chart) {
    throw new Error(
      `${presetId} uses a ${preset.higherTimeframe.timeframe} higher timeframe, which is not above a ${timeframe.label} chart`
    );
  }
}

// Everything defaults to what the preset ships, so a parity run measures the product
// rather than a hand-assembled configuration. Flags exist only to explore alternatives.
const mode = args.mode ?? (preset.signalMode === "score" ? `score-${preset.scoreThreshold}` : "all");
const riskReward = Number(args.rr ?? preset.risk.riskReward);
const triggerWindow = Number(args.window ?? preset.triggerWindow);
const exitOptions = {
  breakEvenAtR: Number(args.be ?? preset.risk.breakEvenAtR) || null,
  trailStartR: Number(args.trailStart ?? preset.risk.trailStartR) || null,
  trailDistanceR: Number(args.trailDistance ?? preset.risk.trailDistanceR)
};
const signalOptions = mode === "all"
  ? { signalMode: "all", triggerWindow }
  : { signalMode: "score", scoreThreshold: Number(mode.replace("score-", "")), triggerWindow };

// The engine grew a limit-pullback entry path, and a path the engine can run but parity has
// never checked is a path whose numbers mean nothing. These flags exist so the same limit
// order can be set on both sides — engine here, "Entry type: Limit (pullback)" on the chart —
// and the two readings held against each other.
const entryOptions = {
  entryType: args.entryType ?? "market",
  limitPullback: Number(args.limitPullback ?? 0.5),
  limitExpiryBars: Number(args.limitExpiry ?? 5)
};
if (!["market", "limit"].includes(entryOptions.entryType)) {
  throw new Error(`--entryType must be market or limit, got ${entryOptions.entryType}`);
}

// Reads every downloaded source, so a parity window can sit anywhere in 2019-2026.
const { bySymbol } = await loadAll();
const fiveMinute = bySymbol.get(symbol);
if (!fiveMinute) throw new Error(`No data for ${symbol}. Available: ${[...bySymbol.keys()].join(", ")}`);
const candles = aggregate(fiveMinute, timeframe.factor);
const segments = splitContiguous(candles, intervalMs(timeframe)).filter((segment) => segment.length >= 300);
const plan = buildBehaviorPlan(preset);

// Indicators still warm up on the full history; only the trades are windowed, so
// a run over a short window is not handicapped by a cold start.
const trades = [];
for (const segment of segments) {
  const signals = buildSignals(preset, plan, segment, signalOptions);
  for (const trade of simulate(preset, segment, signals, { riskReward, costPerSide, ...exitOptions, ...entryOptions })) {
    if (trade.entryTimestamp >= from && trade.entryTimestamp < toExclusive) trades.push(trade);
  }
}

const metrics = summarize(trades);
const iso = (value) => new Date(value).toISOString().slice(0, 16).replace("T", " ");

const stopNote = ` | stop=${preset.risk.stopTrigger}`;
const htfNote = preset.higherTimeframe.enabled ? ` | htf=${preset.higherTimeframe.timeframe}` : "";
const exitNote = exitOptions.trailStartR ? ` | trail ${exitOptions.trailStartR}/${exitOptions.trailDistanceR}` : exitOptions.breakEvenAtR ? ` | be ${exitOptions.breakEvenAtR}` : "";
const entryNote = entryOptions.entryType === "limit"
  ? ` | entry=limit ${entryOptions.limitPullback}xR, expires ${entryOptions.limitExpiryBars} bars`
  : " | entry=market";
console.log(`${presetId} | ${symbol} | ${timeframe.label} | ${mode} | w${triggerWindow} | rr=${riskReward}${exitNote}${entryNote} | cost=${costPerSide}%${stopNote}${htfNote}`);
console.log(`window ${iso(from)} -> ${iso(toExclusive)}`);
console.log("");
console.log(`Wins / Losses   ${metrics.wins} / ${metrics.losses}`);
console.log(`Win rate (net)  ${metrics.win_rate === null ? "n/a" : (100 * metrics.win_rate).toFixed(1)}%  (${metrics.net_r >= 0 ? "+" : ""}${metrics.net_r.toFixed(2)}R)`);
console.log(`Expectancy      ${metrics.expectancy_r === null ? "n/a" : metrics.expectancy_r.toFixed(4)}R per trade`);
console.log(`Gross           ${metrics.gross_r.toFixed(2)}R    Max drawdown ${metrics.max_drawdown_r.toFixed(2)}R`);
if (trades.length) {
  console.log(`First entry     ${iso(trades[0].entryTimestamp)}`);
  console.log(`Last entry      ${iso(trades.at(-1).entryTimestamp)}`);
}
