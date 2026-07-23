import type { StrategyConfig } from "./types";

export function toPublicIndicatorConfig(config: StrategyConfig): StrategyConfig {
  return {
    ...config,
    outputMode: "indicator"
  };
}
