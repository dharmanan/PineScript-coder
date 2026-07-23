import { describe, expect, it } from "vitest";
import { compilePine } from "../lib/compiler";
import { presets } from "../lib/presets";

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

describe("RSI divergence entry alignment", () => {
  it("uses the same regular divergence events for pane labels and entries", () => {
    const preset = presets.find((item) => item.name === "RSI Divergence Reversal");
    expect(preset).toBeDefined();

    const config = clone(preset!);
    config.outputMode = "indicator";
    const code = compilePine(config);

    expect(code).toContain("bullishDivergence = divRegularBullAlert");
    expect(code).toContain("bearishDivergence = divRegularBearAlert");
    expect(code).toContain("longSetup = rsiValue >= rsiLongLevel and bullishDivergence and confirmationOk");
    expect(code).toContain("shortSetup = rsiValue <= rsiShortLevel and bearishDivergence and confirmationOk");
    expect(code).not.toContain("pricePivotLow = ta.pivotlow(low, 5, 5)");
    expect(code.indexOf("// === Integrated RSI divergence pane ===")).toBeLessThan(
      code.indexOf("// === Filters and triggers ===")
    );
  });

  it("aligns any supported indicator configuration when divergence is enabled", () => {
    const preset = presets.find((item) => item.name === "Balanced Intraday");
    expect(preset).toBeDefined();

    const config = clone(preset!);
    config.outputMode = "indicator";
    config.momentum.divergenceEnabled = true;
    const code = compilePine(config);

    expect(code).toContain("bullishDivergence = divRegularBullAlert");
    expect(code).toContain("bearishDivergence = divRegularBearAlert");
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
