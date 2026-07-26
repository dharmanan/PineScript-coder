import type { StrategyConfig } from "./types";

export type PlanFilter = {
  id: string;
  label: string;
  longExpression: string;
  shortExpression?: string;
};

export type PlanTrigger = {
  id: StrategyConfig["entryTrigger"];
  label: string;
  longExpression: string;
  shortExpression?: string;
  plotsBreakoutLevels: boolean;
};

export type BehaviorPlan = {
  mode: StrategyConfig["direction"];
  output: StrategyConfig["outputMode"];
  chartTimeframe: string;
  entry: {
    trigger: PlanTrigger;
    filters: PlanFilter[];
    hasLong: boolean;
    hasShort: boolean;
  };
  higherTimeframe?: {
    timeframe: string;
    method: StrategyConfig["higherTimeframe"]["method"];
    length: number;
    closedBarOnly: boolean;
    blocksCounterTrend: boolean;
  };
  risk: {
    enabled: boolean;
    stopMode: StrategyConfig["risk"]["stopMode"];
    takeProfitMode: StrategyConfig["risk"]["takeProfitMode"];
    stopLabel?: string;
    targetLabel?: string;
    visualOnly: boolean;
  };
  execution: {
    confirmedBarsOnly: boolean;
    cooldownBars: number;
    session?: string;
    alertsEnabled: boolean;
    dashboardEnabled: boolean;
  };
  spotExit?: {
    mode: StrategyConfig["spotExitMode"];
    label: string;
  };
};

const triggerPlan = (c: StrategyConfig): PlanTrigger => {
  switch (c.entryTrigger) {
    case "ema_cross":
      return {
        id: "ema_cross",
        label: "the fast EMA crosses the slow EMA",
        longExpression: "ta.crossover(emaFast, emaSlow)",
        shortExpression: "ta.crossunder(emaFast, emaSlow)",
        plotsBreakoutLevels: false
      };
    case "pullback_reclaim":
      return {
        id: "pullback_reclaim",
        label: "price reclaims the fast EMA after a pullback",
        longExpression: "ta.crossover(close, emaFast)",
        shortExpression: "ta.crossunder(close, emaFast)",
        plotsBreakoutLevels: false
      };
    case "vwap_reclaim":
      return {
        id: "vwap_reclaim",
        label: "price reclaims VWAP",
        longExpression: "ta.crossover(close, vwapValue)",
        shortExpression: "ta.crossunder(close, vwapValue)",
        plotsBreakoutLevels: false
      };
    case "supertrend_flip":
      return {
        id: "supertrend_flip",
        label: "Supertrend changes direction",
        longExpression: "ta.change(supertrendDirection) < 0",
        shortExpression: "ta.change(supertrendDirection) > 0",
        plotsBreakoutLevels: false
      };
    case "breakout":
      return {
        id: "breakout",
        label: `price breaks the previous ${c.trend.breakoutLength}-bar high or low`,
        longExpression: "ta.crossover(close, previousHigh)",
        shortExpression: "ta.crossunder(close, previousLow)",
        plotsBreakoutLevels: true
      };
    case "trend_state":
    default:
      return {
        id: "trend_state",
        label: "all selected conditions remain valid",
        longExpression: "true",
        shortExpression: "true",
        plotsBreakoutLevels: false
      };
  }
};

const spotExitLabel = (mode: StrategyConfig["spotExitMode"]): string => {
  switch (mode) {
    case "trend_break": return "price crosses below the long moving average";
    case "ema_cross": return "the fast EMA crosses below the slow EMA";
    case "rsi_overbought": return "RSI falls back below the selected exit level";
    case "htf_bearish": return "the higher-timeframe bias turns bearish";
    case "combined": return "any configured trend, EMA, RSI or higher-timeframe reversal event occurs";
  }
};

const stopLabel = (c: StrategyConfig): string | undefined => {
  switch (c.risk.stopMode) {
    case "atr": return `${c.risk.atrMultiple} ATR stop`;
    case "percent": return `${c.risk.stopPercent}% stop`;
    case "swing": return `${c.risk.swingLength}-bar swing stop`;
    case "none": return undefined;
  }
};

const targetLabel = (c: StrategyConfig): string | undefined => {
  switch (c.risk.takeProfitMode) {
    case "risk_reward": return `${c.risk.riskReward}:1 risk/reward target`;
    case "percent": return `${c.risk.takeProfitPercent}% target`;
    case "opposite_signal": return "exit on the configured opposite signal";
    case "none": return undefined;
  }
};

export function buildBehaviorPlan(c: StrategyConfig): BehaviorPlan {
  const filters: PlanFilter[] = [];

  if (c.trend.emaEnabled) filters.push({
    id: "ema_trend",
    label: `EMA ${c.trend.emaFast}/${c.trend.emaSlow} trend`,
    longExpression: "emaFast > emaSlow",
    shortExpression: "emaFast < emaSlow"
  });
  if (c.trend.longMaEnabled) filters.push({
    id: "long_ma",
    label: `price relative to ${c.trend.longMaType.toUpperCase()} ${c.trend.longMaLength}`,
    longExpression: "close > longMa",
    shortExpression: "close < longMa"
  });
  if (c.trend.vwapEnabled) filters.push({
    id: "vwap",
    label: "price relative to VWAP",
    longExpression: "close > vwapValue",
    shortExpression: "close < vwapValue"
  });
  if (c.trend.supertrendEnabled) filters.push({
    id: "supertrend",
    label: "Supertrend direction",
    longExpression: "supertrendDirection < 0",
    shortExpression: "supertrendDirection > 0"
  });
  if (c.momentum.rsiEnabled) filters.push({
    id: "rsi",
    label: `RSI ${c.momentum.rsiLength} thresholds ${c.momentum.rsiLong}/${c.momentum.rsiShort}`,
    longExpression: "rsiValue >= rsiLongLevel",
    shortExpression: "rsiValue <= rsiShortLevel"
  });
  if (c.momentum.macdEnabled) filters.push({
    id: "macd",
    label: "MACD direction and histogram",
    longExpression: "macdLine > macdSignal and macdHist > 0",
    shortExpression: "macdLine < macdSignal and macdHist < 0"
  });
  if (c.momentum.adxEnabled) filters.push({
    id: "adx",
    label: `ADX at least ${c.momentum.adxThreshold} with directional confirmation`,
    longExpression: "adxValue >= adxThreshold and plusDI > minusDI",
    shortExpression: "adxValue >= adxThreshold and minusDI > plusDI"
  });
  if (c.momentum.divergenceEnabled) filters.push({
    id: "divergence",
    label: `confirmed RSI divergence using ${c.momentum.divergencePivot}-bar pivots`,
    longExpression: "bullishDivergence",
    shortExpression: "bearishDivergence"
  });
  if (c.volume.enabled) filters.push({
    id: "volume",
    label: `volume at least ${c.volume.multiplier}x its ${c.volume.averageLength}-bar average`,
    longExpression: "volume >= volumeAverage * volumeMultiplier",
    shortExpression: "volume >= volumeAverage * volumeMultiplier"
  });
  // Structure replaces the higher-timeframe gate rather than joining it: both answer the
  // same question — which side is allowed — and stacking two directional vetoes would be a
  // different, unmeasured configuration.
  if (c.biasSource === "swing_structure") filters.push({
    id: "structure_bias",
    label: `swing structure bias from ${c.swingLookback}-bar pivots`,
    longExpression: "structureBull",
    shortExpression: "structureBear"
  });
  else if (c.higherTimeframe.enabled && c.higherTimeframe.blockCounterTrend) filters.push({
    id: "htf_bias",
    label: "higher-timeframe bias",
    longExpression: "htfBull",
    shortExpression: "htfBear"
  });
  if (c.execution.sessionEnabled) filters.push({
    id: "session",
    label: `inside exchange-time session ${c.execution.session}`,
    longExpression: "sessionOk",
    shortExpression: "sessionOk"
  });
  filters.push({
    id: "confirmation",
    label: c.confirmedBarsOnly ? "confirmed chart candle" : "live or confirmed chart candle",
    longExpression: "confirmationOk",
    shortExpression: "confirmationOk"
  });

  return {
    mode: c.direction,
    output: c.outputMode,
    chartTimeframe: c.chartTimeframe,
    entry: {
      trigger: triggerPlan(c),
      filters,
      hasLong: true,
      hasShort: c.direction === "long_short"
    },
    higherTimeframe: c.higherTimeframe.enabled ? {
      timeframe: c.higherTimeframe.timeframe,
      method: c.higherTimeframe.method,
      length: c.higherTimeframe.length,
      closedBarOnly: c.higherTimeframe.closedBarOnly,
      // Structure took over the directional gate, so the higher timeframe is still computed
      // and still shown, but it no longer blocks anything. Reporting otherwise would
      // describe a rule the generated script does not apply.
      blocksCounterTrend: c.biasSource === "swing_structure" ? false : c.higherTimeframe.blockCounterTrend
    } : undefined,
    risk: {
      enabled: c.risk.stopMode !== "none" || c.risk.takeProfitMode !== "none",
      stopMode: c.risk.stopMode,
      takeProfitMode: c.risk.takeProfitMode,
      stopLabel: stopLabel(c),
      targetLabel: targetLabel(c),
      visualOnly: c.outputMode === "indicator"
    },
    execution: {
      confirmedBarsOnly: c.confirmedBarsOnly,
      cooldownBars: c.execution.cooldownBars,
      session: c.execution.sessionEnabled ? c.execution.session : undefined,
      alertsEnabled: c.execution.alertsEnabled,
      dashboardEnabled: c.execution.showDashboard
    },
    spotExit: c.direction === "spot_buy_exit" ? { mode: c.spotExitMode, label: spotExitLabel(c.spotExitMode) } : undefined
  };
}
