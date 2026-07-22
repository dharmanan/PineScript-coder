import type { StrategyConfig } from "./types";

const styleLabels: Record<StrategyConfig["style"], string> = {
  scalp: "very short-term scalping",
  intraday: "intraday trading",
  swing: "swing trading",
  spot: "spot trading",
  long_term: "long-term trend following"
};

export function explainConfig(c: StrategyConfig): string[] {
  const lines: string[] = [];
  const direction = c.direction === "long_short" ? "long and short" : c.direction === "long_only" ? "long-only" : "spot buy and exit";
  lines.push(`This script is designed for ${styleLabels[c.style]} and produces ${direction} signals on the ${c.chartTimeframe} chart timeframe.`);

  const trendParts: string[] = [];
  if (c.trend.emaEnabled) trendParts.push(`EMA ${c.trend.emaFast}/${c.trend.emaSlow}`);
  if (c.trend.longMaEnabled) trendParts.push(`${c.trend.longMaType.toUpperCase()} ${c.trend.longMaLength}`);
  if (c.trend.vwapEnabled) trendParts.push("VWAP");
  if (c.trend.supertrendEnabled) trendParts.push(`Supertrend ${c.trend.supertrendAtrLength}/${c.trend.supertrendFactor}`);
  if (trendParts.length) lines.push(`Trend direction is evaluated with ${trendParts.join(", ")}.`);

  if (c.higherTimeframe.enabled) {
    lines.push(`The ${c.higherTimeframe.timeframe} higher-timeframe bias uses ${c.higherTimeframe.method.toUpperCase()} ${c.higherTimeframe.length}.${c.higherTimeframe.blockCounterTrend ? " Long signals are blocked during bearish bias, and short signals are blocked during bullish bias." : " It is displayed as context but does not block signals."}`);
  }

  const confirmations: string[] = [];
  if (c.momentum.rsiEnabled) confirmations.push(`RSI ${c.momentum.rsiLength}`);
  if (c.momentum.macdEnabled) confirmations.push("MACD direction");
  if (c.momentum.adxEnabled) confirmations.push(`ADX above ${c.momentum.adxThreshold}`);
  if (c.momentum.divergenceEnabled) confirmations.push("confirmed RSI divergence");
  if (c.volume.enabled) confirmations.push(`volume above ${c.volume.multiplier}× its ${c.volume.averageLength}-bar average`);
  if (confirmations.length) lines.push(`Signals are confirmed by ${confirmations.join(", ")}.`);

  if (c.confirmedBarsOnly) lines.push("Signals only finalize after the candle closes to reduce intrabar changes.");
  if (c.execution.cooldownBars > 0) lines.push(`A ${c.execution.cooldownBars}-bar cooldown prevents repeated signals in the same move.`);

  if (c.outputMode === "strategy") {
    const riskParts: string[] = [];
    if (c.risk.stopMode === "atr") riskParts.push(`${c.risk.atrMultiple} ATR stop`);
    if (c.risk.stopMode === "percent") riskParts.push(`${c.risk.stopPercent}% stop`);
    if (c.risk.takeProfitMode === "risk_reward") riskParts.push(`${c.risk.riskReward}:1 risk/reward target`);
    if (c.risk.takeProfitMode === "percent") riskParts.push(`${c.risk.takeProfitPercent}% target`);
    if (c.risk.takeProfitMode === "opposite_signal") riskParts.push("exit on the opposite signal");
    if (riskParts.length) lines.push(`Strategy orders use ${riskParts.join(" and ")}.`);
  }

  if (c.execution.alertsEnabled) lines.push("TradingView alert triggers are included for generated signals.");
  return lines;
}
