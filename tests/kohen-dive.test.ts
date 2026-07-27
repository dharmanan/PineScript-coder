import { describe, expect, it } from "vitest";
import { analyzeBehaviorContract } from "../lib/contract-analyzer";
import { compilePine } from "../lib/compiler";
import { explainConfig } from "../lib/explain";
import { presets } from "../lib/presets";
import { analyzeGeneratedPine } from "../lib/static-analyzer";
import type { StrategyConfig } from "../lib/types";

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const adaptivePreset = presets.find((item) => item.presetId === "kohen_dive_adaptive") as StrategyConfig;

describe("Kohen Dive PineForge preset", () => {
  it("ships only the adaptive Kohen Dive replacement in the ready-made preset list", () => {
    expect(adaptivePreset).toBeDefined();
    expect(presets.some((item) => item.presetId === "rsi_divergence_reversal")).toBe(false);
    expect(presets.some((item) => item.presetId === "kohen_dive")).toBe(false);
    expect(presets.filter((item) => item.name.startsWith("Kohen Dive"))).toEqual([adaptivePreset]);
  });

  it("keeps the original pressure family and fixes the rolling VWAP anchor", () => {
    const code = compilePine(clone(adaptivePreset));

    expect(code).toContain("Original concept: Kohen Dive V4.6");
    expect(code).toContain("trendScore = positiveCount - negativeCount");
    expect(code).toContain("sniperBuy = ");
    expect(code).toContain("rollingDivBuy = ");
    expect(code).toContain("anchorBarsBack = math.abs(ta.lowestbars(low, vwapAnchorLookback))");
    expect(code).toContain("cumulativePriceVolume[anchorBarsBack + 1]");
    expect(code).not.toContain("if is_new_low");
  });

  it("only measures confirmed strong signals using the shared next-open risk model", () => {
    const code = compilePine(clone(adaptivePreset));

    expect(code).toContain("confirmationOk = not confirmedOnly or barstate.isconfirmed");
    expect(code).toContain("acceptedLongSignal = longSignal and (riskDirection == 0 or reverseOnOppositeSignal");
    expect(code).toContain("longFillPrice = entryUsesLimit ? math.min(open, pendingLimit) : open");
    expect(code).toContain("pendingRisk := atrValue * atrMultiple");
    expect(code).toContain("riskCanResolve = riskDirection != 0 and not na(riskStartedBar) and bar_index >= riskStartedBar");
    expect(code).toContain("riskAmbiguous = riskStopHit and riskTargetHit");
    expect(code).toContain("outcomeGrossR = riskAmbiguous ? -1.0 :");
  });

  it("adds the PineForge dashboard metrics requested for live comparison", () => {
    const code = compilePine(clone(adaptivePreset));

    for (const label of [
      "Long state",
      "Short state",
      "Chart TF",
      "Trend pressure",
      "PD zone",
      "Anchored VWAP",
      "Wins / Losses",
      "Win rate (net)",
      "Net result",
      "Profit factor",
      "Max drawdown"
    ]) {
      expect(code).toContain(`"${label}"`);
    }
    expect(code).toContain(
      "var table dashboard = table.new(position.top_right, 2, 19, border_width=1, force_overlay=true)"
    );
    expect(code).toContain("if barstate.islast and showDashboardPanel");
    for (const removed of ["Last entry", "Result price", "Entry date", "Result date", "Signal score", "Profile"]) {
      expect(code).not.toContain(`"${removed}"`);
    }
  });

  it("compiles the relevant PineForge form values into its own inputs", () => {
    const changed = clone(adaptivePreset);
    changed.chartTimeframe = "60";
    changed.confirmedBarsOnly = false;
    changed.execution.cooldownBars = 10;
    changed.momentum.rsiLength = 9;
    changed.momentum.rsiLong = 35;
    changed.momentum.rsiShort = 65;
    changed.risk.atrLength = 20;
    changed.risk.atrMultiple = 2.5;
    changed.risk.riskReward = 1.5;

    const code = compilePine(changed);
    expect(code).toContain('expectedChartTimeframe = input.timeframe("60"');
    expect(code).toContain('confirmedOnly = input.bool(false, "Confirmed candles only"');
    expect(code).toContain('cooldownBars = input.int(10, "Signal cooldown bars"');
    expect(code).toContain('rsiLength = input.int(9, "RSI length"');
    expect(code).toContain('rsiLongLevel = input.float(35.0, "Buy RSI ceiling"');
    expect(code).toContain('rsiShortLevel = input.float(65.0, "Sell RSI floor"');
    expect(code).toContain('atrLength = input.int(20, "ATR length"');
    expect(code).toContain('atrMultiple = input.float(2.5, "ATR stop multiple"');
    expect(code).toContain('riskReward = input.float(1.5, "Risk/reward"');
  });

  it("describes the shipping profile without temporary comparison language", () => {
    const code = compilePine(clone(adaptivePreset));
    const explanation = explainConfig(clone(adaptivePreset));

    expect(analyzeGeneratedPine(adaptivePreset, code).filter((issue) => issue.level === "error")).toEqual([]);
    expect(analyzeBehaviorContract(adaptivePreset, code, explanation).filter((issue) => issue.level === "error")).toEqual([]);
    expect(explanation.join(" ")).not.toContain("experimental");
    expect(explanation.join(" ")).not.toContain("baseline");
  });

  it("ships the measured Active 4H defaults", () => {
    const adaptiveCode = compilePine(clone(adaptivePreset));

    expect(adaptivePreset.researchProfile).toBe("kohen_dive_adaptive_v1");
    expect(adaptivePreset.chartTimeframe).toBe("240");
    expect(adaptivePreset.risk.atrMultiple).toBe(1.75);
    expect(adaptivePreset.risk.riskReward).toBe(1.75);
    expect(adaptivePreset.execution.cooldownBars).toBe(2);
    expect(adaptiveCode).toContain('adaptiveMode = input.bool(true, "Adaptive regime engine"');
    expect(adaptiveCode).toContain('reverseOnOppositeSignal = input.bool(false, "Exit and reverse on opposite signal"');
  });

  it("counts the adaptive 4-hour evidence window from 1 January 2024 by default", () => {
    const adaptiveCode = compilePine(clone(adaptivePreset));

    expect(adaptiveCode).toContain(
      'countFrom = input.time(timestamp("2024-01-01T00:00:00+0000"), "Count trades entered from"'
    );
  });

  it("gates raw counter-trend reversals and defaults to measurable active continuation entries", () => {
    const code = compilePine(clone(adaptivePreset));

    expect(code).toContain("strongBullRegime = regimeFast > regimeSlow");
    expect(code).toContain("strongBearRegime = regimeFast < regimeSlow");
    expect(code).toContain('adaptiveSignalProfile = input.string("Active 4H"');
    expect(code).toContain("longReversalTrigger = longReversalArmed and (activeSignalProfile ? longStateRecovery : longStructureBreak)");
    expect(code).toContain("shortReversalTrigger = shortReversalArmed and (activeSignalProfile ? shortStateRecovery : shortStructureBreak)");
    expect(code).toContain("longContinuationTrigger = allowContinuation and strongBullRegime");
    expect(code).toContain("shortContinuationTrigger = allowContinuation and strongBearRegime");
    expect(code).toContain("longHybridContinuation = longRsiRecovery or longEmaRecovery or longPressureRecovery");
    expect(code).toContain('activeSignalProfile ? "ACTIVE 4H" : "STRICT 4H"');
    expect(code).toContain("oppositeSignalReversal = reverseOnOppositeSignal and");
  });

  it("reports compact direction and signal-family outcomes for adaptive measurement", () => {
    const code = compilePine(clone(adaptivePreset));

    for (const label of [
      "Long W / L",
      "Short W / L",
      "Continuation W / L",
      "Reversal W / L",
      "Raw reversals gated"
    ]) {
      expect(code).toContain(`"${label}"`);
    }
    expect(code).toContain("riskFamily := pendingFamily");
    expect(code).toContain("continuationWinCount :=");
    expect(code).toContain("reversalLossCount :=");
    expect(code).not.toContain('"Cont 1/3"');
    expect(code).not.toContain('"DIAGNOSTICS"');
  });

  it("keeps the compact dashboard isolated from the other ready-made indicators", () => {
    const adaptiveCode = compilePine(clone(adaptivePreset));
    const genericPreset = presets.find((item) => item.presetId === "balanced_intraday") as StrategyConfig;
    const genericCode = compilePine(clone(genericPreset));

    expect(adaptiveCode).toContain("table.new(position.top_right, 2, 19");
    expect(adaptiveCode).not.toContain('"Entry date"');
    expect(adaptiveCode).not.toContain('"Result date"');
    expect(genericCode).toContain('"Entry date"');
    expect(genericCode).toContain('"Result date"');
    expect(genericCode).not.toContain('"Raw reversals gated"');
  });

  it("passes adaptive Pine and explanation contracts", () => {
    const code = compilePine(clone(adaptivePreset));
    const explanation = explainConfig(clone(adaptivePreset));

    expect(analyzeGeneratedPine(adaptivePreset, code).filter((issue) => issue.level === "error")).toEqual([]);
    expect(analyzeBehaviorContract(adaptivePreset, code, explanation).filter((issue) => issue.level === "error")).toEqual([]);
    expect(explanation.join(" ")).toContain("trend-aligned pullback continuation");
    expect(explanation.join(" ")).toContain("ATR 14 × 1.75");
  });
});
