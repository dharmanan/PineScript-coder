import { describe, expect, it } from "vitest";
import { compilePine } from "../lib/compiler";
import { defaultConfig } from "../lib/defaults";
import { presets } from "../lib/presets";
import type { StrategyConfig } from "../lib/types";

// Supertrend Volume was the one preset whose drawings could end up in a separate pane: it
// declares overlay=true and, before compiler-v29, pinned nothing to the main chart. On a
// saved TradingView layout that had ever held a pane indicator it opened inside that pane,
// plotting supertrend, stop and target against the pane's own scale with the dashboard
// clipped to six rows. The nine presets with an integrated RSI pane never had this problem
// because compiler-v14 already pins every drawing.
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

const visualLines = (code: string): string[] =>
  code.split("\n").filter((line) => /^\s*(?:plot|plotshape|bgcolor|label\.new)\(/.test(line));

const findPreset = (name: string): StrategyConfig => {
  const preset = presets.find((item) => item.name === name);
  expect(preset, `Missing preset: ${name}`).toBeDefined();
  return clone(preset!);
};

describe("main-chart pin for overlay scripts", () => {
  it("pins every Supertrend Volume drawing to the main chart", () => {
    const config = findPreset("Supertrend Volume");
    config.outputMode = "indicator";

    const code = compilePine(config);

    // The declaration is untouched: this changes where drawings go, not where the indicator opens.
    expect(code).toContain('indicator("Supertrend Volume", overlay=true');
    expect(code).not.toContain("// === Integrated RSI divergence pane ===");

    const lines = visualLines(code);
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) expect(line).toContain("force_overlay=true");
  });

  it("pins the Supertrend Volume dashboard, so the profile row cannot be clipped into a pane", () => {
    const config = findPreset("Supertrend Volume");
    config.outputMode = "indicator";

    const code = compilePine(config);
    const dashboardLine = code.split("\n").find((line) => line.includes("var table dashboard = table.new"));

    expect(dashboardLine).toContain("force_overlay=true");
    // Row 15 is the one the review procedure reads to confirm a profile actually applied.
    expect(code).toContain('table.cell(dashboard, 0, 15, "Profile"');
  });

  it("pins the stop, target and entry drawings a review reads off the chart", () => {
    const config = findPreset("Supertrend Volume");
    config.outputMode = "indicator";

    const code = compilePine(config).split("\n");
    const line = (needle: string) => code.find((item) => item.includes(needle));

    expect(line('"Risk Stop"')).toContain("force_overlay=true");
    expect(line('"Risk Target"')).toContain("force_overlay=true");
    expect(line('"Supertrend"')).toContain("force_overlay=true");
    expect(line('"LONG\\n"')).toContain("force_overlay=true");
    expect(line('"SHORT\\n"')).toContain("force_overlay=true");
  });

  it("pins a custom configuration too", () => {
    const config = clone(defaultConfig);
    config.outputMode = "indicator";

    const code = compilePine(config);
    const lines = visualLines(code);

    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) expect(line).toContain("force_overlay=true");
  });

  // The pane presets keep their split: price drawings on the chart, the RSI plot in the pane.
  // Pinning the RSI plot too would defeat the point of having a pane at all.
  it("leaves the RSI divergence pane alone", () => {
    const config = findPreset("Balanced Intraday");
    config.outputMode = "indicator";

    const code = compilePine(config);
    const paneStart = code.indexOf("// === Integrated RSI divergence pane ===");
    expect(paneStart).toBeGreaterThan(0);

    expect(code).toContain('indicator("Balanced Intraday", overlay=false');

    const paneLines = visualLines(code.slice(paneStart));
    expect(paneLines.length).toBeGreaterThan(0);
    for (const line of paneLines) expect(line).not.toContain("force_overlay=true");
  });
});
