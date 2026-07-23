import {
  SPEC,
  calculateAtr,
  calculateDivergence,
  calculateRsi,
  resolveIntrabar,
  summarize
} from "./reference-engine.mjs";

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
    target: direction === "long"
      ? entry + risk * spec.riskReward
      : entry - risk * spec.riskReward,
    bars: 0
  };
}

function closePosition(position, candle, rawPrice, reason, costs, ambiguous) {
  const exit = fill(rawPrice, position.direction, false, costs.slippage);
  const gross = position.direction === "long"
    ? exit / position.entry - 1
    : position.entry / exit - 1;
  const fees = costs.commission + (exit / position.entry) * costs.commission;
  return {
    strategy_id: SPEC.strategyId,
    implementation_version: "reference-execution-v1",
    symbol: position.symbol,
    timeframe: SPEC.timeframe,
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

export function runReference(candles, options = {}) {
  const spec = options.spec ?? SPEC;
  const symbol = options.symbol ?? "UNKNOWN";
  const costs = {
    commission: options.commission ?? spec.commission,
    slippage: options.slippage ?? spec.slippage
  };
  const policy = options.intrabarPolicy ?? "tradingview_path";
  const tradeStart = options.tradeStart ?? Number.NEGATIVE_INFINITY;
  const tradeEndExclusive = options.tradeEndExclusive ?? Number.POSITIVE_INFINITY;
  const rsi = calculateRsi(candles, spec.rsiLength);
  const atr = calculateAtr(candles, spec.atrLength);
  const divergence = calculateDivergence(candles, rsi, spec);
  const trades = [];
  const signals = [];
  let position = null;
  let lastSignalBar = null;

  for (let index = 0; index < candles.length; index += 1) {
    const candle = candles[index];
    if (candle.timestamp >= tradeEndExclusive) break;

    // Orders created after an on-close entry are first eligible on the next bar.
    if (position && candle.timestamp > position.entryTimestamp) {
      position.bars += 1;
      const resolved = resolveIntrabar(position, candle, policy);
      if (resolved) {
        trades.push(closePosition(
          position,
          candle,
          resolved.price,
          resolved.reason,
          costs,
          resolved.ambiguous
        ));
        position = null;
      }
    }

    const insideWindow = candle.timestamp >= tradeStart;
    const cooldown = lastSignalBar === null || index - lastSignalBar > spec.cooldownBars;
    const ready = Number.isFinite(rsi[index]) && Number.isFinite(atr[index]);
    const longSignal = insideWindow && ready && rsi[index] >= spec.rsiLong &&
      divergence.bullish[index] && cooldown;
    const shortSignal = insideWindow && ready && rsi[index] <= spec.rsiShort &&
      divergence.bearish[index] && cooldown;

    if (longSignal || shortSignal) {
      lastSignalBar = index;
      signals.push({
        timestamp: candle.timestamp,
        long: longSignal,
        short: shortSignal,
        rsi: rsi[index],
        atr: atr[index]
      });
    }

    const requested = longSignal && position?.direction !== "long"
      ? "long"
      : shortSignal && position?.direction !== "short"
        ? "short"
        : null;

    if (requested) {
      if (position) {
        trades.push(closePosition(
          position,
          candle,
          candle.close,
          "signal_reversal",
          costs,
          false
        ));
      }
      position = openPosition(symbol, requested, candle, atr[index], spec, costs);
    }
  }

  if (position) {
    const finalCandle = [...candles]
      .reverse()
      .find((candle) => candle.timestamp < tradeEndExclusive);
    if (finalCandle) {
      trades.push(closePosition(
        position,
        finalCandle,
        finalCandle.close,
        "partition_end",
        costs,
        false
      ));
    }
  }

  return {
    trades,
    signals,
    metrics: summarize(trades),
    rsi,
    atr,
    divergence
  };
}
