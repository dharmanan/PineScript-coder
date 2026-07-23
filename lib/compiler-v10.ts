import { compilePine as compileBase } from "./compiler-v9";
import type { StrategyConfig } from "./types";

const profileLabel = (profile: StrategyConfig["visual"]["profile"]) =>
  profile === "clean" ? "Clean" : profile === "enhanced" ? "Enhanced" : "Advanced";

const replaceRegexRequired = (source: string, pattern: RegExp, replacement: string): string => {
  if (!pattern.test(source)) throw new Error(`Compiler transform anchor missing: ${pattern.source