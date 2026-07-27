import { describe, expect, it } from "vitest";
import { compilePine } from "../lib/compiler";
import { presets } from "../lib/presets";
import { explainConfig } from "../lib/explain";
import { defaultConfig } from "../lib/defaults";
import { toPublicIndicatorConfig } from "../lib/public-indicator-config";
import type { StrategyConfig } from "../lib/types";

const indicator = (config: StrategyConfig) => compilePine(toPublicIndicatorConfig(config));
const MONEY = "Money (larger wins)";
const WIN_RATE = "Win rate (more wins)";

const withProfile = presets.filter((preset) => preset.winRateProfile);

// Pine types a float input as float, so the compiler writes whole numbers with one decimal
// and leaves fractional ones alone. Calling toFixed(1) instead would look for "1.3" when the
// profile asks for 1.25 — which is exactly how a reward target of 1.25 broke this file three
// times. One definition, used everywhere a compiled reward is matched.
const asFloat = (value: number) => (Number.isInteger(value) ? value.toFixed(1) : String(value));

describe("profile selector", () => {
  it("ships a measured alternative for every preset that defines a stop and a target", () => {
    const measurable = presets.filter(
      (preset) =>
        preset.direction !== "spot_buy_exit" &&
        preset.researchProfile === undefined &&
        preset.risk.stopMode !== "none" &&
        preset.risk.takeProfitMode !== "none"
    );
    expect(withProfile).toHaveLength(8);
    expect(withProfile.map((preset) => preset.presetId).sort()).toEqual(
      measurable.map((preset) => preset.presetId).sort()
    );
  });

  for (const preset of withProfile) {
    describe(preset.name, () => {
      const code = indicator(preset);
      const profile = preset.winRateProfile!;

      // Every preset opens on the win-rate profile. Both are compiled in and the money profile
      // is one dropdown away, so this is only about which one a reader meets first — and the
      // money profile meets them somewhere between a 12% and a 25% hit rate, which reads as a
      // broken indicator before it reads as a wide reward target.
      it("offers all three profiles, defaulting to the win-rate one", () => {
        expect(code).toContain(
          `profileMode = input.string("${WIN_RATE}", "Profile", options=["${MONEY}", "${WIN_RATE}", "Custom (use inputs below)"])`
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

      // The routed inputs keep showing their own defaults while a profile overrides them,
      // so the settings panel displays a reward the script is not using. Without this the
      // only way to know the active value is to guess from the hit rate.
      it("reports the risk/reward actually in force", () => {
        expect(code).toContain('+ "  ·  rr " + str.tostring(riskReward, "#.##")');
      });

      // `+` binds tighter than `?:` in Pine, so an unparenthesised name would append the
      // reward to the CUSTOM branch only and the other two would show a bare label.
      it("appends the reward to every branch, not just the last", () => {
        const row = code.split("\n").find((line) => line.includes('"  ·  rr "'));
        expect(row).toBeDefined();
        expect(row).toContain('(profileMode == ');
        expect(row).toContain('"CUSTOM") + "  ·  rr "');
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
  // the build.
  describe("locked presets", () => {
    const LOCKED: Record<string, { money: Partial<StrategyConfig["risk"]>; winRate: NonNullable<StrategyConfig["winRateProfile"]> }> = {
      balanced_intraday: {
        money: { riskReward: 5, breakEvenAtR: 0, trailStartR: 0 },
        winRate: {
          signalMode: "all_filters", scoreThreshold: 60, triggerWindow: 10,
          riskReward: 1.25, breakEvenAtR: 0, trailStartR: 0, trailDistanceR: 1
        }
      },
      // Money profile unchanged; win-rate profile moved to reward 1.5 without a trailing
      // stop after it beat reward 2 on three of four symbols on the chart.
      fast_ema_scalper: {
        money: { riskReward: 6, breakEvenAtR: 1, trailStartR: 0 },
        winRate: {
          signalMode: "all_filters", scoreThreshold: 60, triggerWindow: 5,
          riskReward: 1.5, breakEvenAtR: 0, trailStartR: 0, trailDistanceR: 1
        }
      },
      // Money profile unchanged; win-rate profile moved to reward 1.25 without a trailing
      // stop after it beat reward 3 on three of four symbols on the chart and on the unseen
      // July data. The third preset in a row where a lower reward target and no trail won.
      supertrend_volume: {
        money: { riskReward: 5, breakEvenAtR: 0, trailStartR: 0 },
        winRate: {
          signalMode: "all_filters", scoreThreshold: 60, triggerWindow: 10,
          riskReward: 1.25, breakEvenAtR: 0, trailStartR: 0, trailDistanceR: 1
        }
      },
      // The one preset whose structure changed, so the lock covers more than the two profiles:
      // the breakout channel, the ADX gate and the stop confirmation are pinned in the
      // structure test below, because those three are what the review actually decided.
      breakout_momentum: {
        money: { riskReward: 6, breakEvenAtR: 0, trailStartR: 0 },
        winRate: {
          signalMode: "all_filters", scoreThreshold: 60, triggerWindow: 3,
          riskReward: 1.25, breakEvenAtR: 0, trailStartR: 1, trailDistanceR: 0.5
        }
      },
      // Money profile unchanged at reward 6. The win-rate profile keeps reward 4 and replaces
      // the 1.5R/1R trail with a tight 1R/0.5R one, which is what lifted its hit rate from
      // 43.3% to 56.4% and made it positive in July. The structural half of the decision — the
      // session window and the volume multiplier — is pinned separately below.
      vwap_session_trader: {
        money: { riskReward: 6, breakEvenAtR: 0, trailStartR: 0 },
        winRate: {
          signalMode: "all_filters", scoreThreshold: 60, triggerWindow: 3,
          riskReward: 4, breakEvenAtR: 0, trailStartR: 1, trailDistanceR: 0.5
        }
      },
      // The win-rate profile was shipping at 27.9% here, which is not a win-rate profile. Reward
      // 1.25 with a tight trail doubles that to 53.1% for 0.016R of expectancy. The first attempt
      // at this review rejected the change by ranking candidates on expectancy, which is the money
      // profile's job — this line exists so that mistake cannot be repeated silently.
      swing_trend_4h: {
        money: { riskReward: 6, breakEvenAtR: 0, trailStartR: 0 },
        winRate: {
          signalMode: "all_filters", scoreThreshold: 60, triggerWindow: 5,
          riskReward: 1.25, breakEvenAtR: 0, trailStartR: 1, trailDistanceR: 0.5
        }
      },
      // Both profiles unchanged: this review moved the structure, not the reward target. The
      // three settings it did move are pinned separately below, because they are the decision.
      selective_multi_timeframe: {
        money: { riskReward: 6, breakEvenAtR: 0, trailStartR: 2 },
        winRate: {
          signalMode: "all_filters", scoreThreshold: 60, triggerWindow: 3,
          riskReward: 2.5, breakEvenAtR: 0, trailStartR: 1.5, trailDistanceR: 1
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
        expect(code).toContain(`? ${asFloat(expected.money.riskReward!)} :`);
        expect(code).toContain(`? ${asFloat(expected.winRate.riskReward)} :`);
      });
    }

    // Breakout Momentum is the only reviewed preset where the decision was about the shape of
    // the setup rather than the reward target, so its lock has to cover the three settings the
    // review actually moved. Without this the reward target could stay pinned while the channel
    // length quietly went back to 20 and the whole measurement would stop describing the product.
    it("keeps the three structural settings Breakout Momentum's review changed", () => {
      const preset = presets.find((item) => item.presetId === "breakout_momentum") as StrategyConfig;
      expect(preset.trend.breakoutLength).toBe(10);
      expect(preset.momentum.adxThreshold).toBe(30);
      expect(preset.risk.stopTrigger).toBe("close");
      // MACD measures as contributing nothing and is kept as a product decision; if it is ever
      // removed that should be a deliberate change with this line updated, not a silent one.
      expect(preset.momentum.macdEnabled).toBe(true);

      const code = indicator(preset);
      expect(code).toContain('breakoutLen = input.int(10,');
      expect(code).toContain('adxThreshold = input.float(30,');
      expect(code).toContain('stopConfirmation = input.string("Candle close"');
    });

    // VWAP Reclaim's review was also structural, and the session is the part most likely to be
    // quietly undone: it reads like a harmless default. It is not. Restricted to New York equity
    // hours this preset lost money on all four symbols (-0.240R); opened to the whole day it
    // makes money on all four (+0.267R). The filter stays enabled so a user can narrow it, and
    // its window stays open so the shipped behaviour is every hour.
    it("keeps VWAP Reclaim's session open and its volume filter where the review put them", () => {
      const preset = presets.find((item) => item.presetId === "vwap_session_trader") as StrategyConfig;
      expect(preset.name).toBe("VWAP Reclaim");
      expect(preset.execution.sessionEnabled).toBe(true);
      expect(preset.execution.session).toBe("0000-2359");
      expect(preset.volume.multiplier).toBe(1.5);

      const code = indicator(preset);
      expect(code).toContain('tradeSession = input.session("0000-2359"');
      expect(code).toContain('volumeMultiplier = input.float(1.5,');
      // The plain-language text must not call an open window a restriction.
      expect(code).not.toContain("0930-1600");
    });

    // Selective Multi-Timeframe's review was structural too, and all three of its settings are
    // the kind that read as harmless defaults. They are not. On the win-rate profile over
    // 2026-01-01 to 2026-07-27 the shipping settings gave BTC 18 trades at 38.9% for -4.38R and
    // BNB 12 trades at 50.0% for -0.01R; these three give BTC 42 at 50.0% for +7.09R and BNB 36
    // at 55.6% for +14.42R, with the trade count roughly doubling on all four symbols.
    it("keeps the three structural settings Selective Multi-Timeframe's review changed", () => {
      const preset = presets.find((item) => item.presetId === "selective_multi_timeframe") as StrategyConfig;
      expect(preset.volume.multiplier).toBe(0.8);
      expect(preset.momentum.adxEnabled).toBe(false);
      // Measurably dead: switching it off was identical to the reference on every symbol and
      // every period, so it was a control in the form that decided nothing.
      expect(preset.trend.longMaEnabled).toBe(false);
      // MACD is the opposite case here — switching it off cost the holdout most of its edge —
      // so it stays, and a future change to it has to be deliberate.
      expect(preset.momentum.macdEnabled).toBe(true);

      const code = indicator(preset);
      expect(code).toContain('volumeMultiplier = input.float(0.8,');
      expect(code).not.toContain("adxThreshold = input.float(");
      // The long MA stays on the chart as a drawn line, because spotExitMode keeps it compiled.
      // What the review removed is its veto, so the assertion is about the setup line rather
      // than the plot: the average may be shown, it may not decide which signals survive.
      const longSetup = code.split("\n").find((row) => row.startsWith("longSetup = "));
      expect(longSetup).toBeDefined();
      expect(longSetup).not.toContain("longMa");
      expect(longSetup).not.toContain("adxValue");
    });

    // The "Signal frequency" dropdown is a macro: picking a value overwrites the cooldown, the
    // volume multiplier and the ADX threshold at once. A preset that names one is claiming to be
    // in that state. This one has no ADX gate at all, so no value on that dropdown is true of it,
    // and naming "selective" would put the opposite of its settings on the form.
    it("does not claim a signal-frequency macro it is not in", () => {
      const preset = presets.find((item) => item.presetId === "selective_multi_timeframe") as StrategyConfig;
      expect(preset.sensitivity).toBe(defaultConfig.sensitivity);
      expect(preset.momentum.adxEnabled).toBe(false);
    });

    // 4H Swing Trend's review found its SMA-200 was vetoing nothing — switching it off moved 364
    // trades to 366 — while every other filter was load-bearing. And at 2.2 trades per symbol per
    // month it is the sparsest preset in the set, which the product states rather than leaving a
    // reader to conclude from a quiet chart that the indicator is broken.
    it("keeps 4H Swing Trend's redundant filter off and its sparseness declared", () => {
      const preset = presets.find((item) => item.presetId === "swing_trend_4h") as StrategyConfig;
      expect(preset.trend.longMaEnabled).toBe(false);
      expect(preset.tradesPerMonth).toBe(2.2);

      const explanation = explainConfig(preset).join(" ");
      expect(explanation).toContain("2.2 signals per symbol per month");
      expect(explanation).toContain("deliberately selective");
      // The filter list must not advertise a gate the script no longer applies.
      expect(explanation).not.toContain("SMA 200");
    });
  });

  describe("which profile the script opens with", () => {
    const preset = presets.find((item) => item.presetId === "breakout_momentum") as StrategyConfig;

    it("defaults to the win-rate profile when nothing was chosen", () => {
      expect(preset.activeProfile).toBeUndefined();
      expect(indicator(preset)).toContain(`profileMode = input.string("${WIN_RATE}"`);
    });

    it("opens on the money profile when that was chosen", () => {
      const code = indicator({ ...preset, activeProfile: "money" });
      expect(code).toContain(`profileMode = input.string("${MONEY}"`);
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
        expect(code).toContain(`? ${asFloat(preset.risk.riskReward)} :`);
        expect(code).toContain(`? ${asFloat(preset.winRateProfile!.riskReward)} :`);
      }
    });
  });
});
