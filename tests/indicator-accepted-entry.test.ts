import { describe, expect, it } from "vitest";
import { compilePine } from "../lib/compiler";
import { presets } from "../lib/presets";

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

describe("accepted indicator entry lifecycle", () => {
  it("uses accepted signals for labels, risk entries, dashboard and alerts", () => {
    const preset = presets.find((item) => item.name === "Balanced Intraday");
    expect(preset).toBeDefined();

    const config = clone(preset!);
    config.outputMode = "indicator";
    const code = compilePine(config);

    expect(code).toContain("acceptedLongSignal = longSignal and riskDirection != 1");
    expect(code).toContain("acceptedShortSignal = shortSignal and riskDirection != -1");
    expect(code).toContain("if acceptedLongSignal\n    label.new");
    expect(code).toContain("if acceptedShortSignal\n    label.new");
    expect(code).toContain("if acceptedLongSignal and riskDirection == 0\n    pendingDirection := 1");
    expect(code).toContain("if acceptedShortSignal and riskDirection == 0\n    pendingDirection := -1");
    expect(code).toContain("if longFillReady\n    riskEntry := longFillPrice");
    expect(code).toContain("if shortFillReady\n    riskEntry := shortFillPrice");
    expect(code).toContain('acceptedLongSignal ? "YES" : "WAIT"');
    expect(code).toContain('acceptedShortSignal ? "YES" : "WAIT"');
    expect(code).toContain('alertcondition(acceptedLongSignal, "Long signal"');
    expect(code).toContain('alertcondition(acceptedShortSignal, "Short signal"');
  });

  it("does not alter Strategy output", () => {
    const preset = presets.find((item) => item.name === "Balanced Intraday");
    expect(preset).toBeDefined();

    const config = clone(preset!);
    config.outputMode = "strategy";
    const code = compilePine(config);

    expect(code).not.toContain("acceptedLongSignal");
    expect(code).toContain("strategy.entry");
  });
});
