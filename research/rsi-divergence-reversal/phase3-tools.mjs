import {
  SPEC,
  calculateAtr,
  calculateRsi,
  resolveIntrabar,
  summarize
} from "./reference-engine.mjs";
import { divergenceEvents, ema } from "./improvement-tools.mjs";

const FIFTEEN = 15 * 60 * 1000;
const FOUR_HOURS = 4 * 60 * 60 * 1000;

function aggregateComplete4h(candles) {
  const bars = [];
  for (let index = 0; index + 15 < candles.length;) {
    const first = candles[index];
    const bucket = Math.floor(first.timestamp / FOUR_HOURS) * FOUR_HOURS;
    if (first.timestamp !== bucket) {
      index += 1;
      continue;
    }
    let complete = true;
    for (let offset = 0; offset < 16; offset += 1) {
      if (candles[index + offset]?.timestamp !== bucket + offset * FIFTEEN) {
        complete = false;
        break;
      }
    }
    if (!complete) {
      index += 1;
      continue;
    }
    const group = candles.slice(index, index + 16);
    bars.push({
      timestamp: bucket,
      closeTimestamp: bucket + FOUR_HOURS,
      open: group[0].open,
      high: Math.max(...group.map((item) => item.high)),
      low: Math.min(...group.map((item) => item.low)),
      close: group[15].close,
      volume: group.reduce((sum, item) => sum + item.volume, 0)
    });
    index += 16;
  }
  return bars;
}

export function closed4hTrend(candles) {
  const bars = aggregateComplete4h(candles);
  const closes = bars.map((bar) => bar.close);
  const ema20 = ema(closes, 20);
  const ema50 = ema(closes, 50);
  const ema100 = ema(closes, 100);
  const ema200 = ema(closes, 200);
  const state = Array(candles.length).fill(null);
  let barIndex = -1;

  for (let index = 0; index < candles.length; index += 1) {
    const closeTime = candles[index].timestamp + FIFTEEN;
    while (barIndex + 1 < bars.length && bars[barIndex + 1].closeTimestamp <= closeTime) {
      barIndex += 1;
    }
    if (barIndex < 0) continue;
    state[index] = {
      close: bars[barIndex].close,
      ema20: ema20[barIndex],
      ema50: ema50[barIndex],
      ema100: ema100[barIndex],
      ema200: ema200[barIndex],
      previousEma20: barIndex > 0 ? ema20[barIndex - 1] : null,
      previousEma50: barIndex > 0 ? ema50[barIndex - 1] : null,
      completedBarTimestamp: bars[barIndex].timestamp,
      completedBarCloseTimestamp: bars[barIndex].closeTimestamp
    };
  }

  return { bars, state };
}

export const PHASE3_SIGNAL_VARIANTS = Object.freeze([
  { id: "4h-ema50-200-break8", fast: "ema50", slow: "ema200", slope: false, pivotLongMax: null, pivotShortMin: null, expiryBars: 8 },
  { id: "4h-ema50-200-pivot35-break8", fast: "ema50", slow: "ema200", slope: false, pivotLongMax: 35, pivotShortMin: 65, expiryBars: 8 },
  { id: "4h-ema50-200-pivot35-break16", fast: "ema50", slow: "ema200", slope: false, pivotLongMax: 35, pivotShortMin: 65, expiryBars: 16 },
  { id: "4h-ema50-200-slope-pivot35-break8", fast: "ema50", slow: "ema200", slope: true, pivotLongMax: 35, pivotShortMin: 65, expiryBars: 8 },
  { id: "4h-ema20-100-pivot35-break8", fast: "ema20", slow: "ema100", slope: false, pivotLongMax: 35, pivotShortMin: 65, expiryBars: 8 },
  { id: "4h-ema20-100-slope-pivot35-break8", fast: "ema20", slow: "ema100", slope: true, pivotLongMax: 35, pivotShortMin: 65, expiryBars: 8 }
]);

export const PHASE3_RISK_VARIANTS = Object.freeze([
  { id: "pivot-buffer-0.25-rr-1.5", mode: "pivot", bufferAtr: 0.25, atrMultiple: null, riskReward: 1.5, maxBars: 64 },
  { id: "pivot-buffer-0.25-rr-2.0", mode: "pivot", bufferAtr: 0.25, atrMultiple: null, riskReward: 2, maxBars: 64 },
  { id: "pivot-buffer-0.50-rr-2.0", mode: "pivot", bufferAtr: 0.5, atrMultiple: null, riskReward: 2, maxBars: 64 },
  { id: "atr-1.5-rr-2.0", mode: "atr", bufferAtr: null, atrMultiple: 1.5, riskReward: 2, maxBars: 64 }
]);

export const PHASE3_CANDIDATES = Object.freeze(
  PHASE3_SIGNAL_VARIANTS.flatMap((signal) =>
    PHASE3_RISK_VARIANTS.flatMap((risk) =>
      [false, true].flatMap((breakEven) =>
        ["both", "long_only", "short_only"].map((directionMode) => Object.freeze({
          id: `${signal.id}__${risk.id}__${breakEven ? "be1r" : "no-be"}__${directionMode}`,
          signal,
          risk,
          breakEven,
          directionMode
        }))
      )
    )
  )
);

export function preparePhase3Features(candles) {
  const rsi = calculateRsi(candles, 14);
  return {
    rsi,
    atr: calculateAtr(candles, 14),
    divergence: divergenceEvents(candles, rsi, SPEC),
    htf: closed4hTrend(candles)
  };
}

function directionEnabled(direction, mode) {
  return mode === "both" || mode === `${direction}_only`;
}

function htfAllows(direction, state, variant) {
  if (!state) return false;
  const fast = state[variant.fast];
  const slow = state[variant.slow];
  if (![fast, slow, state.close].every(Number.isFinite)) return false;
  if (direction === "long" && !(fast > slow && state.close > slow)) return false;
  if (direction === "short" && !(fast < slow && state.close < slow)) return false;
  if (variant.slope) {
    const previous = variant.fast === "ema20" ? state.previousEma20 : state.previousEma50;
    if (!Number.isFinite(previous)) return false;
    if (direction === "long" && fast <= previous) return false;
    if (direction === "short" && fast >= previous) return false;
  }
  return true;
}

function setupFromSignal(direction, index, candles, features, event, candidate) {
  if (!event || !directionEnabled(direction, candidate.directionMode)) return null;
  if (!htfAllows(direction, features.htf.state[index], candidate.signal)) return null;
  if (direction === "long" && candidate.signal.pivotLongMax !== null && event.pivotRsi > candidate.signal.pivotLongMax) return null;
  if (direction === "short" && candidate.signal.pivotShortMin !== null && event.pivotRsi < candidate.signal.pivotShortMin) return null;
  const pivotCandle = candles[event.pivotIndex];
  if (!pivotCandle) return null;
  return {
    direction,
    signalIndex: index,
    signalTimestamp: candles[index].timestamp,
    trigger: direction === "long" ? candles[index].high : candles[index].low,
    pivotPrice: direction === "long" ? pivotCandle.low : pivotCandle.high,
    expiresAfterIndex: index + candidate.signal.expiryBars
  };
}

function entryFill(setup, candle) {
  if (setup.direction === "long") {
    if (candle.open >= setup.trigger) return candle.open;
    if (candle.high >= setup.trigger) return setup.trigger;
    return null;
  }
  if (candle.open <= setup.trigger) return candle.open;
  if (candle.low <= setup.trigger) return setup.trigger;
  return null;
}

function adverseFill(price, direction, entry, slippage) {
  if (direction === "long") return price * (entry ? 1 + slippage : 1 - slippage);
  return price * (entry ? 1 - slippage : 1 + slippage);
}

function netBreakEvenRaw(entry, direction, costs) {
  const c = costs.commission;
  const s = costs.slippage;
  if (direction === "long") {
    const exitFill = entry * (1 + c) / (1 - c);
    return exitFill / (1 - s);
  }
  const discriminant = (1 + c) ** 2 + 4 * c;
  const exitRatio = c === 0 ? 1 : (-(1 + c) + Math.sqrt(discriminant)) / (2 * c);
  const exitFill = entry * exitRatio;
  return exitFill / (1 + s);
}

function openPosition(symbol, setup, candle, rawEntry, atr, candidate, costs, entryIndex) {
  const entry = adverseFill(rawEntry, setup.direction, true, costs.slippage);
  let rawStop;
  if (candidate.risk.mode === "pivot") {
    rawStop = setup.direction === "long"
      ? setup.pivotPrice - candidate.risk.bufferAtr * atr
      : setup.pivotPrice + candidate.risk.bufferAtr * atr;
  } else {
    rawStop = setup.direction === "long"
      ? entry - candidate.risk.atrMultiple * atr
      : entry + candidate.risk.atrMultiple * atr;
  }
  const risk = setup.direction === "long" ? entry - rawStop : rawStop - entry;
  if (!(risk > 0) || risk / atr < 0.25 || risk / atr > 4) return null;
  return {
    symbol,
    direction: setup.direction,
    signalTimestamp: setup.signalTimestamp,
    entryTimestamp: candle.timestamp,
    entryIndex,
    entry,
    atr,
    initialRisk: risk,
    stop: rawStop,
    target: setup.direction === "long"
      ? entry + risk * candidate.risk.riskReward
      : entry - risk * candidate.risk.riskReward,
    breakEvenRaw: netBreakEvenRaw(entry, setup.direction, costs),
    breakEvenArmed: false,
    breakEvenActive: false,
    bars: 0
  };
}

function closePosition(position, candle, rawPrice, reason, costs, ambiguous, candidateId) {
  const exit = adverseFill(rawPrice, position.direction, false, costs.slippage);
  const gross = position.direction === "long" ? exit / position.entry - 1 : position.entry / exit - 1;
  const fees = costs.commission + (exit / position.entry) * costs.commission;
  return {
    candidate_id: candidateId,
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

export function runPhase3Candidate(candles, features, candidate, options = {}) {
  const symbol = options.symbol ?? "UNKNOWN";
  const tradeStart = options.tradeStart ?? Number.NEGATIVE_INFINITY;
  const tradeEndExclusive = options.tradeEndExclusive ?? Number.POSITIVE_INFINITY;
  const costs = {
    commission: options.commission ?? 0.001,
    slippage: options.slippage ?? 0.0005
  };
  const policy = options.intrabarPolicy ?? "tradingview_path";
  const trades = [];
  let setup = null;
  let position = null;

  for (let index = 0; index < candles.length; index += 1) {
    const candle = candles[index];
    if (candle.timestamp >= tradeEndExclusive) break;

    if (position && index > position.entryIndex) {
      position.bars += 1;
      if (position.breakEvenArmed) {
        position.breakEvenActive = true;
        position.breakEvenArmed = false;
      }
      const activeStop = position.breakEvenActive
        ? (position.direction === "long"
          ? Math.max(position.stop, position.breakEvenRaw)
          : Math.min(position.stop, position.breakEvenRaw))
        : position.stop;
      const resolved = resolveIntrabar({ ...position, stop: activeStop }, candle, policy);
      if (resolved) {
        const causalBe = position.breakEvenActive && activeStop !== position.stop && resolved.reason.startsWith("stop");
        trades.push(closePosition(
          position,
          candle,
          resolved.price,
          causalBe ? "break_even_stop" : resolved.reason,
          costs,
          resolved.ambiguous,
          candidate.id
        ));
        position = null;
      } else if (position.bars >= candidate.risk.maxBars) {
        trades.push(closePosition(position, candle, candle.close, "time_exit", costs, false, candidate.id));
        position = null;
      } else if (candidate.breakEven && !position.breakEvenActive && !position.breakEvenArmed) {
        const activation = position.direction === "long"
          ? position.entry + position.initialRisk
          : position.entry - position.initialRisk;
        const touched = position.direction === "long"
          ? candle.open >= activation || candle.high >= activation
          : candle.open <= activation || candle.low <= activation;
        if (touched) position.breakEvenArmed = true;
      }
    }

    if (position || candle.timestamp < tradeStart) continue;

    if (setup && index > setup.signalIndex) {
      if (index > setup.expiresAfterIndex) {
        setup = null;
      } else {
        const rawEntry = entryFill(setup, candle);
        if (rawEntry !== null) {
          const opened = openPosition(symbol, setup, candle, rawEntry, features.atr[index], candidate, costs, index);
          setup = null;
          if (opened) position = opened;
        }
      }
    }

    if (position) continue;
    const longSetup = setupFromSignal("long", index, candles, features, features.divergence.bullish[index], candidate);
    const shortSetup = setupFromSignal("short", index, candles, features, features.divergence.bearish[index], candidate);
    if (longSetup && shortSetup) {
      setup = null;
    } else if (longSetup) {
      setup = longSetup;
    } else if (shortSetup) {
      setup = shortSetup;
    }
  }

  if (position) {
    const finalCandle = [...candles].reverse().find((candle) => candle.timestamp < tradeEndExclusive);
    if (finalCandle) trades.push(closePosition(position, finalCandle, finalCandle.close, "partition_end", costs, false, candidate.id));
  }

  return { trades, metrics: summarize(trades) };
}

export function phase3Score(metrics) {
  const pf = metrics.profit_factor ?? 0;
  const tradePenalty = metrics.closed_trades < 120 ? (120 - metrics.closed_trades) / 120 : 0;
  return metrics.total_net_return_units + Math.min(pf, 2) * 0.75 - metrics.max_drawdown_return_units * 0.5 - tradePenalty;
}
