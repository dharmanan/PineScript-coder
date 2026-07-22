import { buildBehaviorPlan } from "./behavior-plan";
import { buildVisualPlan } from "./visual-plan";
import type { StrategyConfig } from "./types";

const styleLabels: Record<StrategyConfig["style"], string> = {
  scalp: "very short-term scalping",
  intraday: "intraday trading",
  swing: "swing trading",
  spot: "spot trading",
  long_term: "long-term trend following"
};

export function explainConfig(c: StrategyConfig): string[] {
  const plan = buildBehaviorPlan(c);
  const visual = buildVisualPlan(c);
  const lines: string[] = [];
  const direction = plan.mode === "long_short" ? "long and short" : plan.mode === "long_only" ? "long-only" : "spot buy and exit";

  lines.push(`This script is designed for ${styleLabels[c.style]} and produces ${direction} signals when used on a ${plan.chartTimeframe} chart.`);
  lines.push(c.execution.enforceChartTimeframe
    ? `Signals are blocked when the TradingView chart is not set to ${plan.chartTimeframe}; the dashboard reports OK or WRONG.`
    : `The dashboard reports whether the chart matches ${plan.chartTimeframe}, but mismatched charts are not blocked.`);
  lines.push(`A new entry is triggered when ${plan.entry.trigger.label}; every selected filter must also agree.`);

  const filterLabels = plan.entry.filters
    .filter((filter) => filter.id !== "confirmation")
    .map((filter) => filter.label);
  if (filterLabels.length) lines.push(`Entries are filtered by ${filterLabels.join(", ")}.`);

  if (plan.higherTimeframe) {
    const candle = plan.higherTimeframe.closedBarOnly ? "the last closed higher-timeframe candle" : "the developing higher-timeframe candle";
    const blocking = plan.higherTimeframe.blocksCounterTrend
      ? plan.mode === "long_short"
        ? "Bearish bias blocks long signals and bullish bias blocks short signals."
        : "Bearish bias blocks long or buy signals."
      : "The bias is shown for context and does not block entries.";
    lines.push(`The ${plan.higherTimeframe.timeframe} bias uses ${plan.higherTimeframe.method.toUpperCase()} ${plan.higherTimeframe.length} and reads ${candle}. ${blocking}`);
  }

  if (plan.spotExit) lines.push(`A spot exit is generated when ${plan.spotExit.label}. The script never creates short entries.`);
  if (plan.execution.confirmedBarsOnly) lines.push("Long, short, buy and exit signals only finalize after the chart candle closes.");
  if (plan.execution.cooldownBars > 0) lines.push(`After a signal, a ${plan.execution.cooldownBars}-bar cooldown prevents duplicate entries in the same move.`);
  if (plan.execution.session) lines.push(`Signals are restricted to the ${plan.execution.session} exchange-time session.`);

  if (plan.risk.enabled) {
    const parts = [plan.risk.stopLabel, plan.risk.targetLabel].filter((value): value is string => Boolean(value));
    if (plan.risk.visualOnly) {
      lines.push(`Indicator mode plots ${parts.join(" and ")} as visual guidance; it does not submit Strategy Tester orders.`);
      lines.push("Visual risk tracking starts on a signal, clears the active lines after a later bar reaches the stop or target, and marks bars that touch both levels as ambiguous because intrabar order is unknown.");
    } else {
      lines.push(`Strategy Tester orders use ${parts.join(" and ")}.`);
    }
  } else if (plan.output === "indicator") {
    lines.push("Indicator mode plots signals and alerts but does not place Strategy Tester orders.");
  }

  const profile = visual.profile === "clean" ? "Clean" : visual.profile === "enhanced" ? "Enhanced" : "Advanced";
  lines.push(`${profile} is the default visual profile for this script. Visual settings are separate from signal rules, so changing bar colors or the trend ribbon does not change entries.`);

  if (plan.entry.trigger.plotsBreakoutLevels) lines.push("The previous breakout high and low are plotted on the chart so each signal can be visually verified.");
  if (plan.execution.alertsEnabled) lines.push("TradingView alert conditions are included for every generated signal.");
  return lines;
}
