import { describe, expect, it } from "vitest";
import { compilePine } from "../lib/compiler";
import { presets } from "../lib/presets";
import type { StrategyConfig } from "../lib/types";

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

const findPreset = (name: string): StrategyConfig => {
  const preset = presets.find((item) => item.name === name);
  expect(preset, `Missing preset: ${name}`).toBeDefined();
  return clone(preset!);
};

describe("visual stop confirmation", () => {
  it("uses candle-close stop confirmation by default for Selective Multi-Timeframe", () => {
    const config = findPreset("Selective Multi-Timeframe");
    config.outputMode = "indicator";

    const code = compilePine(config);

    expect(config.risk.stopTrigger).toBe("close");
    expect(code).toContain('stopConfirmation = input.string("Candle close", "Stop confirmation", options=["Wick touch", "Candle close"])');
    expect(code).toContain('stopConfirmation == "Candle close" ? close <= riskStop : low <= riskStop');
    expect(code).toContain('stopConfirmation == "Candle close" ? close >= riskStop : high >= riskStop');
  });

  it("keeps wick-touch confirmation as the default for Balanced Intraday", () => {
    const config = findPreset("Balanced Intraday");
    config.outputMode = "indicator";

    const code = compilePine(config);

    expect(config.risk.stopTrigger).toBe("wick");
    expect(code).toContain('stopConfirmation = input.string("Wick touch", "Stop confirmation", options=["Wick touch", "Candle close"])');
  });
});
