import { defaultConfig } from "./defaults";
import type { StrategyConfig } from "./types";

const preset = (overrides: Partial<StrategyConfig> & { name: string }): StrategyConfig => ({
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

export const presets: StrategyConfig[] = [
  preset({ name: "Balanced Intraday", style: "intraday", entryTrigger: "pullback_reclaim" }),
  preset({ name: "Fast EMA Scalper", style: "scalp", chartTimeframe: "5", entryTrigger: "ema_cross", trend: { ...defaultConfig.trend, emaFast: 9, emaSlow: 21, longMaEnabled: false, vwapEnabled: true }, higherTimeframe: { ...defaultConfig.higherTimeframe, timeframe: "60", length: 50 }, volume: { ...defaultConfig.volume, multiplier: 1.2 }, risk: { ...defaultConfig.risk, atrMultiple: 1.5, riskReward: 1.5 }, execution: { ...defaultConfig.execution, cooldownBars: 3 } }),
  preset({ name: "VWAP Session Trader", style: "intraday", entryTrigger: "vwap_reclaim", trend: { ...defaultConfig.trend, emaEnabled: true, emaFast: 9, emaSlow: 21, longMaEnabled: false, vwapEnabled: true }, higherTimeframe: { ...defaultConfig.higherTimeframe, enabled: false }, execution: { ...defaultConfig.execution, sessionEnabled: true, session: "0930-1600", sessionTimezone: "America/New_York" } }),
  preset({ name: "4H Swing Trend", style: "swing", chartTimeframe: "240", entryTrigger: "pullback_reclaim", trend: { ...defaultConfig.trend, emaFast: 50, emaSlow: 100, longMaLength: 200, vwapEnabled: false }, higherTimeframe: { ...defaultConfig.higherTimeframe, timeframe: "D", length: 200 }, momentum: { ...defaultConfig.momentum, adxEnabled: true, adxThreshold: 22 }, risk: { ...defaultConfig.risk, atrMultiple: 2.5, riskReward: 3 } }),
  preset({ name: "Spot Accumulation", style: "spot", direction: "spot_buy_exit", chartTimeframe: "D", entryTrigger: "pullback_reclaim", spotExitMode: "combined", trend: { ...defaultConfig.trend, emaFast: 50, emaSlow: 100, longMaLength: 200, vwapEnabled: false }, higherTimeframe: { ...defaultConfig.higherTimeframe, timeframe: "W", length: 50, closedBarOnly: true }, momentum: { ...defaultConfig.momentum, rsiLong: 45, rsiShort: 40, rsiExit: 65 }, risk: { ...defaultConfig.risk, stopMode: "none", takeProfitMode: "none" } }),
  preset({ name: "Supertrend Volume", entryTrigger: "supertrend_flip", trend: { ...defaultConfig.trend, emaEnabled: false, supertrendEnabled: true, vwapEnabled: false }, volume: { ...defaultConfig.volume, multiplier: 1.25 }, momentum: { ...defaultConfig.momentum, rsiEnabled: false } }),
  preset({ name: "Breakout Momentum", entryTrigger: "breakout", trend: { ...defaultConfig.trend, emaFast: 20, emaSlow: 50, vwapEnabled: false, breakoutLength: 20 }, momentum: { ...defaultConfig.momentum, macdEnabled: true, adxEnabled: true }, volume: { ...defaultConfig.volume, multiplier: 1.5 } }),
  preset({ name: "RSI Divergence Reversal", researchProfile: "bnb_30m_ema_confirmed_regular_divergence_v1", style: "intraday", chartTimeframe: "30", sensitivity: "selective", entryTrigger: "trend_state", confirmedBarsOnly: true, trend: { ...defaultConfig.trend, emaEnabled: true, emaFast: 9, emaSlow: 45, longMaEnabled: false, vwapEnabled: false }, higherTimeframe: { ...defaultConfig.higherTimeframe, enabled: false }, momentum: { ...defaultConfig.momentum, rsiEnabled: false, divergenceEnabled: true, divergencePivot: 5 }, volume: { ...defaultConfig.volume, enabled: true, averageLength: 20, multiplier: 0.8 }, risk: { ...defaultConfig.risk, stopMode: "swing", swingLength: 15, takeProfitMode: "risk_reward", riskReward: 1.8, trailingEnabled: false, breakEvenEnabled: false }, execution: { ...defaultConfig.execution, cooldownBars: 0, enforceChartTimeframe: true } }),
  preset({ name: "Selective Multi-Timeframe", sensitivity: "selective", entryTrigger: "pullback_reclaim", higherTimeframe: { ...defaultConfig.higherTimeframe, enabled: true, timeframe: "240", blockCounterTrend: true, closedBarOnly: true }, momentum: { ...defaultConfig.momentum, macdEnabled: true, adxEnabled: true }, volume: { ...defaultConfig.volume, multiplier: 1.2 } }),
  preset({ name: "Long-Term Trend Guard", style: "long_term", direction: "long_only", chartTimeframe: "D", entryTrigger: "ema_cross", trend: { ...defaultConfig.trend, emaFast: 50, emaSlow: 100, longMaLength: 200, vwapEnabled: false }, higherTimeframe: { ...defaultConfig.higherTimeframe, timeframe: "W", method: "sma", length: 40, closedBarOnly: true }, momentum: { ...defaultConfig.momentum, rsiLong: 50, rsiShort: 40 }, risk: { ...defaultConfig.risk, atrMultiple: 3, riskReward: 4 } })
];
