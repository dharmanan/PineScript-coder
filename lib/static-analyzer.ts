import { buildBehaviorPlan } from "./behavior-plan";
import type { StrategyConfig } from "./types";

export type StaticIssue = {
  level: "error" | "warning";
  code: string;
  message: string;
};

const contains = (code: string, value: string) => code.includes(value);

export function analyzeGeneratedPine(config: StrategyConfig, code: string): StaticIssue[] {
  const plan = buildBehaviorPlan(config);
  const issues: StaticIssue[] = [];
  const error = (codeValue: string, message: string) => issues.push({ level: "error", code: codeValue, message });
  const warn = (codeValue: string, message: string) => issues.push({ level: "warning", code: codeValue, message });

  if (!code.startsWith("//@version=6")) error("pine.version", "Generated code must start with Pine Script version 6.");
  if (plan.output === "strategy" && !contains(code, "strategy(")) error("output.strategy_missing", "Strategy mode did not generate a strategy declaration.");
  if (plan.output === "indicator" && !contains(code, "indicator(")) error("output.indicator_missing", "Indicator mode did not generate an indicator declaration.");

  if (plan.mode === "spot_buy_exit") {
    if (!contains(code, "buySignal")) error("spot.buy_missing", "Spot mode must generate a buy signal.");
    if (!contains(code, "exitSignal")) error("spot.exit_missing", "Spot mode must generate an exit signal.");
    if (contains(code, "shortSignal") || contains(code, "strategy.short") || contains(code, 'text="SHORT"')) error("spot.short_leak", "Spot mode must not generate short logic.");
  }

  if (plan.mode === "long_only" && (contains(code, "shortSignal") || contains(code, "strategy.short"))) {
    error("long_only.short_leak", "Long-only mode must not generate short logic.");
  }

  if (plan.mode === "long_short") {
    if (!contains(code, "longSignal")) error("long_short.long_missing", "Long/short mode must generate a long signal.");
    if (!contains(code, "shortSignal")) error("long_short.short_missing", "Long/short mode must generate a short signal.");
  }

  if (!contains(code, plan.entry.trigger.longExpression)) error("trigger.long_missing", `Long trigger ${plan.entry.trigger.id} is missing.`);
  if (plan.entry.hasShort && plan.entry.trigger.shortExpression && !contains(code, plan.entry.trigger.shortExpression)) {
    error("trigger.short_missing", `Short trigger ${plan.entry.trigger.id} is missing.`);
  }

  for (const filter of plan.entry.filters) {
    if (!contains(code, filter.longExpression)) error(`filter.${filter.id}.long_missing`, `Long filter ${filter.id} is missing.`);
    if (plan.entry.hasShort && filter.shortExpression && !contains(code, filter.shortExpression)) {
      error(`filter.${filter.id}.short_missing`, `Short filter ${filter.id} is missing.`);
    }
  }

  if (plan.entry.trigger.plotsBreakoutLevels) {
    if (!contains(code, 'plot(previousHigh, "Breakout High"')) error("breakout.high_plot_missing", "Breakout mode must plot the previous high.");
    if (!contains(code, 'plot(previousLow, "Breakout Low"')) error("breakout.low_plot_missing", "Breakout mode must plot the previous low.");
  }

  if (config.confirmedBarsOnly && !contains(code, "confirmationOk")) error("confirmation.missing", "Confirmed-candle mode must generate confirmation logic.");

  if (plan.higherTimeframe) {
    if (!contains(code, "request.security")) error("htf.request_missing", "Higher-timeframe mode requires request.security().");
    if (plan.higherTimeframe.closedBarOnly) {
      if (!contains(code, "lookahead=barmerge.lookahead_on")) error("htf.closed_lookahead", "Closed HTF mode must use lookahead_on with an offset expression.");
      if (!contains(code, "[1]")) error("htf.closed_offset", "Closed HTF mode must use the previous HTF value.");
      if (!contains(code, "previous confirmed higher-timeframe candle")) error("htf.closed_comment", "Closed HTF code comment must describe the actual safety method.");
    } else {
      if (!contains(code, "lookahead=barmerge.lookahead_off")) error("htf.live_lookahead", "Live HTF mode must use lookahead_off.");
      if (!contains(code, "developing higher-timeframe candle")) error("htf.live_comment", "Live HTF code comment must describe repaint risk.");
    }
  }

  if (plan.execution.alertsEnabled && !contains(code, "alertcondition(")) error("alerts.missing", "Alerts are enabled but no alertcondition() was generated.");
  if (!plan.execution.alertsEnabled && contains(code, "alertcondition(")) warn("alerts.unexpected", "Alert conditions were generated although alerts are disabled.");

  if (plan.output === "strategy") {
    if (!contains(code, "strategy.entry")) error("strategy.entry_missing", "Strategy mode must generate strategy.entry().");
    if (plan.risk.enabled && !contains(code, "strategy.exit") && config.risk.takeProfitMode !== "opposite_signal") {
      error("strategy.risk_exit_missing", "Selected strategy risk rules require strategy.exit().");
    }
  }

  if (plan.output === "indicator" && plan.risk.enabled) {
    if (!contains(code, 'plot(riskStop, "Risk Stop"')) error("indicator.risk_stop_missing", "Indicator risk settings require a visible stop plot.");
    if ((config.risk.takeProfitMode === "risk_reward" || config.risk.takeProfitMode === "percent") && !contains(code, 'plot(riskTarget, "Risk Target"')) {
      error("indicator.risk_target_missing", "Indicator target settings require a visible target plot.");
    }
  }

  const declaredInputs = [...code.matchAll(/^(\w+)\s*=\s*input\./gm)].map((match) => match[1]);
  for (const variable of declaredInputs) {
    const references = code.match(new RegExp(`\\b${variable}\\b`, "g"))?.length ?? 0;
    if (references < 2) warn("input.unused", `Input ${variable} appears to be unused.`);
  }

  return issues;
}
