import {
  atr, crossover, crossunder, dmi, ema, fairValueGaps, highest, liquiditySweep, lowest, macd,
  orderBlocks, pivotHigh, pivotLow, rsi, sma, structureBias, supertrend, valueWhenPrevious, vwap
} from "./indicators.mjs";

const DAY = 86400000;
// Epoch was a Thursday; shift so weekly buckets start Monday 00:00 UTC.
const MONDAY_SHIFT = 4 * DAY;

const bucketStart = (timestamp, timeframe) => {
  if (timeframe === "D") return Math.floor(timestamp / DAY) * DAY;
  if (timeframe === "W") return Math.floor((timestamp + MONDAY_SHIFT) / (7 * DAY)) * (7 * DAY) - MONDAY_SHIFT;
  if (timeframe === "M") {
    const date = new Date(timestamp);
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
  }
  const minutes = Number(timeframe);
  if (!Number.isFinite(minutes) || minutes <= 0) throw new Error(`Unsupported timeframe: ${timeframe}`);
  const interval = minutes * 60000;
  return Math.floor(timestamp / interval) * interval;
};

export function timeframeMinutes(timeframe) {
  if (timeframe === "D") return 1440;
  if (timeframe === "W") return 10080;
  if (timeframe === "M") return 43200;
  const minutes = Number(timeframe);
  return Number.isFinite(minutes) ? minutes : null;
}

function groupByBucket(candles, timeframe) {
  const buckets = [];
  let current = null;
  for (const candle of candles) {
    const start = bucketStart(candle.timestamp, timeframe);
    if (!current || current.timestamp !== start) {
      current = { timestamp: start, open: candle.open, high: candle.high, low: candle.low, close: candle.close, volume: candle.volume };
      buckets.push(current);
    } else {
      current.high = Math.max(current.high, candle.high);
      current.low = Math.min(current.low, candle.low);
      current.close = candle.close;
      current.volume += candle.volume;
    }
  }
  return buckets;
}

// request.security(..., close[1] > ma[1], lookahead_on) reads the last fully
// closed higher-timeframe candle. Anything else would leak unclosed information.
function higherTimeframeBias(candles, config) {
  const { timeframe, method, length, closedBarOnly } = config.higherTimeframe;
  const buckets = groupByBucket(candles, timeframe);
  const closes = buckets.map((bucket) => bucket.close);
  let bull;
  if (method === "supertrend") {
    const { direction } = supertrend(buckets, config.trend.supertrendFactor, config.trend.supertrendAtrLength);
    bull = direction.map((value) => (value === null ? null : value < 0));
  } else {
    const line = method === "sma" ? sma(closes, length) : ema(closes, length);
    bull = line.map((value, index) => (value === null ? null : closes[index] > value));
  }

  const index = new Map();
  buckets.forEach((bucket, position) => index.set(bucket.timestamp, position));
  return candles.map((candle) => {
    const position = index.get(bucketStart(candle.timestamp, timeframe));
    if (position === undefined) return null;
    const read = closedBarOnly ? position - 1 : position;
    return read < 0 ? null : bull[read];
  });
}

function sessionMask(candles, config) {
  const [from, to] = config.execution.session.split("-");
  const zone = config.execution.sessionTimezone === "exchange" ? "UTC" : config.execution.sessionTimezone;
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone, hour: "2-digit", minute: "2-digit", hour12: false
  });
  const start = Number(from);
  const end = Number(to);
  return candles.map((candle) => {
    const parts = formatter.format(new Date(candle.timestamp)).split(":");
    const minute = Number(parts[0]) * 100 + Number(parts[1]);
    return start <= end ? minute >= start && minute < end : minute >= start || minute < end;
  });
}

// Each plan filter id maps to exactly one predicate. An unmapped id throws rather
// than silently dropping a condition the generated Pine would enforce.
export function buildSeries(config, candles, { structural = false, swingLookback } = {}) {
  const closes = candles.map((candle) => candle.close);
  const series = { candles, closes };

  // Built when a sweep axis asks for them, and whenever the config itself gates on
  // structure — otherwise a preset that adopted the structural bias would reach its
  // filter with no series behind it.
  const lookback = swingLookback ?? config.swingLookback ?? 3;
  if (structural || config.biasSource === "swing_structure") {
    series.structureBull = structureBias(candles, lookback);
    series.sweep = liquiditySweep(candles, lookback);
    series.fvg = fairValueGaps(candles);
    series.orderBlock = orderBlocks(candles);
  }

  series.emaFast = ema(closes, config.trend.emaFast);
  series.emaSlow = ema(closes, config.trend.emaSlow);
  series.longMa = config.trend.longMaType === "sma"
    ? sma(closes, config.trend.longMaLength)
    : ema(closes, config.trend.longMaLength);
  series.vwap = vwap(candles);
  series.rsi = rsi(closes, config.momentum.rsiLength);
  series.atr = atr(candles, config.risk.atrLength);
  series.volumeAverage = sma(candles.map((candle) => candle.volume), config.volume.averageLength);

  if (config.momentum.macdEnabled) series.macd = macd(closes, 12, 26, 9);
  if (config.momentum.adxEnabled) series.dmi = dmi(candles, config.momentum.adxLength, config.momentum.adxLength);
  if (config.trend.supertrendEnabled || config.entryTrigger === "supertrend_flip") {
    series.supertrend = supertrend(candles, config.trend.supertrendFactor, config.trend.supertrendAtrLength);
  }
  if (config.entryTrigger === "breakout") {
    series.previousHigh = highest(candles.map((candle) => candle.high), config.trend.breakoutLength);
    series.previousLow = lowest(candles.map((candle) => candle.low), config.trend.breakoutLength);
  }
  if (config.momentum.divergenceEnabled) {
    const pivot = config.momentum.divergencePivot;
    const pricePivotLow = pivotLow(candles.map((candle) => candle.low), pivot, pivot);
    const pricePivotHigh = pivotHigh(candles.map((candle) => candle.high), pivot, pivot);
    const rsiPivotLow = pivotLow(series.rsi, pivot, pivot);
    const rsiPivotHigh = pivotHigh(series.rsi, pivot, pivot);
    series.divergence = {
      pricePivotLow, pricePivotHigh, rsiPivotLow, rsiPivotHigh,
      prevPriceLow: valueWhenPrevious(pricePivotLow),
      prevPriceHigh: valueWhenPrevious(pricePivotHigh),
      prevRsiLow: valueWhenPrevious(rsiPivotLow),
      prevRsiHigh: valueWhenPrevious(rsiPivotHigh)
    };
  }
  if (config.higherTimeframe.enabled) series.htfBull = higherTimeframeBias(candles, config);
  if (config.execution.sessionEnabled) series.session = sessionMask(candles, config);

  if (config.risk.stopMode === "swing") {
    series.swingLow = lowest(candles.map((candle) => candle.low), config.risk.swingLength);
    series.swingHigh = highest(candles.map((candle) => candle.high), config.risk.swingLength);
  }
  return series;
}

const FILTERS = {
  ema_trend: (s, i, long) => s.emaFast[i] !== null && s.emaSlow[i] !== null && (long ? s.emaFast[i] > s.emaSlow[i] : s.emaFast[i] < s.emaSlow[i]),
  long_ma: (s, i, long) => s.longMa[i] !== null && (long ? s.closes[i] > s.longMa[i] : s.closes[i] < s.longMa[i]),
  vwap: (s, i, long) => s.vwap[i] !== null && (long ? s.closes[i] > s.vwap[i] : s.closes[i] < s.vwap[i]),
  supertrend: (s, i, long) => s.supertrend.direction[i] !== null && (long ? s.supertrend.direction[i] < 0 : s.supertrend.direction[i] > 0),
  rsi: (s, i, long, c) => s.rsi[i] !== null && (long ? s.rsi[i] >= c.momentum.rsiLong : s.rsi[i] <= c.momentum.rsiShort),
  macd: (s, i, long) => s.macd.line[i] !== null && s.macd.signal[i] !== null && s.macd.histogram[i] !== null &&
    (long ? s.macd.line[i] > s.macd.signal[i] && s.macd.histogram[i] > 0 : s.macd.line[i] < s.macd.signal[i] && s.macd.histogram[i] < 0),
  adx: (s, i, long, c) => s.dmi.adx[i] !== null && s.dmi.plusDI[i] !== null && s.dmi.minusDI[i] !== null &&
    s.dmi.adx[i] >= c.momentum.adxThreshold && (long ? s.dmi.plusDI[i] > s.dmi.minusDI[i] : s.dmi.minusDI[i] > s.dmi.plusDI[i]),
  divergence: (s, i, long) => {
    const d = s.divergence;
    if (long) {
      return d.pricePivotLow[i] !== null && d.rsiPivotLow[i] !== null &&
        d.prevPriceLow[i] !== null && d.prevRsiLow[i] !== null &&
        d.pricePivotLow[i] < d.prevPriceLow[i] && d.rsiPivotLow[i] > d.prevRsiLow[i];
    }
    return d.pricePivotHigh[i] !== null && d.rsiPivotHigh[i] !== null &&
      d.prevPriceHigh[i] !== null && d.prevRsiHigh[i] !== null &&
      d.pricePivotHigh[i] > d.prevPriceHigh[i] && d.rsiPivotHigh[i] < d.prevRsiHigh[i];
  },
  volume: (s, i, long, c) => s.volumeAverage[i] !== null && s.candles[i].volume >= s.volumeAverage[i] * c.volume.multiplier,
  htf_bias: (s, i, long) => s.htfBull[i] !== null && (long ? s.htfBull[i] : !s.htfBull[i]),
  // Same role as htf_bias — decide which side is allowed — read from swing structure
  // instead of a higher-timeframe average, so it turns on the break rather than after it.
  structure_bias: (s, i, long) => s.structureBull[i] !== null && (long ? s.structureBull[i] : !s.structureBull[i]),
  session: (s, i) => s.session[i],
  // Every candle in a backtest is closed, so confirmation is structurally true.
  confirmation: () => true
};

const TRIGGERS = {
  trend_state: () => true,
  ema_cross: (s, i, long) => (long ? crossover(s.emaFast, i, s.emaSlow) : crossunder(s.emaFast, i, s.emaSlow)),
  pullback_reclaim: (s, i, long) => (long ? crossover(s.closes, i, s.emaFast) : crossunder(s.closes, i, s.emaFast)),
  vwap_reclaim: (s, i, long) => (long ? crossover(s.closes, i, s.vwap) : crossunder(s.closes, i, s.vwap)),
  supertrend_flip: (s, i, long) => {
    const direction = s.supertrend.direction;
    if (i === 0 || direction[i] === null || direction[i - 1] === null) return false;
    const change = direction[i] - direction[i - 1];
    return long ? change < 0 : change > 0;
  },
  breakout: (s, i, long) => {
    const level = long ? s.previousHigh : s.previousLow;
    if (i === 0 || level[i - 1] === null || level[i - 2] === undefined || level[i - 2] === null) return false;
    const shifted = [level[i - 2], level[i - 1]];
    return long
      ? s.closes[i - 1] <= shifted[0] && s.closes[i] > shifted[1]
      : s.closes[i - 1] >= shifted[0] && s.closes[i] < shifted[1];
  },
  // Enter after liquidity was taken and rejected, rather than on a moving-average
  // event. A sell-side sweep reads bullish: the low was run and price closed back above.
  sweep_reversal: (s, i, long) => (long ? s.sweep.bullish[i] : s.sweep.bearish[i]),
  // Enter where price returns into a gap it previously ran through.
  fvg_return: (s, i, long) => (long ? s.fvg.bullish[i] : s.fvg.bearish[i]),
  // Enter where price returns to the last opposite candle before a displacement move.
  order_block_retest: (s, i, long) => (long ? s.orderBlock.bullish[i] : s.orderBlock.bearish[i])
};

export const SCORE_WEIGHTS = Object.freeze({
  ema_trend: 30, supertrend: 30, htf_bias: 25, adx: 25, divergence: 25,
  rsi: 15, macd: 15, vwap: 15, long_ma: 10, volume: 10,
  // Carries the weight htf_bias would have had, since it replaces it and answers the
  // same question. A different weight would change the score as well as the source.
  structure_bias: 25
});
const MANDATORY = new Set(["confirmation", "session"]);

export function knownFilterIds() { return Object.keys(FILTERS); }
export function knownTriggerIds() { return Object.keys(TRIGGERS); }

// The plan is passed in rather than imported so this module never depends on a
// build artifact: lib/ stays the single source of truth for which filters exist.
export function buildSignals(
  config,
  plan,
  candles,
  {
    signalMode = "all", scoreThreshold = 60, series: reused, triggerWindow = 1,
    // Axes for measuring the ICT mechanisms against the ones already in the product.
    // "htf" and "preset" reproduce the untouched behaviour.
    biasSource = "htf",
    triggerSource = "preset"
  } = {}
) {
  const structural = biasSource === "structure" || ["sweep_reversal", "fvg_return", "order_block_retest"].includes(triggerSource);
  // Indicators depend only on the config, so a caller sweeping signal modes can
  // compute them once and pass them back in.
  const series = reused ?? buildSeries(config, candles, { structural });
  const allowShort = config.direction === "long_short";

  if (structural && (!series.structureBull || !series.sweep)) {
    throw new Error("Structural axis needs series built with { structural: true }");
  }

  // Swapping the bias replaces the higher-timeframe filter in place, so the preset keeps
  // every other filter it has and only the source of its directional veto changes. A
  // preset without a higher-timeframe filter gains one, which is the comparison worth
  // making: the question is whether structure is a better gate, not whether more gates help.
  let filters = plan.entry.filters;
  if (biasSource === "structure") {
    filters = filters.filter((filter) => filter.id !== "htf_bias");
    filters = [...filters, { id: "structure_bias" }];
  }

  for (const filter of filters) {
    if (!FILTERS[filter.id]) throw new Error(`Sweep has no predicate for plan filter: ${filter.id}`);
  }
  const triggerId = triggerSource === "preset" ? plan.entry.trigger.id : triggerSource;
  const trigger = TRIGGERS[triggerId];
  if (!trigger) throw new Error(`Sweep has no predicate for plan trigger: ${triggerId}`);

  const scored = filters.filter((filter) => SCORE_WEIGHTS[filter.id]);
  const totalWeight = scored.reduce((sum, filter) => sum + SCORE_WEIGHTS[filter.id], 0);
  const mandatory = filters.filter((filter) => MANDATORY.has(filter.id));

  const evaluate = (index, long) => {
    if (signalMode === "score" && totalWeight > 0) {
      for (const filter of mandatory) if (!FILTERS[filter.id](series, index, long, config)) return false;
      let raw = 0;
      for (const filter of scored) if (FILTERS[filter.id](series, index, long, config)) raw += SCORE_WEIGHTS[filter.id];
      return Math.round((100 * raw) / totalWeight) >= scoreThreshold;
    }
    for (const filter of filters) if (!FILTERS[filter.id](series, index, long, config)) return false;
    return true;
  };

  // A trigger is a one-bar event while the filters move slowly, so demanding both on the
  // same candle throws away setups that become valid a bar or two later. triggerWindow
  // keeps a fired trigger alive for that many candles; 1 is the same-bar behaviour.
  const window = Math.max(1, triggerWindow);
  const triggeredLong = new Array(candles.length).fill(false);
  const triggeredShort = new Array(candles.length).fill(false);
  for (let index = 0; index < candles.length; index += 1) {
    triggeredLong[index] = trigger(series, index, true);
    if (allowShort) triggeredShort[index] = trigger(series, index, false);
  }
  const firedWithin = (marks, index) => {
    for (let back = 0; back < window && index - back >= 0; back += 1) if (marks[index - back]) return true;
    return false;
  };

  const long = new Array(candles.length).fill(false);
  const short = new Array(candles.length).fill(false);
  let lastSignalBar = null;
  for (let index = 0; index < candles.length; index += 1) {
    const cooldownOk = lastSignalBar === null || index - lastSignalBar > config.execution.cooldownBars;
    if (!cooldownOk) continue;
    const longNow = firedWithin(triggeredLong, index) && evaluate(index, true);
    const shortNow = allowShort && firedWithin(triggeredShort, index) && evaluate(index, false);
    long[index] = longNow;
    short[index] = shortNow;
    if (longNow || shortNow) lastSignalBar = index;
  }
  return { series, long, short };
}

// Mirrors the generated indicator exactly: arm on the signal candle, fill at the
// next candle's open with the risk distance frozen at the signal, resolve stop and
// target intrabar, charge both sides of the commission, and score a win only when
// the trade is positive after costs.
export function simulate(
  config,
  candles,
  signals,
  { riskReward, costPerSide = 0.01, breakEvenAtR = null, trailStartR = null, trailDistanceR = null, intrabar = null } = {}
) {
  const { series, long, short } = signals;
  const reward = riskReward ?? config.risk.riskReward;
  const useClose = config.risk.stopTrigger === "close";
  const trades = [];

  let direction = 0;
  let entry = null;
  let stop = null;
  let target = null;
  let startedBar = null;
  let unit = null;
  let bestR = 0;
  let pendingDirection = 0;
  let pendingRisk = null;

  // A stop only ever moves in the trade's favour. Applied on the candle after the level
  // was reached, because a candle cannot prove the favourable excursion came first.
  const manageStop = (candle) => {
    if (unit === null || unit <= 0) return;
    const excursion = direction === 1 ? (candle.high - entry) / unit : (entry - candle.low) / unit;
    if (excursion > bestR) bestR = excursion;

    if (breakEvenAtR !== null && bestR >= breakEvenAtR) {
      stop = direction === 1 ? Math.max(stop, entry) : Math.min(stop, entry);
    }
    if (trailStartR !== null && trailDistanceR !== null && bestR >= trailStartR) {
      const trailed = direction === 1 ? entry + (bestR - trailDistanceR) * unit : entry - (bestR - trailDistanceR) * unit;
      stop = direction === 1 ? Math.max(stop, trailed) : Math.min(stop, trailed);
    }
  };

  const riskDistance = (index, isLong) => {
    if (config.risk.stopMode === "atr") {
      return series.atr[index] === null ? null : series.atr[index] * config.risk.atrMultiple;
    }
    if (config.risk.stopMode === "percent") return series.closes[index] * (config.risk.stopPercent / 100);
    if (config.risk.stopMode === "swing") {
      const level = isLong ? series.swingLow[index] : series.swingHigh[index];
      if (level === null) return null;
      return isLong ? series.closes[index] - level : level - series.closes[index];
    }
    return null;
  };

  const close = (index, price, reason) => {
    // Scored against the risk taken at entry, so a trade that was stopped at break-even
    // reads as zero rather than being rescaled by its moved stop.
    const gross = direction === 1 ? (price - entry) / unit : (entry - price) / unit;
    const cost = ((costPerSide / 100) * (entry + price)) / unit;
    trades.push({
      direction, entryIndex: startedBar, entryTimestamp: candles[startedBar].timestamp,
      entry, stop, target, exitIndex: index, exitTimestamp: candles[index].timestamp,
      exitPrice: price, reason, grossR: gross, netR: gross - cost
    });
    direction = 0; entry = null; stop = null; target = null; startedBar = null; unit = null; bestR = 0;
  };

  for (let index = 0; index < candles.length; index += 1) {
    const candle = candles[index];

    if (pendingDirection !== 0 && direction === 0 && pendingRisk > 0) {
      direction = pendingDirection;
      entry = candle.open;
      unit = pendingRisk;
      bestR = 0;
      stop = direction === 1 ? entry - pendingRisk : entry + pendingRisk;
      target = direction === 1 ? entry + pendingRisk * reward : entry - pendingRisk * reward;
      startedBar = index;
      pendingDirection = 0;
      pendingRisk = null;
    }

    if (direction !== 0) {
      // Walking the candle's own five-minute candles in order settles which level was
      // reached first. Without them a chart candle that touched both is charged as a
      // loss, which is safe but systematically pessimistic.
      const steps = intrabar?.[index]?.length ? intrabar[index] : [candle];
      const lastStep = steps.length - 1;

      for (let step = 0; step <= lastStep && direction !== 0; step += 1) {
        const bar = steps[step];
        // A close-confirmed stop is a rule about the chart candle, not about a piece of
        // it, so it is only tested once the chart candle is complete.
        const stopHit = useClose
          ? step === lastStep && (direction === 1 ? candle.close <= stop : candle.close >= stop)
          : (direction === 1 ? bar.low <= stop : bar.high >= stop);
        const targetHit = direction === 1 ? bar.high >= target : bar.low <= target;

        if (stopHit || targetHit) {
          const ambiguous = stopHit && targetHit;
          // A close-confirmed stop is not filled at the stop level: the candle already
          // closed beyond it, so the exit is the close and the loss exceeds one unit.
          const stopExit = useClose ? candle.close : stop;
          close(index, ambiguous ? stopExit : stopHit ? stopExit : target, ambiguous ? "ambiguous" : stopHit ? "stop" : "target");
        } else {
          manageStop(bar);
        }
      }

      if (direction !== 0 && ((direction === 1 && short[index]) || (direction === -1 && long[index]))) {
        close(index, candle.close, "reversed");
      }
    }

    const acceptedLong = long[index] && direction !== 1;
    const acceptedShort = short[index] && direction !== -1;
    if (direction === 0 && (acceptedLong || acceptedShort)) {
      const isLong = acceptedLong;
      const distance = riskDistance(index, isLong);
      if (distance !== null && distance > 0) {
        pendingDirection = isLong ? 1 : -1;
        pendingRisk = distance;
      }
    }
  }
  return trades;
}

export function summarize(trades) {
  let wins = 0;
  let netR = 0;
  let grossR = 0;
  let peak = 0;
  let cumulative = 0;
  let drawdown = 0;
  let profit = 0;
  let loss = 0;
  for (const trade of trades) {
    netR += trade.netR;
    grossR += trade.grossR;
    cumulative += trade.netR;
    peak = Math.max(peak, cumulative);
    drawdown = Math.max(drawdown, peak - cumulative);
    if (trade.netR > 0) { wins += 1; profit += trade.netR; } else { loss += Math.abs(trade.netR); }
  }
  return {
    trades: trades.length,
    wins,
    losses: trades.length - wins,
    win_rate: trades.length ? wins / trades.length : null,
    net_r: netR,
    gross_r: grossR,
    expectancy_r: trades.length ? netR / trades.length : null,
    profit_factor: loss ? profit / loss : null,
    max_drawdown_r: drawdown
  };
}
