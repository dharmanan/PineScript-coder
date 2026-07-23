import { describe, expect, it } from "vitest";
import {
  evaluateDoubledCostGate,
  evaluateNeighborhoodGate,
  evaluateOverallRobustness,
  evaluateQuarterGate,
  evaluateSymbolDistribution,
  median
} from "../research/regime-trend-v1/robustness-tools.mjs";

function metrics(overrides: Record<string, number | null> = {}) {
  return {
    closed_trades: 10,
    winning_trades: 4,
    losing_trades: 6,
    win_rate: 0.4,
    total_net_pnl: 1,
    average_net_pnl: 0.1,
    net_expectancy: 0.1,
    gross_profit: 2,
    gross_loss: 1,
    profit_factor: 2,
    max_drawdown_normalized_units: 0.5,
    ...overrides
  };
}

describe("Regime Trend v1 robustness gates", () => {
  it("requires five positive validation quarters", () => {
    const passing = Array.from({ length: 8 }, (_, index) => ({
      metrics: metrics({ net_expectancy: index < 5 ? 0.1 : -0.1 })
    }));
    const failing = Array.from({ length: 8 }, (_, index) => ({
      metrics: metrics({ net_expectancy: index < 4 ? 0.1 : -0.1 })
    }));
    expect(evaluateQuarterGate(passing).passed).toBe(true);
    expect(evaluateQuarterGate(failing).passed).toBe(false);
  });

  it("rejects symbol concentration above sixty percent", () => {
    const passing = evaluateSymbolDistribution([
      { symbol: "BTCUSDT", metrics: metrics({ total_net_pnl: 0.5 }) },
      { symbol: "ETHUSDT", metrics: metrics({ total_net_pnl: 0.4 }) },
      { symbol: "BNBUSDT", metrics: metrics({ total_net_pnl: -0.1 }) }
    ]);
    const failing = evaluateSymbolDistribution([
      { symbol: "BTCUSDT", metrics: metrics({ total_net_pnl: 0.9 }) },
      { symbol: "ETHUSDT", metrics: metrics({ total_net_pnl: 0.1 }) },
      { symbol: "BNBUSDT", metrics: metrics({ total_net_pnl: -0.2 }) }
    ]);
    expect(passing.passed).toBe(true);
    expect(failing.passed).toBe(false);
  });

  it("requires non-negative doubled-cost net and PF at least one", () => {
    expect(evaluateDoubledCostGate(metrics({ total_net_pnl: 0, profit_factor: 1 })).passed).toBe(true);
    expect(evaluateDoubledCostGate(metrics({ total_net_pnl: -0.01, profit_factor: 1.1 })).passed).toBe(false);
    expect(evaluateDoubledCostGate(metrics({ total_net_pnl: 0.1, profit_factor: 0.99 })).passed).toBe(false);
  });

  it("applies the frozen twelve-neighbor thresholds", () => {
    const passing = Array.from({ length: 12 }, (_, index) => ({
      metrics: metrics({ total_net_pnl: index < 8 ? 0.1 : -0.1, profit_factor: index < 10 ? 1.05 : 0.85 })
    }));
    const failing = Array.from({ length: 12 }, (_, index) => ({
      metrics: metrics({ total_net_pnl: index < 6 ? 0.1 : -0.1, profit_factor: 0.8 })
    }));
    expect(evaluateNeighborhoodGate(passing).passed).toBe(true);
    expect(evaluateNeighborhoodGate(failing).passed).toBe(false);
  });

  it("requires every robustness gate for an overall pass", () => {
    const gates = {
      symbol_distribution: { passed: true },
      chronological_blocks: { passed: true },
      doubled_costs: { passed: true },
      parameter_neighborhood: { passed: true }
    };
    expect(evaluateOverallRobustness(gates).classification).toBe("ROBUSTNESS_PASS");
    expect(evaluateOverallRobustness({ ...gates, doubled_costs: { passed: false } }).classification)
      .toBe("ROBUSTNESS_FAIL");
  });

  it("calculates median without selecting a best neighbor", () => {
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([3, 1, 2])).toBe(2);
    expect(median([])).toBeNull();
  });
});
