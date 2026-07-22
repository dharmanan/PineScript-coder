import type { StrategyConfig } from "./types";

export type BehaviorPlan = {
  mode: StrategyConfig["direction"];
  output: StrategyConfig["outputMode"];
  chartTimeframe: string;
  entry: {
    trigger: StrategyConfig["entryTrigger"];
    longFilters: string[];
    shortFilters: string[];
  };
  higherTimeframe?: {
    timeframe: string;
    method: StrategyConfig["higherTimeframe"]["method"];
    length: number;
    closedBarOnly: boolean;
    blocksCounterTrend: boolean;
  };
  risk: {
    stopMode: StrategyConfig["risk"]["stopMode"];
    takeProfitMode: StrategyConfig["risk"]["takeProfitMode"];
    visualOnly: boolean;
  };
  execution: {
    confirmedBarsOnly: boolean;
    cooldownBars: number;
    session?: string;
  };
};

export function buildBehaviorPlan(c: StrategyConfig): BehaviorPlan {
  const longFilters: string[] = [];
  const shortFilters: string[] = [];

  if (c.trend.emaEnabled) {
    longFilters.push(`EMA ${c.trend.emaFast} above EMA ${c.trend.emaSlow}`);
    shortFilters.push(`EMA ${c.trend.emaFast} below EMA ${c.trend.emaSlow}`);
  }
  if (c.trend.longMaEnabled) {
    const label = `${c.trend.longMaType.toUpperCase()} ${c.trend.longMaLength}`;
    longFilters.push(`price above ${label}`);
    shortFilters.push(`price below ${label}`);
  }
  if (c.trend.vwapEnabled) {
    longFilters.push("price above VWAP");
    shortFilters.push("price below VWAP");
  }
  if (c.trend.supertrendEnabled) {
    longFilters.push("Supertrend bullish");
    shortFilters.push("Supertrend bearish");
  }
  if (c.momentum.rsiEnabled) {
    longFilters.push(`RSI at least ${c.momentum.rsiLong}`);
    shortFilters.push(`RSI at most ${c.momentum.rsiShort}`);
  }
  if (c.momentum.macdEnabled) {
    longFilters.push("MACD bullish");
    shortFilters.push("MACD bearish");
  }
  if (c.momentum.adxEnabled) {
    longFilters.push(`ADX at least ${c.momentum.adxThreshold} with +DI dominant`);
    shortFilters.push(`ADX at least ${c.momentum.adxThreshold} with -DI dominant`);
  }
  if (c.momentum.divergenceEnabled) {
    longFilters.push("confirmed bullish RSI divergence");
    shortFilters.push("confirmed bearish RSI divergence");
  }
  if (c.volume.enabled) {
    const label = `volume at least ${c.volume.multiplier}x its ${c.volume.averageLength}-bar average`;
    longFilters.push(label);
    shortFilters.push(label);
  }
  if (c.higherTimeframe.enabled && c.higherTimeframe.blockCounterTrend) {
    longFilters.push("higher-timeframe bias bullish");
    shortFilters.push("higher-timeframe bias bearish");
  }
  if (c.execution.sessionEnabled) {
    longFilters.push(`inside session ${c.execution.session}`);
    shortFilters.push(`inside session ${c.execution.session}`);
  }
  if (c.confirmedBarsOnly) {
    longFilters.push("chart candle confirmed");
    shortFilters.push("chart candle confirmed");
  }

  return {
    mode: c.direction,
    output: c.outputMode,
    chartTimeframe: c.chartTimeframe,
    entry: {
      trigger: c.entryTrigger,
      longFilters,
      shortFilters: c.direction === "long_short" ? shortFilters : []
    },
    higherTimeframe: c.higherTimeframe.enabled
      ? {
          timeframe: c.higherTimeframe.timeframe,
          method: c.higherTimeframe.method,
          length: c.higherTimeframe.length,
          closedBarOnly: c.higherTimeframe.closedBarOnly,
          blocksCounterTrend: c.higherTimeframe.blockCounterTrend
        }
      : undefined,
    risk: {
      stopMode: c.risk.stopMode,
      takeProfitMode: c.risk.takeProfitMode,
      visualOnly: c.outputMode === "indicator"
    },
    execution: {
      confirmedBarsOnly: c.confirmedBarsOnly,
      cooldownBars: c.execution.cooldownBars,
      session: c.execution.sessionEnabled ? c.execution.session : undefined
    }
  };
}
