import type { StrategyConfig } from "./types";

export type ValidationIssue = {
  level: "error" | "warning";
  code: string;
  message: string;
};

const timeframeMinutes = (value: string): number | null => {
  if (/^\d+$/.test(value)) return Number(value);
  if (value === "D") return 1440;
  if (value === "W") return 10080;
  if (value === "M") return 43200;
  return null;
};

export function validateConfig(c: StrategyConfig): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const error = (code: string, message: string) => issues.push({ level: "error", code, message });
  const warn = (code: string, message: string) => issues.push({ level: "warning", code, message });

  if (!c.name.trim()) error("name.empty", "Script name cannot be empty.");
  if (c.trend.emaFast >= c.trend.emaSlow && c.trend.emaEnabled) warn("ema.order", "Fast EMA is not below slow EMA; this may invert or weaken the intended trend filter.");
  if (c.momentum.rsiLong <= c.momentum.rsiShort && c.direction === "long_short" && c.momentum.rsiEnabled) warn("rsi.overlap", "Long RSI threshold should normally be above the short RSI threshold.");
  if (c.direction === "spot_buy_exit" && c.style !== "spot") warn("spot.style", "Spot buy/exit mode is selected while trading style is not Spot.");
  if (c.entryTrigger === "vwap_reclaim" && !c.trend.vwapEnabled) warn("vwap.implicit", "VWAP reclaim requires VWAP; the compiler will add it implicitly.");
  if (c.entryTrigger === "supertrend_flip" && !c.trend.supertrendEnabled) warn("supertrend.implicit", "Supertrend flip requires Supertrend; the compiler will add it implicitly.");
  if (c.momentum.divergenceEnabled && !c.momentum.rsiEnabled) warn("divergence.implicit_rsi", "RSI divergence requires RSI; the compiler will calculate RSI implicitly.");

  if (c.risk.takeProfitMode === "risk_reward" && c.risk.stopMode === "none") {
    error("risk_reward.no_stop", "Risk/reward targets require a stop-loss definition.");
  }
  if (c.direction === "spot_buy_exit" && c.risk.takeProfitMode === "opposite_signal") {
    error("spot.opposite_signal_redundant", "Spot mode already has an explicit exit rule. Choose a numeric target or None instead of opposite signal.");
  }
  if (c.outputMode === "indicator" && c.direction !== "spot_buy_exit" && c.risk.takeProfitMode === "opposite_signal") {
    error("indicator.opposite_signal_unsupported", "Indicator mode does not yet track position state for opposite-signal exits. Use Strategy Tester or choose another target mode.");
  }
  if (c.outputMode === "indicator" && (c.risk.stopMode !== "none" || c.risk.takeProfitMode === "risk_reward" || c.risk.takeProfitMode === "percent")) {
    warn("indicator.risk_visual_only", "Indicator mode renders selected stop and target settings as visual levels; it does not place orders.");
  }

  if (c.execution.sessionEnabled && !/^\d{4}-\d{4}$/.test(c.execution.session)) error("session.format", "Session must use HHMM-HHMM format.");

  if (c.higherTimeframe.enabled) {
    const chart = timeframeMinutes(c.chartTimeframe);
    const higher = timeframeMinutes(c.higherTimeframe.timeframe);
    if (chart !== null && higher !== null && higher <= chart) error("htf.not_higher", "Higher timeframe must be greater than the chart timeframe.");
  }

  return issues;
}

export function assertValidConfig(c: StrategyConfig): void {
  const errors = validateConfig(c).filter((issue) => issue.level === "error");
  if (errors.length) throw new Error(errors.map((issue) => `${issue.code}: ${issue.message}`).join("\n"));
}
