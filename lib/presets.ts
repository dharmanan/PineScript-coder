import { defaultConfig } from "./defaults";
import type { StrategyConfig, WinRateProfile } from "./types";

// The hit-rate alternative for each preset, measured on the same 2019-2022 development data
// and restricted to the preset's own chart timeframe so switching profiles never asks for a
// different chart. Every one of them is a low reward target plus a trailing stop: that pair,
// not any single filter, is what turns a 20% hit rate into a 40-57% one. The money it gives
// up is real and is documented next to each preset.
const winRate = (overrides: Partial<WinRateProfile>): WinRateProfile => ({
  signalMode: "all_filters", scoreThreshold: 60, triggerWindow: 1,
  riskReward: 2, breakEvenAtR: 0, trailStartR: 1.5, trailDistanceR: 1,
  ...overrides
});

const preset = (overrides: Partial<StrategyConfig> & { name: string; presetId: NonNullable<StrategyConfig["presetId"]> }): StrategyConfig => ({
  ...defaultConfig,
  ...overrides,
  higherTimeframe: { ...defaultConfig.higherTimeframe, ...(overrides.higherTimeframe ?? {}) },
  trend: { ...defaultConfig.trend, ...(overrides.trend ?? {}) },
  momentum: { ...defaultConfig.momentum, ...(overrides.momentum ?? {}) },
  volume: { ...defaultConfig.volume, ...(overrides.volume ?? {}) },
  risk: { ...defaultConfig.risk, ...(overrides.risk ?? {}) },
  execution: { ...defaultConfig.execution, ...(overrides.execution ?? {}) },
  visual: { ...defaultConfig.visual, ...(overrides.visual ?? {}) }
});

// Chart timeframe, signal mode, trigger window, risk/reward and exit management are
// measured, not guessed. Each was chosen from the 2019-2022 development partition by
// research/preset-sweep, keeping the highest expectancy among configurations that were
// profitable in at least 60% of quarters, then reported against 2023-2025 validation and
// finally against the untouched 2026 holdout. Six of the eight held up on the holdout;
// the two that did not are marked below. See research/preset-sweep/results-v2.md.
export const presets: StrategyConfig[] = [
  // LOCKED 26 July 2026 — reviewed on all four symbols in TradingView, panel figures matched
  // the measurement, see research/preset-sweep/PRESET-REVIEW-PLAN.md
  //
  // Money profile, holdout 2026: 151 trades, 19.2% win, +0.138R — but ETH carries all of it
  // (+1.079R) while BNB (-0.524R) and BTC (-0.138R) lose. Kept as the alternative, not the
  // default, and its dependence on one symbol is stated rather than hidden.
  //
  // Win-rate profile: reward 1.25 with a ten-bar trigger window. Holdout 2026: 711 trades,
  // 49.2% win, +0.086R, positive on all four symbols. It gives up headline expectancy
  // against the wider target but spreads the result: ETH 41% of the profit, BTC 34%, SOL
  // 13%, BNB 12%, versus 78% from ETH alone at reward 2. Also the least bad candidate of
  // the 34 measured on the unseen July data (-0.042R against -0.198R at reward 2).
  preset({
    presetId: "balanced_intraday", name: "Balanced Intraday", style: "intraday",
    chartTimeframe: "30", entryTrigger: "pullback_reclaim",
    risk: { ...defaultConfig.risk, riskReward: 5 },
    winRateProfile: winRate({ triggerWindow: 10, riskReward: 1.25, trailStartR: 0 })
  }),
  // holdout 2026: 517 trades, 12.0% win, +0.104R per trade
  // Win-rate profile, holdout 2026: 559 trades, 43.8% win, +0.032R. Hit rate more than
  // doubles, the money nearly disappears.
  preset({
    presetId: "fast_ema_scalper", name: "Fast EMA Scalper", style: "scalp",
    chartTimeframe: "30", triggerWindow: 5, entryTrigger: "ema_cross",
    trend: { ...defaultConfig.trend, emaFast: 9, emaSlow: 21, longMaEnabled: false, vwapEnabled: true },
    higherTimeframe: { ...defaultConfig.higherTimeframe, timeframe: "60", length: 50 },
    volume: { ...defaultConfig.volume, multiplier: 1.2 },
    risk: { ...defaultConfig.risk, atrMultiple: 1.5, riskReward: 6, breakEvenAtR: 1 },
    execution: { ...defaultConfig.execution, cooldownBars: 3 },
    winRateProfile: winRate({ triggerWindow: 5 })
  }),
  // holdout 2026: 180 trades, -0.264R per trade. Measured and did NOT hold.
  // Win-rate profile, holdout 2026: 210 trades, 37.6% win, -0.020R. Closer to break-even
  // than the money profile, but still not a preset that held out of sample.
  preset({
    presetId: "vwap_session_trader", name: "VWAP Session Trader", style: "intraday",
    chartTimeframe: "60", triggerWindow: 3, entryTrigger: "vwap_reclaim",
    trend: { ...defaultConfig.trend, emaEnabled: true, emaFast: 9, emaSlow: 21, longMaEnabled: false, vwapEnabled: true },
    higherTimeframe: { ...defaultConfig.higherTimeframe, enabled: false },
    risk: { ...defaultConfig.risk, riskReward: 6 },
    execution: { ...defaultConfig.execution, sessionEnabled: true, session: "0930-1600", sessionTimezone: "America/New_York" },
    winRateProfile: winRate({ triggerWindow: 3, riskReward: 4 })
  }),
  // The one preset where swing structure beat the daily average on all three partitions at
  // once, so it is the one preset that changed. Its daily EMA-200 gate turned after the
  // structure had already broken, which cost it money out of sample; the structural gate
  // turns on the break. Paired against identical settings it was ahead in 40 of 40
  // validation pairs and 21 of 24 holdout pairs.
  //   old (daily EMA-200):   dev +0.328R | val -0.105R | holdout -0.292R
  //   new (swing structure): dev +0.495R | val +0.215R | holdout +0.336R
  // holdout 2026: 57 trades, 19.3% win, +0.336R per trade. BTC negative (-0.193R).
  // Its win-rate profile is the one place in the set where pushing the hit rate higher
  // reverses the sign: rr 2 with a trailing stop reaches 47% in development but loses
  // money on the 2026 holdout (-0.141R, negative on three of four symbols). So this
  // preset's alternative stops at rr 3 — 32.9% development, 29.2% validation, +0.052R
  // holdout — which is still a large step up in hit rate and still positive out of sample.
  preset({
    presetId: "swing_trend_4h", name: "4H Swing Trend", style: "swing",
    chartTimeframe: "30", triggerWindow: 5, entryTrigger: "pullback_reclaim",
    biasSource: "swing_structure",
    trend: { ...defaultConfig.trend, emaFast: 50, emaSlow: 100, longMaLength: 200, vwapEnabled: false },
    higherTimeframe: { ...defaultConfig.higherTimeframe, timeframe: "D", length: 200 },
    momentum: { ...defaultConfig.momentum, adxEnabled: true, adxThreshold: 22 },
    risk: { ...defaultConfig.risk, atrMultiple: 2.5, riskReward: 6 },
    winRateProfile: winRate({ triggerWindow: 5, riskReward: 3, trailStartR: 0, trailDistanceR: 1 })
  }),
  // No stop and no target, so a win and a loss are not defined. Never measured.
  preset({
    presetId: "spot_accumulation", name: "Spot Accumulation", style: "spot", direction: "spot_buy_exit",
    chartTimeframe: "D", entryTrigger: "pullback_reclaim", spotExitMode: "combined",
    trend: { ...defaultConfig.trend, emaFast: 50, emaSlow: 100, longMaLength: 200, vwapEnabled: false },
    higherTimeframe: { ...defaultConfig.higherTimeframe, timeframe: "W", length: 50, closedBarOnly: true },
    momentum: { ...defaultConfig.momentum, rsiLong: 45, rsiShort: 40, rsiExit: 65 },
    risk: { ...defaultConfig.risk, stopMode: "none", takeProfitMode: "none" }
  }),
  // holdout 2026: 271 trades, 21.0% win, +0.240R per trade
  // Win-rate profile, holdout 2026: 338 trades, 42.6% win, +0.067R. BNB and BTC negative.
  preset({
    presetId: "supertrend_volume", name: "Supertrend Volume",
    chartTimeframe: "30", triggerWindow: 10, entryTrigger: "supertrend_flip",
    trend: { ...defaultConfig.trend, emaEnabled: false, supertrendEnabled: true, vwapEnabled: false },
    volume: { ...defaultConfig.volume, multiplier: 1.25 },
    momentum: { ...defaultConfig.momentum, rsiEnabled: false },
    risk: { ...defaultConfig.risk, riskReward: 5 },
    winRateProfile: winRate({ triggerWindow: 10, riskReward: 3 })
  }),
  // holdout 2026: 168 trades, 22.0% win, +0.412R per trade
  // Win-rate profile, holdout 2026: 269 trades, 42.4% win, +0.083R. SOL negative. This is
  // the preset where the trade-off is starkest: nearly double the hit rate for a fifth of
  // the money, on the one preset whose money profile clears two sigma in validation.
  preset({
    presetId: "breakout_momentum", name: "Breakout Momentum",
    chartTimeframe: "60", triggerWindow: 3, entryTrigger: "breakout",
    trend: { ...defaultConfig.trend, emaFast: 20, emaSlow: 50, vwapEnabled: false, breakoutLength: 20 },
    momentum: { ...defaultConfig.momentum, macdEnabled: true, adxEnabled: true },
    volume: { ...defaultConfig.volume, multiplier: 1.5 },
    risk: { ...defaultConfig.risk, riskReward: 6 },
    winRateProfile: winRate({ triggerWindow: 3 })
  }),
  // holdout 2026: 135 trades, -0.208R per trade. Measured and did NOT hold.
  // Win-rate profile, holdout 2026: 146 trades, 33.6% win, -0.028R. Neither profile held.
  preset({
    presetId: "rsi_divergence_reversal", name: "RSI Divergence Reversal",
    chartTimeframe: "30", entryTrigger: "trend_state",
    trend: { ...defaultConfig.trend, emaEnabled: false, vwapEnabled: false, longMaEnabled: false },
    higherTimeframe: { ...defaultConfig.higherTimeframe, enabled: false },
    momentum: { ...defaultConfig.momentum, divergenceEnabled: true, rsiLong: 40, rsiShort: 60 },
    volume: { ...defaultConfig.volume, enabled: false },
    risk: { ...defaultConfig.risk, riskReward: 6 },
    winRateProfile: winRate({ riskReward: 3.5, trailStartR: 2, trailDistanceR: 1.5 })
  }),
  // Strongest of the set. holdout 2026: 55 trades, 45.5% win, +0.521R per trade.
  // A documented alternative trades reward for hit rate: rr 2.5 with trail 1.5/1.0 gave
  // 52.7% win and +0.303R on the same holdout.
  // Win-rate profile, holdout 2026: 55 trades, 49.1% win, +0.075R. The highest hit rate in
  // the set — 57.6% in development, 48.8% in validation, positive on all four symbols out
  // of sample. Also the smallest sample: 9 to 16 trades per symbol in the holdout.
  preset({
    presetId: "selective_multi_timeframe", name: "Selective Multi-Timeframe", sensitivity: "selective",
    chartTimeframe: "60", triggerWindow: 3, entryTrigger: "pullback_reclaim",
    higherTimeframe: { ...defaultConfig.higherTimeframe, enabled: true, timeframe: "240", blockCounterTrend: true, closedBarOnly: true },
    momentum: { ...defaultConfig.momentum, macdEnabled: true, adxEnabled: true },
    volume: { ...defaultConfig.volume, multiplier: 1.2 },
    risk: { ...defaultConfig.risk, stopTrigger: "close", riskReward: 6, trailStartR: 2, trailDistanceR: 1.5 },
    winRateProfile: winRate({ triggerWindow: 3, riskReward: 2.5 })
  }),
  // Long-only. Not carried forward from the v2 sweep: its best configuration matched
  // Fast EMA Scalper's, so it keeps its own character with the measured exit management.
  // Win-rate profile: 44.7% in development, 37.4% in validation. The 2026 holdout holds
  // five trades for this preset, all on one symbol, so no holdout claim is made either way.
  preset({
    presetId: "long_term_trend_guard", name: "Long-Term Trend Guard", style: "long_term", direction: "long_only",
    chartTimeframe: "30", triggerWindow: 5, entryTrigger: "ema_cross",
    trend: { ...defaultConfig.trend, emaFast: 50, emaSlow: 100, longMaLength: 200, vwapEnabled: false },
    higherTimeframe: { ...defaultConfig.higherTimeframe, timeframe: "W", method: "sma", length: 40, closedBarOnly: true },
    momentum: { ...defaultConfig.momentum, rsiLong: 50, rsiShort: 40 },
    risk: { ...defaultConfig.risk, atrMultiple: 3, riskReward: 6, breakEvenAtR: 1 },
    winRateProfile: winRate({ signalMode: "score", scoreThreshold: 85, triggerWindow: 10 })
  })
];
