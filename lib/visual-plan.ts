import type { StrategyConfig, VisualProfile } from "./types";

export type VisualPlan = {
  profile: VisualProfile;
  labelSize: "tiny" | "small" | "normal";
  colorBars: boolean;
  showTrendRibbon: boolean;
  showSignalScore: boolean;
  showRiskOutcomeLabels: boolean;
};

export function buildVisualPlan(config: StrategyConfig): VisualPlan {
  const profile = config.visual.profile;
  return {
    profile,
    labelSize: profile === "clean" ? "tiny" : profile === "enhanced" ? "small" : "normal",
    colorBars: config.visual.colorBars || profile === "advanced",
    showTrendRibbon: config.visual.showTrendRibbon || profile !== "clean",
    showSignalScore: config.visual.showSignalScore,
    showRiskOutcomeLabels: config.visual.showRiskOutcomeLabels
  };
}
