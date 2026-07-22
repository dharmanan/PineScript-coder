import type { StrategyConfig } from "./types";

export const defaultConfig: StrategyConfig = {
  name: "PineForge Strategy",
  style: "intraday",
  direction: "long_short",
  outputMode: "indicator",
  chartTimeframe: "15",
  sensitivity: "balanced",
  confirmedBarsOnly: true,
  higherTimeframe: {
    enabled: true,
    timeframe: "240",
    method: "ema",
    length: 100,
    blockCounterTrend: true
  },
  trend: {
    emaEnabled: true,
    emaFast: 20,
    emaSlow: 50,
    longMaEnabled: true,
    longMaType: "sma",
    longMaLength: 100,
    vwapEnabled: true,
    supertrendEnabled: false,
    supertrendAtrLength: 10,
    supertrendFactor: 3
  },
  momentum: {
    rsiEnabled: true,
    rsiLength: 14,
    rsiLong: 55,
    rsiShort: 45,
    macdEnabled: false,
    adxEnabled: false,
    adxLength: 14,
    adxThreshold: 20,
    divergenceEnabled: false,
    divergencePivot: 5
  },
  volume: {
    enabled: true,
    averageLength: 20,
    multiplier: 1
  },
  risk: {
    stopMode: "atr",
    atrLength: 14,
    atrMultiple: 2,
    stopPercent: 1.5,
    takeProfitMode: "risk_reward",
    riskReward: 2,
    takeProfitPercent: 3,
    trailingEnabled: false,
    breakEvenEnabled: false
  },
  execution: {
    cooldownBars: 5,
    sessionEnabled: false,
    session: "0900-1700",
    alertsEnabled: true,
    webhookEnabled: true,
    showDashboard: true,
    showBackground: true
  }
};
