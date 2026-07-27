import type { StrategyConfig } from "./types";

export const defaultConfig: StrategyConfig = {
  name: "Kohen Pine Indicator",
  presetId: "custom",
  style: "intraday",
  direction: "long_short",
  outputMode: "indicator",
  chartTimeframe: "15",
  sensitivity: "balanced",
  signalMode: "all_filters",
  scoreThreshold: 60,
  triggerWindow: 1,
  entryTrigger: "pullback_reclaim",
  spotExitMode: "combined",
  confirmedBarsOnly: true,
  higherTimeframe: {
    enabled: true,
    timeframe: "240",
    method: "ema",
    length: 100,
    blockCounterTrend: true,
    closedBarOnly: true
  },
  // The default stays the higher-timeframe average: swing structure only replaced it on the
  // one preset where development, validation and holdout all agreed it was better.
  biasSource: "higher_timeframe",
  swingLookback: 3,
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
    supertrendFactor: 3,
    breakoutLength: 20
  },
  momentum: {
    rsiEnabled: true,
    rsiLength: 14,
    rsiLong: 55,
    rsiShort: 45,
    rsiExit: 65,
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
    stopTrigger: "wick",
    atrLength: 14,
    atrMultiple: 2,
    stopPercent: 1.5,
    swingLength: 10,
    takeProfitMode: "risk_reward",
    riskReward: 2,
    takeProfitPercent: 3,
    breakEvenAtR: 0,
    trailStartR: 0,
    trailDistanceR: 1
  },
  execution: {
    cooldownBars: 5,
    sessionEnabled: false,
    session: "0900-1700",
    sessionTimezone: "exchange",
    alertsEnabled: true,
    webhookEnabled: true,
    showDashboard: true,
    showBackground: true,
    enforceChartTimeframe: true
  },
  // Advanced by default: the signal score, setup colours and trend ribbon are what make the
  // chart readable, and having to switch to them on every generated script was pure friction.
  // Presentation only — the signal rules are identical in all three.
  visual: {
    profile: "advanced",
    colorBars: true,
    showSignalScore: true,
    showRiskOutcomeLabels: true,
    showTrendRibbon: true
  }
};
