import type { StrategyConfig } from "./types";

export type StaticIssue = {
  level: "error" | "warning";
  code: string;
  message: string;
};

const contains = (code: string, value: string) => code.includes(value);

export function analyzeGeneratedPine(config: StrategyConfig, code: string): StaticIssue[] {
  const issues: StaticIssue[] = [];
  const error = (codeValue: string, message: string) => issues.push({ level: "error", code: codeValue, message });
  const warn = (codeValue: string, message: string) => issues.push({ level: "warning", code: codeValue, message });

  if (!code.startsWith("//@version=6")) error("pine.version", "Generated code must start with Pine Script version 6.");
  if (config.outputMode === "strategy" && !contains(code, "strategy(")) error("output.strategy_missing", "Strategy mode did not generate a strategy declaration.");
  if (config.outputMode === "indicator" && !contains(code, "indicator(")) error("output.indicator_missing", "Indicator mode did not generate an indicator declaration.");

  if (config.direction === "spot_buy_exit") {
    if (!contains(code, "buySignal")) error("spot.buy_missing", "Spot mode must generate a buy signal.");
    if (!contains(code, "exitSignal")) error("spot.exit_missing", "Spot mode must generate an exit signal.");
    if (contains(code, "shortSignal") || contains(code, "strategy.short") || contains(code, 'text="SHORT"')) error("spot.short_leak", "Spot mode must not generate short logic.");
  }

  if (config.direction === "long_only" && (contains(code, "shortSignal") || contains(code, "strategy.short"))) {
    error("long_only.short_leak", "Long-only mode must not generate short logic.");
  }

  if (config.direction === "long_short") {
    if (!contains(code, "longSignal")) error("long_short.long_missing", "Long/short mode must generate a long signal.");
    if (!contains(code, "shortSignal")) error("long_short.short_missing", "Long/short mode must generate a short signal.");
  }

  if (config.entryTrigger === "vwap_reclaim") {
    if (!contains(code, "vwapValue")) error("vwap.value_missing", "VWAP reclaim requires VWAP calculation.");
    if (!contains(code, "ta.crossover(close, vwapValue)")) error("vwap.long_trigger_missing", "VWAP reclaim requires a long crossover trigger.");
    if (config.direction === "long_short" && !contains(code, "ta.crossunder(close, vwapValue)")) error("vwap.short_trigger_missing", "Long/short VWAP reclaim requires a short crossunder trigger.");
  }

  if (config.entryTrigger === "ema_cross" && !contains(code, "ta.crossover(emaFast, emaSlow)")) error("ema.trigger_missing", "EMA crossover trigger is missing.");
  if (config.entryTrigger === "breakout" && !contains(code, "previousHigh")) error("breakout.level_missing", "Breakout trigger requires previous high/low calculations.");

  if (config.confirmedBarsOnly && !contains(code, "confirmationOk")) error("confirmation.missing", "Confirmed-candle mode must generate confirmation logic.");

  if (config.higherTimeframe.enabled) {
    if (!contains(code, "request.security")) error("htf.request_missing", "Higher-timeframe mode requires request.security().");
    if (config.higherTimeframe.closedBarOnly) {
      if (!contains(code, "lookahead=barmerge.lookahead_on")) error("htf.closed_lookahead", "Closed HTF mode must use lookahead_on with an offset expression.");
      if (!contains(code, "[1]")) error("htf.closed_offset", "Closed HTF mode must use the previous HTF value.");
    } else if (!contains(code, "lookahead=barmerge.lookahead_off")) {
      error("htf.live_lookahead", "Live HTF mode must use lookahead_off.");
    }
  }

  if (config.execution.alertsEnabled && !contains(code, "alertcondition(")) error("alerts.missing", "Alerts are enabled but no alertcondition() was generated.");
  if (!config.execution.alertsEnabled && contains(code, "alertcondition(")) warn("alerts.unexpected", "Alert conditions were generated although alerts are disabled.");

  if (config.outputMode === "strategy") {
    if (!contains(code, "strategy.entry")) error("strategy.entry_missing", "Strategy mode must generate strategy.entry().");
    if ((config.risk.stopMode !== "none" || config.risk.takeProfitMode === "risk_reward" || config.risk.takeProfitMode === "percent") && !contains(code, "strategy.exit")) {
      error("strategy.risk_exit_missing", "Selected strategy risk rules require strategy.exit().");
    }
  }

  if (config.outputMode === "indicator" && (config.risk.stopMode !== "none" || config.risk.takeProfitMode !== "none")) {
    const visualRisk = contains(code, "Risk Stop") || contains(code, "Risk Target") || contains(code, "stopLine") || contains(code, "targetLine");
    if (!visualRisk) warn("indicator.risk_not_rendered", "Indicator risk settings are selected but no visual stop/target output is present.");
  }

  const declaredInputs = [...code.matchAll(/^(\w+)\s*=\s*input\./gm)].map((match) => match[1]);
  for (const variable of declaredInputs) {
    const references = code.match(new RegExp(`\\b${variable}\\b`, "g"))?.length ?? 0;
    if (references < 2) warn("input.unused", `Input ${variable} appears to be unused.`);
  }

  return issues;
}
