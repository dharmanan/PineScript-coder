import { buildBehaviorPlan } from "./behavior-plan";
import { buildVisualPlan } from "./visual-plan";
import { explainConfigTr } from "./explain-tr";
import type { StrategyConfig } from "./types";
import type { UiLanguage } from "./ui-i18n";

const styleLabels: Record<StrategyConfig["style"], string> = {
  scalp: "very short-term scalping",
  intraday: "intraday trading",
  swing: "swing trading",
  spot: "spot trading",
  long_term: "long-term trend following"
};

const VALIDATED_BNB_PROFILE = "bnb_30m_ema_confirmed_regular_divergence_v1";
const KOHEN_DIVE_ADAPTIVE_PROFILE = "kohen_dive_adaptive_v1";

export function explainConfig(c: StrategyConfig, language: UiLanguage = "en"): string[] {
  if (language === "tr") return explainConfigTr(c);

  if (c.researchProfile === KOHEN_DIVE_ADAPTIVE_PROFILE) {
    return [
      "Kohen Dive Adaptive is a 4-hour pressure indicator. It opens with the Active 4H signal profile, which is the standard setting for this script.",
      "In plain terms: it tries to join a move only after buying or selling pressure starts to recover. An RSI divergence by itself is not a buy or sell signal.",
      "If price is still fighting a strong opposite regime, the script waits for state recovery before it allows a reversal signal. This is meant to avoid reacting too early to a possible turn.",
      "Active 4H can also show trend-aligned pullback continuation signals: after a pullback, RSI, EMA or pressure needs to improve again. Strict 4H remains available if you prefer the more selective version.",
      "Automatic opposite-signal reversal is off by default. A new signal in the other direction will not automatically close or reverse an open risk guide. Confirmed signals use the next candle open, ATR 14 × 1.75 risk and a 1.75R target.",
      "The dashboard keeps the results readable: long/short and continuation/reversal wins and losses, plus net R, profit factor, maximum drawdown and the number of raw reversals the filter skipped."
    ];
  }

  if (c.researchProfile === VALIDATED_BNB_PROFILE) {
    const lines = [
      "This is a narrow research preset for BINANCE:BNBUSDT on a 30-minute chart. It blocks signals on another market or timeframe.",
      "It first looks for a regular RSI divergence, then waits for EMA 9 / WMA 45 to cross in the same direction. In other words, the divergence gets its attention; the crossover is the final go-ahead.",
      "It only trades with the larger trend: long signals need EMA 50 and price above EMA 200; short signals need the opposite. Volume must be at least 0.8 times its 20-bar average.",
      "Signals are confirmed only after the candle closes. Each one uses a fixed 15-bar swing stop and a 1.8:1 risk/reward target."
    ];
    lines.push(c.outputMode === "indicator"
      ? "The indicator draws those levels as visual guidance; it does not submit Strategy Tester orders."
      : "Strategy Tester orders use the same swing stop and target.");
    lines.push("TradingView alert conditions are included for long and short signals. This is a tested research profile, not a universal recommendation or a promise of profit.");
    return lines;
  }

  const plan = buildBehaviorPlan(c);
  const visual = buildVisualPlan(c);
  const lines: string[] = [];
  const direction = plan.mode === "long_short" ? "long and short" : plan.mode === "long_only" ? "long-only" : "spot buy and exit";

  lines.push(`This script is designed for ${styleLabels[c.style]} and produces ${direction} signals when used on a ${plan.chartTimeframe} chart.`);
  if (c.tradesPerMonth !== undefined) {
    lines.push(c.tradesPerMonth < 4
      ? `Expect roughly ${c.tradesPerMonth} signals per symbol per month. It is deliberately selective, so a quiet week is normal.`
      : `Expect roughly ${c.tradesPerMonth} signals per symbol per month.`);
  }
  lines.push(c.execution.enforceChartTimeframe
    ? `Use the ${plan.chartTimeframe} chart. On another timeframe, it will not send signals.`
    : `It works on any chart timeframe, but ${plan.chartTimeframe} is the intended view.`);
  lines.push(`A signal can appear when ${plan.entry.trigger.label}. The other checks below must agree too.`);

  const structuralBias = c.biasSource === "swing_structure";
  const swingLookback = c.swingLookback;

  const filterLabels = plan.entry.filters
    .filter((filter) => filter.id !== "confirmation" && filter.id !== "structure_bias")
    .map((filter) => filter.label);
  if (filterLabels.length) lines.push(`Before showing a signal, it checks: ${filterLabels.join(", ")}.`);

  const blocking = plan.mode === "long_short"
    ? "Bearish bias blocks long signals and bullish bias blocks short signals."
    : "Bearish bias blocks long or buy signals.";

  if (structuralBias) {
    lines.push(
      `It follows confirmed swing structure rather than a higher-timeframe average. Higher highs with higher lows read bullish; ` +
      `lower highs with lower lows read bearish. A swing is only confirmed once ${swingLookback} later candles have closed. ${blocking}`
    );
  }

  if (plan.higherTimeframe) {
    const candle = plan.higherTimeframe.closedBarOnly ? "the last closed higher-timeframe candle" : "the developing higher-timeframe candle";
    const note = plan.higherTimeframe.blocksCounterTrend
      ? blocking
      : structuralBias
        ? "It is shown for context only; swing structure decides which side is allowed."
        : "The bias is shown for context and does not block entries.";
    lines.push(`For direction, it reads ${candle} on the ${plan.higherTimeframe.timeframe} chart using ${plan.higherTimeframe.method.toUpperCase()} ${plan.higherTimeframe.length}. ${note}`);
  }

  if (plan.spotExit) lines.push(`For spot trading, it gives a spot exit when ${plan.spotExit.label}. The script never creates short entries.`);
  if (plan.execution.confirmedBarsOnly || plan.execution.cooldownBars > 0) {
    const timing = [
      plan.execution.confirmedBarsOnly ? "Signals are confirmed only after the candle closes" : null,
      plan.execution.cooldownBars > 0 ? `then waits ${plan.execution.cooldownBars} bars before repeating the same type of entry` : null
    ].filter((value): value is string => Boolean(value));
    lines.push(`${timing.join(" and ")}.`);
  }
  if (plan.execution.session) {
    lines.push(/^0000-(2359|2400)$/.test(plan.execution.session)
      ? "It is currently allowed to look for signals all day."
      : `It only looks for signals during the ${plan.execution.session} exchange-time session.`);
  }

  if (plan.risk.enabled) {
    const parts = [plan.risk.stopLabel, plan.risk.targetLabel].filter((value): value is string => Boolean(value));
    if (plan.risk.visualOnly) {
      lines.push(`It draws ${parts.join(" and ")} as visual guidance. It does not submit Strategy Tester orders. If one candle touches both levels, the result is marked uncertain.`);
    } else {
      lines.push(`Strategy Tester orders use ${parts.join(" and ")}.`);
    }
  } else if (plan.output === "indicator") {
    lines.push("Indicator mode plots signals and alerts but does not place Strategy Tester orders.");
  }

  const profile = visual.profile === "clean" ? "Clean" : visual.profile === "enhanced" ? "Enhanced" : "Advanced";
  lines.push(`${profile} is the default chart appearance. Changing colors or the trend ribbon does not change signals.`);

  if (plan.entry.trigger.plotsBreakoutLevels) lines.push("The previous breakout high and low are plotted on the chart so each signal can be visually verified.");
  if (plan.execution.alertsEnabled) lines.push("TradingView alert conditions are included for every generated signal.");
  return lines;
}
