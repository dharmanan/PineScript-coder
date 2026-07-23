export const FIVE = 5 * 60 * 1000;
export const FIFTEEN = 15 * 60 * 1000;

export const SPEC = Object.freeze({
  strategyId: "rsi-divergence-reversal-v1",
  timeframe: "15m",
  rsiLength: 14,
  rsiLong: 40,
  rsiShort: 60,
  pivotLeft: 5,
  pivotRight: 5,
  rangeMin: 5,
  rangeMax: 60,
  cooldownBars: 5,
  atrLength: 14,
  atrMultiple: 2,
  riskReward: 2,
  commission: 0.001,
  slippage: 0
});

export function aggregate5mTo15m(candles) {
  const ordered = [...candles].sort((a, b) => a.timestamp - b.timestamp);
  const output = [];
  for (let index = 0; index + 2 < ordered.length;) {
    const first = ordered[index];
    const bucket = Math.floor(first.timestamp / FIFTEEN) * FIFTEEN;
    if (
      first.timestamp !== bucket ||
      ordered[index + 1]?.timestamp !== bucket + FIVE ||
      ordered[index + 2]?.timestamp !== bucket + 2 * FIVE
    ) {
      index += 1;
      continue;
    }
    const group = ordered.slice(index, index + 3);
    output.push({
      timestamp: bucket,
      open: group[0].open,
      high: Math.max(...group.map((item) => item.high)),
      low: Math.min(...group.map((item) => item.low)),
      close: group[2].close,
      volume: group.reduce((sum, item) => sum + item.volume, 0)
    });
    index += 3;
  }
  return output;
}

export function splitContiguous(candles) {
  if (!candles.length) return [];
  const output = [[candles[0]]];
  for (let index = 1; index < candles.length; index += 1) {
    if (candles[index].timestamp - candles[index - 1].timestamp === FIFTEEN) {
      output.at(-1).push(candles[index]);
    } else {
      output.push([candles[index]]);
    }
  }
  return output;
}

function rma(values, length) {
  const output = Array(values.length).fill(null);
  if (values.length < length) return output;
  output[length - 1] = values.slice(0, length).reduce((sum, value) => sum + value, 0) / length;
  for (let index = length; index < values.length; index += 1) {
    output[index] = (output[index - 1] * (length - 1) + values[index]) / length;
  }
  return output;
}

export function calculateRsi(candles, length = SPEC.rsiLength) {
  const gains = [];
  const losses = [];
  for (let index = 1; index < candles.length; index += 1) {
    const change = candles[index].close - candles[index - 1].close;
    gains.push(Math.max(change, 0));
    losses.push(Math.max(-change, 0));
  }
  const averageGain = rma(gains, length);
  const averageLoss = rma(losses, length);
  const output = Array(candles.length).fill(null);
  for (let index = length; index < candles.length; index += 1) {
    const gain = averageGain[index - 1];
    const loss = averageLoss[index - 1];
    output[index] = loss === 0 ? (gain === 0 ? 50 : 100) : 100 - 100 / (1 + gain / loss);
  }
  return output;
}

export function calculateAtr(candles, length = SPEC.atrLength) {
  return rma(candles.map((candle, index) => {
    if (index === 0) return candle.high - candle.low;
    const previousClose = candles[index - 1].close;
    return Math.max(
      candle.high - candle.low,
      Math.abs(candle.high - previousClose),
      Math.abs(candle.low - previousClose)
    );
  }), length);
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

export function calculateDivergence(candles, rsi, spec = SPEC) {
  const bullish = Array(candles.length).fill(false);
  const bearish = Array(candles.length).fill(false);
  const lows = [];
  const highs = [];

  for (let confirmation = 0; confirmation < candles.length; confirmation += 1) {
    const pivot = confirmation - spec.pivotRight;
    if (pivot < spec.pivotLeft) continue;

    if (pivotLow(rsi, pivot, spec.pivotLeft, spec.pivotRight)) {
      const previous = lows.at(-1);
      if (previous) {
        const distance = confirmation - previous.confirmation - 1;
        bullish[confirmation] =
          distance >= spec.rangeMin && distance <= spec.rangeMax &&
          rsi[pivot] > previous.rsi && candles[pivot].low < previous.price;
      }
      lows.push({ confirmation, rsi: rsi[pivot], price: candles[pivot].low });
    }

    if (pivotHigh(rsi, pivot, spec.pivotLeft, spec.pivotRight)) {
      const previous = highs.at(-1);
      if (previous) {
        const distance = confirmation - previous.confirmation - 1;
        bearish[confirmation] =
          distance >= spec.rangeMin && distance <= spec.rangeMax &&
          rsi[pivot] < previous.rsi && candles[pivot].high > previous.price;
      }
      highs.push({ confirmation, rsi: rsi[pivot], price: candles[pivot].high });
    }
  }
  return { bullish, bearish };
}

export function resolveIntrabar(position, candle, policy = "tradingview_path") {
  const long = position.direction === "long";
  if (long && candle.open <= position.stop) return { price: candle.open, reason: "stop_gap", ambiguous: false };
  if (long && candle.open >= position.target) return { price: candle.open, reason: "target_gap", ambiguous: false };
  if (!long && candle.open >= position.stop) return { price: candle.open, reason: "stop_gap", ambiguous: false };
  if (!long && candle.open <= position.target) return { price: candle.open, reason: "target_gap", ambiguous: false };

  const stopTouched = long ? candle.low <= position.stop : candle.high >= position.stop;
  const targetTouched = long ? candle.high >= position.target : candle.low <= position.target;
  if (stopTouched && targetTouched) {
    if (policy === "conservative_stop_first") {
      return { price: position.stop, reason: "stop", ambiguous: true };
    }
    const highFirst = Math.abs(candle.open - candle.high) < Math.abs(candle.open - candle.low);
    const targetFirst = long ? highFirst : !highFirst;
    return targetFirst
      ? { price: position.target, reason: "target", ambiguous: true }
      : { price: position.stop, reason: "stop", ambiguous: true };
  }
  if (stopTouched) return { price: position.stop, reason: "stop", ambiguous: false };
  if (targetTouched) return { price: position.target, reason: "target", ambiguous: false };
  return null;
}

function fill(price, direction, entry, slippage) {
  if (!slippage) return price;
  if (direction === "long") return price * (entry ? 1 + slippage : 1 - slippage);
  return price * (entry ? 1 - slippage : 1 + slippage);
}

function openPosition(symbol, direction, candle, atr, spec, costs) {
  const entry = fill(candle.close, direction, true, costs.slippage);
  const risk = atr * spec.atrMultiple;
  return {
    symbol,
    direction,
    signalTimestamp: candle.timestamp,
    entryTimestamp: candle.timestamp,
    entry,
    atr,
    stop: direction === "long" ? entry - risk : entry + risk,
    target: direction === "long" ? entry + risk * spec.riskReward : entry - risk * spec.riskReward,
    bars: 0,
    exitsActive: false
  };
}

function closePosition(position, candle, rawPrice, reason, costs, ambiguous) {
  const exit = fill(rawPrice, position.direction, false, costs.slippage);
  const gross = position.direction === "long" ? exit / position.entry - 1 : position.entry / exit - 1;
  const fees = costs.commission + (exit / position.entry) * costs.commission;
  return {
    strategy_id: SPEC.strategyId,
    symbol: position.symbol,
    direction: position.direction,
    signal_timestamp: position.signalTimestamp,
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

export function runStrategy(candles, options = {}) {
  const spec = options.spec ?? SPEC;
  const symbol = options.symbol ?? "UNKNOWN";
  const costs = {
    commission: options.commission ?? spec.commission,
    slippage: options.slippage ?? spec.slippage
  };
  const policy = options.intrabarPolicy ?? "tradingview_path";
  const rsi = calculateRsi(candles, spec.rsiLength);
  const atr = calculateAtr(candles, spec.atrLength);
  const divergence = calculateDivergence(candles, rsi, spec);
  const trades = [];
  let position = null;
  let lastSignalBar = null;

  for (let index = 0; index < candles.length; index += 1) {
    const candle = candles[index];
    if (position?.exitsActive) {
      position.bars += 1;
      const resolved = resolveIntrabar(position, candle, policy);
      if (resolved) {
        trades.push(closePosition(position, candle, resolved.price, resolved.reason, costs, resolved.ambiguous));
        position = null;
      }
    }

    const cooldown = lastSignalBar === null || index - lastSignalBar > spec.cooldownBars;
    const longSignal = Number.isFinite(rsi[index]) && Number.isFinite(atr[index]) &&
      rsi[index] >= spec.rsiLong && divergence.bullish[index] && cooldown;
    const shortSignal = Number.isFinite(rsi[index]) && Number.isFinite(atr[index]) &&
      rsi[index] <= spec.rsiShort && divergence.bearish[index] && cooldown;

    if (longSignal || shortSignal) lastSignalBar = index;
    const requested = longSignal && position?.direction !== "long"
      ? "long"
      : shortSignal && position?.direction !== "short"
        ? "short"
        : null;

    if (requested) {
      if (position) trades.push(closePosition(position, candle, candle.close, "signal_reversal", costs, false));
      position = openPosition(symbol, requested, candle, atr[index], spec, costs);
    }
    if (position && position.entryTimestamp < candle.timestamp) position.exitsActive = true;
  }

  if (position) {
    const last = candles.at(-1);
    trades.push(closePosition(position, last, last.close, "segment_end", costs, false));
  }
  return { trades, rsi, atr, divergence };
}

export function summarize(trades) {
  const ordered = [...trades].sort((a, b) => a.exit_timestamp - b.exit_timestamp);
  let cumulative = 0;
  let peak = 0;
  let drawdown = 0;
  let profit = 0;
  let loss = 0;
  let wins = 0;
  let ambiguous = 0;
  for (const trade of ordered) {
    cumulative += trade.net_return;
    peak = Math.max(peak, cumulative);
    drawdown = Math.max(drawdown, peak - cumulative);
    if (trade.net_return > 0) { wins += 1; profit += trade.net_return; }
    if (trade.net_return < 0) loss += Math.abs(trade.net_return);
    if (trade.ambiguous_intrabar) ambiguous += 1;
  }
  return {
    closed_trades: trades.length,
    winning_trades: wins,
    losing_trades: trades.length - wins,
    win_rate: trades.length ? wins / trades.length : null,
    total_net_return_units: cumulative,
    average_net_return: trades.length ? cumulative / trades.length : null,
    profit_factor: loss ? profit / loss : null,
    max_drawdown_return_units: drawdown,
    ambiguous_intrabar_trades: ambiguous
  };
}
