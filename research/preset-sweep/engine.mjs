import {
  atr, crossover, crossunder, dmi, ema, fairValueGaps, highest, liquiditySweep, lowest, macd,
  orderBlocks, pivotHigh, pivotLow, rsi, sma, structureBias, supertrend, vwap
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

// The generated Pine finds pivots in RSI, then samples price at those RSI pivot bars.
// It does not require price itself to be a pivot. The prior sweep engine did require an
// RSI pivot and a price pivot on the same bar, which removed roughly half the product's
// divergence signals. Pine also accepts the previous RSI pivot only when its confirmation
// is 5-60 bars back (`ta.barssince(pivotFound[1])`); keep those defaults here because they
// are the inputs emitted by compiler-v14.
export function confirmedRegularDivergence(
  candles,
  rsiValues,
  pivotOrOptions,
  legacyRangeMinimum = 5,
  legacyRangeMaximum = 60
) {
  const options = typeof pivotOrOptions === "number"
    ? {
        left: pivotOrOptions,
        right: pivotOrOptions,
        rangeMinimum: legacyRangeMinimum,
        rangeMaximum: legacyRangeMaximum
      }
    : pivotOrOptions;
  const {
    left,
    right,
    rangeMinimum = 5,
    rangeMaximum = 60
  } = options;
  const rsiPivotLow = pivotLow(rsiValues, left, right);
  const rsiPivotHigh = pivotHigh(rsiValues, left, right);
  const bullish = new Array(candles.length).fill(false);
  const bearish = new Array(candles.length).fill(false);
  let previousLow = null;
  let previousHigh = null;

  for (let confirmation = 0; confirmation < candles.length; confirmation += 1) {
    const pivotIndex = confirmation - right;
    if (rsiPivotLow[confirmation] !== null) {
      const current = {
        confirmation,
        rsi: rsiPivotLow[confirmation],
        price: candles[pivotIndex].low
      };
      if (previousLow) {
        const distance = confirmation - previousLow.confirmation - 1;
        bullish[confirmation] =
          distance >= rangeMinimum &&
          distance <= rangeMaximum &&
          current.rsi > previousLow.rsi &&
          current.price < previousLow.price;
      }
      previousLow = current;
    }

    if (rsiPivotHigh[confirmation] !== null) {
      const current = {
        confirmation,
        rsi: rsiPivotHigh[confirmation],
        price: candles[pivotIndex].high
      };
      if (previousHigh) {
        const distance = confirmation - previousHigh.confirmation - 1;
        bearish[confirmation] =
          distance >= rangeMinimum &&
          distance <= rangeMaximum &&
          current.rsi < previousHigh.rsi &&
          current.price > previousHigh.price;
      }
      previousHigh = current;
    }
  }

  return { bullish, bearish };
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
    series.divergence = confirmedRegularDivergence(candles, series.rsi, {
      left: config.momentum.divergencePivotLeft ?? pivot,
      right: config.momentum.divergencePivotRight ?? pivot,
      rangeMinimum: config.momentum.divergenceRangeMinimum ?? 5,
      rangeMaximum: config.momentum.divergenceRangeMaximum ?? 60
    });
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
  divergence: (s, i, long) => long ? s.divergence.bullish[i] : s.divergence.bearish[i],
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

// Entries found inside the candle instead of after it closed.
//
// buildSignals answers "was this setup valid once the candle finished", and the fill that
// follows is the next candle's open. On a large candle those are far apart: the level breaks
// early in the hour and the fill lands near the top of the move, which is the complaint that
// started this. Here the trigger is checked on the lower-timeframe candles that make up the
// chart candle, and the entry is the lower-timeframe close where it first fires.
//
// Nothing looks ahead. Three layers, each coarser than the one below it:
//   bias      — higher timeframe, unchanged, only moves when the 4h candle closes
//   levels    — the last CLOSED chart candle: the breakout high, the EMA, ADX, RSI. These
//               have no intrabar value by definition; an EMA of hourly closes does not
//               exist halfway through an hour.
//   the moment — the lower-timeframe close, where price meets a level that was already known
//
// Two filters are exceptions because they genuinely do have an intrabar value, and both are
// computed on the lower-timeframe series: VWAP, which is cumulative and anchored to the day,
// and volume, compared against a lower-timeframe volume average rather than the chart one.
// Comparing a partial hour's volume against an hourly average would reject almost everything.
//
// Only level-crossing triggers can be improved this way. ema_cross and supertrend_flip are
// changes in an indicator's own state, which only happens at the chart close, so they are
// rejected here rather than silently measured as something they are not.
const INTRABAR_TRIGGERS = new Set(["breakout", "pullback_reclaim", "vwap_reclaim"]);

export function buildIntrabarSignals(config, plan, candles, groups, { series: reused, signalMode = "all", scoreThreshold = 60 } = {}) {
  const series = reused ?? buildSeries(config, candles);
  const allowShort = config.direction === "long_short";
  const triggerId = plan.entry.trigger.id;
  if (!INTRABAR_TRIGGERS.has(triggerId)) {
    throw new Error(
      `Intrabar entry cannot improve the "${triggerId}" trigger: it is an indicator-state change, ` +
      "which only happens when the chart candle closes. Supported: " + [...INTRABAR_TRIGGERS].join(", ")
    );
  }

  // The lower-timeframe series, flattened so cumulative values run across chart candles the
  // way they actually do, then indexed back to the step it belongs to.
  const steps = groups.flat();
  const stepVwap = vwap(steps);
  // The same lookback the preset asks for, counted in lower-timeframe candles: twenty
  // five-minute bars rather than twenty hours. That is what makes it a comparison between a
  // breakout candle and the candles around it instead of against a different timescale.
  const stepVolumeAverage = sma(steps.map((candle) => candle.volume), config.volume.averageLength);
  const offsets = [];
  let running = 0;
  for (const group of groups) {
    offsets.push(running);
    running += group.length;
  }

  const fixed = plan.entry.filters.filter(
    (filter) => !["volume", "vwap", "long_ma", "confirmation", "session"].includes(filter.id)
  );
  for (const filter of plan.entry.filters) {
    if (!FILTERS[filter.id]) throw new Error(`Sweep has no predicate for plan filter: ${filter.id}`);
  }
  const usesVolume = plan.entry.filters.some((filter) => filter.id === "volume");
  const usesVwap = plan.entry.filters.some((filter) => filter.id === "vwap");
  const usesLongMa = plan.entry.filters.some((filter) => filter.id === "long_ma");
  const usesSession = plan.entry.filters.some((filter) => filter.id === "session");

  // Score mode weighs filters against each other, which needs every filter on the same
  // footing. Mixing chart-bar and intrabar footings would produce a score that means nothing,
  // so it is refused rather than approximated.
  if (signalMode === "score") {
    throw new Error("Intrabar entry does not support score mode: the filters sit on two different footings");
  }
  void scoreThreshold;

  const entries = new Array(candles.length).fill(null);
  const cooldown = Math.max(0, config.execution.cooldownBars);
  let lastSignalBar = null;

  for (let index = 1; index < candles.length; index += 1) {
    if (lastSignalBar !== null && index - lastSignalBar <= cooldown) continue;
    const group = groups[index];
    if (!group?.length) continue;
    const previous = index - 1;

    // Everything that cannot move inside the candle is decided once, before the walk.
    const fixedOk = (long) => {
      for (const filter of fixed) if (!FILTERS[filter.id](series, previous, long, config)) return false;
      return true;
    };
    const longAllowed = fixedOk(true);
    const shortAllowed = allowShort && fixedOk(false);
    if (!longAllowed && !shortAllowed) continue;

    const level = {
      longBreak: series.previousHigh?.[previous] ?? null,
      shortBreak: series.previousLow?.[previous] ?? null,
      emaFast: series.emaFast[previous],
      longMa: series.longMa[previous]
    };

    // The reference the crossing is measured from: the last close before this candle opened,
    // then each step's own close as the walk proceeds.
    let reference = series.closes[previous];
    for (let step = 0; step < group.length; step += 1) {
      const bar = group[step];
      const at = offsets[index] + step;
      const price = bar.close;

      const crossed = (long) => {
        if (triggerId === "breakout") {
          const line = long ? level.longBreak : level.shortBreak;
          if (line === null) return false;
          return long ? reference <= line && price > line : reference >= line && price < line;
        }
        if (triggerId === "pullback_reclaim") {
          if (level.emaFast === null) return false;
          return long ? reference <= level.emaFast && price > level.emaFast : reference >= level.emaFast && price < level.emaFast;
        }
        const line = stepVwap[at];
        if (line === null) return false;
        return long ? reference <= line && price > line : reference >= line && price < line;
      };

      const intrabarOk = (long) => {
        if (usesVolume && !(stepVolumeAverage[at] !== null && bar.volume >= stepVolumeAverage[at] * config.volume.multiplier)) return false;
        if (usesVwap && !(stepVwap[at] !== null && (long ? price > stepVwap[at] : price < stepVwap[at]))) return false;
        if (usesLongMa && !(level.longMa !== null && (long ? price > level.longMa : price < level.longMa))) return false;
        if (usesSession && !series.session[index]) return false;
        return true;
      };

      const longNow = longAllowed && crossed(true) && intrabarOk(true);
      const shortNow = !longNow && shortAllowed && crossed(false) && intrabarOk(false);
      if (longNow || shortNow) {
        entries[index] = { direction: longNow ? 1 : -1, price, step };
        lastSignalBar = index;
        break;
      }
      reference = price;
    }
  }

  return { series, entries };
}

// Mirrors the generated indicator exactly: arm on the signal candle, fill at the
// next candle's open with the risk distance frozen at the signal, resolve stop and
// target intrabar, charge both sides of the commission, and score a win only when
// the trade is positive after costs.
export function simulate(
  config,
  candles,
  signals,
  {
    riskReward, costPerSide = 0.01, breakEvenAtR = null, trailStartR = null, trailDistanceR = null, intrabar = null,
    // Entry type is a chart input, not part of StrategyConfig, so it arrives here as an option
    // and defaults to the market path every generated script opens with. Passing "market" —
    // or nothing — leaves this function behaving exactly as it did before limit fills existed,
    // which is what keeps every number measured so far valid.
    entryType = "market", limitPullback = 0.5, limitExpiryBars = 5,
    // Entries found inside the candle by buildIntrabarSignals. When present the position
    // opens on its own candle at the price the level was crossed, so there is nothing to arm
    // and nothing to fill later — the signal and the fill are the same moment.
    intrabarEntries = null
  } = {}
) {
  const { series, long, short } = signals;
  const reward = riskReward ?? config.risk.riskReward;
  const useClose = config.risk.stopTrigger === "close";
  const useLimit = entryType === "limit";
  const trades = [];
  // The reversal test asks whether the opposite side signalled on this candle, and that is
  // the same question either way, so the two entry models are flattened to one shape here
  // rather than branching everywhere it is asked.
  const longSignal = intrabarEntries ? intrabarEntries.map((entry) => entry?.direction === 1) : long;
  const shortSignal = intrabarEntries ? intrabarEntries.map((entry) => entry?.direction === -1) : short;

  let direction = 0;
  let entry = null;
  let stop = null;
  let target = null;
  let startedBar = null;
  let unit = null;
  let bestR = 0;
  let pendingDirection = 0;
  let pendingRisk = null;
  let pendingLimit = null;
  let pendingExpires = null;
  // Where on the fill candle the position began, in intrabar steps. Zero for a market fill,
  // because that one happens at the open and the whole candle belongs to the trade.
  let fillStep = 0;

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

    fillStep = 0;
    // The intrabar entry opens on its own candle, at the step where the level was crossed, so
    // the rest of that candle can already resolve it. Risk is measured from the last closed
    // candle's ATR, because the current one is still forming.
    const intrabarEntry = intrabarEntries?.[index];
    if (intrabarEntry && direction === 0) {
      const risk = riskDistance(index - 1, intrabarEntry.direction === 1);
      if (risk !== null && risk > 0) {
        direction = intrabarEntry.direction;
        entry = intrabarEntry.price;
        unit = risk;
        bestR = 0;
        stop = direction === 1 ? entry - risk : entry + risk;
        target = direction === 1 ? entry + risk * reward : entry - risk * reward;
        startedBar = index;
        fillStep = intrabarEntry.step;
      }
    }

    if (pendingDirection !== 0 && direction === 0 && pendingRisk > 0) {
      const isLong = pendingDirection === 1;
      // A market order always fills. A limit order fills only if the candle came back to the
      // level, and a candle that gapped straight through it fills at the open, which is the
      // price actually available. Both rules are the generated script's, copied rather than
      // improved on: the engine's job is to predict what the indicator does on the chart, so
      // being cleverer than the indicator would only make the two disagree.
      const reached = !useLimit || (isLong ? candle.low <= pendingLimit : candle.high >= pendingLimit);
      if (reached) {
        const risk = pendingRisk;
        entry = useLimit
          ? (isLong ? Math.min(candle.open, pendingLimit) : Math.max(candle.open, pendingLimit))
          : candle.open;
        // With five-minute steps to hand, the step that reached the limit is known, so the
        // candle's earlier movement — which happened before this trade existed — is not
        // charged against it. Without them the whole candle is used, exactly as Pine does.
        if (useLimit) {
          const steps = intrabar?.[index];
          if (steps?.length) {
            const at = steps.findIndex((bar) => (isLong ? bar.low <= pendingLimit : bar.high >= pendingLimit));
            fillStep = at < 0 ? 0 : at;
          }
        }
        direction = pendingDirection;
        unit = risk;
        bestR = 0;
        stop = direction === 1 ? entry - risk : entry + risk;
        target = direction === 1 ? entry + risk * reward : entry - risk * reward;
        startedBar = index;
        pendingDirection = 0;
        pendingRisk = null;
        pendingLimit = null;
        pendingExpires = null;
      }
    }

    // Checked after the fill so the expiry candle can still trade, which is the order the
    // generated script uses. An expired level never fills days later.
    if (pendingDirection !== 0 && useLimit && pendingExpires !== null && index > pendingExpires) {
      pendingDirection = 0;
      pendingRisk = null;
      pendingLimit = null;
      pendingExpires = null;
    }

    if (direction !== 0) {
      // Walking the candle's own five-minute candles in order settles which level was
      // reached first. Without them a chart candle that touched both is charged as a
      // loss, which is safe but systematically pessimistic.
      const steps = intrabar?.[index]?.length ? intrabar[index] : [candle];
      const lastStep = steps.length - 1;

      for (let step = fillStep; step <= lastStep && direction !== 0; step += 1) {
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

      if (direction !== 0 && ((direction === 1 && shortSignal[index]) || (direction === -1 && longSignal[index]))) {
        close(index, candle.close, "reversed");
      }
    }

    // Arming for a later fill is the chart-close model only. An intrabar entry has already
    // opened above, or missed, and there is nothing to carry into the next candle.
    const acceptedLong = !intrabarEntries && longSignal[index] && direction !== 1;
    const acceptedShort = !intrabarEntries && shortSignal[index] && direction !== -1;
    if (direction === 0 && (acceptedLong || acceptedShort)) {
      const isLong = acceptedLong;
      const distance = riskDistance(index, isLong);
      if (distance !== null && distance > 0) {
        pendingDirection = isLong ? 1 : -1;
        pendingRisk = distance;
        // The limit sits a fraction of the risk back from the signal candle's close, and the
        // order lives for a fixed number of candles. Both are computed even on the market
        // path so the two paths arm identically and only the fill differs.
        pendingLimit = isLong ? candle.close - distance * limitPullback : candle.close + distance * limitPullback;
        pendingExpires = index + limitExpiryBars;
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
