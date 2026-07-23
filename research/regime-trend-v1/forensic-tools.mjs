export const FORENSIC_HORIZONS = Object.freeze([3, 6, 12, 24, 42]);
const COMMISSION = 0.001;
const SLIPPAGE = 0.0005;

export function median(values) {
  if (values.length === 0) return null;
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 0
    ? (ordered[middle - 1] + ordered[middle]) / 2
    : ordered[middle];
}

export function netLongReturn(entryOpen, exitOpen) {
  const entryFill = entryOpen * (1 + SLIPPAGE);
  const exitFill = exitOpen * (1 - SLIPPAGE);
  const quantity = 1 / entryFill;
  const entryFee = entryFill * quantity * COMMISSION;
  const exitFee = exitFill * quantity * COMMISSION;
  return ((exitFill - entryFill) * quantity - entryFee - exitFee) / (entryFill * quantity);
}

export function netShortReturn(entryOpen, exitOpen) {
  const entryFill = entryOpen * (1 - SLIPPAGE);
  const exitFill = exitOpen * (1 + SLIPPAGE);
  const quantity = 1 / entryFill;
  const entryFee = entryFill * quantity * COMMISSION;
  const exitFee = exitFill * quantity * COMMISSION;
  return ((entryFill - exitFill) * quantity - entryFee - exitFee) / (entryFill * quantity);
}

export function classifyCounterfactual(longReturn, shortReturn) {
  if (longReturn > 0 && shortReturn > 0) {
    throw new Error("Both long and short cannot be positive after symmetric costs");
  }
  if (shortReturn > 0) return "SHORT_REVERSAL";
  if (longReturn > 0) return "LONG_RECOVERY";
  return "NO_TRADE";
}

export function analyzeTradePath(trade, candles) {
  const byTimestamp = new Map(candles.map((candle, index) => [candle.timestamp, index]));
  const entryIndex = byTimestamp.get(trade.entry_timestamp);
  const exitIndex = byTimestamp.get(trade.exit_timestamp);
  if (entryIndex === undefined || exitIndex === undefined || exitIndex < entryIndex) {
    throw new Error(`Trade timestamps not found for ${trade.symbol}`);
  }

  const path = candles.slice(entryIndex, exitIndex + 1);
  const highest = Math.max(...path.map((candle) => candle.high));
  const lowest = Math.min(...path.map((candle) => candle.low));
  const mfe = highest - trade.entry_fill;
  const mae = trade.entry_fill - lowest;
  const mfeAtr = mfe / trade.entry_atr;
  const maeAtr = mae / trade.entry_atr;
  const captureRatio = mfe > 0 ? trade.net_pnl / (mfe / trade.entry_fill) : null;

  return {
    entry_index: entryIndex,
    exit_index: exitIndex,
    mfe,
    mae,
    mfe_atr: mfeAtr,
    mae_atr: maeAtr,
    capture_ratio: captureRatio,
    gave_back_favorable_excursion: trade.net_pnl < 0 && mfeAtr >= 1
  };
}

export function analyzePostExit(trade, candles, horizons = FORENSIC_HORIZONS) {
  const byTimestamp = new Map(candles.map((candle, index) => [candle.timestamp, index]));
  const exitIndex = byTimestamp.get(trade.exit_timestamp);
  if (exitIndex === undefined) throw new Error(`Exit timestamp not found for ${trade.symbol}`);

  const counterfactualEntryIndex = exitIndex + 1;
  if (counterfactualEntryIndex >= candles.length) return {};
  const entryCandle = candles[counterfactualEntryIndex];
  const results = {};

  for (const horizon of horizons) {
    const horizonIndex = counterfactualEntryIndex + horizon;
    if (horizonIndex >= candles.length) {
      results[horizon] = null;
      continue;
    }

    const horizonCandle = candles[horizonIndex];
    const longReturn = netLongReturn(entryCandle.open, horizonCandle.open);
    const shortReturn = netShortReturn(entryCandle.open, horizonCandle.open);
    const window = candles.slice(counterfactualEntryIndex, horizonIndex + 1);
    const lowest = Math.min(...window.map((candle) => candle.low));
    const highest = Math.max(...window.map((candle) => candle.high));

    results[horizon] = {
      entry_timestamp: entryCandle.timestamp,
      exit_timestamp: horizonCandle.timestamp,
      long_net_return: longReturn,
      short_net_return: shortReturn,
      classification: classifyCounterfactual(longReturn, shortReturn),
      downward_excursion_atr: (entryCandle.open - lowest) / trade.entry_atr,
      upward_excursion_atr: (highest - entryCandle.open) / trade.entry_atr
    };
  }

  return results;
}

export function summarizeForensicRows(rows, horizons = FORENSIC_HORIZONS) {
  const summary = {};
  for (const horizon of horizons) {
    const eligible = rows.map((row) => row.counterfactuals[horizon]).filter(Boolean);
    const counts = { SHORT_REVERSAL: 0, LONG_RECOVERY: 0, NO_TRADE: 0 };
    for (const item of eligible) counts[item.classification] += 1;
    summary[horizon] = {
      eligible: eligible.length,
      short_reversal_count: counts.SHORT_REVERSAL,
      short_reversal_rate: eligible.length ? counts.SHORT_REVERSAL / eligible.length : null,
      long_recovery_count: counts.LONG_RECOVERY,
      long_recovery_rate: eligible.length ? counts.LONG_RECOVERY / eligible.length : null,
      no_trade_count: counts.NO_TRADE,
      no_trade_rate: eligible.length ? counts.NO_TRADE / eligible.length : null,
      average_short_net_return: eligible.length ? eligible.reduce((sum, item) => sum + item.short_net_return, 0) / eligible.length : null,
      average_long_net_return: eligible.length ? eligible.reduce((sum, item) => sum + item.long_net_return, 0) / eligible.length : null,
      median_downward_excursion_atr: median(eligible.map((item) => item.downward_excursion_atr)),
      median_upward_excursion_atr: median(eligible.map((item) => item.upward_excursion_atr))
    };
  }
  return summary;
}
