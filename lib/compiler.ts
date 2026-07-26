import { compilePine as compileBase } from "./compiler-v29";
import { toPublicIndicatorConfig } from "./public-indicator-config";
import type { StrategyConfig } from "./types";

export function compilePine(config: StrategyConfig): string {
  const effectiveConfig = typeof window === "undefined"
    ? config
    : toPublicIndicatorConfig(config);

  return compileBase(effectiveConfig);
}
