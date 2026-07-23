import { describe, expect, it } from "vitest";
import { compilePine } from "../lib/compiler";
import { presets } from "../lib/presets";
import { legacyRsiConfig } from "./helpers/legacy-rsi-config";

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

describe("RSI Divergence Reversal consistency", () => {
  it("reuses the main RSI calculation for divergence in the generic compiler", () => {
    const code = compilePine(legacyRsiConfig("indicator"));

    expect(code).toContain("divRsi = rsiValue");
    expect(code).not.toContain('divRsiLength = input.int(14, "Divergence RSI period"');
    expect(code).not.toContain("divRsi = ta.rsi(close, divRsiLength)");
  });

  it("does not overwrite an active same-direction visual trade in the generic compiler", () => {
    const code = compilePine(legacyRsiConfig("indicator"));

    expect(code).toContain("acceptedLongSignal = longSignal and riskDirection != 1");
    expect(code).toContain("acceptedShortSignal = shortSignal and riskDirection != -1");
    expect(code).toContain("if acceptedLongSignal and riskDirection == 0\n    riskEntry := close");
    expect(code).toContain("if acceptedShortSignal and riskDirection == 0\n    riskEntry := close");
    expect(code).toContain("oppositeSignalReversal =");
  });

  it("leaves unrelated presets unchanged and keeps the generic strategy path available", () => {
    const balanced = presets.find((item) => item.name === "Balanced Intraday");
    expect(balanced).toBeDefined();

    const balancedCode = compilePine(clone(balanced!));
    expect(balancedCode).toContain("divRsi = ta.rsi(close, divRsiLength)");

    const strategyCode = compilePine(legacyRsiConfig("strategy"));
    expect(strategyCode).not.toContain("divRsi = rsiValue");
    expect(strategyCode).toContain("strategy.entry");
  });
});
