import { summarizeTrades } from "./backtest-tools.mjs";

export const VALIDATION_QUARTERS = Object.freeze([
  ["2023-Q1", "2023-01-01T00:00:00.000Z", "2023-04-01T00:00:00.000Z"],
  ["2023-Q2", "2023-04-01T00:00:00.000Z", "2023-07-01T00:00:00.000Z"],
  ["2023-Q3", "2023-07-01T00:00:00.000Z", "2023-10-01T00:00:00.000Z"],
  ["2023-Q4", "2023-10-01T00:00:00.000Z", "2024-01-01T00:00:00.000Z"],
  ["2024-Q1", "2024-01-01T00:00:00.000Z", "2024-04-01T00:00:00.000Z"],
  ["2024-Q2", "2024-04-01T00:00:00.000Z", "2024-07-01T00:00:00.000Z"],
  ["2024-Q3", "2024-07-01T00:00:00.000Z", "2024-10-01T00:00:00.000Z"],
  ["2024-Q4", "2024-10-01T00:00:00.000Z", "2025-01-01T00:00:00.000Z"]
].map(([id, start, endExclusive]) => Object.freeze({
  id,
  start: Date.parse(start),
  endExclusive: Date.parse(endExclusive)
})));

export const PARAMETER_NEIGHBORS = Object.freeze([
  { id: "ema-fast-45", parameters: { emaFast: 45 } },
  { id: "ema-fast-55", parameters: { emaFast: 55 } },
  { id: "ema-slow-180", parameters: { emaSlow: 180 } },
  { id: "ema-slow-220", parameters: { emaSlow: 220 } },
  { id: "donchian-18", parameters: { donchianLookback: 18 } },
  { id: "donchian-22", parameters: { donchianLookback: 22 } },
  { id: "atr-floor-0.0045", parameters: { atrFloor: 0.0045 } },
  { id: "atr-floor-0.0055", parameters: { atrFloor: 0.0055 } },
  { id: "initial-stop-2.25", parameters: { initialStopAtr: 2.25 } },
  { id: "initial-stop-2.75", parameters: { initialStopAtr: 2.75 } },
  { id: "trailing-stop-2.70", parameters: { trailingStopAtr: 2.7 } },
  { id: "trailing-stop-3.30", parameters: { trailingStopAtr: 3.3 } }
]);

export function buildQuarterReports(trades) {
  return VALIDATION_QUARTERS.map((quarter) => {
    const quarterTrades = trades.filter(
      (trade) => trade.exit_timestamp >= quarter.start && trade.exit_timestamp < quarter.endExclusive
    );
    return {
      id: quarter.id,
      start: new Date(quarter.start).toISOString(),
      end_exclusive: new Date(quarter.endExclusive).toISOString(),
      metrics: summarizeTrades(quarterTrades)
    };
  });
}

export function evaluateQuarterGate(quarters) {
  const positive = quarters.filter((quarter) => {
    const expectancy = quarter.metrics.net_expectancy;
    return expectancy !== null && expectancy > 0;
  }).length;
  return {
    positive_quarters: positive,
    total_quarters: quarters.length,
    required_positive_quarters: 5,
    passed: quarters.length === 8 && positive >= 5
  };
}

export function evaluateSymbolDistribution(symbolReports) {
  const positiveSymbols = symbolReports
    .filter((report) => report.metrics.total_net_pnl > 0)
    .map((report) => ({ symbol: report.symbol, net: report.metrics.total_net_pnl }));
  const positiveProfitSum = positiveSymbols.reduce((sum, item) => sum + item.net, 0);
  const largest = positiveSymbols.reduce(
    (current, item) => (item.net > current.net ? item : current),
    { symbol: null, net: 0 }
  );
  const largestShare = positiveProfitSum > 0 ? largest.net / positiveProfitSum : null;
  const aggregateNet = symbolReports.reduce((sum, report) => sum + report.metrics.total_net_pnl, 0);

  return {
    aggregate_net_pnl: aggregateNet,
    positive_symbol_profit_sum: positiveProfitSum,
    largest_positive_contributor: largest.symbol,
    largest_positive_contribution_share: largestShare,
    maximum_allowed_share: 0.6,
    passed: aggregateNet > 0 && largestShare !== null && largestShare <= 0.6
  };
}

export function evaluateDoubledCostGate(metrics) {
  const profitFactor = metrics.profit_factor;
  return {
    total_net_pnl: metrics.total_net_pnl,
    profit_factor: profitFactor,
    minimum_profit_factor: 1,
    passed: metrics.total_net_pnl >= 0 && profitFactor !== null && profitFactor >= 1
  };
}

export function median(values) {
  if (values.length === 0) return null;
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 0
    ? (ordered[middle - 1] + ordered[middle]) / 2
    : ordered[middle];
}

export function evaluateNeighborhoodGate(neighborReports) {
  const positiveNeighbors = neighborReports.filter(
    (report) => report.metrics.closed_trades > 0 && report.metrics.total_net_pnl > 0
  ).length;
  const definedProfitFactors = neighborReports
    .map((report) => report.metrics.profit_factor)
    .filter((value) => value !== null && Number.isFinite(value));
  const medianProfitFactor = median(definedProfitFactors);
  const belowPointNine = neighborReports.filter((report) => {
    const profitFactor = report.metrics.profit_factor;
    return profitFactor !== null && profitFactor < 0.9;
  }).length;

  return {
    positive_neighbors: positiveNeighbors,
    total_neighbors: neighborReports.length,
    required_positive_neighbors: 7,
    median_profit_factor: medianProfitFactor,
    minimum_median_profit_factor: 1,
    neighbors_below_0_90: belowPointNine,
    maximum_neighbors_below_0_90: 3,
    passed:
      neighborReports.length === 12 &&
      positiveNeighbors >= 7 &&
      medianProfitFactor !== null &&
      medianProfitFactor >= 1 &&
      belowPointNine <= 3
  };
}

export function evaluateOverallRobustness(gates) {
  const passed =
    gates.symbol_distribution.passed &&
    gates.chronological_blocks.passed &&
    gates.doubled_costs.passed &&
    gates.parameter_neighborhood.passed;
  return {
    passed,
    classification: passed ? "ROBUSTNESS_PASS" : "ROBUSTNESS_FAIL"
  };
}
