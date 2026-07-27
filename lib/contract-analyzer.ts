import { buildBehaviorPlan } from "./behavior-plan";
import type { StrategyConfig } from "./types";

export type ContractIssue = {
  level: "error" | "warning";
  code: string;
  message: string;
};

const VALIDATED_BNB_PROFILE = "bnb_30m_ema_confirmed_regular_divergence_v1";
const KOHEN_DIVE_ADAPTIVE_PROFILE = "kohen_dive_adaptive_v1";

const claimsShortEntries = (text: string): boolean => {
  const sentences = text.split(/[.!?]+/).map((sentence) => sentence.trim()).filter(Boolean);
  const positiveClaim = /\b(?:produce|produces|create|creates|generate|generates|open|opens)\s+short\s+(?:signals?|entries?|positions?)\b|\bshort\s+entries?\s+(?:are|is)\s+(?:generated|created|opened)\b/;
  const negation = /\b(?:never|not|no|does not|doesn't|will not|won't|cannot|can't)\b/;
  return sentences.some((sentence) => positiveClaim.test(sentence) && !negation.test(sentence));
};

const mentionsBreakoutVerificationLevels = (text: string): boolean => {
  const mentionsHighAndLow =
    /\bbreakout high and low\b/.test(text) ||
    (/\b(?:previous )?breakout high\b/.test(text) && /\b(?:previous )?breakout low\b/.test(text)) ||
    (/\bprevious high\b/.test(text) && /\bprevious low\b/.test(text));
  const hasVisualContext = /\b(?:plot|plots|plotted|visible|visual|chart|display|displayed)\b/.test(text);
  return mentionsHighAndLow && hasVisualContext;
};

export function analyzeBehaviorContract(config: StrategyConfig, code: string, explanation: string[]): ContractIssue[] {
  const text = explanation.join(" ").toLowerCase();
  const issues: ContractIssue[] = [];
  const error = (codeValue: string, message: string) => issues.push({ level: "error", code: codeValue, message });

  if (config.researchProfile === KOHEN_DIVE_ADAPTIVE_PROFILE) {
    const requiredExplanation = [
      ["4-hour pressure indicator", "explanation.kohen_scope_missing"],
      ["active 4h signal profile", "explanation.kohen_active_profile_missing"],
      ["strong opposite regime", "explanation.kohen_regime_missing"],
      ["state recovery", "explanation.kohen_confirmation_missing"],
      ["trend-aligned pullback continuation signals", "explanation.kohen_continuation_missing"],
      ["automatic opposite-signal reversal is off", "explanation.kohen_reverse_guard_missing"],
      ["long/short and continuation/reversal", "explanation.kohen_split_metrics_missing"],
      ["atr 14 × 1.75", "explanation.kohen_risk_missing"]
    ] as const;
    for (const [needle, issueCode] of requiredExplanation) {
      if (!text.includes(needle)) error(issueCode, `Kohen Dive explanation is missing: ${needle}`);
    }
    if (!code.includes(`expectedChartTimeframe = input.timeframe("${config.chartTimeframe}"`)) {
      error("code.kohen_timeframe_missing", "Kohen Dive must expose its measured chart timeframe.");
    }
    return issues;
  }

  if (config.researchProfile === VALIDATED_BNB_PROFILE) {
    const requiredExplanation = [
      ["bnbusdt", "explanation.profile_market_missing"],
      ["30-minute", "explanation.profile_timeframe_missing"],
      ["regular rsi divergence", "explanation.profile_divergence_missing"],
      ["ema 9 / wma 45", "explanation.profile_confirmation_missing"],
      ["ema 50", "explanation.profile_trend_missing"],
      ["0.8 times", "explanation.profile_volume_missing"],
      ["15-bar swing stop", "explanation.profile_stop_missing"],
      ["1.8:1", "explanation.profile_target_missing"],
      ["alert conditions", "explanation.alerts_missing"]
    ] as const;
    for (const [needle, issueCode] of requiredExplanation) {
      if (!text.includes(needle)) error(issueCode, `Validated profile explanation is missing: ${needle}`);
    }
    if (!code.includes('expectedTicker = "BNBUSDT"') || !code.includes('expectedTimeframe = "30"')) {
      error("code.profile_scope_missing", "Validated profile code must enforce BNBUSDT and 30-minute scope.");
    }
    if (!code.includes("ta.crossover(ema9, wma45)") || !code.includes("ta.crossunder(ema9, wma45)")) {
      error("code.profile_confirmation_missing", "Validated profile code must include EMA9/WMA45 confirmation.");
    }
    if (config.outputMode === "indicator") {
      if (!text.includes("visual guidance")) error("explanation.visual_risk_missing", "Indicator explanation must say that risk levels are visual guidance.");
      if (!code.includes('plot(activeStop, "Frozen swing stop"')) error("code.visual_stop_missing", "Validated indicator requires the frozen stop plot.");
    } else if (!text.includes("strategy tester orders")) {
      error("explanation.strategy_orders_missing", "Validated strategy explanation must describe Strategy Tester orders.");
    }
    return issues;
  }

  const plan = buildBehaviorPlan(config);

  if (!text.includes(plan.entry.trigger.label.toLowerCase())) error("explanation.trigger_missing", "Explanation does not describe the configured entry trigger.");

  for (const filter of plan.entry.filters.filter((item) => item.id !== "confirmation")) {
    const key = filter.label.toLowerCase().split(" ").slice(0, 2).join(" ");
    if (key && !text.includes(key)) error(`explanation.filter.${filter.id}_missing`, `Explanation does not mention filter ${filter.id}.`);
  }

  if (plan.mode !== "spot_buy_exit" && /exit event|spot exit/.test(text)) {
    error("explanation.false_exit_claim", "Non-spot explanation must not claim a dedicated exit event unless one is generated.");
  }

  if (plan.mode === "spot_buy_exit") {
    if (!text.includes("spot exit")) error("explanation.spot_exit_missing", "Spot explanation must describe its exit logic.");
    if (claimsShortEntries(text)) error("explanation.spot_short_claim", "Spot explanation must not claim short entries.");
  }

  if (plan.entry.trigger.plotsBreakoutLevels) {
    if (!mentionsBreakoutVerificationLevels(text)) error("explanation.breakout_plots_missing", "Breakout explanation must mention plotted verification levels.");
    if (!code.includes('plot(previousHigh, "Breakout High"') || !code.includes('plot(previousLow, "Breakout Low"')) {
      error("code.breakout_plots_missing", "Breakout contract requires visible high and low plots.");
    }
  }

  if (plan.risk.enabled) {
    if (plan.risk.stopLabel && !text.includes(plan.risk.stopLabel.toLowerCase())) error("explanation.stop_missing", "Explanation does not describe the configured stop.");
    if (plan.risk.targetLabel && !text.includes(plan.risk.targetLabel.toLowerCase())) error("explanation.target_missing", "Explanation does not describe the configured target.");
    if (plan.risk.visualOnly) {
      if (!text.includes("visual guidance")) error("explanation.visual_risk_missing", "Indicator risk explanation must say that levels are visual only.");
      if (!code.includes('plot(riskStop, "Risk Stop"')) error("code.visual_stop_missing", "Indicator risk contract requires a stop plot.");
    }
  }

  if (plan.higherTimeframe?.closedBarOnly) {
    if (!text.includes("last closed higher-timeframe candle")) error("explanation.closed_htf_missing", "Explanation must describe confirmed higher-timeframe data.");
    if (!code.includes("lookahead=barmerge.lookahead_on") || !code.includes("[1]")) error("code.closed_htf_missing", "Closed HTF contract requires offset plus lookahead_on.");
  }

  if (plan.execution.alertsEnabled && !text.includes("alert conditions")) error("explanation.alerts_missing", "Explanation must mention generated alerts.");

  return issues;
}
