import { describe, expect, it } from "vitest";
import { compilePine } from "../lib/compiler";
import { defaultConfig } from "../lib/defaults";
import { presets } from "../lib/presets";
import type { StrategyConfig } from "../lib/types";

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

describe("chart timeframe guard", () => {
  it("declares, reports and enforces the expected chart timeframe", () => {
    const config = clone(defaultConfig);
    config.chartTimeframe = "240";
    config.execution.enforceChartTimeframe = true;
    const code = compilePine(config);

    expect(code).toContain('expectedChartTimeframe = input.timeframe("240"');
    expect(code).toContain("chartTimeframeOk = timeframe.period == expectedChartTimeframe");
    expect(code).toContain("chartTimeframeAllowed and longSetup");
    expect(code).toContain('"Chart TF"');
    expect(code).toContain('"WRONG: " + expectedChartTimeframe');
  });
});

describe("session timezone safety", () => {
  it("generates the VWAP session preset in New York time", () => {
    const preset = presets.find((item) => item.name === "VWAP Session Trader");
    expect(preset).toBeDefined();
    expect(preset?.execution.sessionTimezone).toBe("America/New_York");

    const code = compilePine(clone(preset!));
    expect(code).toContain('sessionTimezoneMode = input.string("America/New_York"');
    expect(code).toContain('options=["exchange", "America/New_York", "Europe/London", "Europe/Istanbul", "UTC"]');
    expect(code).toContain('sessionTimezone = sessionTimezoneMode == "exchange" ? syminfo.timezone : sessionTimezoneMode');
    expect(code).toContain("time(timeframe.period, tradeSession, sessionTimezone)");
  });
});

describe("indicator risk lifecycle", () => {
  it("closes visual risk levels after stop or target and preserves an outcome", () => {
    const config = clone(defaultConfig);
    config.outputMode = "indicator";
    config.risk.stopMode = "atr";
    config.risk.takeProfitMode = "risk_reward";
    const code = compilePine(config);

    expect(code).toContain("riskStartedBar");
    expect(code).toContain("riskCanResolve");
    expect(code).toContain("riskStopHit");
    expect(code).toContain("riskTargetHit");
    expect(code).toContain('lastRiskOutcome := riskAmbiguous ? "AMBIGUOUS"');
    expect(code).toContain("riskStop := na");
    expect(code).toContain("riskTarget := na");
  });

  it("does not add visual lifecycle state to Strategy Tester mode", () => {
    const config = clone(defaultConfig);
    config.outputMode = "strategy";
    const code = compilePine(config);
    expect(code).not.toContain("riskCanResolve");
    expect(code).toContain("strategy.exit");
  });
});

describe("visual plan isolation", () => {
  it("changes visuals without changing the configured entry trigger", () => {
    const clean = clone(defaultConfig);
    clean.visual.profile = "clean";
    clean.visual.colorBars = false;
    clean.visual.showTrendRibbon = false;

    const advanced: StrategyConfig = clone(clean);
    advanced.visual.profile = "advanced";
    advanced.visual.colorBars = true;
    advanced.visual.showTrendRibbon = true;

    const cleanCode = compilePine(clean);
    const advancedCode = compilePine(advanced);

    expect(cleanCode).toContain("longTrigger = ta.crossover(close, emaFast)");
    expect(advancedCode).toContain("longTrigger = ta.crossover(close, emaFast)");
    expect(cleanCode).toContain('visualProfile = input.string("Clean"');
    expect(advancedCode).toContain('visualProfile = input.string("Advanced"');
    expect(cleanCode).not.toBe(advancedCode);
  });
});
