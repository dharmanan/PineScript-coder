import { compilePine as compileBase } from "./compiler-v9";
import type { StrategyConfig } from "./types";

const profileLabel = (profile: StrategyConfig["visual"]["profile"]) =>
  profile === "clean" ? "Clean" : profile === "enhanced" ? "Enhanced" : "Advanced";

export function compilePine(config: StrategyConfig): string {
  const code = compileBase(config);
  const label = profileLabel(config.visual.profile);
  const runtimeInput = `visualProfile = input.string("${label}", "Visual profile", options=["Clean", "Enhanced", "Advanced"])`;
  const bakedProfile = `visualProfile = "${label}" // Selected in PineForge Studio`;

  if (!code.includes(runtimeInput)) throw new Error("Compiler transform anchor missing: visual profile input");
  return code.replace(runtimeInput, bakedProfile);
}
