export const EXIT_TIMING_THRESHOLDS_ATR = Object.freeze([0.5, 1, 1.5, 2]);
export const EXIT_TIMING_WINDOWS_BARS = Object.freeze([0, 1, 2, 3, 6, 12, 24]);

export function median(values) {
  if (values.length === 0) return null;
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 0
    ? (ordered[middle - 1] + ordered[middle]) / 2
    : ordered[middle];
}

export function analyzeExitTiming(trade, candles, thresholds = EXIT_TIMING_THRESHOLDS_ATR) {
  const byTimestamp = new Map(candles.map((candle, index) => [candle.timestamp, index]));
  const entryIndex = byTimestamp.get(trade.entry_timestamp);
  const exitIndex = byTimestamp.get(trade.exit_timestamp);
  if (entryIndex === undefined || exitIndex === undefined || exitIndex < entryIndex) {
    throw new Error(`Trade timestamps not found for ${trade.symbol}`);
  }

  const activeCandles = candles.slice(entryIndex, exitIndex);
  const firstHighTouch = {};
  const firstCloseConfirmation = {};

  for (const threshold of thresholds) {
    const target = trade.entry_fill + threshold * trade.entry_atr;
    const highOffset = activeCandles.findIndex((candle) => candle.high >= target);
    const closeOffset = activeCandles.findIndex((candle) => candle.close >= target);
    firstHighTouch[String(threshold)] = highOffset >= 0 ? highOffset : null;
    firstCloseConfirmation[String(threshold)] = closeOffset >= 0 ? closeOffset : null;
  }

  const peakHigh = activeCandles.length
    ? Math.max(...activeCandles.map((candle) => candle.high))
    : trade.entry_fill;
  const peakClose = activeCandles.length
    ? Math.max(...activeCandles.map((candle) => candle.close))
    : trade.entry_fill;
  const peakHighOffset = activeCandles.length
    ? activeCandles.findIndex((candle) => candle.high === peakHigh)
    : null;
  const peakCloseOffset = activeCandles.length
    ? activeCandles.findIndex((candle) => candle.close === peakClose)
    : null;

  const peakHighMfeAtr = Math.max(0, peakHigh - trade.entry_fill) / trade.entry_atr;
  const peakCloseMfeAtr = Math.max(0, peakClose - trade.entry_fill) / trade.entry_atr;
  const realizedNetAtr = trade.net_pnl * trade.entry_fill / trade.entry_atr;

  return {
    entry_index: entryIndex,
    exit_index: exitIndex,
    bars_held: exitIndex - entryIndex,
    first_high_touch_bars: firstHighTouch,
    first_close_confirmation_bars: firstCloseConfirmation,
    peak_high_mfe_atr: peakHighMfeAtr,
    peak_close_mfe_atr: peakCloseMfeAtr,
    bars_to_peak_high: peakHighOffset,
    bars_to_peak_close: peakCloseOffset,
    realized_net_atr: realizedNetAtr,
    peak_high_to_realized_giveback_atr: peakHighMfeAtr - realizedNetAtr,
    peak_close_to_realized_giveback_atr: peakCloseMfeAtr - realizedNetAtr
  };
}

function summarizePassages(rows, field, threshold, windows) {
  const key = String(threshold);
  const values = rows
    .map((row) => row.timing[field][key])
    .filter((value) => value !== null);
  return {
    reached_count: values.length,
    reached_rate: rows.length ? values.length / rows.length : null,
    median_bars_to_reach: median(values),
    within_windows: Object.fromEntries(
      windows.map((window) => [
        String(window),
        {
          count: values.filter((value) => value <= window).length,
          rate: rows.length ? values.filter((value) => value <= window).length / rows.length : null
        }
      ])
    )
  };
}

export function summarizeExitTimingRows(
  rows,
  thresholds = EXIT_TIMING_THRESHOLDS_ATR,
  windows = EXIT_TIMING_WINDOWS_BARS
) {
  return {
    trades: rows.length,
    median_bars_held: median(rows.map((row) => row.timing.bars_held)),
    median_peak_high_mfe_atr: median(rows.map((row) => row.timing.peak_high_mfe_atr)),
    median_peak_close_mfe_atr: median(rows.map((row) => row.timing.peak_close_mfe_atr)),
    median_realized_net_atr: median(rows.map((row) => row.timing.realized_net_atr)),
    median_peak_high_giveback_atr: median(
      rows.map((row) => row.timing.peak_high_to_realized_giveback_atr)
    ),
    median_peak_close_giveback_atr: median(
      rows.map((row) => row.timing.peak_close_to_realized_giveback_atr)
    ),
    thresholds: Object.fromEntries(
      thresholds.map((threshold) => [
        String(threshold),
        {
          threshold_atr: threshold,
          high_touch: summarizePassages(rows, "first_high_touch_bars", threshold, windows),
          close_confirmation: summarizePassages(
            rows,
            "first_close_confirmation_bars",
            threshold,
            windows
          )
        }
      ])
    )
  };
}
