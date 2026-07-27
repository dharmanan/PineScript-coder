import { describe, expect, it } from "vitest";
import { compilePine } from "../lib/compiler";
import { presets } from "../lib/presets";
import type { StrategyConfig } from "../lib/types";

const rsiPanePresetNames = [
  "Balanced Intraday",
  "Fast EMA Scalper",
  "VWAP Reclaim",
  "Swing Structure Trend",
  "Spot Accumulation",
  "Breakout Momentum",
  "RSI Divergence Reversal",
  "Selective Multi-Timeframe",
  "Long-Term Trend Guard"
] as const;

const paneAnchor = "// === Integrated RSI divergence pane ===";
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

const findPreset = (name: string): StrategyConfig => {
  const preset = presets.find((item) => item.name === name);
  expect(preset, `Missing preset: ${name}`).toBeDefined();
  return clone(preset!);
};

const splitPane = (code: string): { pane: string; outside: string } => {
  const paneStart = code.indexOf(paneAnchor);
  expect(paneStart).toBeGreaterThanOrEqual(0);

  const paneEndCandidates = [
    code.indexOf("// === Entry divergence aliases ===", paneStart),
    code.indexOf("// === Filters and triggers ===", paneStart),
    code.indexOf("// === Alerts ===", paneStart)
  ].filter((index) => index > paneStart);

  expect(paneEndCandidates.length).toBeGreaterThan(0);
  const paneEnd = Math.min(...paneEndCandidates);

  return {
    pane: code.slice(paneStart, paneEnd),
    outside: code.slice(0, paneStart) + code.slice(paneEnd)
  };
};

const visualLines = (source: string): string[] =>
  source
    .split("\n")
    .filter((line) => /^\s*(?:plot|plotshape|bgcolor|label\.new)\(/.test(line));

describe("RSI pane main-chart routing", () => {
  for (const name of rsiPanePresetNames) {
    it(`keeps ${name} chart visuals on the main chart`, () => {
      const config = findPreset(name);
      config.outputMode = "indicator";

      const code = compilePine(config);
      const { pane, outside } = splitPane(code);
      const chartLines = visualLines(outside);
      const paneLines = visualLines(pane);

      expect(chartLines.length).toBeGreaterThan(0);
      for (const line of chartLines) {
        expect(line).toContain("force_overlay=true");
      }

      expect(paneLines.length).toBeGreaterThan(0);
      for (const line of paneLines) {
        expect(line).not.toContain("force_overlay=true");
      }

      const dashboardLine = outside
        .split("\n")
        .find((line) => line.includes("var table dashboard = table.new"));
      expect(dashboardLine).toContain("force_overlay=true");

      if (config.direction === "spot_buy_exit") {
        const buyLine = outside.split("\n").find((line) => line.includes('title="Spot buy"'));
        const exitLine = outside.split("\n").find((line) => line.includes('title="Spot exit"'));
        expect(buyLine).toContain("force_overlay=true");
        expect(exitLine).toContain("force_overlay=true");
      } else {
        const longLine = outside
          .split("\n")
          .find((line) => line.includes("label.new") && line.includes('"LONG\\n"'));
        expect(longLine).toContain("force_overlay=true");

        if (config.direction === "long_short") {
          const shortLine = outside
            .split("\n")
            .find((line) => line.includes("label.new") && line.includes('"SHORT\\n"'));
          expect(shortLine).toContain("force_overlay=true");
        }
      }

      if (config.risk.stopMode !== "none") {
        const stopLine = outside.split("\n").find((line) => line.includes('"Risk Stop"'));
        expect(stopLine).toContain("force_overlay=true");
      }

      if (config.risk.takeProfitMode !== "none") {
        const targetLine = outside.split("\n").find((line) => line.includes('"Risk Target"'));
        expect(targetLine).toContain("force_overlay=true");
      }
    });
  }
});
