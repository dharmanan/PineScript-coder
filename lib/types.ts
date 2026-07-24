export type TradingStyle = "scalp" | "intraday" | "swing" | "spot" | "long_term";
export type Direction = "long_short" | "long_only" | "spot_buy_exit";
export type OutputMode = "indicator" | "strategy";
export type Sensitivity = "frequent" | "balanced" | "selective";
export type StopMode = "atr" | "percent" | "swing" | "none";
export type StopTrigger = "wick" | "close";
export type TakeProfitMode = "risk_reward" | "percent" | "opposite_signal" | "none";
export type EntryTrigger = "trend_state" | "ema_cross" | "pullback_reclaim" | "vwap_reclaim" | "supertrend_flip" | "breakout";
export type SpotExitMode = "trend_break" | "ema_cross" | "rsi_overbought" | "htf_bearish" | "combined";
export type VisualProfile = "clean" | "enhanced" | "advanced";
export type SessionTimezone = "exchange" | "America/New_York" | "Europe/London" | "Europe/Istanbul" | "UTC";
export type ResearchProfile = "bnb_30m_ema_confirmed_regular_divergence_v1";
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
  entryTrigger: EntryTrigger;
  spotExitMode: SpotExitMode;
  confirmedBarsOnly: boolean;
  researchProfile?: ResearchProfile;
  higherTimeframe: {
    enabled: boolean;
    timeframe: string;
    method: "ema" | "sma" | "supertrend";
    length: number;
    blockCounterTrend: boolean;
    closedBarOnly: boolean;
  };
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
    trailingEnabled: boolean;
    breakEvenEnabled: boolean;
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
