import { describe, expect, it } from "vitest";
import { compilePine } from "../lib/compiler";
import { presets } from "../lib/presets";
import { defaultConfig } from "../lib/defaults";
import { toPublicIndicatorConfig } from "../lib/public-indicator-config";
import type { StrategyConfig } from "../lib/types";

const indicator = (config: StrategyConfig) => compilePine(toPublicIndicatorConfig(config));
const MONEY = "Money (larger wins)";
const WIN_RATE = "Win rate (more wins)";

const withProfile = presets.filter((preset) => preset.winRateProfile);

describe("profile selector", () => {
  it("ships a measured alternative for every preset that defines a stop and a target", () => {
    const measurable = presets.filter(
      (preset) =>
        preset.direction !== "spot_buy_exit" &&
        preset.risk.stopMode !== "none" &&
        preset.risk.takeProfitMode !== "none"
    );
    expect(withProfile).toHaveLength(9);
    expect(withProfile.map((preset) => preset.presetId).sort()).toEqual(
      measurable.map((preset) => preset.presetId).sort()
    );
  });

  it("leaves the spot preset alone, since it has no reward target to trade away", () => {
    const spot = presets.find((preset) => preset.presetId === "spot_accumulation") as StrategyConfig;
    expect(spot.winRateProfile).toBeUndefined();
    expect(indicator(spot)).not.toContain("profileMode");
  });

  for (const preset of withProfile) {
    describe(preset.name, () => {
      const code = indicator(preset);
      const profile = preset.winRateProfile!;

      it("offers all three profiles, defaulting to the one the preset ships with", () => {
        expect(code).toContain(
          `profileMode = input.string("${MONEY}", "Profile", options=["${MONEY}", "${WIN_RATE}", "Custom (use inputs below)"])`
        );
      });

      it("declares the selector before anything reads it", () => {
        const selector = code.indexOf("profileMode = input.string");
        const firstRead = code.indexOf('profileMode == "');
        expect(selector).toBeGreaterThan(-1);
        expect(firstRead).toBeGreaterThan(selector);
      });

      // Every win-rate profile in the set is a lower reward target, so this is the one
      // field guaranteed to differ and the switch must always reach it.
      // Pine types a float input as float, so the compiler writes whole numbers with one
      // decimal and leaves fractional ones alone. Matching on toFixed(1) would look for
      // "1.3" when the profile asks for 1.25.
      const asFloat = (value: number) => (Number.isInteger(value) ? value.toFixed(1) : String(value));

      it("routes risk/reward through the profile", () => {
        expect(profile.riskReward).not.toBe(preset.risk.riskReward);
        expect(code).toMatch(
          new RegExp(`^riskReward = profileMode == ".*" \\? ${asFloat(preset.risk.riskReward)} : .* \\? ${asFloat(profile.riskReward)} : riskRewardInput$`, "m")
        );
      });

      it("keeps the underlying input editable for the custom branch", () => {
        expect(code).toContain("riskRewardInput = input.float(");
        expect(code).toContain(": riskRewardInput");
      });

      // A routed input is ignored unless Custom is selected. Without this on the label the
      // user edits the field, nothing happens, and the settings panel gives no reason why.
      it("says on the label that a routed input only applies in Custom", () => {
        const routed = code.split("\n").filter((row) => /^\w+Input = input\./.test(row));
        expect(routed.length).toBeGreaterThan(0);
        for (const row of routed) {
          expect(row, `routed input without the Custom note: ${row}`).toContain("— only in Custom profile");
        }
      });

      it("leaves inputs the profile does not touch labelled normally", () => {
        const untouched = code.split("\n").filter((row) => /^\w+ = input\./.test(row) && !/^\w+Input = /.test(row));
        for (const row of untouched) {
          expect(row, `unrouted input wrongly marked: ${row}`).not.toContain("— only in Custom profile");
        }
      });

      // A ternary whose branches are identical would present a choice that changes
      // nothing, so a field the two profiles agree on is left as a plain input.
      it("only routes the fields the two profiles disagree on", () => {
        const routed = [...code.matchAll(/^(\w+) = profileMode == /gm)].map((match) => match[1]);
        const differs = (a: number | string, b: number | string) => a !== b;
        expect(routed.includes("trailStartR")).toBe(differs(preset.risk.trailStartR, profile.trailStartR));
        expect(routed.includes("triggerWindow")).toBe(differs(preset.triggerWindow, profile.triggerWindow));
        expect(routed.includes("scoreThreshold")).toBe(differs(preset.scoreThreshold, profile.scoreThreshold));
      });

      it("names the active profile on the dashboard", () => {
        expect(code).toContain('table.cell(dashboard, 0, ');
        expect(code).toContain('"Profile", text_color=color.white');
        expect(code).toContain('? "MONEY" : profileMode == ');
      });

      it("keeps the chart timeframe, so switching profiles never asks for a different chart", () => {
        expect(code).toContain(`expectedChartTimeframe = input.timeframe("${preset.chartTimeframe}"`);
      });
    });
  }

  it("stays out of a custom configuration, which was never measured", () => {
    const custom: StrategyConfig = { ...defaultConfig, name: "Custom" };
    expect(custom.winRateProfile).toBeUndefined();
    expect(indicator(custom)).not.toContain("profileMode");
  });

  it("stays out of strategy output", () => {
    const preset = withProfile[0];
    expect(compilePine({ ...preset, outputMode: "strategy" })).not.toContain("profileMode");
  });

  // Presets that have been reviewed on all four symbols in TradingView and locked. Their
  // settings are not a suggestion any more: changing one without a new review should break
  // the build. See research/preset-sweep/PRESET-REVIEW-PLAN.md for what each review found.
  describe("locked presets", () => {
    const LOCKED: Record<string, { money: Partial<StrategyConfig["risk"]>; winRate: NonNullable<StrategyConfig["winRateProfile"]> }> = {
      balanced_intraday: {
        money: { riskReward: 5, breakEvenAtR: 0, trailStartR: 0 },
        winRate: {
          signalMode: "all_filters", scoreThreshold: 60, triggerWindow: 10,
          riskReward: 1.25, breakEvenAtR: 0, trailStartR: 0, trailDistanceR: 1
        }
      }
    };

    for (const [id, expected] of Object.entries(LOCKED)) {
      const preset = presets.find((item) => item.presetId === id) as StrategyConfig;

      it(`${id} keeps its reviewed money profile`, () => {
        expect(preset.risk.riskReward).toBe(expected.money.riskReward);
        expect(preset.risk.breakEvenAtR).toBe(expected.money.breakEvenAtR);
        expect(preset.risk.trailStartR).toBe(expected.money.trailStartR);
      });

      it(`${id} keeps its reviewed win-rate profile`, () => {
        expect(preset.winRateProfile).toEqual(expected.winRate);
      });

      it(`${id} compiles both reviewed profiles into the script`, () => {
        const code = indicator(preset);
        const asFloat = (value: number) => (Number.isInteger(value) ? value.toFixed(1) : String(value));
        expect(code).toContain(`? ${asFloat(expected.money.riskReward!)} :`);
        expect(code).toContain(`? ${asFloat(expected.winRate.riskReward)} :`);
      });
    }
  });

  describe("which profile the script opens with", () => {
    const preset = presets.find((item) => item.presetId === "breakout_momentum") as StrategyConfig;

    it("defaults to money when nothing was chosen", () => {
      expect(preset.activeProfile).toBeUndefined();
      expect(indicator(preset)).toContain(`profileMode = input.string("${MONEY}"`);
    });

    it("opens on the win-rate profile when that was chosen", () => {
      const code = indicator({ ...preset, activeProfile: "win_rate" });
      expect(code).toContain(`profileMode = input.string("${WIN_RATE}"`);
    });

    // The choice only moves the starting point: both settings stay compiled in, so a script
    // generated for one profile can still be switched to the other on the chart.
    it("keeps both settings reachable either way", () => {
      for (const active of ["money", "win_rate"] as const) {
        const code = indicator({ ...preset, activeProfile: active });
        expect(code).toContain(`options=["${MONEY}", "${WIN_RATE}", "Custom (use inputs below)"]`);
        expect(code).toContain(`? ${preset.risk.riskReward.toFixed(1)} :`);
        expect(code).toContain(`? ${preset.winRateProfile!.riskReward.toFixed(1)} :`);
      }
    });
  });
});
