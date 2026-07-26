import { describe, expect, it } from "vitest";
import { compilePine } from "../lib/compiler";
import { presets } from "../lib/presets";
import { defaultConfig } from "../lib/defaults";
import { buildBehaviorPlan } from "../lib/behavior-plan";
import { toPublicIndicatorConfig } from "../lib/public-indicator-config";
import { declares, declaresString } from "./helpers/pine-input";
import type { StrategyConfig } from "../lib/types";

const indicator = (config: StrategyConfig) => compilePine(toPublicIndicatorConfig(config));

const scored = presets.filter((preset) => preset.direction !== "spot_buy_exit");

describe("signal score", () => {
  it("applies to every non-spot preset", () => {
    expect(scored).toHaveLength(9);
  });

  for (const preset of scored) {
    describe(preset.name, () => {
      const code = indicator(preset);

      it("offers both signal modes with a threshold", () => {
        const mode = preset.signalMode === "score" ? "Score" : "All filters";
        expect(code).toMatch(declaresString("signalMode", mode, "Signal mode"));
        expect(code).toContain('options=["All filters", "Score"])');
        expect(code).toMatch(declares("scoreThreshold", preset.scoreThreshold, "Minimum signal score"));
      });

      it("keeps both paths selectable whichever one the preset defaults to", () => {
        expect(code).toContain('(signalMode == "Score" ? longScoreOk : longSetup) and longTrigger');
      });

      it("keeps the entry trigger mandatory in score mode", () => {
        const line = code.split("\n").find((row) => row.startsWith("longSignal = "));
        expect(line).toBeDefined();
        expect(line).toContain("longTrigger");
        expect(line).toContain("cooldownOk");
      });

      it("normalises the score to 0-100", () => {
        const raw = code.match(/^longScore = math\.round\(100\.0 \* longScoreRaw \/ (\d+)\)$/m);
        expect(raw).not.toBeNull();
        expect(Number(raw?.[1])).toBeGreaterThan(0);
      });

      it("scores every weighted filter the plan declares", () => {
        const filters = buildBehaviorPlan(preset).entry.filters;
        const weighted = filters.filter(
          (filter) => filter.id !== "confirmation" && filter.id !== "session"
        );
        const scoreLine = code.split("\n").find((row) => row.startsWith("longScoreRaw = "));
        expect(scoreLine).toBeDefined();
        for (const filter of weighted) {
          expect(scoreLine).toContain(`(${filter.longExpression})`);
        }
        expect(scoreLine?.match(/ \? \d+ : 0\)/g) ?? []).toHaveLength(weighted.length);
      });

      it("keeps confirmation mandatory instead of scoring it", () => {
        const scoreLine = code.split("\n").find((row) => row.startsWith("longScoreRaw = "));
        expect(scoreLine).not.toContain("confirmationOk");
        const okLine = code.split("\n").find((row) => row.startsWith("longScoreOk = "));
        expect(okLine).toContain("confirmationOk");
        expect(okLine).toContain("longScore >= scoreThreshold");
      });

      it("reports the live score on the dashboard", () => {
        expect(code).toContain('"Signal score"');
      });

      it("says on the panel whether scoring is actually driving entries", () => {
        expect(code).toContain('(signalMode == "Score" ? " - min " + str.tostring(scoreThreshold) : " - OFF")');
        expect(code).toContain('text_color=signalMode == "Score" ? color.white : color.gray');
      });

      it("reserves a dashboard row for every cell it writes", () => {
        const declared = code.match(
          /var table dashboard = table\.new\(position\.top_right, 2, (\d+), border_width=1/
        );
        const rows = Number(declared?.[1]);
        const used = [...code.matchAll(/table\.cell\(dashboard, \d+, (\d+),/g)].map((m) => Number(m[1]));
        expect(Math.max(...used)).toBe(rows - 1);
      });
    });
  }

  it("scores the short side independently for a long/short preset", () => {
    const code = indicator(presets[0]);
    expect(code).toContain("shortScoreRaw = ");
    expect(code).toContain('(signalMode == "Score" ? shortScoreOk : shortSetup) and shortTrigger');
    const long = code.split("\n").find((row) => row.startsWith("longScoreRaw = "));
    const short = code.split("\n").find((row) => row.startsWith("shortScoreRaw = "));
    expect(long).not.toEqual(short);
    expect(short).toContain("(emaFast < emaSlow)");
    expect(long).toContain("(emaFast > emaSlow)");
  });

  it("keeps a session filter mandatory rather than scored", () => {
    const session = presets.find((preset) => preset.presetId === "vwap_session_trader");
    expect(session?.execution.sessionEnabled).toBe(true);
    const code = indicator(session as StrategyConfig);
    const scoreLine = code.split("\n").find((row) => row.startsWith("longScoreRaw = "));
    expect(scoreLine).not.toContain("sessionOk");
    expect(code).toContain("longScoreOk = sessionOk and confirmationOk");
  });

  it("does not score a short side in a long-only preset", () => {
    const longOnly = presets.find((preset) => preset.presetId === "long_term_trend_guard");
    expect(longOnly?.direction).toBe("long_only");
    const code = indicator(longOnly as StrategyConfig);
    expect(code).toContain("longScoreRaw = ");
    expect(code).not.toContain("shortScoreRaw = ");
    expect(code).toContain('"L " + str.tostring(longScore)');
  });

  it("weights the divergence preset on its divergence filter", () => {
    const divergence = presets.find((preset) => preset.presetId === "rsi_divergence_reversal");
    const code = indicator(divergence as StrategyConfig);
    const scoreLine = code.split("\n").find((row) => row.startsWith("longScoreRaw = "));
    expect(scoreLine).toContain("((bullishDivergence) ? 25 : 0)");
  });

  it("stays out of a spot preset", () => {
    const spot = presets.find((preset) => preset.presetId === "spot_accumulation");
    const code = indicator(spot as StrategyConfig);
    expect(code).not.toContain("longScoreRaw");
    expect(code).not.toContain("signalMode");
  });

  it("leaves strategy output untouched", () => {
    const code = compilePine({ ...defaultConfig, outputMode: "strategy" });
    expect(code).not.toContain("longScoreRaw");
    expect(code).not.toContain("signalMode");
    expect(code).toContain("strategy.entry");
  });
});

describe("trigger window", () => {
  for (const preset of scored) {
    describe(preset.name, () => {
      const code = indicator(preset);

      it("carries the preset's window as an input", () => {
        expect(code).toMatch(declares("triggerWindow", preset.triggerWindow, "Trigger window (bars)"));
      });

      it("keeps a fired trigger alive for that many candles", () => {
        expect(code).toContain("longTriggerAge = ta.barssince(longTrigger)");
        expect(code).toContain("longTriggerActive = not na(longTriggerAge) and longTriggerAge < triggerWindow");
      });

      it("still requires the trigger, it is never dropped", () => {
        const line = code.split("\n").find((row) => row.startsWith("longSignal = "));
        expect(line).toContain("longTriggerActive");
        expect(line).toContain("cooldownOk");
      });
    });
  }
});
