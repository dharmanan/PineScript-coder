import { describe, expect, it } from "vitest";
import { presets } from "../lib/presets";
import { defaultConfig } from "../lib/defaults";
import { buildBehaviorPlan } from "../lib/behavior-plan";
import type { StrategyConfig } from "../lib/types";
import {
  buildSignals, knownFilterIds, knownTriggerIds, simulate, summarize
} from "../research/preset-sweep/engine.mjs";
import { ema, rsi, sma } from "../research/preset-sweep/indicators.mjs";
import { aggregate, splitContiguous } from "../research/preset-sweep/data.mjs";

const FIVE = 5 * 60 * 1000;

const candle = (index: number, open: number, high: number, low: number, close: number, volume = 1000) => ({
  timestamp: index * FIVE, open, high, low, close, volume
});

describe("sweep covers the whole plan", () => {
  it("has a predicate for every filter any preset can produce", () => {
    const known = new Set(knownFilterIds());
    const seen = new Set<string>();
    for (const preset of [...presets, defaultConfig]) {
      for (const filter of buildBehaviorPlan(preset).entry.filters) {
        seen.add(filter.id);
        expect(known.has(filter.id), `no predicate for filter "${filter.id}"`).toBe(true);
      }
    }
    expect(seen.size).toBeGreaterThan(5);
  });

  it("has a predicate for every entry trigger the type system allows", () => {
    const known = new Set(knownTriggerIds());
    const triggers: StrategyConfig["entryTrigger"][] = [
      "trend_state", "ema_cross", "pullback_reclaim", "vwap_reclaim", "supertrend_flip", "breakout"
    ];
    for (const entryTrigger of triggers) {
      const plan = buildBehaviorPlan({ ...defaultConfig, entryTrigger });
      expect(known.has(plan.entry.trigger.id), `no predicate for trigger "${entryTrigger}"`).toBe(true);
    }
  });
});

describe("indicators match Pine warm-up semantics", () => {
  it("returns null until an SMA window is full", () => {
    expect(sma([1, 2, 3, 4], 3)).toEqual([null, null, 2, 3]);
  });

  it("seeds the EMA from the SMA, exactly like ta.ema", () => {
    const values = [1, 2, 3, 4, 5];
    const result = ema(values, 3);
    expect(result[0]).toBeNull();
    expect(result[1]).toBeNull();
    expect(result[2]).toBeCloseTo(2, 10);
    expect(result[3]).toBeCloseTo(0.5 * 4 + 0.5 * 2, 10);
  });

  it("reports a pure uptrend as RSI 100", () => {
    const values = Array.from({ length: 40 }, (_, index) => 100 + index);
    expect(rsi(values, 14).at(-1)).toBeCloseTo(100, 6);
  });
});

describe("aggregation", () => {
  it("builds a higher-timeframe candle only from a complete aligned group", () => {
    const source = [0, 1, 2, 3, 4, 5].map((index) => candle(index, 10 + index, 20 + index, index, 15 + index, 100));
    const result = aggregate(source, 3);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ timestamp: 0, open: 10, high: 22, low: 0, close: 17, volume: 300 });
  });

  it("drops an incomplete group instead of inventing a candle", () => {
    const source = [candle(0, 10, 11, 9, 10), candle(2, 10, 11, 9, 10), candle(3, 10, 11, 9, 10)];
    expect(aggregate(source, 3)).toHaveLength(0);
  });

  it("steps over a short maintenance gap instead of restarting warm-up", () => {
    const source = [candle(0, 1, 1, 1, 1), candle(1, 1, 1, 1, 1), candle(5, 1, 1, 1, 1)];
    expect(splitContiguous(source, FIVE).map((segment) => segment.length)).toEqual([3]);
  });

  it("splits on an outage longer than the bridging tolerance", () => {
    const beyondTolerance = (24 * 60) / 5 + 2;
    const source = [candle(0, 1, 1, 1, 1), candle(1, 1, 1, 1, 1), candle(beyondTolerance, 1, 1, 1, 1)];
    expect(splitContiguous(source, FIVE).map((segment) => segment.length)).toEqual([2, 1]);
  });

  it("honours an explicit bridging tolerance", () => {
    const source = [candle(0, 1, 1, 1, 1), candle(1, 1, 1, 1, 1), candle(5, 1, 1, 1, 1)];
    expect(splitContiguous(source, FIVE, FIVE).map((segment) => segment.length)).toEqual([2, 1]);
  });
});

describe("trade lifecycle mirrors the generated indicator", () => {
  const config: StrategyConfig = {
    ...defaultConfig,
    direction: "long_only",
    risk: { ...defaultConfig.risk, stopMode: "percent", stopPercent: 10, takeProfitMode: "risk_reward", riskReward: 2 }
  };
  const plan = buildBehaviorPlan(config);

  const run = (candles: ReturnType<typeof candle>[], long: boolean[], costPerSide = 0) => {
    const signals = buildSignals(config, plan, candles);
    return simulate(config, candles, { ...signals, long, short: candles.map(() => false) }, { costPerSide });
  };

  const flat = Array.from({ length: 6 }, (_, index) => candle(index, 100, 100, 100, 100));

  it("fills at the next candle open, never the signal candle close", () => {
    const candles = [
      candle(0, 100, 100, 100, 100), candle(1, 100, 100, 100, 100),
      // signal candle closes at 100, next candle opens 10% higher
      candle(2, 100, 100, 100, 100), candle(3, 110, 110, 110, 110),
      candle(4, 110, 110, 80, 85)
    ];
    const long = candles.map((_, index) => index === 2);
    const trades = run(candles, long);
    expect(trades).toHaveLength(1);
    expect(trades[0].entryIndex).toBe(3);
    expect(trades[0].entry).toBe(110);
    expect(trades[0].entry).not.toBe(candles[2].close);
    // The 10% risk distance is frozen on the signal candle, then applied to the fill.
    expect(trades[0].stop).toBeCloseTo(100, 10);
  });

  it("lets the fill candle itself resolve the trade", () => {
    const candles = [
      candle(0, 100, 100, 100, 100), candle(1, 100, 100, 100, 100),
      candle(2, 100, 100, 100, 100), candle(3, 100, 100, 80, 85)
    ];
    const long = candles.map((_, index) => index === 2);
    const trades = run(candles, long);
    expect(trades).toHaveLength(1);
    expect(trades[0].entryIndex).toBe(3);
    expect(trades[0].exitIndex).toBe(3);
    expect(trades[0].reason).toBe("stop");
  });

  it("takes a target hit as +riskReward before costs", () => {
    const candles = [
      candle(0, 100, 100, 100, 100), candle(1, 100, 100, 100, 100),
      candle(2, 100, 100, 100, 100), candle(3, 100, 100, 100, 100),
      candle(4, 100, 130, 100, 125)
    ];
    const long = candles.map((_, index) => index === 2);
    const trades = run(candles, long);
    expect(trades).toHaveLength(1);
    expect(trades[0].reason).toBe("target");
    expect(trades[0].entry).toBe(100);
    expect(trades[0].stop).toBeCloseTo(90, 10);
    expect(trades[0].target).toBeCloseTo(120, 10);
    expect(trades[0].grossR).toBeCloseTo(2, 10);
  });

  it("takes a stop hit as -1R before costs", () => {
    const candles = [
      candle(0, 100, 100, 100, 100), candle(1, 100, 100, 100, 100),
      candle(2, 100, 100, 100, 100), candle(3, 100, 100, 100, 100),
      candle(4, 100, 100, 85, 88)
    ];
    const long = candles.map((_, index) => index === 2);
    const trades = run(candles, long);
    expect(trades).toHaveLength(1);
    expect(trades[0].reason).toBe("stop");
    expect(trades[0].grossR).toBeCloseTo(-1, 10);
  });

  it("charges an ambiguous candle as a loss, never a win", () => {
    const candles = [
      candle(0, 100, 100, 100, 100), candle(1, 100, 100, 100, 100),
      candle(2, 100, 100, 100, 100), candle(3, 100, 100, 100, 100),
      candle(4, 100, 130, 85, 100)
    ];
    const long = candles.map((_, index) => index === 2);
    const trades = run(candles, long);
    expect(trades).toHaveLength(1);
    expect(trades[0].reason).toBe("ambiguous");
    expect(trades[0].grossR).toBeCloseTo(-1, 10);
  });

  it("charges both sides of the commission against the trade", () => {
    const candles = [
      candle(0, 100, 100, 100, 100), candle(1, 100, 100, 100, 100),
      candle(2, 100, 100, 100, 100), candle(3, 100, 100, 100, 100),
      candle(4, 100, 130, 100, 125)
    ];
    const long = candles.map((_, index) => index === 2);
    const trades = run(candles, long, 0.1);
    // entry 100, exit 120, risk unit 10 -> cost = 0.001 * 220 / 10 = 0.022R
    expect(trades[0].netR).toBeCloseTo(2 - 0.022, 10);
  });

  it("counts a win only when the trade survives costs", () => {
    const winner = summarize([{ netR: 0.01, grossR: 1 } as never]);
    const loser = summarize([{ netR: -0.01, grossR: 1 } as never]);
    expect(winner.wins).toBe(1);
    expect(loser.wins).toBe(0);
    expect(loser.losses).toBe(1);
  });

  it("does not open a second position while one is active", () => {
    const candles = Array.from({ length: 10 }, (_, index) => candle(index, 100, 101, 99, 100));
    const long = candles.map((_, index) => index === 2 || index === 4);
    const trades = run(candles, long);
    expect(trades).toHaveLength(0);
    const signals = buildSignals(config, plan, candles);
    const result = simulate(config, candles, { ...signals, long, short: candles.map(() => false) }, { costPerSide: 0 });
    expect(result.filter((trade: { entryIndex: number }) => trade.entryIndex === 5)).toHaveLength(0);
  });
});

describe("exit management", () => {
  const config: StrategyConfig = {
    ...defaultConfig,
    direction: "long_only",
    risk: { ...defaultConfig.risk, stopMode: "percent", stopPercent: 10, takeProfitMode: "risk_reward", riskReward: 5 }
  };
  const plan = buildBehaviorPlan(config);

  // entry 100, risk unit 10, stop 90, target 150
  const scenario = (...tail: ReturnType<typeof candle>[]) => [
    candle(0, 100, 100, 100, 100), candle(1, 100, 100, 100, 100),
    candle(2, 100, 100, 100, 100), candle(3, 100, 100, 100, 100),
    ...tail
  ];
  const run = (candles: ReturnType<typeof candle>[], options: Record<string, unknown>) => {
    const long = candles.map((_, index) => index === 2);
    const signals = buildSignals(config, plan, candles);
    return simulate(config, candles, { ...signals, long, short: candles.map(() => false) }, { costPerSide: 0, ...options });
  };

  it("without break-even a give-back is a full loss", () => {
    // reaches +1.5R, then falls to the original stop
    const trades = run(scenario(candle(4, 100, 115, 100, 110), candle(5, 110, 110, 85, 88)), {});
    expect(trades[0].reason).toBe("stop");
    expect(trades[0].grossR).toBeCloseTo(-1, 10);
  });

  it("break-even turns the same give-back into a scratch", () => {
    const trades = run(scenario(candle(4, 100, 115, 100, 110), candle(5, 110, 110, 85, 88)), { breakEvenAtR: 1 });
    expect(trades[0].reason).toBe("stop");
    expect(trades[0].grossR).toBeCloseTo(0, 10);
  });

  it("does not move the stop before the level is reached", () => {
    // only reaches +0.5R
    const trades = run(scenario(candle(4, 100, 105, 100, 103), candle(5, 103, 103, 85, 88)), { breakEvenAtR: 1 });
    expect(trades[0].grossR).toBeCloseTo(-1, 10);
  });

  it("a trailing stop banks part of a reversed run", () => {
    // reaches +3R, then reverses; trail keeps 3 - 1 = +2R
    const trades = run(scenario(candle(4, 100, 130, 100, 128), candle(5, 128, 128, 85, 88)), {
      trailStartR: 2, trailDistanceR: 1
    });
    expect(trades[0].reason).toBe("stop");
    expect(trades[0].grossR).toBeCloseTo(2, 10);
  });

  it("never moves a stop against the trade", () => {
    // a lower high after the peak must not pull the trailed stop back down
    const trades = run(
      scenario(candle(4, 100, 130, 100, 128), candle(5, 128, 129, 100, 105), candle(6, 105, 105, 85, 88)),
      { trailStartR: 2, trailDistanceR: 1 }
    );
    expect(trades[0].grossR).toBeCloseTo(2, 10);
  });
});

describe("trigger window", () => {
  const config: StrategyConfig = { ...defaultConfig, direction: "long_only", entryTrigger: "ema_cross" };
  const plan = buildBehaviorPlan(config);

  it("keeps a fired trigger alive for the configured number of candles", () => {
    const rising = Array.from({ length: 120 }, (_, index) => candle(index, 100 + index, 101 + index, 99 + index, 100 + index));
    const sameBar = buildSignals(config, plan, rising, { triggerWindow: 1 });
    const widened = buildSignals(config, plan, rising, { triggerWindow: 10 });
    const count = (marks: boolean[]) => marks.filter(Boolean).length;
    expect(count(widened.long)).toBeGreaterThanOrEqual(count(sameBar.long));
  });

  it("treats a window of one as the original same-bar rule", () => {
    const rising = Array.from({ length: 120 }, (_, index) => candle(index, 100 + index, 101 + index, 99 + index, 100 + index));
    const explicit = buildSignals(config, plan, rising, { triggerWindow: 1 });
    const implicit = buildSignals(config, plan, rising);
    expect(explicit.long).toEqual(implicit.long);
  });
});

describe("intrabar resolution", () => {
  const config: StrategyConfig = {
    ...defaultConfig,
    direction: "long_only",
    risk: { ...defaultConfig.risk, stopMode: "percent", stopPercent: 10, takeProfitMode: "risk_reward", riskReward: 2 }
  };
  const plan = buildBehaviorPlan(config);

  // entry 100 at candle 3, risk unit 10, stop 90, target 120
  const base = [
    candle(0, 100, 100, 100, 100), candle(1, 100, 100, 100, 100),
    candle(2, 100, 100, 100, 100), candle(3, 100, 100, 100, 100)
  ];
  const run = (candles: ReturnType<typeof candle>[], intrabar: ReturnType<typeof candle>[][] | null) => {
    const long = candles.map((_, index) => index === 2);
    const signals = buildSignals(config, plan, candles);
    return simulate(config, candles, { ...signals, long, short: candles.map(() => false) }, { costPerSide: 0, intrabar });
  };

  // one chart candle that touched both levels
  const both = [...base, candle(4, 100, 130, 85, 100)];

  it("charges a both-touched candle as a loss when nothing finer is available", () => {
    const trades = run(both, null);
    expect(trades[0].reason).toBe("ambiguous");
    expect(trades[0].grossR).toBeCloseTo(-1, 10);
  });

  it("awards the target when the finer candles show it came first", () => {
    const intrabar = [[base[0]], [base[1]], [base[2]], [base[3]], [
      candle(40, 100, 130, 100, 125), // target touched here
      candle(41, 125, 125, 85, 100)   // stop only afterwards
    ]];
    const trades = run(both, intrabar);
    expect(trades[0].reason).toBe("target");
    expect(trades[0].grossR).toBeCloseTo(2, 10);
  });

  it("keeps the loss when the finer candles show the stop came first", () => {
    const intrabar = [[base[0]], [base[1]], [base[2]], [base[3]], [
      candle(40, 100, 100, 85, 90),   // stop touched here
      candle(41, 90, 130, 90, 125)    // target only afterwards
    ]];
    const trades = run(both, intrabar);
    expect(trades[0].reason).toBe("stop");
    expect(trades[0].grossR).toBeCloseTo(-1, 10);
  });

  it("stays ambiguous when a single finer candle touched both", () => {
    const intrabar = [[base[0]], [base[1]], [base[2]], [base[3]], [candle(40, 100, 130, 85, 100)]];
    expect(run(both, intrabar)[0].reason).toBe("ambiguous");
  });
});

describe("close-confirmed stops", () => {
  const config: StrategyConfig = {
    ...defaultConfig,
    direction: "long_only",
    risk: {
      ...defaultConfig.risk, stopMode: "percent", stopPercent: 10,
      takeProfitMode: "risk_reward", riskReward: 2, stopTrigger: "close"
    }
  };
  const plan = buildBehaviorPlan(config);

  it("fills at the candle close, not at the untouched stop level", () => {
    // entry 100, stop 90; the candle closes at 80, well beyond the stop
    const candles = [
      candle(0, 100, 100, 100, 100), candle(1, 100, 100, 100, 100),
      candle(2, 100, 100, 100, 100), candle(3, 100, 100, 100, 100),
      candle(4, 100, 100, 78, 80)
    ];
    const long = candles.map((_, index) => index === 2);
    const signals = buildSignals(config, plan, candles);
    const trades = simulate(config, candles, { ...signals, long, short: candles.map(() => false) }, { costPerSide: 0 });
    expect(trades[0].reason).toBe("stop");
    expect(trades[0].exitPrice).toBe(80);
    // (80 - 100) / 10 = -2R, not the -1R a stop-level fill would have recorded
    expect(trades[0].grossR).toBeCloseTo(-2, 10);
  });

  it("ignores a wick that pierced the stop without closing beyond it", () => {
    const candles = [
      candle(0, 100, 100, 100, 100), candle(1, 100, 100, 100, 100),
      candle(2, 100, 100, 100, 100), candle(3, 100, 100, 100, 100),
      candle(4, 100, 100, 85, 95), candle(5, 95, 130, 95, 125)
    ];
    const long = candles.map((_, index) => index === 2);
    const signals = buildSignals(config, plan, candles);
    const trades = simulate(config, candles, { ...signals, long, short: candles.map(() => false) }, { costPerSide: 0 });
    expect(trades[0].reason).toBe("target");
  });
});
