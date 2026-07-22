import { describe, expect, it } from "vitest";
import { analyzeBehaviorContract } from "../lib/contract-analyzer";
import { compilePine } from "../lib/compiler";
import { defaultConfig } from "../lib/defaults";
import { explainConfig } from "../lib/explain";
import { presets } from "../lib/presets";
import { analyzeGeneratedPine } from "../lib/static-analyzer";
import { validateConfig } from "../lib/validator";
import type { StrategyConfig } from "../lib/types";

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const errors = (issues: { level: string; message: string }[]) => issues.filter((issue) => issue.level === "error");

const compileAndAnalyze = (config: StrategyConfig) => {
  const validation = validateConfig(config);
  const code = compilePine(config);
  const explanation = explainConfig(config);
  const staticIssues = analyzeGeneratedPine(config, code);
  const contractIssues = analyzeBehaviorContract(config, code, explanation);
  return { code, explanation, validation, staticIssues, contractIssues };
};

const expectClean = (config: StrategyConfig) => {
  const result = compileAndAnalyze(config);
  expect(errors(result.validation), JSON.stringify(result.validation, null, 2)).toEqual([]);
  expect(errors(result.staticIssues), JSON.stringify(result.staticIssues, null, 2)).toEqual([]);
  expect(errors(result.contractIssues), JSON.stringify(result.contractIssues, null, 2)).toEqual([]);
  return result;
};

describe("deterministic compiler modes", () => {
  it("generates long and short logic only in long_short mode", () => {
    const config = clone(defaultConfig);
    config.direction = "long_short";
    const { code } = expectClean(config);
    expect(code).toContain("longSignal");
    expect(code).toContain("shortSignal");
  });

  it("does not leak short logic into long_only mode", () => {
    const config = clone(defaultConfig);
    config.direction = "long_only";
    const { code } = expectClean(config);
    expect(code).toContain("longSignal");
    expect(code).not.toContain("shortSignal");
    expect(code).not.toContain("strategy.short");
  });

  it("generates real buy and exit state for spot mode without short logic", () => {
    const config = clone(defaultConfig);
    config.style = "spot";
    config.direction = "spot_buy_exit";
    config.spotExitMode = "combined";
    const { code, explanation } = expectClean(config);
    expect(code).toContain("buySignal");
    expect(code).toContain("exitSignal");
    expect(code).toContain("spotActive");
    expect(code).not.toContain("shortSignal");
    expect(explanation.join(" ")).toContain("The script never creates short entries");
  });
});

describe("entry trigger behavior contracts", () => {
  const triggers: StrategyConfig["entryTrigger"][] = [
    "trend_state",
    "ema_cross",
    "pullback_reclaim",
    "vwap_reclaim",
    "supertrend_flip",
    "breakout"
  ];

  for (const trigger of triggers) {
    it(`generates complete ${trigger} behavior`, () => {
      const config = clone(defaultConfig);
      config.entryTrigger = trigger;
      if (trigger === "vwap_reclaim") config.trend.vwapEnabled = true;
      if (trigger === "supertrend_flip") config.trend.supertrendEnabled = true;
      const { code, explanation } = expectClean(config);
      if (trigger === "breakout") {
        expect(code).toContain('plot(previousHigh, "Breakout High"');
        expect(code).toContain('plot(previousLow, "Breakout Low"');
        expect(explanation.join(" ")).toContain("visually verified");
      }
    });
  }
});

describe("higher-timeframe safety", () => {
  it("uses an offset and lookahead_on for the last closed HTF candle", () => {
    const config = clone(defaultConfig);
    config.higherTimeframe.closedBarOnly = true;
    const { code, explanation } = expectClean(config);
    expect(code).toContain("[1]");
    expect(code).toContain("lookahead=barmerge.lookahead_on");
    expect(code).toContain("previous confirmed higher-timeframe candle");
    expect(explanation.join(" ")).toContain("last closed higher-timeframe candle");
  });

  it("uses lookahead_off and warns in the code comment for a developing HTF candle", () => {
    const config = clone(defaultConfig);
    config.higherTimeframe.closedBarOnly = false;
    const { code } = expectClean(config);
    expect(code).toContain("lookahead=barmerge.lookahead_off");
    expect(code).toContain("values may change before it closes");
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
    const { code, explanation } = expectClean(config);
    expect(code).toContain("strategy.entry");
    expect(code).toContain("strategy.exit");
    expect(explanation.join(" ")).toContain("Strategy Tester orders use");
  });

  it("renders indicator stop and target levels instead of silently ignoring risk settings", () => {
    const config = clone(defaultConfig);
    config.outputMode = "indicator";
    config.risk.stopMode = "atr";
    config.risk.takeProfitMode = "risk_reward";
    const { code, explanation } = expectClean(config);
    expect(code).toContain('plot(riskStop, "Risk Stop"');
    expect(code).toContain('plot(riskTarget, "Risk Target"');
    expect(explanation.join(" ")).toContain("visual guidance");
  });

  it("rejects risk/reward without a stop", () => {
    const config = clone(defaultConfig);
    config.risk.stopMode = "none";
    config.risk.takeProfitMode = "risk_reward";
    expect(validateConfig(config).some((issue) => issue.code === "risk_reward.no_stop" && issue.level === "error")).toBe(true);
  });
});

describe("preset behavior fixtures", () => {
  for (const preset of presets) {
    it(`${preset.name} satisfies validation, Pine and explanation contracts`, () => {
      expectClean(clone(preset));
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
            expectClean(config);
          });
        }
      }
    }
  }
});

describe("dead-option protection", () => {
  it("changes generated output when each major feature is toggled", () => {
    const base = clone(defaultConfig);
    const baseCode = compilePine(base);
    const mutations: Array<(config: StrategyConfig) => void> = [
      (c) => { c.trend.vwapEnabled = !c.trend.vwapEnabled; },
      (c) => { c.momentum.macdEnabled = !c.momentum.macdEnabled; },
      (c) => { c.momentum.adxEnabled = !c.momentum.adxEnabled; },
      (c) => { c.volume.enabled = !c.volume.enabled; },
      (c) => { c.execution.alertsEnabled = !c.execution.alertsEnabled; },
      (c) => { c.execution.showDashboard = !c.execution.showDashboard; },
      (c) => { c.execution.showBackground = !c.execution.showBackground; }
    ];

    for (const mutate of mutations) {
      const config = clone(base);
      mutate(config);
      expect(compilePine(config)).not.toBe(baseCode);
    }
  });
});
