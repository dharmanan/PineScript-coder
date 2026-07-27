import type { PresetId, StrategyConfig } from "./types";

// Product display order, not a promise of future returns. The locked TradingView
// reviews prioritize four-symbol consistency first, then net result and sample
// strength. Keep this separate from `presets` so research and compiler behavior
// never change just because the Studio list is reordered.
export const presetDisplayOrder = [
  "kohen_dive_adaptive",
  "vwap_session_trader",
  "balanced_intraday",
  "long_term_trend_guard",
  "selective_multi_timeframe",
  "breakout_momentum",
  "supertrend_volume",
  "fast_ema_scalper",
  "swing_trend_4h"
] as const satisfies readonly PresetId[];

const displayRank = new Map<PresetId, number>(
  presetDisplayOrder.map((presetId, index) => [presetId, index])
);

export const orderPresetsForDisplay = (items: readonly StrategyConfig[]) =>
  [...items].sort((left, right) => {
    const leftRank = left.presetId ? displayRank.get(left.presetId) : undefined;
    const rightRank = right.presetId ? displayRank.get(right.presetId) : undefined;
    return (leftRank ?? Number.MAX_SAFE_INTEGER) - (rightRank ?? Number.MAX_SAFE_INTEGER);
  });
