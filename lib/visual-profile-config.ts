import type { StrategyConfig, VisualProfile } from "./types";

const settings: Record<VisualProfile, StrategyConfig["visual"]> = {
  clean: {
    profile: "clean",
    colorBars: false,
    showSignalScore: false,
    showRiskOutcomeLabels: true,
    showTrendRibbon: false
  },
  enhanced: {
    profile: "enhanced",
    colorBars: true,
    showSignalScore: false,
    showRiskOutcomeLabels: true,
    showTrendRibbon: true
  },
  advanced: {
    profile: "advanced",
    colorBars: true,
    showSignalScore: true,
    showRiskOutcomeLabels: true,
    showTrendRibbon: true
  }
};

export function visualSettingsFor(profile: VisualProfile): StrategyConfig["visual"] {
  return { ...settings[profile] };
}

export function applyVisualProfile(config: StrategyConfig, profile: VisualProfile): StrategyConfig {
  return {
    ...config,
    visual: visualSettingsFor(profile)
  };
}
