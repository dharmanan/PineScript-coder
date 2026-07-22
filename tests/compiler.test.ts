import { describe, expect, it } from "vitest";
import { compilePine } from "../lib/compiler";
import { defaultConfig } from "../lib/defaults";
import { presets } from "../lib/presets";
import { analyzeGeneratedPine } from "../lib/static-analyzer";
import { validateConfig } from "../lib/validator";
import type { StrategyConfig } from "../lib/types";

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const compileAndAnalyze = (config: StrategyConfig) => {
  const validation = validateConfig(config);
  const code = compilePine(config);
  const staticIssues = analyzeGeneratedPine(config, code);
  return { code, validation, staticIssues };
};

const errors = (issues: { level: string; message: string }[]) => issues.filter((issue) => issue.level === "error");

describe("deterministic compiler modes", () => {
  it("generates long and short logic only in long_short mode", () => {
    const config = clone(defaultConfig);
    config.direction = "long_short";
    const { code, staticIssues } = compileAndAnalyze(config);
    expect(code).toContain("longSignal");
    expect(code).toContain("shortSignal");
    expect(errors(staticIssues)).toEqual([]);
  });

  it("does not leak short logic into long_only mode", () => {
    const config = clone(defaultConfig);
    config.direction = "long_only";
    const { code, staticIssues } = compileAndAnalyze(config);
    expect(code).toContain("longSignal");
    expect(code).not.toContain("shortSignal");
    expect(code).not.toContain("strategy.short");
    expect(errors(staticIssues)).toEqual([]);
  });

  it("generates real buy and exit state for spot mode without short logic", () => {
    const config = clone(defaultConfig);
    config.style = "spot";
    config.direction = "spot_buy_exit";
    config.spotExitMode = "combined";
    const { code, staticIssues } = compileAndAnalyze(config);
    expect(code).toContain("buySignal");
    expect(code).toContain("exitSignal");
    expect(code).toContain("spotActive");
    expect(code).not.toContain("shortSignal");
    expect(errors(staticIssues)).toEqual([]);
  });
});

describe("entry triggers", () => {
  const triggers: StrategyConfig["entryTrigger"][] = [
    "trend_state",
    "ema_cross",
    "pullback_reclaim",
    "vwap_reclaim",
    "supertrend_flip",
    "breakout"
  ];

  for (const trigger of triggers) {
    it(`generates a valid ${trigger} configuration`, () => {
      const config = clone(defaultConfig);
      config.entryTrigger = trigger;
      if (trigger === "vwap_reclaim") config.trend.vwapEnabled = true;
      if (trigger === "supertrend_flip") config.trend.supertrendEnabled = true;
      const { staticIssues } = compileAndAnalyze(config);
      expect(errors(staticIssues)).toEqual([]);
    });
  }
});

describe("higher-timeframe safety", () => {
  it("uses an offset and lookahead_on for the last closed HTF candle", () => {
    const config = clone(defaultConfig);
    config.higherTimeframe.closedBarOnly = true;
    const { code, staticIssues } = compileAndAnalyze(config);
    expect(code).toContain("[1]");
    expect(code).toContain("lookahead=barmerge.lookahead_on");
    expect(errors(staticIssues)).toEqual([]);
  });

  it("uses lookahead_off for a developing HTF candle", () => {
    const config = clone(defaultConfig);
    config.higherTimeframe.closedBarOnly = false;
    const { code, staticIssues } = compileAndAnalyze(config);
    expect(code).toContain("lookahead=barmerge.lookahead_off");
    expect(errors(staticIssues)).toEqual([]);
  });

  it("rejects an HTF that is not higher than the chart timeframe", () => {
    const config = clone(defaultConfig);
    config.chartTimeframe = "240";
    config.higherTimeframe.timeframe = "60";
    expect(validateConfig(config).some((issue) => issue.code === "htf.not_higher" && issue.level === "error")).toBe(true);
  });
});

describe("risk and output behavior", () => {
  it("generates strategy orders and exits for strategy mode", () => {
    const config = clone(defaultConfig);
    config.outputMode = "strategy";
    config.risk.stopMode = "atr";
    config.risk.takeProfitMode = "risk_reward";
    const { code, staticIssues } = compileAndAnalyze(config);
    expect(code).toContain("strategy.entry");
    expect(code).toContain("strategy.exit");
    expect(errors(staticIssues)).toEqual([]);
  });

  it("reports indicator risk settings that are not rendered", () => {
    const config = clone(defaultConfig);
    config.outputMode = "indicator";
    config.risk.stopMode = "atr";
    config.risk.takeProfitMode = "risk_reward";
    const { staticIssues } = compileAndAnalyze(config);
    expect(staticIssues.some((issue) => issue.code === "indicator.risk_not_rendered")).toBe(true);
  });

  it("rejects risk/reward without a stop", () => {
    const config = clone(defaultConfig);
    config.risk.stopMode = "none";
    config.risk.takeProfitMode = "risk_reward";
    expect(validateConfig(config).some((issue) => issue.code === "risk_reward.no_stop" && issue.level === "error")).toBe(true);
  });
});

describe("preset fixtures", () => {
  for (const preset of presets) {
    it(`${preset.name} has no validation or static-analysis errors`, () => {
      const { validation, staticIssues } = compileAndAnalyze(clone(preset));
      expect(errors(validation), JSON.stringify(validation, null, 2)).toEqual([]);
      expect(errors(staticIssues), JSON.stringify(staticIssues, null, 2)).toEqual([]);
    });
  }
});

describe("critical combination matrix", () => {
  const directions: StrategyConfig["direction"][] = ["long_short", "long_only", "spot_buy_exit"];
  const outputs: StrategyConfig["outputMode"][] = ["indicator", "strategy"];
  const triggers: StrategyConfig["entryTrigger"][] = ["ema_cross", "vwap_reclaim", "breakout"];
  const htfModes = [true, false];

  for (const direction of directions) {
    for (const outputMode of outputs) {
      for (const entryTrigger of triggers) {
        for (const closedBarOnly of htfModes) {
          it(`${direction} / ${outputMode} / ${entryTrigger} / closedHTF=${closedBarOnly}`, () => {
            const config = clone(defaultConfig);
            config.direction = direction;
            config.style = direction === "spot_buy_exit" ? "spot" : "intraday";
            config.outputMode = outputMode;
            config.entryTrigger = entryTrigger;
            config.higherTimeframe.closedBarOnly = closedBarOnly;
            if (entryTrigger === "vwap_reclaim") config.trend.vwapEnabled = true;
            const { validation, staticIssues } = compileAndAnalyze(config);
            expect(errors(validation), JSON.stringify(validation, null, 2)).toEqual([]);
            expect(errors(staticIssues), JSON.stringify(staticIssues, null, 2)).toEqual([]);
          });
        }
      }
    }
  }
});
