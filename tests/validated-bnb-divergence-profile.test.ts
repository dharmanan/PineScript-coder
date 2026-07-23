import { describe, expect, it } from "vitest";
import { compilePine } from "../lib/compiler";
import { presets } from "../lib/presets";

describe("validated BNBUSDT 30m divergence profile", () => {
  const preset = presets.find((item) => item.name === "RSI Divergence Reversal");

  it("binds the preset to the validated market profile", () => {
    expect(preset).toBeDefined();
    expect(preset?.researchProfile).toBe("bnb_30m_ema_confirmed_regular_divergence_v1");
    expect(preset?.chartTimeframe).toBe("30");
    expect(preset?.risk.stopMode).toBe("swing");
    expect(preset?.risk.swingLength).toBe(15);
    expect(preset?.risk.riskReward).toBe(1.8);
  });

  it("generates the same confirmed signal and frozen-risk rules in Strategy mode", () => {
    if (!preset) throw new Error("RSI Divergence Reversal preset missing");
    const code = compilePine({ ...preset, outputMode: "strategy" });

    expect(code).toContain('expectedTicker = "BNBUSDT"');
    expect(code).toContain('expectedTimeframe = "30"');
    expect(code).toContain("confirmationExpiry = input.int(30");
    expect(code).toContain("longConfirmation = pendingDirection == 1 and ta.crossover(ema9, wma45)");
    expect(code).toContain("shortConfirmation = pendingDirection == -1 and ta.crossunder(ema9, wma45)");
    expect(code).toContain("longTrendOk = ema50 > ema200 and close > ema200");
    expect(code).toContain("volume >= volumeAverage * volumeMultiplier");
    expect(code).toContain("activeStop := ta.lowest(low, swingLength)");
    expect(code).toContain("activeStop := ta.highest(high, swingLength)");
    expect(code).toContain("activeTarget := close + (close - activeStop) * riskReward");
    expect(code).toContain("activeTarget := close - (activeStop - close) * riskReward");
    expect(code).toContain("commission_value=0.15");
    expect(code).not.toContain("request.security");
  });

  it("keeps Indicator and Strategy entry conditions aligned", () => {
    if (!preset) throw new Error("RSI Divergence Reversal preset missing");
    const indicator = compilePine({ ...preset, outputMode: "indicator" });
    const strategy = compilePine({ ...preset, outputMode: "strategy" });

    for (const rule of [
      "regularBullishDivergence = pivotLowFound and rsiHigherLow and priceLowerLow",
      "regularBearishDivergence = pivotHighFound and rsiLowerHigh and priceHigherHigh",
      "longSignal = profileAllowed and confirmationOk and volumeOk and longTrendOk and longConfirmation",
      "shortSignal = profileAllowed and confirmationOk and volumeOk and shortTrendOk and shortConfirmation"
    ]) {
      expect(indicator).toContain(rule);
      expect(strategy).toContain(rule);
    }
  });
});
