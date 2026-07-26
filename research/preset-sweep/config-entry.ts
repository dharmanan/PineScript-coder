// Single bundle entry so the sweep reads presets, defaults and the behavior plan
// from lib/ itself. The sweep must never re-declare what a preset is; if a preset
// changes, the sweep follows automatically.
export { presets } from "../../lib/presets";
export { defaultConfig } from "../../lib/defaults";
export { buildBehaviorPlan } from "../../lib/behavior-plan";
export type { StrategyConfig } from "../../lib/types";
export type { BehaviorPlan, PlanFilter, PlanTrigger } from "../../lib/behavior-plan";
