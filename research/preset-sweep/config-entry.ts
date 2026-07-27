// Single bundle entry so the sweep reads generic presets, defaults and the behavior plan
// from lib/ itself. A researchProfile owns a custom compiler and cannot be simulated by the
// generic behavior plan without silently measuring a different strategy. Those profiles
// require their own reference engine before entering a sweep.
import { presets as productPresets } from "../../lib/presets";

export const presets = productPresets.filter((preset) => preset.researchProfile === undefined);
export { defaultConfig } from "../../lib/defaults";
export { buildBehaviorPlan } from "../../lib/behavior-plan";
export type { StrategyConfig } from "../../lib/types";
export type { BehaviorPlan, PlanFilter, PlanTrigger } from "../../lib/behavior-plan";
