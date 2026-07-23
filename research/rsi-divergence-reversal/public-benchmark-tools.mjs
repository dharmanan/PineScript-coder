import { SPEC, calculateAtr, calculateRsi, resolveIntrabar, summarize } from "./reference-engine.mjs";
import { divergenceEvents, ema } from "./improvement-tools.mjs";

const FIFTEEN = 15 * 60 * 1000;

export function aggregate15m(candles, factor) {
  if (factor === 1) return candles;
  const interval = FIFTEEN * factor;
  const output = [];
  for (let index = 0; index + factor - 1 < candles.length;) {
    const first = candles[index];
    const bucket = Math.floor(first.timestamp / interval) * interval;
    if (first.timestamp !== bucket) { index += 1; continue; }
    let complete = true;
    for (let offset = 0; offset < factor; offset += 1) {
      if (candles[index + offset]?.timestamp !== bucket + offset * FIFTEEN) { complete = false; break; }
    }
    if (!complete) { index += 1; continue; }
    const group = candles.slice(index, index + factor);
    output.push({
      timestamp: bucket,
      open: group[0].open,
      high: Math.max(...group.map((item) => item.high)),
      low: Math.min(...group.map((item) => item.low)),
      close: group.at(-1).close,
      volume: group.reduce((sum, item) => sum + item.volume, 0)
    });
    index += factor;
  }
  return output;
}

function sma(values, length) {
  const output = Array(values.length).fill(null);
  let sum = 0;
  for (let index = 0; index < values.length; index += 1) {
    sum += values[index];
    if (index >= length) sum -= values[index - length];
    if (index >= length - 1) output[index] = sum / length;
  }
  return output;
}

function wma(values, length) {
  const output = Array(values.length).fill(null);
  const denominator = length * (length + 1) / 2;
  for (let index = length - 1; index < values.length; index += 1) {
    let weighted = 0;
    for (let offset = 0; offset < length; offset += 1) weighted += values[index - offset] * (length - offset);
    output[index] = weighted / denominator;
  }
  return output;
}

function linearRegressionSlope(values, length) {
  const output = Array(values.length).fill(null);
  const xMean = (length - 1) / 2;
  let denominator = 0;
  for (let x = 0; x < length; x += 1) denominator += (x - xMean) ** 2;
  for (let index = length - 1; index < values.length; index += 1) {
    let yMean = 0;
    for (let offset = 0; offset < length; offset += 1) yMean += values[index - length + 1 + offset];
    yMean /= length;
    let numerator = 0;
    for (let x = 0; x < length; x += 1) numerator += (x - xMean) * (values[index - length + 1 + x] - yMean);
    output[index] = numerator / denominator;
  }
  return output;
}

function hiddenDivergence(candles, rsi, spec = SPEC) {
  const regular = divergenceEvents(candles, rsi, spec);
  const bullish = Array(candles.length).fill(null);
  const bearish = Array(candles.length).fill(null);
  const lowPivots = [];
  const highPivots = [];
  for (let confirmation = 0; confirmation < candles.length; confirmation += 1) {
    const pivot = confirmation - spec.pivotRight;
    if (pivot < spec.pivotLeft) continue;
    const regularBull = regular.bullish[confirmation];
    const regularBear = regular.bearish[confirmation];
    if (regularBull) lowPivots.push({ confirmation, pivot, rsi: rsi[pivot], price: candles[pivot].low });
    if (regularBear) highPivots.push({ confirmation, pivot, rsi: rsi[pivot], price: candles[pivot].high });
  }
  // Re-scan all RSI pivots independently so hidden divergence is not limited to regular events.
  const lows = [];
  const highs = [];
  const isLow = (index) => {
    if (!Number.isFinite(rsi[index])) return false;
    for (let i = index - spec.pivotLeft; i < index; i += 1) if (!Number.isFinite(rsi[i]) || rsi[index] > rsi[i]) return false;
    for (let i = index + 1; i <= index + spec.pivotRight; i += 1) if (!Number.isFinite(rsi[i]) || rsi[index] >= rsi[i]) return false;
    return true;
  };
  const isHigh = (index) => {
    if (!Number.isFinite(rsi[index])) return false;
    for (let i = index - spec.pivotLeft; i < index; i += 1) if (!Number.isFinite(rsi[i]) || rsi[index] < rsi[i]) return false;
    for (let i = index + 1; i <= index + spec.pivotRight; i += 1) if (!Number.isFinite(rsi[i]) || rsi[index] <= rsi[i]) return false;
    return true;
  };
  for (let confirmation = 0; confirmation < candles.length; confirmation += 1) {
    const pivot = confirmation - spec.pivotRight;
    if (pivot < spec.pivotLeft) continue;
    if (isLow(pivot)) {
      const previous = lows.at(-1);
      if (previous) {
        const distance = confirmation - previous.confirmation - 1;
        if (distance >= spec.rangeMin && distance <= spec.rangeMax && candles[pivot].low > previous.price && rsi[pivot] < previous.rsi) {
          bullish[confirmation] = { pivotIndex: pivot, pivotRsi: rsi[pivot], previousPivotRsi: previous.rsi, distance };
        }
      }
      lows.push({ confirmation, rsi: rsi[pivot], price: candles[pivot].low });
    }
    if (isHigh(pivot)) {
      const previous = highs.at(-1);
      if (previous) {
        const distance = confirmation - previous.confirmation - 1;
        if (distance >= spec.rangeMin && distance <= spec.rangeMax && candles[pivot].high < previous.price && rsi[pivot] > previous.rsi) {
          bearish[confirmation] = { pivotIndex: pivot, pivotRsi: rsi[pivot], previousPivotRsi: previous.rsi, distance };
        }
      }
      highs.push({ confirmation, rsi: rsi[pivot], price: candles[pivot].high });
    }
  }
  return { bullish, bearish };
}

export const BENCHMARK_FAMILIES = Object.freeze([
  { id: "armed-regular", type: "armed_regular", rsiLongArm: 30, rsiShortArm: 70, armExpiry: 48, trendFilter: false, confirmBars: 0 },
  { id: "armed-regular-trend", type: "armed_regular", rsiLongArm: 35, rsiShortArm: 65, armExpiry: 64, trendFilter: true, confirmBars: 0 },
  { id: "hidden-continuation", type: "hidden", trendFilter: true, confirmBars: 0 },
  { id: "ema-confirmed-regular", type: "ema_confirmed", trendFilter: true, confirmBars: 30 },
  { id: "linreg-regular-14", type: "linreg", regressionLength: 14, trendFilter: false, confirmBars: 0 },
  { id: "linreg-regular-28", type: "linreg", regressionLength: 28, trendFilter: true, confirmBars: 0 }
]);

export const BENCHMARK_RISKS = Object.freeze([
  { id: "swing-rr-1.8", stopMode: "swing", swingLength: 15, atrMultiple: null, riskReward: 1.8, trailing: false },
  { id: "swing-rr-2.0-trail", stopMode: "swing", swingLength: 15, atrMultiple: null, riskReward: 2, trailing: true },
  { id: "atr-1.5-rr-2.0", stopMode: "atr", swingLength: null, atrMultiple: 1.5, riskReward: 2, trailing: false }
]);

export const BENCHMARK_CANDIDATES = Object.freeze(BENCHMARK_FAMILIES.flatMap((family) =>
  BENCHMARK_RISKS.map((risk) => Object.freeze({ id: `${family.id}__${risk.id}`, family, risk }))
));

export function prepareBenchmarkFeatures(candles) {
  const closes = candles.map((item) => item.close);
  const rsi = calculateRsi(candles, 14);
  return {
    rsi,
    atr: calculateAtr(candles, 14),
    regular: divergenceEvents(candles, rsi, SPEC),
    hidden: hiddenDivergence(candles, rsi, SPEC),
    ema9: ema(closes, 9),
    ema50: ema(closes, 50),
    ema200: ema(closes, 200),
    wma45: wma(closes, 45),
    volume20: sma(candles.map((item) => item.volume), 20),
    priceSlope14: linearRegressionSlope(closes, 14),
    priceSlope28: linearRegressionSlope(closes, 28),
    rsiSlope14: linearRegressionSlope(rsi.map((value) => Number.isFinite(value) ? value : 50), 14),
    rsiSlope28: linearRegressionSlope(rsi.map((value) => Number.isFinite(value) ? value : 50), 28)
  };
}

function trendAllows(direction, index, candle, features) {
  const fast = features.ema50[index];
  const slow = features.ema200[index];
  if (![fast, slow].every(Number.isFinite)) return false;
  return direction === "long" ? fast > slow && candle.close > slow : fast < slow && candle.close < slow;
}

function swingStop(direction, index, candles, length) {
  const start = Math.max(0, index - length + 1);
  const window = candles.slice(start, index + 1);
  return direction === "long" ? Math.min(...window.map((item) => item.low)) : Math.max(...window.map((item) => item.high));
}

function fill(price, direction, entry, slippage) {
  if (direction === "long") return price * (entry ? 1 + slippage : 1 - slippage);
  return price * (entry ? 1 - slippage : 1 + slippage);
}

function openPosition(symbol, direction, index, candle, candles, features, candidate, costs) {
  const entry = fill(candle.close, direction, true, costs.slippage);
  let stop = candidate.risk.stopMode === "atr"
    ? (direction === "long" ? entry - features.atr[index] * candidate.risk.atrMultiple : entry + features.atr[index] * candidate.risk.atrMultiple)
    : swingStop(direction, index, candles, candidate.risk.swingLength);
  const risk = direction === "long" ? entry - stop : stop - entry;
  if (!(risk > 0) || !Number.isFinite(features.atr[index]) || risk / features.atr[index] > 5) return null;
  return {
    symbol, direction, entryIndex: index, entryTimestamp: candle.timestamp, entry, stop,
    target: direction === "long" ? entry + risk * candidate.risk.riskReward : entry - risk * candidate.risk.riskReward,
    initialRisk: risk, highestClose: candle.close, lowestClose: candle.close, bars: 0
  };
}

function closePosition(position, candle, rawPrice, reason, costs, candidateId) {
  const exit = fill(rawPrice, position.direction, false, costs.slippage);
  const gross = position.direction === "long" ? exit / position.entry - 1 : position.entry / exit - 1;
  const fees = costs.commission + (exit / position.entry) * costs.commission;
  return {
    candidate_id: candidateId, symbol: position.symbol, direction: position.direction,
    entry_timestamp: position.entryTimestamp, entry_fill: position.entry,
    initial_stop: position.stop, target: position.target,
    exit_timestamp: candle.timestamp, exit_fill: exit, exit_reason: reason,
    net_return: gross - fees, bars_held: position.bars, ambiguous_intrabar: false
  };
}

export function runBenchmarkCandidate(candles, features, candidate, options = {}) {
  const symbol = options.symbol ?? "UNKNOWN";
  const tradeStart = options.tradeStart ?? Number.NEGATIVE_INFINITY;
  const tradeEndExclusive = options.tradeEndExclusive ?? Number.POSITIVE_INFINITY;
  const costs = { commission: options.commission ?? 0.001, slippage: options.slippage ?? 0.0005 };
  const trades = [];
  let position = null;
  let longArmedUntil = -1;
  let shortArmedUntil = -1;
  let pending = null;

  for (let index = 0; index < candles.length; index += 1) {
    const candle = candles[index];
    if (candle.timestamp >= tradeEndExclusive) break;

    if (position && index > position.entryIndex) {
      position.bars += 1;
      position.highestClose = Math.max(position.highestClose, candle.close);
      position.lowestClose = Math.min(position.lowestClose, candle.close);
      if (candidate.risk.trailing) {
        const trail = position.direction === "long"
          ? position.highestClose - position.initialRisk
          : position.lowestClose + position.initialRisk;
        position.stop = position.direction === "long" ? Math.max(position.stop, trail) : Math.min(position.stop, trail);
      }
      const resolved = resolveIntrabar(position, candle, "tradingview_path");
      if (resolved) {
        trades.push(closePosition(position, candle, resolved.price, resolved.reason, costs, candidate.id));
        position = null;
      }
    }

    if (candle.timestamp < tradeStart || position) continue;
    const family = candidate.family;
    if (family.type === "armed_regular") {
      if (features.rsi[index] <= family.rsiLongArm) longArmedUntil = index + family.armExpiry;
      if (features.rsi[index] >= family.rsiShortArm) shortArmedUntil = index + family.armExpiry;
    }

    let longSignal = false;
    let shortSignal = false;
    if (family.type === "armed_regular") {
      longSignal = Boolean(features.regular.bullish[index]) && index <= longArmedUntil;
      shortSignal = Boolean(features.regular.bearish[index]) && index <= shortArmedUntil;
    } else if (family.type === "hidden") {
      longSignal = Boolean(features.hidden.bullish[index]);
      shortSignal = Boolean(features.hidden.bearish[index]);
    } else if (family.type === "linreg") {
      const p = family.regressionLength === 14 ? features.priceSlope14[index] : features.priceSlope28[index];
      const r = family.regressionLength === 14 ? features.rsiSlope14[index] : features.rsiSlope28[index];
      longSignal = Number.isFinite(p) && Number.isFinite(r) && p < 0 && r > 0;
      shortSignal = Number.isFinite(p) && Number.isFinite(r) && p > 0 && r < 0;
    } else if (family.type === "ema_confirmed") {
      if (features.regular.bullish[index]) pending = { direction: "long", expires: index + family.confirmBars };
      if (features.regular.bearish[index]) pending = { direction: "short", expires: index + family.confirmBars };
      if (pending && index <= pending.expires && index > 0) {
        const crossLong = features.ema9[index - 1] <= features.wma45[index - 1] && features.ema9[index] > features.wma45[index];
        const crossShort = features.ema9[index - 1] >= features.wma45[index - 1] && features.ema9[index] < features.wma45[index];
        longSignal = pending.direction === "long" && crossLong;
        shortSignal = pending.direction === "short" && crossShort;
        if (longSignal || shortSignal || index === pending.expires) pending = null;
      }
    }

    if (family.trendFilter) {
      longSignal = longSignal && trendAllows("long", index, candle, features);
      shortSignal = shortSignal && trendAllows("short", index, candle, features);
    }
    const volumeOk = !Number.isFinite(features.volume20[index]) || candle.volume >= features.volume20[index] * 0.8;
    longSignal = longSignal && volumeOk;
    shortSignal = shortSignal && volumeOk;

    if (longSignal !== shortSignal) {
      position = openPosition(symbol, longSignal ? "long" : "short", index, candle, candles, features, candidate, costs);
    }
  }

  if (position) {
    const last = [...candles].reverse().find((item) => item.timestamp < tradeEndExclusive);
    if (last) trades.push(closePosition(position, last, last.close, "partition_end", costs, candidate.id));
  }
  return { trades, metrics: summarize(trades) };
}
