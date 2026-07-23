import { describe, expect, it } from "vitest";
import { compilePine } from "../lib/compiler";
import { presets } from "../lib/presets";
import { legacyRsiConfig } from "./helpers/legacy-rsi-config";

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

describe("strategy ATR entry freeze", () => {
  it("captures ATR once for Fast EMA Scalper strategy entries", () => {
    const preset = presets.find((item) => item.name === "Fast EMA Scalper");
    expect(preset).toBeDefined();

    const config = clone(preset!);
    config.outputMode = "strategy";
    const code = compilePine(config);

    expect(code).toContain("var float strategyAtrAtEntry = na");
    expect(code).toContain("if longSignal and strategy.position_size <= 0\n    strategyAtrAtEntry := atrValue");
    expect(code).toContain("if shortSignal and strategy.position_size >= 0\n    strategyAtrAtEntry := atrValue");
    expect(code).toContain("longStop = strategy.position_avg_price - strategyAtrAtEntry * atrMultiple");
    expect(code).toContain("shortStop = strategy.position_avg_price + strategyAtrAtEntry * atrMultiple");
    expect(code).not.toContain("longStop = strategy.position_avg_price - atrValue * atrMultiple");
    expect(code).not.toContain("shortStop = strategy.position_avg_price + atrValue * atrMultiple");
  });

  it("keeps the aligned divergence engine and freezes ATR for the generic RSI strategy", () => {
    const code = compilePine(legacyRsiConfig("strategy"));

    expect(code).toContain("// Confirmed regular RSI divergence shared with Indicator mode.");
    expect(code).toContain("strategyAtrAtEntry := atrValue");
    expect(code).toContain("longStop = strategy.position_avg_price - strategyAtrAtEntry * atrMultiple");
  });

  it("does not add strategy ATR state to indicator output", () => {
    const preset = presets.find((item) => item.name === "Fast EMA Scalper");
    expect(preset).toBeDefined();

    const config = clone(preset!);
    config.outputMode = "indicator";
    const code = compilePine(config);

    expect(code).not.toContain("strategyAtrAtEntry");
  });
});
