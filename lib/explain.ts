import type { StrategyConfig } from "./types";

const styleLabels: Record<StrategyConfig["style"], string> = {
  scalp: "very short-term scalping",
  intraday: "intraday trading",
  swing: "swing trading",
  spot: "spot trading",
  long_term: "long-term trend following"
};

const triggerLabels: Record<StrategyConfig["entryTrigger"], string> = {
  trend_state: "all selected conditions remain valid",
  ema_cross: "the fast EMA crosses the slow EMA",
  pullback_reclaim: "price reclaims the fast EMA after a pullback",
  vwap_reclaim: "price reclaims VWAP",
  supertrend_flip: "Supertrend changes direction",
  breakout: "price breaks the selected recent high or low"
};

const exitLabels: Record<StrategyConfig["spotExitMode"], string> = {
  trend_break: "price breaks below the long moving average",
  ema_cross: "the fast EMA crosses below the slow EMA",
  rsi_overbought: "RSI falls back below the selected exit level",
  htf_bearish: "the higher-timeframe bias turns bearish",
  combined: "any selected trend, EMA, RSI or higher-timeframe exit event occurs"
};

export function explainConfig(c: StrategyConfig): string[] {
  const lines: string[] = [];
  const direction = c.direction === "long_short" ? "long and short" : c.direction === "long_only" ? "long-only" : "spot buy and exit";
  lines.push(`This script is designed for ${styleLabels[c.style]} and produces ${direction} signals when used on a ${c.chartTimeframe} chart.`);
  lines.push(`A new entry is triggered when ${triggerLabels[c.entryTrigger]}; selected filters must also agree.`);

  const trendParts: string[] = [];
  if (c.trend.emaEnabled) trendParts.push(`EMA ${c.trend.emaFast}/${c.trend.emaSlow}`);
  if (c.trend.longMaEnabled) trendParts.push(`${c.trend.longMaType.toUpperCase()} ${c.trend.longMaLength}`);
  if (c.trend.vwapEnabled) trendParts.push("VWAP");
  if (c.trend.supertrendEnabled) trendParts.push(`Supertrend ${c.trend.supertrendAtrLength}/${c.trend.supertrendFactor}`);
  if (trendParts.length) lines.push(`Trend direction is filtered with ${trendParts.join(", ")}.`);

  if (c.higherTimeframe.enabled) {
    const closed = c.higherTimeframe.closedBarOnly ? "the last closed higher-timeframe candle" : "the live higher-timeframe candle";
    const blockText = c.higherTimeframe.blockCounterTrend
      ? c.direction === "spot_buy_exit" || c.direction === "long_only"
        ? "Long or buy signals are blocked while that bias is bearish."
        : "Long signals are blocked during bearish bias and short signals during bullish bias."
      : "The bias is shown as context and does not block entries.";
    lines.push(`The ${c.higherTimeframe.timeframe} bias uses ${c.higherTimeframe.method.toUpperCase()} ${c.higherTimeframe.length} and reads ${closed}. ${blockText}`);
  }

  const confirmations: string[] = [];
  if (c.momentum.rsiEnabled) confirmations.push(`RSI ${c.momentum.rsiLength}`);
  if (c.momentum.macdEnabled) confirmations.push("MACD direction");
  if (c.momentum.adxEnabled) confirmations.push(`ADX at or above ${c.momentum.adxThreshold}`);
  if (c.momentum.divergenceEnabled) confirmations.push(`confirmed RSI divergence using ${c.momentum.divergencePivot}-bar pivots`);
  if (c.volume.enabled) confirmations.push(`volume at least ${c.volume.multiplier}× its ${c.volume.averageLength}-bar average`);
  if (confirmations.length) lines.push(`Entries require ${confirmations.join(", ")}.`);

  if (c.direction === "spot_buy_exit") lines.push(`A spot exit is produced when ${exitLabels[c.spotExitMode]}. The script never creates short entries.`);
  if (c.confirmedBarsOnly) lines.push("Entry and exit events only finalize after the chart candle closes.");
  if (c.execution.cooldownBars > 0) lines.push(`After an entry, a ${c.execution.cooldownBars}-bar cooldown prevents duplicate entries in the same move.`);
  if (c.execution.sessionEnabled) lines.push(`Signals are restricted to the ${c.execution.session} exchange-time session.`);

  if (c.outputMode === "strategy") {
    const riskParts: string[] = [];
    if (c.risk.stopMode === "atr") riskParts.push(`${c.risk.atrMultiple} ATR stop`);
    if (c.risk.stopMode === "percent") riskParts.push(`${c.risk.stopPercent}% stop`);
    if (c.risk.stopMode === "swing") riskParts.push(`${c.risk.swingLength}-bar swing stop`);
    if (c.risk.takeProfitMode === "risk_reward") riskParts.push(`${c.risk.riskReward}:1 risk/reward target`);
    if (c.risk.takeProfitMode === "percent") riskParts.push(`${c.risk.takeProfitPercent}% target`);
    if (c.risk.takeProfitMode === "opposite_signal") riskParts.push("exit on the configured reversal event");
    if (riskParts.length) lines.push(`Strategy Tester orders use ${riskParts.join(" and ")}.`);
  } else {
    lines.push("Indicator mode plots signals and alerts but does not place Strategy Tester orders.");
  }

  if (c.execution.alertsEnabled) lines.push("TradingView alert conditions are included for every generated entry and exit signal.");
  return lines;
}
