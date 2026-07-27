import { atr, ema, rsi } from "../preset-sweep/indicators.mjs";

const filled = (length, value = null) => Array(length).fill(value);
const crossesOver = (left, right, index) =>
  index > 0 &&
  left[index] !== null &&
  right[index] !== null &&
  left[index - 1] !== null &&
  right[index - 1] !== null &&
  left[index] > right[index] &&
  left[index - 1] <= right[index - 1];
const crossesUnder = (left, right, index) =>
  index > 0 &&
  left[index] !== null &&
  right[index] !== null &&
  left[index - 1] !== null &&
  right[index - 1] !== null &&
  left[index] < right[index] &&
  left[index - 1] >= right[index - 1];
const crossesLevelOver = (values, level, index) =>
  index > 0 && values[index] !== null && values[index - 1] !== null &&
  values[index] > level && values[index - 1] <= level;
const crossesLevelUnder = (values, level, index) =>
  index > 0 && values[index] !== null && values[index - 1] !== null &&
  values[index] < level && values[index - 1] >= level;

function rollingExtreme(values, length, mode) {
  const output = filled(values.length);
  for (let index = length - 1; index < values.length; index += 1) {
    let result = mode === "high" ? -Infinity : Infinity;
    for (let offset = 0; offset < length; offset += 1) {
      result = mode === "high"
        ? Math.max(result, values[index - offset])
        : Math.min(result, values[index - offset]);
    }
    output[index] = result;
  }
  return output;
}

function normalizedGamma(values, length, gamma) {
  const output = filled(values.length);
  for (let index = length - 1; index < values.length; index += 1) {
    let minimum = Infinity;
    let maximum = -Infinity;
    for (let offset = 0; offset < length; offset += 1) {
      minimum = Math.min(minimum, values[index - offset]);
      maximum = Math.max(maximum, values[index - offset]);
    }
    const normalized = (values[index] - minimum) / (maximum === minimum ? 1 : maximum - minimum);
    output[index] = Math.max(0, Math.min(1, normalized)) ** gamma;
  }
  return output;
}

function pressure(candles, length = 9) {
  const plus = filled(candles.length);
  const minus = filled(candles.length);
  const score = filled(candles.length, 0);
  let smoothedRange = null;
  let smoothedPlus = null;
  let smoothedMinus = null;
  let positiveCount = 0;
  let negativeCount = 0;
  const positive = filled(candles.length, 0);
  const negative = filled(candles.length, 0);

  for (let index = 0; index < candles.length; index += 1) {
    const candle = candles[index];
    const previous = candles[index - 1];
    const previousClose = previous?.close ?? 0;
    const previousHigh = previous?.high ?? 0;
    const previousLow = previous?.low ?? 0;
    const trueRange = Math.max(
      candle.high - candle.low,
      Math.abs(candle.high - previousClose),
      Math.abs(candle.low - previousClose)
    );
    const upMove = candle.high - previousHigh;
    const downMove = previousLow - candle.low;
    const dmPlus = upMove > downMove ? Math.max(upMove, 0) : 0;
    const dmMinus = downMove > upMove ? Math.max(downMove, 0) : 0;

    smoothedRange = smoothedRange === null
      ? trueRange
      : smoothedRange - smoothedRange / length + trueRange;
    smoothedPlus = smoothedPlus === null
      ? dmPlus
      : smoothedPlus - smoothedPlus / length + dmPlus;
    smoothedMinus = smoothedMinus === null
      ? dmMinus
      : smoothedMinus - smoothedMinus / length + dmMinus;
    plus[index] = smoothedRange === 0 ? null : smoothedPlus / smoothedRange * 100;
    minus[index] = smoothedRange === 0 ? null : smoothedMinus / smoothedRange * 100;

    if (
      index > 0 &&
      plus[index] !== null &&
      plus[index - 1] !== null &&
      plus[index] > plus[index - 1] &&
      plus[index] > minus[index]
    ) {
      positiveCount += 1;
      negativeCount = 0;
    }
    if (
      index > 0 &&
      minus[index] !== null &&
      minus[index - 1] !== null &&
      minus[index] > minus[index - 1] &&
      minus[index] > plus[index]
    ) {
      negativeCount += 1;
      positiveCount = 0;
    }
    positive[index] = positiveCount;
    negative[index] = negativeCount;
    score[index] = positiveCount - negativeCount;
  }

  return {
    plus,
    minus,
    positive,
    negative,
    score,
    positiveGamma: normalizedGamma(positive, 100, 0.8),
    negativeGamma: normalizedGamma(negative, 100, 0.8)
  };
}

function rollingAnchoredVwap(candles, length, anchorMode) {
  const output = filled(candles.length);
  const priceVolume = filled(candles.length, 0);
  const volume = filled(candles.length, 0);
  for (let index = 0; index < candles.length; index += 1) {
    const candle = candles[index];
    const typical = (candle.high + candle.low + candle.close) / 3;
    priceVolume[index] = typical * candle.volume + (priceVolume[index - 1] ?? 0);
    volume[index] = candle.volume + (volume[index - 1] ?? 0);
    const start = Math.max(0, index - length + 1);
    let anchor = index;
    let extreme = anchorMode === "high" ? -Infinity : Infinity;
    // Pine's lowestbars/highestbars resolves equal extrema to the most recent bar.
    for (let cursor = index; cursor >= start; cursor -= 1) {
      const value = anchorMode === "high" ? candles[cursor].high : candles[cursor].low;
      const better = anchorMode === "high" ? value > extreme : value < extreme;
      if (better) {
        extreme = value;
        anchor = cursor;
      }
    }
    const beforePriceVolume = anchor > 0 ? priceVolume[anchor - 1] : 0;
    const beforeVolume = anchor > 0 ? volume[anchor - 1] : 0;
    const anchoredVolume = volume[index] - beforeVolume;
    output[index] = anchoredVolume > 0
      ? (priceVolume[index] - beforePriceVolume) / anchoredVolume
      : null;
  }
  return output;
}

function rollingSeen(values, index, length, predicate) {
  const start = Math.max(0, index - length + 1);
  for (let cursor = start; cursor <= index; cursor += 1) {
    if (values[cursor] !== null && predicate(values[cursor])) return true;
  }
  return false;
}

export function buildKohenContext(candles) {
  const closes = candles.map((candle) => candle.close);
  const highs = candles.map((candle) => candle.high);
  const lows = candles.map((candle) => candle.low);
  const pressureValues = pressure(candles);
  return {
    candles,
    closes,
    highs,
    lows,
    pressure: pressureValues,
    rsi: rsi(closes, 14),
    atr: atr(candles, 14),
    fast: ema(closes, 20),
    slow: ema(closes, 50),
    rangeHigh: rollingExtreme(highs, 100, "high"),
    rangeLow: rollingExtreme(lows, 100, "low"),
    lowVwap: rollingAnchoredVwap(candles, 200, "low"),
    highVwap: rollingAnchoredVwap(candles, 200, "high")
  };
}

export function buildKohenSignals(context, options = {}) {
  const {
    symmetricVwap = false,
    reversalWindow = 8,
    reversalConfirmation = "strict",
    continuation = "current",
    continuationLookback = 8,
    continuationRsiLevel = 50,
    regimeSlopeBars = 3,
    cooldownBars = 5,
    triggerWindow = 1
  } = options;
  const {
    candles,
    closes,
    highs,
    lows,
    pressure: pressureValues,
    rsi: rsiValues,
    fast,
    slow,
    rangeHigh,
    rangeLow,
    lowVwap,
    highVwap
  } = context;
  const bearVwap = symmetricVwap ? highVwap : lowVwap;
  const length = candles.length;
  const rawLong = filled(length, false);
  const rawShort = filled(length, false);
  const strongBull = filled(length, false);
  const strongBear = filled(length, false);
  const longTrigger = filled(length, false);
  const shortTrigger = filled(length, false);
  const longFamily = filled(length, 2);
  const shortFamily = filled(length, 2);
  let lastRawLong = null;
  let lastRawShort = null;

  for (let index = 0; index < length; index += 1) {
    if (
      index < 100 ||
      rangeHigh[index] === null ||
      rangeLow[index] === null ||
      rsiValues[index] === null
    ) continue;
    const equilibrium = (rangeHigh[index] + rangeLow[index]) / 2;
    const inPremium = closes[index] > equilibrium;
    const inDiscount = closes[index] < equilibrium;
    const positiveGamma = pressureValues.positiveGamma[index];
    const negativeGamma = pressureValues.negativeGamma[index];
    const isBull = pressureValues.score[index] > 0;
    const isBear = pressureValues.score[index] < 0;
    const bullDecay = index > 0 && positiveGamma !== null &&
      pressureValues.positiveGamma[index - 1] !== null &&
      positiveGamma < pressureValues.positiveGamma[index - 1];
    const bearDecay = index > 0 && negativeGamma !== null &&
      pressureValues.negativeGamma[index - 1] !== null &&
      negativeGamma < pressureValues.negativeGamma[index - 1];
    const sniperBuy =
      isBear &&
      negativeGamma !== null &&
      negativeGamma >= 0.8 &&
      (bearDecay || closes[index] > candles[index].open) &&
      rsiValues[index] < 40;
    const sniperSell =
      isBull &&
      positiveGamma !== null &&
      positiveGamma >= 0.8 &&
      (bullDecay || closes[index] < candles[index].open) &&
      rsiValues[index] > 60;

    let previousHigh = -Infinity;
    let previousLow = Infinity;
    let previousRsiHigh = -Infinity;
    let previousRsiLow = Infinity;
    for (let cursor = Math.max(0, index - 15); cursor < index; cursor += 1) {
      previousHigh = Math.max(previousHigh, highs[cursor]);
      previousLow = Math.min(previousLow, lows[cursor]);
      if (rsiValues[cursor] !== null) {
        previousRsiHigh = Math.max(previousRsiHigh, rsiValues[cursor]);
        previousRsiLow = Math.min(previousRsiLow, rsiValues[cursor]);
      }
    }
    const rollingDivSell =
      inPremium &&
      highs[index] >= previousHigh &&
      rsiValues[index] < previousRsiHigh &&
      rsiValues[index] > 60;
    const rollingDivBuy =
      inDiscount &&
      lows[index] <= previousLow &&
      rsiValues[index] > previousRsiLow &&
      rsiValues[index] < 40;
    rawLong[index] = sniperBuy || rollingDivBuy;
    rawShort[index] = sniperSell || rollingDivSell;
    if (rawLong[index]) lastRawLong = index;
    if (rawShort[index]) lastRawShort = index;

    const lowVwapRising =
      index >= regimeSlopeBars &&
      lowVwap[index] !== null &&
      lowVwap[index - regimeSlopeBars] !== null &&
      lowVwap[index] > lowVwap[index - regimeSlopeBars];
    const bearVwapFalling =
      index >= regimeSlopeBars &&
      bearVwap[index] !== null &&
      bearVwap[index - regimeSlopeBars] !== null &&
      bearVwap[index] < bearVwap[index - regimeSlopeBars];
    strongBull[index] =
      fast[index] !== null &&
      slow[index] !== null &&
      fast[index] > slow[index] &&
      closes[index] > fast[index] &&
      lowVwap[index] !== null &&
      closes[index] > lowVwap[index] &&
      lowVwapRising;
    strongBear[index] =
      fast[index] !== null &&
      slow[index] !== null &&
      fast[index] < slow[index] &&
      closes[index] < fast[index] &&
      bearVwap[index] !== null &&
      closes[index] < bearVwap[index] &&
      bearVwapFalling;

    const longArmed = lastRawLong !== null && index - lastRawLong < reversalWindow;
    const shortArmed = lastRawShort !== null && index - lastRawShort < reversalWindow;
    const closeFastOver = crossesOver(closes, fast, index);
    const closeFastUnder = crossesUnder(closes, fast, index);
    const pressureOver = crossesLevelOver(pressureValues.score, 0, index);
    const pressureUnder = crossesLevelUnder(pressureValues.score, 0, index);
    let longReversal = false;
    let shortReversal = false;
    if (reversalConfirmation === "strict") {
      longReversal = longArmed && closes[index] > fast[index] &&
        (closeFastOver || pressureOver) && !strongBear[index];
      shortReversal = shortArmed && closes[index] < fast[index] &&
        (closeFastUnder || pressureUnder) && !strongBull[index];
    } else if (reversalConfirmation === "state") {
      longReversal = longArmed && closes[index] > fast[index] &&
        pressureValues.score[index] > 0 && !strongBear[index];
      shortReversal = shortArmed && closes[index] < fast[index] &&
        pressureValues.score[index] < 0 && !strongBull[index];
    } else if (reversalConfirmation === "ema") {
      longReversal = longArmed && closeFastOver && !strongBear[index];
      shortReversal = shortArmed && closeFastUnder && !strongBull[index];
    } else if (reversalConfirmation === "pressure") {
      longReversal = longArmed && pressureOver && !strongBear[index];
      shortReversal = shortArmed && pressureUnder && !strongBull[index];
    } else {
      throw new Error(`Unknown reversal confirmation: ${reversalConfirmation}`);
    }

    const longPullback = rollingSeen(
      rsiValues,
      index,
      continuationLookback,
      (value) => value < continuationRsiLevel
    );
    const shortPullback = rollingSeen(
      rsiValues,
      index,
      continuationLookback,
      (value) => value > continuationRsiLevel
    );
    const rsiOver = crossesLevelOver(rsiValues, continuationRsiLevel, index);
    const rsiUnder = crossesLevelUnder(rsiValues, continuationRsiLevel, index);
    const gammaLong =
      pressureValues.positiveGamma[index] !== null &&
      pressureValues.positiveGamma[index - 1] !== null &&
      pressureValues.positiveGamma[index] > pressureValues.positiveGamma[index - 1];
    const gammaShort =
      pressureValues.negativeGamma[index] !== null &&
      pressureValues.negativeGamma[index - 1] !== null &&
      pressureValues.negativeGamma[index] > pressureValues.negativeGamma[index - 1];
    let longContinuation = false;
    let shortContinuation = false;
    if (continuation === "current") {
      longContinuation = strongBull[index] && longPullback && rsiOver && gammaLong;
      shortContinuation = strongBear[index] && shortPullback && rsiUnder && gammaShort;
    } else if (continuation === "rsi") {
      longContinuation = strongBull[index] && longPullback && rsiOver;
      shortContinuation = strongBear[index] && shortPullback && rsiUnder;
    } else if (continuation === "ema") {
      longContinuation = strongBull[index] && longPullback && closeFastOver;
      shortContinuation = strongBear[index] && shortPullback && closeFastUnder;
    } else if (continuation === "hybrid") {
      longContinuation = strongBull[index] && longPullback &&
        (rsiOver || closeFastOver || pressureOver);
      shortContinuation = strongBear[index] && shortPullback &&
        (rsiUnder || closeFastUnder || pressureUnder);
    } else if (continuation === "off") {
      longContinuation = false;
      shortContinuation = false;
    } else {
      throw new Error(`Unknown continuation mode: ${continuation}`);
    }
    longTrigger[index] = longReversal || longContinuation;
    shortTrigger[index] = shortReversal || shortContinuation;
    longFamily[index] = longContinuation ? 1 : 2;
    shortFamily[index] = shortContinuation ? 1 : 2;
  }

  const long = filled(length, false);
  const short = filled(length, false);
  const acceptedLongFamily = filled(length, 2);
  const acceptedShortFamily = filled(length, 2);
  let lastLongTrigger = null;
  let lastShortTrigger = null;
  let lastLongFamily = 2;
  let lastShortFamily = 2;
  let lastSignal = null;
  for (let index = 0; index < length; index += 1) {
    if (longTrigger[index]) {
      lastLongTrigger = index;
      lastLongFamily = longFamily[index];
    }
    if (shortTrigger[index]) {
      lastShortTrigger = index;
      lastShortFamily = shortFamily[index];
    }
    const longActive = lastLongTrigger !== null && index - lastLongTrigger < triggerWindow;
    const shortActive = lastShortTrigger !== null && index - lastShortTrigger < triggerWindow;
    const cooldownOk = lastSignal === null || index - lastSignal > cooldownBars;
    if (!cooldownOk) continue;
    // All-filters mode has no additional score veto. Simultaneous active triggers cancel
    // because their event scores are equal after the event bar in the Pine implementation.
    if (longActive && !shortActive) {
      long[index] = true;
      acceptedLongFamily[index] = lastLongFamily;
      lastSignal = index;
    } else if (shortActive && !longActive) {
      short[index] = true;
      acceptedShortFamily[index] = lastShortFamily;
      lastSignal = index;
    }
  }

  return {
    long,
    short,
    longFamily: acceptedLongFamily,
    shortFamily: acceptedShortFamily,
    rawLong,
    rawShort,
    strongBull,
    strongBear
  };
}

export function simulateKohen(context, signals, options = {}) {
  const {
    atrMultiple = 2,
    riskReward = 2,
    costPerSide = 0.01
  } = options;
  const { candles, atr: atrValues } = context;
  const trades = [];
  let risk = null;
  let pending = null;

  const closeTrade = (exitIndex, outcomePrice, grossR, ambiguous = false) => {
    const costR = costPerSide / 100 * (risk.entry + outcomePrice) / risk.unit;
    trades.push({
      entryTimestamp: risk.entryTimestamp,
      exitTimestamp: candles[exitIndex].timestamp,
      direction: risk.direction,
      family: risk.family,
      grossR,
      netR: grossR - costR,
      ambiguous
    });
    risk = null;
  };

  for (let index = 0; index < candles.length; index += 1) {
    const candle = candles[index];
    if (pending && !risk && pending.unit > 0) {
      const direction = pending.direction;
      const entry = candle.open;
      risk = {
        direction,
        family: pending.family,
        entry,
        entryTimestamp: candle.timestamp,
        unit: pending.unit,
        stop: entry - direction * pending.unit,
        target: entry + direction * pending.unit * riskReward
      };
      pending = null;
    }

    const acceptedLong = signals.long[index] && !risk;
    const acceptedShort = signals.short[index] && !risk;
    if (acceptedLong && atrValues[index] !== null) {
      pending = {
        direction: 1,
        family: signals.longFamily[index],
        unit: atrValues[index] * atrMultiple
      };
    } else if (acceptedShort && atrValues[index] !== null) {
      pending = {
        direction: -1,
        family: signals.shortFamily[index],
        unit: atrValues[index] * atrMultiple
      };
    }

    if (risk) {
      const stopHit = risk.direction === 1 ? candle.low <= risk.stop : candle.high >= risk.stop;
      const targetHit = risk.direction === 1 ? candle.high >= risk.target : candle.low <= risk.target;
      if (stopHit || targetHit) {
        const ambiguous = stopHit && targetHit;
        const outcomePrice = ambiguous || stopHit ? risk.stop : risk.target;
        const grossR = ambiguous || stopHit ? -1 : riskReward;
        closeTrade(index, outcomePrice, grossR, ambiguous);
      }
    }
  }
  return trades;
}

export function metrics(trades, range) {
  const selected = trades.filter(
    (trade) => trade.entryTimestamp >= range.start &&
      trade.entryTimestamp < range.endExclusive
  );
  if (!selected.length) {
    return {
      trades: 0,
      wins: 0,
      losses: 0,
      winRate: 0,
      netR: 0,
      profitFactor: 0,
      maxDrawdownR: 0,
      continuationTrades: 0,
      reversalTrades: 0
    };
  }
  const wins = selected.filter((trade) => trade.netR > 0);
  const losses = selected.filter((trade) => trade.netR <= 0);
  let equity = 0;
  let peak = 0;
  let maxDrawdownR = 0;
  for (const trade of selected) {
    equity += trade.netR;
    peak = Math.max(peak, equity);
    maxDrawdownR = Math.max(maxDrawdownR, peak - equity);
  }
  const grossWin = wins.reduce((sum, trade) => sum + trade.netR, 0);
  const grossLoss = losses.reduce((sum, trade) => sum - trade.netR, 0);
  return {
    trades: selected.length,
    wins: wins.length,
    losses: losses.length,
    winRate: wins.length / selected.length,
    netR: equity,
    expectancy: equity / selected.length,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : Infinity,
    maxDrawdownR,
    continuationTrades: selected.filter((trade) => trade.family === 1).length,
    reversalTrades: selected.filter((trade) => trade.family === 2).length
  };
}
