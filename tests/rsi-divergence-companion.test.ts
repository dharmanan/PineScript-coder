import { describe, expect, it } from "vitest";
import { compileRsiDivergenceCompanion } from "../lib/rsi-divergence-companion";

describe("RSI divergence companion", () => {
  it("generates a separate pane with all four divergence types enabled", () => {
    const code = compileRsiDivergenceCompanion("Fast EMA Scalper");

    expect(code).toContain('indicator("Fast EMA Scalper RSI Divergence Companion"');
    expect(code).toContain("overlay=false");
    expect(code).toContain('rsiLength = input.int(14, "RSI period"');
    expect(code).toContain('pivotLeft = input.int(5, "Pivot lookback left"');
    expect(code).toContain('pivotRight = input.int(5, "Pivot lookback right"');
    expect(code).toContain('rangeMinimum = input.int(5, "Minimum pivot range"');
    expect(code).toContain('rangeMaximum = input.int(60, "Maximum pivot range"');
    expect(code).toContain('showRegularBull = input.bool(true');
    expect(code).toContain('showHiddenBull = input.bool(true');
    expect(code).toContain('showRegularBear = input.bool(true');
    expect(code).toContain('showHiddenBear = input.bool(true');
    expect(code).toContain('text="Bull"');
    expect(code).toContain('text="H Bull"');
    expect(code).toContain('text="Bear"');
    expect(code).toContain('text="H Bear"');
    expect(code).toContain('alertcondition(regularBullAlert');
    expect(code).toContain('alertcondition(hiddenBullAlert');
    expect(code).toContain('alertcondition(regularBearAlert');
    expect(code).toContain('alertcondition(hiddenBearAlert');
  });
});
