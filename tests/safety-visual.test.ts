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

  it("keeps the last risk prices and dates available in the dashboard", () => {
    const config = clone(defaultConfig);
    config.outputMode = "indicator";
    config.risk.stopMode = "atr";
    config.risk.takeProfitMode = "risk_reward";
    config.execution.showDashboard = true;
    const code = compilePine(config);

    expect(code).toContain("var float lastOutcomeEntry = na");
    expect(code).toContain("var float lastOutcomePrice = na");
    expect(code).toContain("var int lastOutcomeEntryTime = na");
    expect(code).toContain("var int lastOutcomeTime = na");
    expect(code).toContain('"Last entry"');
    expect(code).toContain('"Result price"');
    expect(code).toContain('"Entry date"');
    expect(code).toContain('"Result date"');
    expect(code).toContain('str.format_time(lastOutcomeEntryTime, "yyyy-MM-dd HH:mm")');
    expect(code).toContain('str.format_time(lastOutcomeTime, "yyyy-MM-dd HH:mm")');
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
    expect(cleanCode).toContain('visualProfile = "Clean" // Selected in PineForge Studio');
    expect(advancedCode).toContain('visualProfile = "Advanced" // Selected in PineForge Studio');
    expect(cleanCode).not.toContain("visualProfile = input.string(");
    expect(advancedCode).not.toContain("visualProfile = input.string(");
    expect(cleanCode).not.toBe(advancedCode);
  });

  it("uses a higher-contrast Advanced palette while Clean remains disabled", () => {
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

    expect(advancedCode).toContain("color.new(color.rgb(0, 165, 90), 15)");
    expect(advancedCode).toContain("color.new(color.rgb(220, 50, 60), 15)");
    expect(advancedCode).toContain("color.new(color.lime, 95)");
    expect(advancedCode).toContain("color.new(color.red, 95)");
    expect(cleanCode).toContain("colorSignalBars = input.bool(false");
    expect(cleanCode).toContain("showTrendRibbon = input.bool(false");
  });
});
