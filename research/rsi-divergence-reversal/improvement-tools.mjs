import {
  SPEC,
  calculateAtr,
  calculateRsi,
  resolveIntrabar,
  summarize
} from "./reference-engine.mjs";

export function ema(values, length) {
  const output = Array(values.length).fill(null);
  if (values.length < length) return output;
  const alpha = 2 / (length + 1);
  let value = values.slice(0, length).reduce((sum, item) => sum + item, 0) / length;
  output[length - 1] = value;
  for (let index = length; index < values.length; index += 1) {
    value = alpha * values[index] + (1 - alpha) * value;
    output[index] = value;
  }
  return output;
}

function rma(values, length) {
  const output = Array(values.length).fill(null);
  if (values.length < length) return output;
  let value = values.slice(0, length).reduce((sum, item) => sum + item, 0) / length;
  output[length - 1] = value;
  for (let index = length; index < values.length; index += 1) {
    value = (value * (length - 1) + values[index]) / length;
    output[index] = value;
  }
  return output;
}

export function adx(candles, length = 14) {
  const tr = [];
  const plusDm = [];
  const minusDm = [];
  for (let index = 0; index < candles.length; index += 1) {
    if (index === 0) {
      tr.push(candles[index].high - candles[index].low);
      plusDm.push(0);
      minusDm.push(0);
      continue;
    }
    const up = candles[index].high - candles[index - 1].high;
    const down = candles[index - 1].low - candles[index].low;
    plusDm.push(up > down && up > 0 ? up : 0);
    minusDm.push(down > up && down > 0 ? down : 0);
    tr.push(Math.max(
      candles[index].high - candles[index].low,
      Math.abs(candles[index].high - candles[index - 1].close),
      Math.abs(candles[index].low - candles[index - 1].close)
    ));
  }
  const atr = rma(tr, length);
  const plus = rma(plusDm, length);
  const minus = rma(minusDm, length);
  const dx = Array(candles.length).fill(null);
  for (let index = 0; index < candles.length; index += 1) {
    if (![atr[index], plus[index], minus[index]].every(Number.isFinite) || atr[index] === 0) continue;
    const plusDi = 100 * plus[index] / atr[index];
    const minusDi = 100 * minus[index] / atr[index];
    const denominator = plusDi + minusDi;
    dx[index] = denominator === 0 ? 0 : 100 * Math.abs(plusDi - minusDi) / denominator;
  }
  const valid = dx.map((value) => Number.isFinite(value) ? value : 0);
  const smoothed = rma(valid, length);
  return smoothed.map((value, index) => Number.isFinite(dx[index]) ? value : null);
}

function pivotLow(values, index, left, right) {
  const value = values[index];
  if (!Number.isFinite(value)) return false;
  for (let cursor = index - left; cursor < index; cursor += 1) {
    if (!Number.isFinite(values[cursor]) || value > values[cursor]) return false;
  }
  for (let cursor = index + 1; cursor <= index + right; cursor += 1) {
    if (!Number.isFinite(values[cursor]) || value >= values[cursor]) return false;
  }
  return true;
}

function pivotHigh(values, index, left, right) {
  const value = values[index];
  if (!Number.isFinite(value)) return false;
  for (let cursor = index - left; cursor < index; cursor += 1) {
    if (!Number.isFinite(values[cursor]) || value < values[cursor]) return false;
  }
  for (let cursor = index + 1; cursor <= index + right; cursor += 1) {
    if (!Number.isFinite(values[cursor]) || value <= values[cursor]) return false;
  }
  return true;
}

export function divergenceEvents(candles, rsi, spec = SPEC) {
  const bullish = Array(candles.length).fill(null);
  const bearish = Array(candles.length).fill(null);
  const lows = [];
  const highs = [];
  for (let confirmation = 0; confirmation < candles.length; confirmation += 1) {
    const pivot = confirmation - spec.pivotRight;
    if (pivot < spec.pivotLeft) continue;
    if (pivotLow(rsi, pivot, spec.pivotLeft, spec.pivotRight)) {
      const previous = lows.at(-1);
      if (previous) {
        const distance = confirmation - previous.confirmation - 1;
        if (distance >= spec.rangeMin && distance <= spec.rangeMax &&
            rsi[pivot] > previous.rsi && candles[pivot].low < previous.price) {
          bullish[confirmation] = {
            pivotIndex: pivot,
            pivotRsi: rsi[pivot],
            previousPivotRsi: previous.rsi,
            priceChange: candles[pivot].low / previous.price - 1,
            rsiChange: rsi[pivot] - previous.rsi,
            distance
          };
        }
      }
      lows.push({ confirmation, rsi: rsi[pivot], price: candles[pivot].low });
    }
    if (pivotHigh(rsi, pivot, spec.pivotLeft, spec.pivotRight)) {
      const previous = highs.at(-1);
      if (previous) {
        const distance = confirmation - previous.confirmation - 1;
        if (distance >= spec.rangeMin && distance <= spec.rangeMax &&
            rsi[pivot] < previous.rsi && candles[pivot].high > previous.price) {
          bearish[confirmation] = {
            pivotIndex: pivot,
            pivotRsi: rsi[pivot],
            previousPivotRsi: previous.rsi,
            priceChange: candles[pivot].high / previous.price - 1,
            rsiChange: previous.rsi - rsi[pivot],
            distance
          };
        }
      }
      highs.push({ confirmation, rsi: rsi[pivot], price: candles[pivot].high });
    }
  }
  return { bullish, bearish };
}

export const SIGNAL_VARIANTS = Object.freeze([
  { id: "baseline", pivotLongMax: null, pivotShortMin: null, ema200: false, adxMax: null, minRsiDelta: 0 },
  { id: "pivot-35-65", pivotLongMax: 35, pivotShortMin: 65, ema200: false, adxMax: null, minRsiDelta: 0 },
  { id: "pivot-30-70", pivotLongMax: 30, pivotShortMin: 70, ema200: false, adxMax: null, minRsiDelta: 0 },
  { id: "ema200", pivotLongMax: null, pivotShortMin: null, ema200: true, adxMax: null, minRsiDelta: 0 },
  { id: "ema200-pivot-35-65", pivotLongMax: 35, pivotShortMin: 65, ema200: true, adxMax: null, minRsiDelta: 0 },
  { id: "ema200-pivot-30-70", pivotLongMax: 30, pivotShortMin: 70, ema200: true, adxMax: null, minRsiDelta: 0 },
  { id: "adx-25", pivotLongMax: null, pivotShortMin: null, ema200: false, adxMax: 25, minRsiDelta: 0 },
  { id: "adx-20", pivotLongMax: null, pivotShortMin: null, ema200: false, adxMax: 20, minRsiDelta: 0 },
  { id: "ema200-adx-25", pivotLongMax: null, pivotShortMin: null, ema200: true, adxMax: 25, minRsiDelta: 0 },
  { id: "quality-combined", pivotLongMax: 35, pivotShortMin: 65, ema200: true, adxMax: 25, minRsiDelta: 3 }
]);

export const RISK_VARIANTS = Object.freeze([
  { id: "atr-1.5-rr-1.5", atrMultiple: 1.5, riskReward: 1.5 },
  { id: "atr-1.5-rr-2.0", atrMultiple: 1.5, riskReward: 2 },
  { id: "atr-2.0-rr-2.0", atrMultiple: 2, riskReward: 2 },
  { id: "atr-2.0-rr-3.0", atrMultiple: 2, riskReward: 3 }
]);

export const CANDIDATES = Object.freeze(SIGNAL_VARIANTS.flatMap((signal) =>
  RISK_VARIANTS.flatMap((risk) => [true, false].map((reverseOnSignal) => Object.freeze({
    id: `${signal.id}__${risk.id}__${reverseOnSignal ? "reverse" : "hold"}`,
    signal,
    risk,
    reverseOnSignal
  })))
));

export function prepareFeatures(candles) {
  const rsi = calculateRsi(candles, 14);
  return {
    rsi,
    atr: calculateAtr(candles, 14),
    ema200: ema(candles.map((candle) => candle.close), 200),
    adx14: adx(candles, 14),
    divergence: divergenceEvents(candles, rsi, SPEC)
  };
}

function signalAllowed(direction, index, candle, event, features, variant) {
  if (!event) return false;
  if (direction === "long" && variant.pivotLongMax !== null && event.pivotRsi > variant.pivotLongMax) return false;
  if (direction === "short" && variant.pivotShortMin !== null && event.pivotRsi < variant.pivotShortMin) return false;
  if (variant.ema200) {
    const average = features.ema200[index];
    if (!Number.isFinite(average)) return false;
    if (direction === "long" && candle.close < average) return false;
    if (direction === "short" && candle.close > average) return false;
  }
  if (variant.adxMax !== null) {
    const value = features.adx14[index];
    if (!Number.isFinite(value) || value > variant.adxMax) return false;
  }
  if (event.rsiChange < variant.minRsiDelta) return false;
  return true;
}

function fill(price, direction, entry, slippage) {
  if (direction === "long") return price * (entry ? 1 + slippage : 1 - slippage);
  return price * (entry ? 1 - slippage : 1 + slippage);
}

function openPosition(symbol, direction, candle, atrValue, candidate, costs) {
  const entry = fill(candle.close, direction, true, costs.slippage);
  const risk = atrValue * candidate.risk.atrMultiple;
  return {
    symbol,
    direction,
    entryTimestamp: candle.timestamp,
    entry,
    atr: atrValue,
    stop: direction === "long" ? entry - risk : entry + risk,
    target: direction === "long" ? entry + risk * candidate.risk.riskReward : entry - risk * candidate.risk.riskReward,
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

export function runCandidate(candles, features, candidate, options = {}) {
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
      }
    }

    if (candle.timestamp < tradeStart) continue;
    const ready = Number.isFinite(features.rsi[index]) && Number.isFinite(features.atr[index]);
    const cooldown = lastSignalBar === null || index - lastSignalBar > SPEC.cooldownBars;
    const longSignal = ready && cooldown && features.rsi[index] >= SPEC.rsiLong &&
      signalAllowed("long", index, candle, features.divergence.bullish[index], features, candidate.signal);
    const shortSignal = ready && cooldown && features.rsi[index] <= SPEC.rsiShort &&
      signalAllowed("short", index, candle, features.divergence.bearish[index], features, candidate.signal);

    if (longSignal || shortSignal) lastSignalBar = index;
    const requested = longSignal && position?.direction !== "long" ? "long" :
      shortSignal && position?.direction !== "short" ? "short" : null;
    if (!requested) continue;

    if (position) {
      if (!candidate.reverseOnSignal) continue;
      trades.push(closePosition(position, candle, candle.close, "signal_reversal", costs, false, candidate.id));
    }
    position = openPosition(symbol, requested, candle, features.atr[index], candidate, costs);
  }

  if (position) {
    const finalCandle = [...candles].reverse().find((candle) => candle.timestamp < tradeEndExclusive);
    if (finalCandle) trades.push(closePosition(position, finalCandle, finalCandle.close, "partition_end", costs, false, candidate.id));
  }
  return { trades, metrics: summarize(trades) };
}

export function candidateScore(metrics) {
  if (!metrics.closed_trades || metrics.closed_trades < 60) return Number.NEGATIVE_INFINITY;
  const pf = metrics.profit_factor ?? 0;
  return metrics.total_net_return_units + 0.5 * (pf - 1) - 0.25 * metrics.max_drawdown_return_units;
}
