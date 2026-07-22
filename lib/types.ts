export type TradingStyle = "scalp" | "intraday" | "swing" | "spot" | "long_term";
export type Direction = "long_short" | "long_only" | "spot_buy_exit";
export type OutputMode = "indicator" | "strategy";
export type Sensitivity = "frequent" | "balanced" | "selective";
export type StopMode = "atr" | "percent" | "swing" | "none";
export type TakeProfitMode = "risk_reward" | "percent" | "opposite_signal" | "none";

export interface StrategyConfig {
  name: string;
  style: TradingStyle;
  direction: Direction;
  outputMode: OutputMode;
  chartTimeframe: string;
  sensitivity: Sensitivity;
  confirmedBarsOnly: boolean;
  higherTimeframe: {
    enabled: boolean;
    timeframe: string;
    method: "ema" | "sma" | "supertrend";
    length: number;
    blockCounterTrend: boolean;
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
  };
  momentum: {
    rsiEnabled: boolean;
    rsiLength: number;
    rsiLong: number;
    rsiShort: number;
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
