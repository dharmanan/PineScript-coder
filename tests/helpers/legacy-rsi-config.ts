import { defaultConfig } from "../../lib/defaults";
import type { StrategyConfig } from "../../lib/types";

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

export function legacyRsiConfig(outputMode: StrategyConfig["outputMode"]): StrategyConfig {
  const config = clone(defaultConfig);
  config.name = "RSI Divergence Reversal";
  config.presetId = "rsi_divergence_reversal";
  config.outputMode = outputMode;
  config.entryTrigger = "trend_state";
  config.trend.emaEnabled = false;
  config.trend.vwapEnabled = false;
  config.trend.longMaEnabled = false;
  config.higherTimeframe.enabled = false;
  config.momentum.rsiEnabled = true;
  config.momentum.divergenceEnabled = true;
  config.momentum.divergencePivot = 5;
  config.momentum.rsiLong = 40;
  config.momentum.rsiShort = 60;
  config.volume.enabled = false;
  config.risk.stopMode = "atr";
  config.risk.atrLength = 14;
  config.risk.atrMultiple = 2;
  config.risk.takeProfitMode = "risk_reward";
  config.risk.riskReward = 2;
  delete config.researchProfile;
  return config;
}
