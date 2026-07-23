import {
  SPEC,
  calculateAtr,
  calculateRsi,
  resolveIntrabar,
  summarize
} from "./reference-engine.mjs";
import { divergenceEvents, ema } from "./improvement-tools.mjs";

export const SIGNAL_VARIANTS_PHASE2 = Object.freeze([
  { id: "countertrend", countertrend: true, pivotLongMax: null, pivotShortMin: null, distanceAtrMin: 0, reclaimEma20: false, breakPrevious: false, minRsiDelta: 0 },
  { id: "countertrend-pivot-35-65", countertrend: true, pivotLongMax: 35, pivotShortMin: 65, distanceAtrMin: 0, reclaimEma20: false, breakPrevious: false, minRsiDelta: 0 },
  { id: "countertrend-pivot-30-70", countertrend: true, pivotLongMax: 30, pivotShortMin: 70, distanceAtrMin: 0, reclaimEma20: false, breakPrevious: false, minRsiDelta: 0 },
  { id: "countertrend-distance-0.5", countertrend: true, pivotLongMax: null, pivotShortMin: null, distanceAtrMin: 0.5, reclaimEma20: false, breakPrevious: false, minRsiDelta: 0 },
  { id: "countertrend-distance-1.0", countertrend: true, pivotLongMax: null, pivotShortMin: null, distanceAtrMin: 1, reclaimEma20: false, breakPrevious: false, minRsiDelta: 0 },
  { id: "countertrend-pivot-35-distance-0.5", countertrend: true, pivotLongMax: 35, pivotShortMin: 65, distanceAtrMin: 0.5, reclaimEma20: false, breakPrevious: false, minRsiDelta: 0 },
  { id: "countertrend-pivot-35-distance-1.0", countertrend: true, pivotLongMax: 35, pivotShortMin: 65, distanceAtrMin: 1, reclaimEma20: false, breakPrevious: false, minRsiDelta: 0 },
  { id: "ema20-reclaim", countertrend: false, pivotLongMax: 35, pivotShortMin: 65, distanceAtrMin: 0, reclaimEma20: true, breakPrevious: false, minRsiDelta: 0 },
  { id: "countertrend-ema20-reclaim", countertrend: true, pivotLongMax: 35, pivotShortMin: 65, distanceAtrMin: 0, reclaimEma20: true, breakPrevious: false, minRsiDelta: 0 },
  { id: "previous-bar-break", countertrend: false, pivotLongMax: 35, pivotShortMin: 65, distanceAtrMin: 0, reclaimEma20: false, breakPrevious: true, minRsiDelta: 0 },
  { id: "countertrend-previous-bar-break", countertrend: true, pivotLongMax: 35, pivotShortMin: 65, distanceAtrMin: 0, reclaimEma20: false, breakPrevious: true, minRsiDelta: 0 },
  { id: "countertrend-quality", countertrend: true, pivotLongMax: 35, pivotShortMin: 65, distanceAtrMin: 0.5, reclaimEma20: false, breakPrevious: true, minRsiDelta: 3 }
]);

export const EXIT_VARIANTS_PHASE2 = Object.freeze([
  { id: "atr-1.0-rr-1.5-time-16", atrMultiple: 1, riskReward: 1.5, maxBars: 16 },
  { id: "atr-1.5-rr-1.5-time-24", atrMultiple: 1.5, riskReward: 1.5, maxBars: 24 },
  { id: "atr-1.5-rr-2.0-time-32", atrMultiple: 1.5, riskReward: 2, maxBars: 32 },
  { id: "atr-2.0-rr-2.0-time-48", atrMultiple: 2, riskReward: 2, maxBars: 48 }
]);

export const DIRECTION_VARIANTS_PHASE2 = Object.freeze(["both", "long_only", "short_only"]);

export const PHASE2_CANDIDATES = Object.freeze(
  SIGNAL_VARIANTS_PHASE2.flatMap((signal) =>
    EXIT_VARIANTS_PHASE2.flatMap((exit) =>
      DIRECTION_VARIANTS_PHASE2.map((directionMode) => Object.freeze({
        id: `${signal.id}__${exit.id}__${directionMode}`,
        signal,
        exit,
        directionMode
      }))
    )
  )
);

export function preparePhase2Features(candles) {
  const rsi = calculateRsi(candles, 14);
  return {
    rsi,
    atr: calculateAtr(candles, 14),
    ema20: ema(candles.map((candle) => candle.close), 20),
    ema200: ema(candles.map((candle) => candle.close), 200),
    divergence: divergenceEvents(candles, rsi, SPEC)
  };
}

function directionEnabled(direction, mode) {
  return mode === "both" || mode === `${direction}_only`;
}

function signalAllowed(direction, index, candles, features, event, variant) {
  if (!event) return false;
  const candle = candles[index];
  const average200 = features.ema200[index];
  const average20 = features.ema20[index];
  const previous20 = features.ema20[index - 1];
  const atr = features.atr[index];
  if (![average200, average20, atr].every(Number.isFinite) || atr <= 0) return false;

  if (direction === "long" && variant.pivotLongMax !== null && event.pivotRsi > variant.pivotLongMax) return false;
  if (direction === "short" && variant.pivotShortMin !== null && event.pivotRsi < variant.pivotShortMin) return false;
  if (event.rsiChange < variant.minRsiDelta) return false;

  if (variant.countertrend) {
    if (direction === "long" && candle.close >= average200) return false;
    if (direction === "short" && candle.close <= average200) return false;
  }

  if (variant.distanceAtrMin > 0) {
    const distance = Math.abs(candle.close - average200) / atr;
    if (distance < variant.distanceAtrMin) return false;
  }

  if (variant.reclaimEma20) {
    if (!Number.isFinite(previous20) || index === 0) return false;
    const previousClose = candles[index - 1].close;
    if (direction === "long" && !(previousClose <= previous20 && candle.close > average20)) return false;
    if (direction === "short" && !(previousClose >= previous20 && candle.close < average20)) return false;
  }

  if (variant.breakPrevious) {
    if (index === 0) return false;
    if (direction === "long" && candle.close <= candles[index - 1].high) return false;
    if (direction === "short" && candle.close >= candles[index - 1].low) return false;
  }

  return true;
}

function fill(price, direction, entry, slippage) {
  if (direction === "long") return price * (entry ? 1 + slippage : 1 - slippage);
  return price * (entry ? 1 - slippage : 1 + slippage);
}

function openPosition(symbol, direction, candle, atrValue, candidate, costs) {
  const entry = fill(candle.close, direction, true, costs.slippage);
  const risk = atrValue * candidate.exit.atrMultiple;
  return {
    symbol,
    direction,
    entryTimestamp: candle.timestamp,
    entry,
    atr: atrValue,
    stop: direction === "long" ? entry - risk : entry + risk,
    target: direction === "long" ? entry + risk * candidate.exit.riskReward : entry - risk * candidate.exit.riskReward,
    bars: 0
  };
}

function closePosition(position, candle, rawPrice, reason, costs, ambiguous, candidateId) {
  const exit = fill(rawPrice, position.direction, false, costs.slippage);
  const gross = position.direction === "long" ? exit / position.entry - 1 : position.entry / exit - 1;
  const fees = costs.commission + (exit / position.entry) * costs.commission;
  return {
    candidate_id: candidateId,
    symbol: position.symbol,
    direction: position.direction,
    entry_timestamp: position.entryTimestamp,
    entry_fill: position.entry,
    entry_atr: position.atr,
    initial_stop: position.stop,
    target: position.target,
    exit_timestamp: candle.timestamp,
    exit_fill: exit,
    exit_reason: reason,
    net_return: gross - fees,
    net_pnl: gross - fees,
    bars_held: position.bars,
    ambiguous_intrabar: ambiguous
  };
}

export function runPhase2Candidate(candles, features, candidate, options = {}) {
  const symbol = options.symbol ?? "UNKNOWN";
  const tradeStart = options.tradeStart ?? Number.NEGATIVE_INFINITY;
  const tradeEndExclusive = options.tradeEndExclusive ?? Number.POSITIVE_INFINITY;
  const costs = {
    commission: options.commission ?? 0.001,
    slippage: options.slippage ?? 0.0005
  };
  const policy = options.intrabarPolicy ?? "tradingview_path";
  const trades = [];
  let position = null;
  let lastSignalBar = null;

  for (let index = 0; index < candles.length; index += 1) {
    const candle = candles[index];
    if (candle.timestamp >= tradeEndExclusive) break;

    if (position && candle.timestamp > position.entryTimestamp) {
      position.bars += 1;
      const resolved = resolveIntrabar(position, candle, policy);
      if (resolved) {
        trades.push(closePosition(position, candle, resolved.price, resolved.reason, costs, resolved.ambiguous, candidate.id));
        position = null;
      } else if (position.bars >= candidate.exit.maxBars) {
        trades.push(closePosition(position, candle, candle.close, "time_exit", costs, false, candidate.id));
        position = null;
      }
    }

    if (candle.timestamp < tradeStart || position) continue;
    const ready = Number.isFinite(features.rsi[index]) && Number.isFinite(features.atr[index]);
    const cooldown = lastSignalBar === null || index - lastSignalBar > SPEC.cooldownBars;
    if (!ready || !cooldown) continue;

    const longSignal = directionEnabled("long", candidate.directionMode) &&
      features.rsi[index] >= SPEC.rsiLong &&
      signalAllowed("long", index, candles, features, features.divergence.bullish[index], candidate.signal);
    const shortSignal = directionEnabled("short", candidate.directionMode) &&
      features.rsi[index] <= SPEC.rsiShort &&
      signalAllowed("short", index, candles, features, features.divergence.bearish[index], candidate.signal);

    if (longSignal || shortSignal) lastSignalBar = index;
    if (longSignal) position = openPosition(symbol, "long", candle, features.atr[index], candidate, costs);
    else if (shortSignal) position = openPosition(symbol, "short", candle, features.atr[index], candidate, costs);
  }

  if (position) {
    const finalCandle = [...candles].reverse().find((candle) => candle.timestamp < tradeEndExclusive);
    if (finalCandle) trades.push(closePosition(position, finalCandle, finalCandle.close, "partition_end", costs, false, candidate.id));
  }

  return { trades, metrics: summarize(trades) };
}

export function phase2Score(metrics) {
  const pf = metrics.profit_factor ?? 0;
  const tradePenalty = metrics.closed_trades < 120 ? (120 - metrics.closed_trades) / 120 : 0;
  return metrics.total_net_return_units + Math.min(pf, 2) * 0.5 - metrics.max_drawdown_return_units * 0.5 - tradePenalty;
}
