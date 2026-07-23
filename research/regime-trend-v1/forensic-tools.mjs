export const FORENSIC_HORIZONS = Object.freeze([3, 6, 12, 24, 42]);
export const FORENSIC_ATR_THRESHOLDS = Object.freeze([0.25, 0.5, 1]);
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

export function classifyAtrOpportunity(longNetAtr, shortNetAtr, thresholdAtr) {
  if (!Number.isFinite(thresholdAtr) || thresholdAtr <= 0) {
    throw new Error("ATR opportunity threshold must be positive");
  }
  const longQualifies = longNetAtr >= thresholdAtr;
  const shortQualifies = shortNetAtr >= thresholdAtr;
  if (longQualifies && shortQualifies) {
    throw new Error("Both long and short cannot reach the same positive ATR threshold");
  }
  if (shortQualifies) return "SHORT_REVERSAL";
  if (longQualifies) return "LONG_RECOVERY";
  return "NO_TRADE";
}

function maxOrFallback(values, fallback) {
  return values.length > 0 ? Math.max(...values) : fallback;
}

function minOrFallback(values, fallback) {
  return values.length > 0 ? Math.min(...values) : fallback;
}

export function analyzeTradePath(trade, candles) {
  const byTimestamp = new Map(candles.map((candle, index) => [candle.timestamp, index]));
  const entryIndex = byTimestamp.get(trade.entry_timestamp);
  const exitIndex = byTimestamp.get(trade.exit_timestamp);
  if (entryIndex === undefined || exitIndex === undefined || exitIndex < entryIndex) {
    throw new Error(`Trade timestamps not found for ${trade.symbol}`);
  }

  const optimisticPath = candles.slice(entryIndex, exitIndex + 1);
  const conservativePreExitPath = candles.slice(entryIndex, exitIndex);

  const optimisticHighest = maxOrFallback(
    optimisticPath.map((candle) => candle.high),
    trade.entry_fill
  );
  const conservativeHighest = maxOrFallback(
    conservativePreExitPath.map((candle) => candle.high),
    trade.entry_fill
  );
  const conservativeLowest = minOrFallback(
    [
      ...conservativePreExitPath.map((candle) => candle.low),
      Number.isFinite(trade.raw_exit_reference) ? trade.raw_exit_reference : trade.exit_fill
    ].filter(Number.isFinite),
    trade.entry_fill
  );

  const mfeUpperBound = Math.max(0, optimisticHighest - trade.entry_fill);
  const mfe = Math.max(0, conservativeHighest - trade.entry_fill);
  const mae = Math.max(0, trade.entry_fill - conservativeLowest);
  const mfeAtrUpperBound = mfeUpperBound / trade.entry_atr;
  const mfeAtr = mfe / trade.entry_atr;
  const maeAtr = mae / trade.entry_atr;
  const captureRatio = mfe > 0 ? trade.net_pnl / (mfe / trade.entry_fill) : null;

  return {
    entry_index: entryIndex,
    exit_index: exitIndex,
    mfe_upper_bound: mfeUpperBound,
    mfe,
    mae,
    mfe_atr_upper_bound: mfeAtrUpperBound,
    mfe_atr: mfeAtr,
    mae_atr: maeAtr,
    capture_ratio: captureRatio,
    gave_back_favorable_excursion: trade.net_pnl < 0 && mfeAtr >= 1
  };
}

export function analyzePostExit(
  trade,
  candles,
  horizons = FORENSIC_HORIZONS,
  thresholds = FORENSIC_ATR_THRESHOLDS
) {
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
    const excursionWindow = candles.slice(counterfactualEntryIndex, horizonIndex);
    const lowest = minOrFallback(excursionWindow.map((candle) => candle.low), entryCandle.open);
    const highest = maxOrFallback(excursionWindow.map((candle) => candle.high), entryCandle.open);
    const downwardExcursionAtr = Math.max(0, entryCandle.open - lowest) / trade.entry_atr;
    const upwardExcursionAtr = Math.max(0, highest - entryCandle.open) / trade.entry_atr;
    const longNetAtr = longReturn * entryCandle.open / trade.entry_atr;
    const shortNetAtr = shortReturn * entryCandle.open / trade.entry_atr;

    const thresholdClassifications = Object.fromEntries(
      thresholds.map((threshold) => [
        String(threshold),
        classifyAtrOpportunity(longNetAtr, shortNetAtr, threshold)
      ])
    );

    results[horizon] = {
      entry_timestamp: entryCandle.timestamp,
      exit_timestamp: horizonCandle.timestamp,
      long_net_return: longReturn,
      short_net_return: shortReturn,
      long_net_atr: longNetAtr,
      short_net_atr: shortNetAtr,
      classification: classifyCounterfactual(longReturn, shortReturn),
      threshold_classifications: thresholdClassifications,
      downward_excursion_atr: downwardExcursionAtr,
      upward_excursion_atr: upwardExcursionAtr,
      long_reward_to_adverse_excursion:
        longNetAtr > 0 && downwardExcursionAtr > 0 ? longNetAtr / downwardExcursionAtr : null,
      short_reward_to_adverse_excursion:
        shortNetAtr > 0 && upwardExcursionAtr > 0 ? shortNetAtr / upwardExcursionAtr : null
    };
  }

  return results;
}

function summarizeThreshold(eligible, threshold) {
  const key = String(threshold);
  const counts = { SHORT_REVERSAL: 0, LONG_RECOVERY: 0, NO_TRADE: 0 };
  for (const item of eligible) counts[item.threshold_classifications[key]] += 1;

  const shortRows = eligible.filter(
    (item) => item.threshold_classifications[key] === "SHORT_REVERSAL"
  );
  const longRows = eligible.filter(
    (item) => item.threshold_classifications[key] === "LONG_RECOVERY"
  );

  return {
    threshold_atr: threshold,
    eligible: eligible.length,
    short_reversal_count: counts.SHORT_REVERSAL,
    short_reversal_rate: eligible.length ? counts.SHORT_REVERSAL / eligible.length : null,
    long_recovery_count: counts.LONG_RECOVERY,
    long_recovery_rate: eligible.length ? counts.LONG_RECOVERY / eligible.length : null,
    no_trade_count: counts.NO_TRADE,
    no_trade_rate: eligible.length ? counts.NO_TRADE / eligible.length : null,
    median_short_adverse_excursion_atr: median(
      shortRows.map((item) => item.upward_excursion_atr)
    ),
    median_long_adverse_excursion_atr: median(
      longRows.map((item) => item.downward_excursion_atr)
    ),
    median_short_reward_to_adverse_excursion: median(
      shortRows.map((item) => item.short_reward_to_adverse_excursion).filter(Number.isFinite)
    ),
    median_long_reward_to_adverse_excursion: median(
      longRows.map((item) => item.long_reward_to_adverse_excursion).filter(Number.isFinite)
    )
  };
}

export function summarizeForensicRows(
  rows,
  horizons = FORENSIC_HORIZONS,
  thresholds = FORENSIC_ATR_THRESHOLDS
) {
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
      average_short_net_return: eligible.length
        ? eligible.reduce((sum, item) => sum + item.short_net_return, 0) / eligible.length
        : null,
      average_long_net_return: eligible.length
        ? eligible.reduce((sum, item) => sum + item.long_net_return, 0) / eligible.length
        : null,
      median_downward_excursion_atr: median(
        eligible.map((item) => item.downward_excursion_atr)
      ),
      median_upward_excursion_atr: median(
        eligible.map((item) => item.upward_excursion_atr)
      ),
      thresholds: Object.fromEntries(
        thresholds.map((threshold) => [String(threshold), summarizeThreshold(eligible, threshold)])
      )
    };
  }
  return summary;
}
