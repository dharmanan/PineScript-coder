export type TradingStyle = "scalp" | "intraday" | "swing" | "spot" | "long_term";
export type Direction = "long_short" | "long_only" | "spot_buy_exit";
export type OutputMode = "indicator" | "strategy";
export type Sensitivity = "frequent" | "balanced" | "selective";
export type StopMode = "atr" | "percent" | "swing" | "none";
export type TakeProfitMode = "risk_reward" | "percent" | "opposite_signal" | "none";
export type EntryTrigger = "trend_state" | "ema_cross" | "pullback_reclaim" | "vwap_reclaim" | "supertrend_flip" | "breakout";
export type SpotExitMode = "trend_break" | "ema_cross" | "rsi_overbought" | "htf_bearish" | "combined";

export interface StrategyConfig {
  name: string;
  style: TradingStyle;
  direction: Direction;
  outputMode: OutputMode;
  chartTimeframe: string;
  sensitivity: Sensitivity;
  entryTrigger: EntryTrigger;
  spotExitMode: SpotExitMode;
  confirmedBarsOnly: boolean;
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
    alertsEnabled: boolean;
    webhookEnabled: boolean;
    showDashboard: boolean;
    showBackground: boolean;
  };
}
