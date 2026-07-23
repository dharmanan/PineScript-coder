import { describe, expect, it } from "vitest";
import { compilePine } from "../lib/compiler";
import { presets } from "../lib/presets";
import { legacyRsiConfig } from "./helpers/legacy-rsi-config";

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

describe("Strategy divergence alignment", () => {
  it("uses the confirmed regular divergence engine in the generic strategy compiler", () => {
    const code = compilePine(legacyRsiConfig("strategy"));

    expect(code).toContain("// Confirmed regular RSI divergence shared with Indicator mode.");
    expect(code).toContain("divPivotLowFound = not na(ta.pivotlow(rsiValue, divPivotLeft, divPivotRight))");
    expect(code).toContain("bullishDivergence = divPriceLowerLow and divRsiHigherLow and divPivotLowFound");
    expect(code).toContain("bearishDivergence = divPriceHigherHigh and divRsiLowerHigh and divPivotHighFound");
    expect(code).not.toContain("pricePivotLow = ta.pivotlow(low");
    expect(code).not.toContain("rsiPivotLow = ta.pivotlow(rsiValue");
    expect(code).toContain("strategy.entry");
  });

  it("leaves strategy output unchanged when divergence is disabled", () => {
    const preset = presets.find((item) => item.name === "Balanced Intraday");
    expect(preset).toBeDefined();

    const config = clone(preset!);
    config.outputMode = "strategy";
    const code = compilePine(config);

    expect(code).not.toContain("// Confirmed regular RSI divergence shared with Indicator mode.");
    expect(code).not.toContain("divPivotLowFound");
    expect(code).toContain("strategy.entry");
  });

  it("keeps the integrated pane on the generic indicator compiler path", () => {
    const code = compilePine(legacyRsiConfig("indicator"));

    expect(code).toContain("// === Integrated RSI divergence pane ===");
    expect(code).toContain("bullishDivergence = divRegularBullAlert");
    expect(code).not.toContain("// Confirmed regular RSI divergence shared with Indicator mode.");
  });
});
