export type TradingStyle = "scalp" | "intraday" | "swing" | "spot" | "long_term";
export type Direction = "long_short" | "long_only" | "spot_buy_exit";
export type OutputMode = "indicator" | "strategy";
export type Sensitivity = "frequent" | "balanced" | "selective";
export type SignalMode = "all_filters" | "score";
export type StopMode = "atr" | "percent" | "swing" | "none";
export type StopTrigger = "wick" | "close";
export type TakeProfitMode = "risk_reward" | "percent" | "opposite_signal" | "none";
export type EntryTrigger = "trend_state" | "ema_cross" | "pullback_reclaim" | "vwap_reclaim" | "supertrend_flip" | "breakout";
export type SpotExitMode = "trend_break" | "ema_cross" | "rsi_overbought" | "htf_bearish" | "combined";
export type VisualProfile = "clean" | "enhanced" | "advanced";
export type SessionTimezone = "exchange" | "America/New_York" | "Europe/London" | "Europe/Istanbul" | "UTC";
export type ResearchProfile = "bnb_30m_ema_confirmed_regular_divergence_v1";

// A preset ships with two measured settings. The money profile is what the preset already
// carries; this is the alternative, which trades reward for hit rate. Only the fields a
// profile is allowed to move are listed — timeframe and filters stay as the preset has them.
export type ActiveProfile = "money" | "win_rate";

export type BiasSource = "higher_timeframe" | "swing_structure";

export interface WinRateProfile {
  signalMode: SignalMode;
  scoreThreshold: number;
  triggerWindow: number;
  riskReward: number;
  breakEvenAtR: number;
  trailStartR: number;
  trailDistanceR: number;
}
export type PresetId =
  | "custom"
  | "balanced_intraday"
  | "fast_ema_scalper"
  | "vwap_session_trader"
  | "swing_trend_4h"
  | "spot_accumulation"
  | "supertrend_volume"
  | "breakout_momentum"
  | "rsi_divergence_reversal"
  | "selective_multi_timeframe"
  | "long_term_trend_guard";

export interface StrategyConfig {
  name: string;
  presetId?: PresetId;
  style: TradingStyle;
  direction: Direction;
  outputMode: OutputMode;
  chartTimeframe: string;
  sensitivity: Sensitivity;
  signalMode: SignalMode;
  scoreThreshold: number;
  triggerWindow: number;
  entryTrigger: EntryTrigger;
  spotExitMode: SpotExitMode;
  confirmedBarsOnly: boolean;
  researchProfile?: ResearchProfile;
  // The settings the same preset takes when it is tuned for hit rate instead of money.
  // Both profiles were measured on the same development partition and share the preset's
  // chart timeframe, so switching between them never asks the user to change charts.
  winRateProfile?: WinRateProfile;
  // Which of the two the generated script opens with. The other stays one dropdown away
  // inside the indicator, so this picks a starting point rather than discarding a choice.
  activeProfile?: ActiveProfile;
  higherTimeframe: {
    enabled: boolean;
    timeframe: string;
    method: "ema" | "sma" | "supertrend";
    length: number;
    blockCounterTrend: boolean;
    closedBarOnly: boolean;
  };
  // Where the directional gate comes from. "higher_timeframe" reads an average on a slower
  // chart and turns when that average turns, which is always after the structure broke.
  // "swing_structure" compares the last two confirmed highs and lows and turns on the break
  // itself. Measured per preset; only adopted where all three partitions agreed.
  biasSource: BiasSource;
  swingLookback: number;
  // Measured trades per symbol per month on the win-rate profile, the one a script opens with.
  // Set only where a review measured it, because a stale frequency is worse than none: a reader
  // who is told to expect twenty signals and gets two has been misled by the product rather than
  // by the market. Sparseness is the first thing a reader needs to know and the last thing they
  // find out if it is left to be discovered from an empty chart.
  tradesPerMonth?: number;
  trend: {
    emaEnabled: boolean;
    emaFast: number;
    emaSlow: number;
    longMaEnabled: boolean;
    longMaType: "sma" | "ema";
    longMaLength: number;
    vwapEnabled: boolean;
    supertrendEnabled: boolean;
    supertrendAtrLength: number;
    supertrendFactor: number;
    breakoutLength: number;
  };
  momentum: {
    rsiEnabled: boolean;
    rsiLength: number;
    rsiLong: number;
    rsiShort: number;
    rsiExit: number;
    macdEnabled: boolean;
    adxEnabled: boolean;
    adxLength: number;
    adxThreshold: number;
    divergenceEnabled: boolean;
    divergencePivot: number;
  };
  volume: {
    enabled: boolean;
    averageLength: number;
    multiplier: number;
  };
  risk: {
    stopMode: StopMode;
    stopTrigger: StopTrigger;
    atrLength: number;
    atrMultiple: number;
    stopPercent: number;
    swingLength: number;
    takeProfitMode: TakeProfitMode;
    riskReward: number;
    takeProfitPercent: number;
    breakEvenAtR: number;
    trailStartR: number;
    trailDistanceR: number;
  };
  execution: {
    cooldownBars: number;
    sessionEnabled: boolean;
    session: string;
    sessionTimezone: SessionTimezone;
    alertsEnabled: boolean;
    webhookEnabled: boolean;
    showDashboard: boolean;
    showBackground: boolean;
    enforceChartTimeframe: boolean;
  };
  visual: {
    profile: VisualProfile;
    colorBars: boolean;
    showSignalScore: boolean;
    showRiskOutcomeLabels: boolean;
    showTrendRibbon: boolean;
  };
}
