import { describe, expect, it } from "vitest";
import { compilePine } from "../lib/compiler";
import { presets } from "../lib/presets";
import { defaultConfig } from "../lib/defaults";
import { toPublicIndicatorConfig } from "../lib/public-indicator-config";
import { declares } from "./helpers/pine-input";
import type { StrategyConfig } from "../lib/types";

const indicator = (config: StrategyConfig) => compilePine(toPublicIndicatorConfig(config));

const countable = presets.filter(
  (preset) =>
    preset.direction !== "spot_buy_exit" &&
    preset.researchProfile === undefined &&
    preset.risk.stopMode !== "none" &&
    preset.risk.takeProfitMode !== "none"
);

describe("outcome counter", () => {
  it("covers every preset that defines both a stop and a target", () => {
    expect(countable).toHaveLength(8);
    expect(presets).toHaveLength(9);
  });

  for (const preset of countable) {
    describe(preset.name, () => {
      const code = indicator(preset);

      it("declares the counter state", () => {
        expect(code).toContain("var int riskWinCount = 0");
        expect(code).toContain("var int riskLossCount = 0");
        expect(code).toContain("var float riskNetR = 0.0");
      });

      it("exposes a commission input", () => {
        expect(code).toContain(
          'costPerSide = input.float(0.01, "Commission + slippage per side (%)", minval=0, step=0.01)'
        );
      });

      it("charges both sides of the commission against every resolved trade", () => {
        expect(code).toContain(
          "outcomeR = outcomeRiskUnit > 0 ? outcomeGrossR - costPerSide / 100.0 * (riskEntry + outcomePrice) / outcomeRiskUnit : na"
        );
      });

      it("counts a win only when the trade is positive after costs", () => {
        expect(code).toContain("riskWinCount := riskWinCount + (countOutcome and outcomeR > 0 ? 1 : 0)");
        expect(code).toContain("riskLossCount := riskLossCount + (countOutcome and outcomeR <= 0 ? 1 : 0)");
      });

      // 2026 through the end of 2028, not every bar the chart holds: the count should reflect
      // the current market, and the upper bound has to stay ahead of today or the panel looks
      // frozen. Exclusive bound, hence 2029-01-01.
      it("counts only trades entered inside the measurement window", () => {
        expect(code).toContain('countFrom = input.time(timestamp("2026-01-01T00:00:00+0000"), "Count trades entered from")');
        expect(code).toContain('countUntil = input.time(timestamp("2029-01-01T00:00:00+0000"), "Count trades entered until")');
        expect(code).toContain(
          "countOutcome = not na(outcomeR) and not na(riskStartedTime) and riskStartedTime >= countFrom and riskStartedTime < countUntil"
        );
      });

      it("charges an ambiguous bar as a full -1R loss before costs", () => {
        expect(code).toContain("outcomeGrossR = riskAmbiguous ? -1.0 :");
      });

      it("renders the net win rate row", () => {
        expect(code).toContain('"Wins / Losses"');
        expect(code).toContain('"Win rate (net)"');
        expect(code).toContain("100.0 * riskWinCount / (riskWinCount + riskLossCount)");
      });

      it("reserves a dashboard row for every cell it writes", () => {
        const declared = code.match(
          /var table dashboard = table\.new\(position\.top_right, 2, (\d+), border_width=1/
        );
        expect(declared).not.toBeNull();
        const rows = Number(declared?.[1]);
        const used = [...code.matchAll(/table\.cell\(dashboard, \d+, (\d+),/g)].map((m) => Number(m[1]));
        expect(Math.max(...used)).toBe(rows - 1);
      });

      it("hides the dashboard behind a toggle", () => {
        expect(code).toContain('showDashboardPanel = input.bool(true, "Show dashboard panel")');
        expect(code).toContain("if barstate.islast and showDashboardPanel");
        expect(code).not.toContain("if barstate.islast\n");
      });
    });
  }

  it("scores an opposite-signal reversal by its realized sign after costs", () => {
    const code = indicator(presets[0]);
    expect(code).toContain('lastRiskOutcome := "REVERSED"');
    expect(code).toContain(
      "reversalR = reversalRiskUnit > 0 ? reversalGrossR - costPerSide / 100.0 * (riskEntry + close) / reversalRiskUnit : na"
    );
    expect(code).toContain("riskWinCount := riskWinCount + (countReversal and reversalR > 0 ? 1 : 0)");
    expect(code).toContain("riskLossCount := riskLossCount + (countReversal and reversalR <= 0 ? 1 : 0)");
    expect(code).toContain(
      "countReversal = not na(reversalR) and not na(riskStartedTime) and riskStartedTime >= countFrom and riskStartedTime < countUntil"
    );
  });

  it("counts every closed trade exactly once", () => {
    const code = indicator(presets[0]);
    const increments = [...code.matchAll(/risk(?:Win|Loss)Count := /g)];
    // two resolution increments plus two reversal increments
    expect(increments).toHaveLength(4);
  });

  it("stays out of a custom spot config that has no stop and no target", () => {
    const spot: StrategyConfig = {
      ...defaultConfig,
      style: "spot",
      direction: "spot_buy_exit",
      risk: { ...defaultConfig.risk, stopMode: "none", takeProfitMode: "none" }
    };
    const code = indicator(spot);
    expect(code).not.toContain("riskWinCount");
    expect(code).not.toContain('"Win rate (net)"');
  });

  it("stays out of a config with no dashboard", () => {
    const code = indicator({
      ...defaultConfig,
      execution: { ...defaultConfig.execution, showDashboard: false }
    });
    expect(code).not.toContain("riskWinCount");
    expect(code).not.toContain("showDashboardPanel");
  });
});

describe("realistic entry fill", () => {
  for (const preset of countable) {
    describe(preset.name, () => {
      const code = indicator(preset);

      it("arms a pending order on the signal bar instead of entering", () => {
        expect(code).toContain("var int pendingDirection = 0");
        expect(code).toContain("var float pendingRisk = na");
        expect(code).toContain("if acceptedLongSignal and riskDirection == 0\n    pendingDirection := 1");
      });

      it("fills a market order at the next candle open", () => {
        expect(code).toContain('entryUsesLimit = entryType == "Limit (pullback)"');
        expect(code).toContain("longFillPrice = entryUsesLimit ? math.min(open, pendingLimit) : open");
        expect(code).toContain(
          "longFillReady = pendingDirection == 1 and riskDirection == 0 and pendingRisk > 0 and (not entryUsesLimit or low <= pendingLimit)"
        );
        expect(code).toContain("if longFillReady\n    riskEntry := longFillPrice");
        expect(code).not.toContain("riskEntry := close");
      });

      it("freezes the stop distance at the signal bar and applies it to the fill price", () => {
        expect(code).toContain("    riskStop := longFillPrice - pendingRisk");
        if (preset.risk.stopMode === "atr") {
          expect(code).toContain("    pendingRisk := atrValue * atrMultiple");
        }
        if (preset.risk.takeProfitMode === "risk_reward") {
          expect(code).toContain("    riskTarget := longFillPrice + pendingRisk * riskReward");
        }
      });

      it("lets the fill candle itself resolve the trade", () => {
        expect(code).toContain(
          "riskCanResolve = riskDirection != 0 and not na(riskStartedBar) and bar_index >= riskStartedBar"
        );
      });

      it("clears the pending order once it fills", () => {
        expect(code).toContain("    pendingDirection := 0\n    pendingRisk := na");
      });
    });
  }

  it("fills a short the same way", () => {
    const code = indicator(presets[0]);
    expect(code).toContain("if acceptedShortSignal and riskDirection == 0\n    pendingDirection := -1");
    expect(code).toContain("shortFillPrice = entryUsesLimit ? math.max(open, pendingLimit) : open");
    expect(code).toContain(
      "shortFillReady = pendingDirection == -1 and riskDirection == 0 and pendingRisk > 0 and (not entryUsesLimit or high >= pendingLimit)"
    );
    expect(code).toContain("    riskStop := shortFillPrice + pendingRisk");
  });

  it("does not arm a short in a long-only preset", () => {
    const longOnly: StrategyConfig = { ...defaultConfig, direction: "long_only" };
    const code = indicator(longOnly);
    expect(code).toContain("pendingDirection := 1");
    expect(code).not.toContain("pendingDirection := -1");
  });

  it("fills before the reversal check so a filled bar can also reverse", () => {
    const code = indicator(presets[0]);
    const fill = code.indexOf("if longFillReady");
    const reversal = code.indexOf("oppositeSignalReversal = ");
    const arm = code.indexOf("if acceptedLongSignal and riskDirection == 0");
    expect(fill).toBeGreaterThan(-1);
    expect(fill).toBeLessThan(reversal);
    expect(reversal).toBeLessThan(arm);
  });
});

describe("exit management reaches the generated script", () => {
  const countable2 = presets.filter(
    (preset) =>
      preset.direction !== "spot_buy_exit" &&
      preset.researchProfile === undefined &&
      preset.risk.stopMode !== "none" &&
      preset.risk.takeProfitMode !== "none"
  );

  for (const preset of countable2) {
    describe(preset.name, () => {
      const code = indicator(preset);

      // A preset with a win-rate profile renames the declaration and redefines the plain
      // name over it, so the assertion accepts either spelling: what matters is that the
      // preset's own value is the one sitting in the input.
      it("exposes break-even and trailing inputs", () => {
        expect(code).toMatch(declares("breakEvenAtR", preset.risk.breakEvenAtR, "Break-even at (R), 0 = off"));
        expect(code).toMatch(declares("trailStartR", preset.risk.trailStartR, "Trail starts at (R), 0 = off"));
        expect(code).toMatch(declares("trailDistanceR", preset.risk.trailDistanceR, "Trail distance (R)"));
      });

      it("freezes the risk unit at the fill and releases it on close", () => {
        expect(code).toContain("var float riskUnit = na");
        expect(code).toContain("    riskUnit := pendingRisk");
        expect(code).toContain("    riskUnit := na");
      });

      it("scores the outcome against the risk taken, not the moved stop", () => {
        expect(code).toContain("outcomeRiskUnit = riskUnit");
        expect(code).not.toContain("outcomeRiskUnit = riskDirection == 1 ? riskEntry - riskStop");
      });

      it("only ever moves a stop in the trade's favour", () => {
        expect(code).toContain(
          "        riskStop := riskDirection == 1 ? math.max(riskStop, riskEntry) : math.min(riskStop, riskEntry)"
        );
        expect(code).toContain(
          "        riskStop := riskDirection == 1 ? math.max(riskStop, riskTrailed) : math.min(riskStop, riskTrailed)"
        );
      });

      it("manages the stop after the resolution check, never before", () => {
        const resolve = code.indexOf("if riskCanResolve and (riskStopHit or riskTargetHit)");
        const manage = code.indexOf("// === Stop management ===");
        expect(resolve).toBeGreaterThan(-1);
        expect(manage).toBeGreaterThan(resolve);
      });
    });
  }
});
