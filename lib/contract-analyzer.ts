import { buildBehaviorPlan } from "./behavior-plan";
import type { StrategyConfig } from "./types";

export type ContractIssue = {
  level: "error" | "warning";
  code: string;
  message: string;
};

const claimsShortEntries = (text: string): boolean => {
  const forbiddenClaims = [
    /produces? short (signals?|entries?)/,
    /creates? short (signals?|entries?)/,
    /generates? short (signals?|entries?)/,
    /opens? short (positions?|entries?)/,
    /short entries? (are|is) (generated|created|opened)/
  ];
  return forbiddenClaims.some((pattern) => pattern.test(text));
};

const mentionsBreakoutVerificationLevels = (text: string): boolean => {
  const hasHigh = /(?:previous )?breakout high|previous high/.test(text);
  const hasLow = /(?:previous )?breakout low|previous low|breakout high and low/.test(text);
  const hasVisualContext = /plot|plotted|visible|visual|chart/.test(text);
  return hasHigh && hasLow && hasVisualContext;
};

export function analyzeBehaviorContract(config: StrategyConfig, code: string, explanation: string[]): ContractIssue[] {
  const plan = buildBehaviorPlan(config);
  const text = explanation.join(" ").toLowerCase();
  const issues: ContractIssue[] = [];
  const error = (codeValue: string, message: string) => issues.push({ level: "error", code: codeValue, message });

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
