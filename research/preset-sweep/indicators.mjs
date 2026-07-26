// Pine Script v6 equivalents. Every function returns an array aligned to the
// candle array, using null where Pine would produce na. Warm-up behaviour matches
// Pine: ta.ema and ta.rma seed from ta.sma, so early bars are na, not a partial value.

const filled = (length) => Array(length).fill(null);

export function sma(values, length) {
  const output = filled(values.length);
  let sum = 0;
  let count = 0;
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === null) {
      sum = 0;
      count = 0;
      continue;
    }
    sum += value;
    count += 1;
    if (count > length) {
      sum -= values[index - length];
      count = length;
    }
    if (count === length) output[index] = sum / length;
  }
  return output;
}

export function ema(values, length) {
  const seed = sma(values, length);
  const alpha = 2 / (length + 1);
  const output = filled(values.length);
  let previous = null;
  for (let index = 0; index < values.length; index += 1) {
    if (previous === null) {
      if (seed[index] === null) continue;
      previous = seed[index];
      output[index] = previous;
      continue;
    }
    previous = alpha * values[index] + (1 - alpha) * previous;
    output[index] = previous;
  }
  return output;
}

// Wilder smoothing, the basis of ta.rsi, ta.atr and ta.dmi.
export function rma(values, length) {
  const seed = sma(values, length);
  const alpha = 1 / length;
  const output = filled(values.length);
  let previous = null;
  for (let index = 0; index < values.length; index += 1) {
    if (previous === null) {
      if (seed[index] === null) continue;
      previous = seed[index];
      output[index] = previous;
      continue;
    }
    previous = alpha * values[index] + (1 - alpha) * previous;
    output[index] = previous;
  }
  return output;
}

export function rsi(values, length) {
  const gains = filled(values.length);
  const losses = filled(values.length);
  for (let index = 1; index < values.length; index += 1) {
    const change = values[index] - values[index - 1];
    gains[index] = Math.max(change, 0);
    losses[index] = Math.max(-change, 0);
  }
  gains[0] = null;
  losses[0] = null;
  const averageGain = rma(gains.slice(1), length);
  const averageLoss = rma(losses.slice(1), length);
  const output = filled(values.length);
  for (let index = 0; index < averageGain.length; index += 1) {
    const gain = averageGain[index];
    const loss = averageLoss[index];
    if (gain === null || loss === null) continue;
    output[index + 1] = loss === 0 ? 100 : gain === 0 ? 0 : 100 - 100 / (1 + gain / loss);
  }
  return output;
}

export function trueRange(candles) {
  const output = filled(candles.length);
  for (let index = 0; index < candles.length; index += 1) {
    const candle = candles[index];
    if (index === 0) {
      output[index] = candle.high - candle.low;
      continue;
    }
    const previousClose = candles[index - 1].close;
    output[index] = Math.max(
      candle.high - candle.low,
      Math.abs(candle.high - previousClose),
      Math.abs(candle.low - previousClose)
    );
  }
  return output;
}

export function atr(candles, length) {
  return rma(trueRange(candles), length);
}

// ta.vwap resets on each new trading day, matching TradingView's session anchor
// for crypto symbols that trade around the clock.
export function vwap(candles) {
  const output = filled(candles.length);
  let cumulativePrice = 0;
  let cumulativeVolume = 0;
  let day = null;
  for (let index = 0; index < candles.length; index += 1) {
    const candle = candles[index];
    const candleDay = Math.floor(candle.timestamp / 86400000);
    if (candleDay !== day) {
      day = candleDay;
      cumulativePrice = 0;
      cumulativeVolume = 0;
    }
    const typical = (candle.high + candle.low + candle.close) / 3;
    cumulativePrice += typical * candle.volume;
    cumulativeVolume += candle.volume;
    output[index] = cumulativeVolume === 0 ? null : cumulativePrice / cumulativeVolume;
  }
  return output;
}

export function macd(values, fastLength, slowLength, signalLength) {
  const fast = ema(values, fastLength);
  const slow = ema(values, slowLength);
  const line = filled(values.length);
  for (let index = 0; index < values.length; index += 1) {
    if (fast[index] === null || slow[index] === null) continue;
    line[index] = fast[index] - slow[index];
  }
  const signal = ema(line, signalLength);
  const histogram = filled(values.length);
  for (let index = 0; index < values.length; index += 1) {
    if (line[index] === null || signal[index] === null) continue;
    histogram[index] = line[index] - signal[index];
  }
  return { line, signal, histogram };
}

// ta.dmi(diLength, adxSmoothing) returns [plusDI, minusDI, adx].
export function dmi(candles, diLength, adxSmoothing) {
  const plusRaw = filled(candles.length);
  const minusRaw = filled(candles.length);
  for (let index = 1; index < candles.length; index += 1) {
    const upMove = candles[index].high - candles[index - 1].high;
    const downMove = candles[index - 1].low - candles[index].low;
    plusRaw[index] = upMove > downMove && upMove > 0 ? upMove : 0;
    minusRaw[index] = downMove > upMove && downMove > 0 ? downMove : 0;
  }
  plusRaw[0] = 0;
  minusRaw[0] = 0;
  const smoothedTrueRange = rma(trueRange(candles), diLength);
  const smoothedPlus = rma(plusRaw, diLength);
  const smoothedMinus = rma(minusRaw, diLength);

  const plusDI = filled(candles.length);
  const minusDI = filled(candles.length);
  const dx = filled(candles.length);
  for (let index = 0; index < candles.length; index += 1) {
    const range = smoothedTrueRange[index];
    if (range === null || range === 0 || smoothedPlus[index] === null || smoothedMinus[index] === null) continue;
    plusDI[index] = (smoothedPlus[index] / range) * 100;
    minusDI[index] = (smoothedMinus[index] / range) * 100;
    const total = plusDI[index] + minusDI[index];
    dx[index] = total === 0 ? 0 : (Math.abs(plusDI[index] - minusDI[index]) / total) * 100;
  }
  return { plusDI, minusDI, adx: rma(dx, adxSmoothing) };
}

export function supertrend(candles, factor, atrLength) {
  const atrValues = atr(candles, atrLength);
  const value = filled(candles.length);
  const direction = filled(candles.length);
  let upperBand = null;
  let lowerBand = null;
  let previousDirection = null;
  for (let index = 0; index < candles.length; index += 1) {
    if (atrValues[index] === null) continue;
    const candle = candles[index];
    const source = (candle.high + candle.low) / 2;
    let upper = source + factor * atrValues[index];
    let lower = source - factor * atrValues[index];
    const previousClose = index > 0 ? candles[index - 1].close : candle.close;

    if (upperBand !== null) upper = upper < upperBand || previousClose > upperBand ? upper : upperBand;
    if (lowerBand !== null) lower = lower > lowerBand || previousClose < lowerBand ? lower : lowerBand;

    let currentDirection;
    if (previousDirection === null) {
      currentDirection = candle.close > upper ? -1 : 1;
    } else if (previousDirection === -1) {
      currentDirection = candle.close < lower ? 1 : -1;
    } else {
      currentDirection = candle.close > upper ? -1 : 1;
    }

    value[index] = currentDirection === -1 ? lower : upper;
    direction[index] = currentDirection;
    upperBand = upper;
    lowerBand = lower;
    previousDirection = currentDirection;
  }
  return { value, direction };
}

export function highest(values, length) {
  const output = filled(values.length);
  for (let index = length - 1; index < values.length; index += 1) {
    let best = -Infinity;
    for (let offset = 0; offset < length; offset += 1) best = Math.max(best, values[index - offset]);
    output[index] = best;
  }
  return output;
}

export function lowest(values, length) {
  const output = filled(values.length);
  for (let index = length - 1; index < values.length; index += 1) {
    let best = Infinity;
    for (let offset = 0; offset < length; offset += 1) best = Math.min(best, values[index - offset]);
    output[index] = best;
  }
  return output;
}

// ta.pivotlow/pivothigh confirm `right` bars after the pivot, so the value only
// becomes visible at the confirmation bar. The returned array marks the pivot at
// its confirmation index, which is when Pine can first read it.
export function pivotLow(values, left, right) {
  const output = filled(values.length);
  for (let confirmation = left + right; confirmation < values.length; confirmation += 1) {
    const pivot = confirmation - right;
    const candidate = values[pivot];
    if (candidate === null) continue;
    let isPivot = true;
    for (let offset = 1; offset <= left; offset += 1) {
      if (values[pivot - offset] === null || values[pivot - offset] <= candidate) { isPivot = false; break; }
    }
    if (isPivot) {
      for (let offset = 1; offset <= right; offset += 1) {
        if (values[pivot + offset] === null || values[pivot + offset] < candidate) { isPivot = false; break; }
      }
    }
    if (isPivot) output[confirmation] = candidate;
  }
  return output;
}

export function pivotHigh(values, left, right) {
  const output = filled(values.length);
  for (let confirmation = left + right; confirmation < values.length; confirmation += 1) {
    const pivot = confirmation - right;
    const candidate = values[pivot];
    if (candidate === null) continue;
    let isPivot = true;
    for (let offset = 1; offset <= left; offset += 1) {
      if (values[pivot - offset] === null || values[pivot - offset] >= candidate) { isPivot = false; break; }
    }
    if (isPivot) {
      for (let offset = 1; offset <= right; offset += 1) {
        if (values[pivot + offset] === null || values[pivot + offset] > candidate) { isPivot = false; break; }
      }
    }
    if (isPivot) output[confirmation] = candidate;
  }
  return output;
}

// ta.valuewhen(condition, source, occurrence) with occurrence 1: the value from
// the previous time the condition was true.
export function valueWhenPrevious(marks) {
  const output = filled(marks.length);
  let latest = null;
  let previous = null;
  for (let index = 0; index < marks.length; index += 1) {
    output[index] = previous;
    if (marks[index] !== null) {
      previous = latest;
      latest = marks[index];
      output[index] = previous;
    }
  }
  return output;
}

export const crossover = (series, index, level) =>
  index > 0 &&
  series[index] !== null &&
  series[index - 1] !== null &&
  series[index - 1] <= level[index - 1] &&
  series[index] > level[index];

export const crossunder = (series, index, level) =>
  index > 0 &&
  series[index] !== null &&
  series[index - 1] !== null &&
  series[index - 1] >= level[index - 1] &&
  series[index] < level[index];

// ========================================================================
// Structural analysis, ported from the ICT LIVE engine's reasoning rather
// than its code: server/ict-core-backend.js, calculateBiasFromBars (960)
// and detectLiquiditySweep (1140).
//
// The point of both is timing. A moving-average bias turns when the average
// turns, which is always after the structure has already broken; these turn
// on the break itself. Every level used here is a confirmed pivot, published
// on the bar its right-hand window completes, so nothing reads ahead.
// ========================================================================

// Confirmed swing levels, each carrying the bar it was confirmed on. A level is
// only visible to bars at or after its confirmation index.
export function swingLevels(candles, lookback = 3) {
  const highs = pivotHigh(candles.map((candle) => candle.high), lookback, lookback);
  const lows = pivotLow(candles.map((candle) => candle.low), lookback, lookback);
  const swingHighs = [];
  const swingLows = [];
  for (let index = 0; index < candles.length; index += 1) {
    if (highs[index] !== null) swingHighs.push({ price: highs[index], confirmedAt: index, pivotAt: index - lookback });
    if (lows[index] !== null) swingLows.push({ price: lows[index], confirmedAt: index, pivotAt: index - lookback });
  }
  return { swingHighs, swingLows };
}

// Bias from the last two confirmed highs and lows: higher highs with higher lows
// reads bullish, lower highs with lower lows bearish. When the two disagree the
// engine falls back to where price sits inside the last swing range, so a bias is
// produced whenever two of each exist. Returns true for bullish, false for
// bearish, null while the structure is still forming.
export function structureBias(candles, lookback = 3) {
  const { swingHighs, swingLows } = swingLevels(candles, lookback);
  const output = filled(candles.length);
  let highCursor = 0;
  let lowCursor = 0;
  const visibleHighs = [];
  const visibleLows = [];

  for (let index = 0; index < candles.length; index += 1) {
    while (highCursor < swingHighs.length && swingHighs[highCursor].confirmedAt <= index) {
      visibleHighs.push(swingHighs[highCursor]);
      highCursor += 1;
    }
    while (lowCursor < swingLows.length && swingLows[lowCursor].confirmedAt <= index) {
      visibleLows.push(swingLows[lowCursor]);
      lowCursor += 1;
    }
    if (visibleHighs.length < 2 || visibleLows.length < 2) continue;

    const lastHigh = visibleHighs[visibleHighs.length - 1].price;
    const prevHigh = visibleHighs[visibleHighs.length - 2].price;
    const lastLow = visibleLows[visibleLows.length - 1].price;
    const prevLow = visibleLows[visibleLows.length - 2].price;

    const higherHighs = lastHigh > prevHigh;
    const higherLows = lastLow > prevLow;
    const lowerHighs = lastHigh < prevHigh;
    const lowerLows = lastLow < prevLow;

    let bull = null;
    if (higherHighs && higherLows) bull = true;
    else if (lowerHighs && lowerLows) bull = false;
    else if (higherHighs || higherLows) bull = true;
    else if (lowerHighs || lowerLows) bull = false;

    if (bull === null) {
      const midPoint = lastLow + (lastHigh - lastLow) / 2;
      bull = candles[index].close > midPoint;
    }
    output[index] = bull;
  }
  return output;
}

// A liquidity sweep: price reached past a confirmed swing level and closed back on
// the other side of it, with the rejection covering more than half the candle. The
// half-candle test is what separates a sweep from an ordinary break — without it
// every level crossing would qualify.
export function liquiditySweep(candles, lookback = 3, memory = 20) {
  const { swingHighs, swingLows } = swingLevels(candles, lookback);
  const bullish = Array(candles.length).fill(false);
  const bearish = Array(candles.length).fill(false);
  let highCursor = 0;
  let lowCursor = 0;
  const visibleHighs = [];
  const visibleLows = [];

  for (let index = 1; index < candles.length; index += 1) {
    while (highCursor < swingHighs.length && swingHighs[highCursor].confirmedAt <= index) {
      visibleHighs.push(swingHighs[highCursor]);
      if (visibleHighs.length > memory) visibleHighs.shift();
      highCursor += 1;
    }
    while (lowCursor < swingLows.length && swingLows[lowCursor].confirmedAt <= index) {
      visibleLows.push(swingLows[lowCursor]);
      if (visibleLows.length > memory) visibleLows.shift();
      lowCursor += 1;
    }

    const candle = candles[index];
    const previous = candles[index - 1];
    const range = candle.high - candle.low;
    if (range <= 0) continue;

    // Sell-side sweep, read as bullish: the low was taken and price closed back above.
    for (const level of visibleLows) {
      const reached = previous.low < level.price || candle.low < level.price;
      if (!reached || candle.close <= level.price) continue;
      const rejection = candle.close - Math.min(previous.low, candle.low);
      if (rejection > range * 0.5) { bullish[index] = true; break; }
    }

    // Buy-side sweep, read as bearish: the high was taken and price closed back below.
    for (const level of visibleHighs) {
      const reached = previous.high > level.price || candle.high > level.price;
      if (!reached || candle.close >= level.price) continue;
      const rejection = Math.max(previous.high, candle.high) - candle.close;
      if (rejection > range * 0.5) { bearish[index] = true; break; }
    }
  }
  return { bullish, bearish };
}

// Fair Value Gap: three candles where the first and third do not overlap, leaving a gap the
// middle candle ran through. Ported from the ICT LIVE engine's findFVGs (1445). Detected on
// the third candle, which is the earliest it can be known, and armed only afterwards — the
// engine's forward mitigation scan is deliberately not copied, because knowing whether a gap
// eventually filled is information a live chart does not have at the time.
export function fairValueGaps(candles, minGapPercent = 0.0005, expiry = 30) {
  const bullish = Array(candles.length).fill(false);
  const bearish = Array(candles.length).fill(false);
  const openBull = [];
  const openBear = [];

  for (let index = 2; index < candles.length; index += 1) {
    const first = candles[index - 2];
    const middle = candles[index - 1];
    const third = candles[index];

    if (first.high < third.low) {
      const gap = third.low - first.high;
      if (gap / middle.close > minGapPercent) openBull.push({ top: third.low, bottom: first.high, at: index });
    }
    if (first.low > third.high) {
      const gap = first.low - third.high;
      if (gap / middle.close > minGapPercent) openBear.push({ top: first.low, bottom: third.high, at: index });
    }

    // A gap is a level price may return to. The signal is that return: price trades back
    // into the zone and closes back out of it on the correct side.
    for (let slot = openBull.length - 1; slot >= 0; slot -= 1) {
      const zone = openBull[slot];
      if (index <= zone.at || index - zone.at > expiry) { if (index - zone.at > expiry) openBull.splice(slot, 1); continue; }
      if (third.low <= zone.top && third.close > zone.top) { bullish[index] = true; openBull.splice(slot, 1); }
      else if (third.close < zone.bottom) openBull.splice(slot, 1);
    }
    for (let slot = openBear.length - 1; slot >= 0; slot -= 1) {
      const zone = openBear[slot];
      if (index <= zone.at || index - zone.at > expiry) { if (index - zone.at > expiry) openBear.splice(slot, 1); continue; }
      if (third.high >= zone.bottom && third.close < zone.bottom) { bearish[index] = true; openBear.splice(slot, 1); }
      else if (third.close > zone.top) openBear.splice(slot, 1);
    }
  }
  return { bullish, bearish };
}

// Order Block: the last opposite-coloured candle before a displacement move. Its body is
// treated as the zone institutions left behind, and the signal is price returning to it.
// Reduced from the ICT LIVE engine's findOrderBlocks (1628), which adds mitigation history,
// breaker conversion and deduplication that only matter for drawing zones on a chart.
export function orderBlocks(candles, minDisplacement = 0.005, expiry = 30, lookback = 5) {
  const bullish = Array(candles.length).fill(false);
  const bearish = Array(candles.length).fill(false);
  const openBull = [];
  const openBear = [];
  const bodyTop = (candle) => Math.max(candle.open, candle.close);
  const bodyBottom = (candle) => Math.min(candle.open, candle.close);

  for (let index = 1; index < candles.length; index += 1) {
    const candle = candles[index];
    const move = (candle.close - candle.open) / candle.open;

    if (move > minDisplacement) {
      // Walk back to the last down candle: that body is the bullish order block.
      for (let back = index - 1; back >= Math.max(0, index - lookback); back -= 1) {
        if (candles[back].close < candles[back].open) {
          openBull.push({ top: bodyTop(candles[back]), bottom: bodyBottom(candles[back]), at: index });
          break;
        }
      }
    }
    if (move < -minDisplacement) {
      for (let back = index - 1; back >= Math.max(0, index - lookback); back -= 1) {
        if (candles[back].close > candles[back].open) {
          openBear.push({ top: bodyTop(candles[back]), bottom: bodyBottom(candles[back]), at: index });
          break;
        }
      }
    }

    for (let slot = openBull.length - 1; slot >= 0; slot -= 1) {
      const zone = openBull[slot];
      if (index <= zone.at) continue;
      if (index - zone.at > expiry) { openBull.splice(slot, 1); continue; }
      if (candle.low <= zone.top && candle.close > zone.top) { bullish[index] = true; openBull.splice(slot, 1); }
      else if (candle.close < zone.bottom) openBull.splice(slot, 1);
    }
    for (let slot = openBear.length - 1; slot >= 0; slot -= 1) {
      const zone = openBear[slot];
      if (index <= zone.at) continue;
      if (index - zone.at > expiry) { openBear.splice(slot, 1); continue; }
      if (candle.high >= zone.bottom && candle.close < zone.bottom) { bearish[index] = true; openBear.splice(slot, 1); }
      else if (candle.close > zone.top) openBear.splice(slot, 1);
    }
  }
  return { bullish, bearish };
}
