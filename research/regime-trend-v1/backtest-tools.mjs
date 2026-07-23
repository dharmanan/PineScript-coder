import { FOUR_HOURS_MS, CSV_HEADER } from "./dataset-tools.mjs";

export const DEVELOPMENT_START_MS = Date.parse("2019-01-01T00:00:00.000Z");
export const DEVELOPMENT_END_EXCLUSIVE_MS = Date.parse("2023-01-01T00:00:00.000Z");
export const VALIDATION_START_MS = DEVELOPMENT_END_EXCLUSIVE_MS;
export const VALIDATION_END_EXCLUSIVE_MS = Date.parse("2025-01-01T00:00:00.000Z");

export const RESEARCH_PARTITIONS = Object.freeze([
  {
    id: "development",
    start: DEVELOPMENT_START_MS,
    endExclusive: DEVELOPMENT_END_EXCLUSIVE_MS
  },
  {
    id: "validation",
    start: VALIDATION_START_MS,
    endExclusive: VALIDATION_END_EXCLUSIVE_MS
  }
]);

export function parseCsvCandles(csv, options = {}) {
  const endExclusive = options.endExclusive ?? Number.POSITIVE_INFINITY;
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length < 2) throw new Error("CSV contains no candle rows");
  if (lines[0] !== CSV_HEADER) throw new Error(`Unexpected CSV header: ${lines[0]}`);

  const candles = [];
  for (let index = 1; index < lines.length; index += 1) {
    const columns = lines[index].split(",");
    if (columns.length !== 7) throw new Error(`Invalid CSV row ${index + 1}`);
    const [openTime, open, high, low, close, volume] = columns.map(Number);
    if ([openTime, open, high, low, close, volume].some((value) => !Number.isFinite(value))) {
      throw new Error(`Non-finite CSV value at row ${index + 1}`);
    }
    if (openTime >= endExclusive) break;
    candles.push({ timestamp: openTime, open, high, low, close, volume });
  }
  return candles;
}

export function splitContiguousCandles(candles, intervalMs = FOUR_HOURS_MS) {
  if (candles.length === 0) return [];
  const segments = [[candles[0]]];
  for (let index = 1; index < candles.length; index += 1) {
    const current = candles[index];
    const previous = candles[index - 1];
    if (current.timestamp - previous.timestamp === intervalMs) {
      segments.at(-1).push(current);
    } else {
      segments.push([current]);
    }
  }
  return segments;
}

export function filterPartition(candles, partition) {
  return candles.filter(
    (candle) => candle.timestamp >= partition.start && candle.timestamp < partition.endExclusive
  );
}

export function summarizeTrades(trades) {
  const ordered = [...trades].sort((left, right) => {
    if (left.exit_timestamp !== right.exit_timestamp) return left.exit_timestamp - right.exit_timestamp;
    return left.symbol.localeCompare(right.symbol);
  });

  let cumulative = 0;
  let peak = 0;
  let maxDrawdown = 0;
  let grossProfit = 0;
  let grossLoss = 0;
  let wins = 0;

  for (const trade of ordered) {
    cumulative += trade.net_pnl;
    peak = Math.max(peak, cumulative);
    maxDrawdown = Math.max(maxDrawdown, peak - cumulative);
    if (trade.net_pnl > 0) {
      grossProfit += trade.net_pnl;
      wins += 1;
    } else if (trade.net_pnl < 0) {
      grossLoss += Math.abs(trade.net_pnl);
    }
  }

  const count = ordered.length;
  return {
    closed_trades: count,
    winning_trades: wins,
    losing_trades: count - wins,
    win_rate: count === 0 ? null : wins / count,
    total_net_pnl: cumulative,
    average_net_pnl: count === 0 ? null : cumulative / count,
    net_expectancy: count === 0 ? null : cumulative / count,
    gross_profit: grossProfit,
    gross_loss: grossLoss,
    profit_factor: grossLoss === 0 ? (grossProfit > 0 ? null : 0) : grossProfit / grossLoss,
    max_drawdown_normalized_units: maxDrawdown
  };
}

export function buyAndHoldReturn(candles) {
  if (candles.length === 0) return null;
  return candles.at(-1).close / candles[0].open - 1;
}

const LEDGER_FIELDS = [
  "strategy_id",
  "implementation_version",
  "dataset_hash",
  "symbol",
  "timeframe",
  "direction",
  "signal_timestamp",
  "entry_timestamp",
  "raw_entry_open",
  "entry_fill",
  "entry_atr",
  "initial_stop",
  "exit_timestamp",
  "raw_exit_reference",
  "exit_fill",
  "exit_reason",
  "quantity",
  "entry_fee",
  "exit_fee",
  "gross_pnl",
  "net_pnl",
  "net_return",
  "bars_held"
];

export function tradeLedgerToCsv(trades) {
  const rows = trades.map((trade) => LEDGER_FIELDS.map((field) => trade[field]).join(","));
  return `${LEDGER_FIELDS.join(",")}\n${rows.join("\n")}${rows.length > 0 ? "\n" : ""}`;
}
