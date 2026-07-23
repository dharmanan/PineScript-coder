import { describe, expect, it } from "vitest";
import { compilePine } from "../lib/compiler";
import { presets } from "../lib/presets";

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

describe("RSI Divergence Reversal entry alignment", () => {
  it("uses the same regular divergence events for pane labels and entries", () => {
    const preset = presets.find((item) => item.name === "RSI Divergence Reversal");
    expect(preset).toBeDefined();

    const config = clone(preset!);
    config.outputMode = "indicator";
    const code = compilePine(config);

    expect(code).toContain("longSetup = rsiValue >= rsiLongLevel and divRegularBullAlert and confirmationOk");
    expect(code).toContain("shortSetup = rsiValue <= rsiShortLevel and divRegularBearAlert and confirmationOk");
    expect(code).not.toContain("pricePivotLow = ta.pivotlow(low, 5, 5)");
    expect(code).not.toContain("bullishDivergence =");
    expect(code.indexOf("// === Integrated RSI divergence pane ===")).toBeLessThan(
      code.indexOf("// === Filters and triggers ===")
    );
  });

  it("does not change the strategy output path", () => {
    const preset = presets.find((item) => item.name === "RSI Divergence Reversal");
    expect(preset).toBeDefined();

    const config = clone(preset!);
    config.outputMode = "strategy";
    const code = compilePine(config);

    expect(code).toContain("bullishDivergence =");
    expect(code).not.toContain("// === Integrated RSI divergence pane ===");
  });
});
