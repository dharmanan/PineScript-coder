import { describe, expect, it } from "vitest";
import { compilePine } from "../lib/compiler";
import { presets } from "../lib/presets";

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

describe("RSI Divergence Reversal consistency", () => {
  it("reuses the main RSI calculation for divergence", () => {
    const preset = presets.find((item) => item.name === "RSI Divergence Reversal");
    expect(preset).toBeDefined();

    const config = clone(preset!);
    config.outputMode = "indicator";
    const code = compilePine(config);

    expect(code).toContain("divRsi = rsiValue");
    expect(code).not.toContain('divRsiLength = input.int(14, "Divergence RSI period"');
    expect(code).not.toContain("divRsi = ta.rsi(close, divRsiLength)");
  });

  it("does not overwrite an active same-direction visual trade", () => {
    const preset = presets.find((item) => item.name === "RSI Divergence Reversal");
    expect(preset).toBeDefined();

    const config = clone(preset!);
    config.outputMode = "indicator";
    const code = compilePine(config);

    expect(code).toContain("acceptedLongSignal = longSignal and riskDirection != 1");
    expect(code).toContain("acceptedShortSignal = shortSignal and riskDirection != -1");
    expect(code).toContain("if acceptedLongSignal and riskDirection == 0\n    riskEntry := close");
    expect(code).toContain("if acceptedShortSignal and riskDirection == 0\n    riskEntry := close");
    expect(code).toContain("oppositeSignalReversal =");
  });

  it("leaves other presets and strategy mode unchanged", () => {
    const balanced = presets.find((item) => item.name === "Balanced Intraday");
    const reversal = presets.find((item) => item.name === "RSI Divergence Reversal");
    expect(balanced).toBeDefined();
    expect(reversal).toBeDefined();

    const balancedCode = compilePine(clone(balanced!));
    expect(balancedCode).toContain("divRsi = ta.rsi(close, divRsiLength)");

    const strategyConfig = clone(reversal!);
    strategyConfig.outputMode = "strategy";
    const strategyCode = compilePine(strategyConfig);
    expect(strategyCode).not.toContain("divRsi = rsiValue");
    expect(strategyCode).toContain("strategy.entry");
  });
});
