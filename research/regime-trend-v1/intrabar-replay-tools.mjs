import { summarizeTrades } from "./backtest-tools.mjs";
import { FIVE_MINUTES_MS } from "./five-minute-data-tools.mjs";

export const INTRABAR_TARGETS_ATR = Object.freeze([0.5, 1, 1.5, 2]);
const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;
const COMMISSION = 0.001;
const SLIPPAGE = 0.0005;

function makeExitTrade(trade, timestamp, rawReference, reason, commission, slippage) {
  const exitFill = rawReference * (1 - slippage);
  const exitFee = exitFill * trade.quantity * commission;
  const grossPnl = (exitFill - trade.entry_fill) * trade.quantity;
  const netPnl = grossPnl - trade.entry_fee - exitFee;
  const entryNotional = trade.entry_fill * trade.quantity;
  return {
    ...trade,
    implementation_version: `${trade.implementation_version}:5m-replay`,
    exit_timestamp: timestamp,
    raw_exit_reference: rawReference,
    exit_fill: exitFill,
    exit_reason: reason,
    exit_fee: exitFee,
    gross_pnl: grossPnl,
    net_pnl: netPnl,
    net_return: netPnl / entryNotional,
    bars_held: Math.max(0, (timestamp - trade.entry_timestamp) / FOUR_HOURS_MS)
  };
}

function isBaselineStopExit(trade) {
  return trade.exit_reason === "initial_stop" || trade.exit_reason === "trailing_stop";
}

function replayEndExclusive(trade) {
  return isBaselineStopExit(trade)
    ? trade.exit_timestamp + FOUR_HOURS_MS
    : trade.exit_timestamp;
}

function normalizedStopUpdates(trade, stopUpdates, endExclusive) {
  return stopUpdates
    .filter(
      (update) =>
        update.timestamp >= trade.entry_timestamp &&
        update.timestamp < endExclusive
    )
    .map((update) => ({
      activation_timestamp: update.timestamp + FOUR_HOURS_MS,
      active_stop: update.activeStop
    }))
    .filter((update) => update.activation_timestamp < endExclusive)
    .sort((left, right) => left.activation_timestamp - right.activation_timestamp);
}

export function replayTrade5m(
  trade,
  stopUpdates,
  candleByTimestamp,
  targetAtr,
  { commission = COMMISSION, slippage = SLIPPAGE } = {}
) {
  if (!Number.isFinite(targetAtr) || targetAtr <= 0) throw new Error("targetAtr must be positive");
  const target = trade.entry_fill + targetAtr * trade.entry_atr;
  const endExclusive = replayEndExclusive(trade);
  const updates = normalizedStopUpdates(trade, stopUpdates, endExclusive);
  let activeStop = trade.initial_stop;
  let updateIndex = 0;

  for (
    let timestamp = trade.entry_timestamp;
    timestamp < endExclusive;
    timestamp += FIVE_MINUTES_MS
  ) {
    while (
      updateIndex < updates.length &&
      updates[updateIndex].activation_timestamp <= timestamp
    ) {
      activeStop = Math.max(activeStop, updates[updateIndex].active_stop);
      updateIndex += 1;
    }

    const candle = candleByTimestamp.get(timestamp);
    if (!candle) {
      return {
        classification: "DATA_GAP",
        target_atr: targetAtr,
        target,
        timestamp,
        lower_trade: trade,
        upper_trade: trade
      };
    }

    if (candle.open <= activeStop) {
      const stopped = makeExitTrade(
        trade,
        timestamp,
        candle.open,
        "intrabar_stop_gap",
        commission,
        slippage
      );
      return {
        classification: "STOP_FIRST",
        target_atr: targetAtr,
        target,
        timestamp,
        active_stop: activeStop,
        lower_trade: stopped,
        upper_trade: stopped
      };
    }

    if (candle.open >= target) {
      const targeted = makeExitTrade(
        trade,
        timestamp,
        target,
        "intrabar_target_gap",
        commission,
        slippage
      );
      return {
        classification: "TARGET_FIRST",
        target_atr: targetAtr,
        target,
        timestamp,
        active_stop: activeStop,
        lower_trade: targeted,
        upper_trade: targeted
      };
    }

    const stopTouched = candle.low <= activeStop;
    const targetTouched = candle.high >= target;

    if (stopTouched && targetTouched) {
      const stopped = makeExitTrade(
        trade,
        timestamp,
        activeStop,
        "intrabar_ambiguous_stop_bound",
        commission,
        slippage
      );
      const targeted = makeExitTrade(
        trade,
        timestamp,
        target,
        "intrabar_ambiguous_target_bound",
        commission,
        slippage
      );
      return {
        classification: "AMBIGUOUS_SAME_5M",
        target_atr: targetAtr,
        target,
        timestamp,
        active_stop: activeStop,
        lower_trade: stopped,
        upper_trade: targeted
      };
    }

    if (stopTouched) {
      const stopped = makeExitTrade(
        trade,
        timestamp,
        activeStop,
        "intrabar_stop",
        commission,
        slippage
      );
      return {
        classification: "STOP_FIRST",
        target_atr: targetAtr,
        target,
        timestamp,
        active_stop: activeStop,
        lower_trade: stopped,
        upper_trade: stopped
      };
    }

    if (targetTouched) {
      const targeted = makeExitTrade(
        trade,
        timestamp,
        target,
        "intrabar_target",
        commission,
        slippage
      );
      return {
        classification: "TARGET_FIRST",
        target_atr: targetAtr,
        target,
        timestamp,
        active_stop: activeStop,
        lower_trade: targeted,
        upper_trade: targeted
      };
    }
  }

  if (isBaselineStopExit(trade)) {
    return {
      classification: "DATA_MISMATCH",
      target_atr: targetAtr,
      target,
      timestamp: trade.exit_timestamp,
      active_stop: activeStop,
      lower_trade: trade,
      upper_trade: trade
    };
  }

  return {
    classification: "BASELINE_EXIT",
    target_atr: targetAtr,
    target,
    timestamp: trade.exit_timestamp,
    lower_trade: trade,
    upper_trade: trade
  };
}

export function summarizeReplayResults(baselineTrades, results) {
  const counts = {
    TARGET_FIRST: 0,
    STOP_FIRST: 0,
    AMBIGUOUS_SAME_5M: 0,
    BASELINE_EXIT: 0,
    DATA_GAP: 0,
    DATA_MISMATCH: 0
  };
  for (const result of results) counts[result.classification] += 1;

  const lowerTrades = results.map((result) => result.lower_trade);
  const upperTrades = results.map((result) => result.upper_trade);
  const baseline = summarizeTrades(baselineTrades);
  const lower = summarizeTrades(lowerTrades);
  const upper = summarizeTrades(upperTrades);

  return {
    baseline_metrics: baseline,
    lower_bound_metrics: lower,
    upper_bound_metrics: upper,
    lower_bound_net_change: lower.total_net_pnl - baseline.total_net_pnl,
    upper_bound_net_change: upper.total_net_pnl - baseline.total_net_pnl,
    counts,
    fully_resolved:
      counts.DATA_GAP === 0 &&
      counts.DATA_MISMATCH === 0 &&
      counts.AMBIGUOUS_SAME_5M === 0,
    target_first_baseline_winners: results.filter(
      (result, index) => result.classification === "TARGET_FIRST" && baselineTrades[index].net_pnl > 0
    ).length,
    target_first_baseline_losers: results.filter(
      (result, index) => result.classification === "TARGET_FIRST" && baselineTrades[index].net_pnl <= 0
    ).length,
    stop_first_baseline_winners: results.filter(
      (result, index) => result.classification === "STOP_FIRST" && baselineTrades[index].net_pnl > 0
    ).length,
    stop_first_baseline_losers: results.filter(
      (result, index) => result.classification === "STOP_FIRST" && baselineTrades[index].net_pnl <= 0
    ).length,
    ambiguous_timestamps: results
      .filter((result) => result.classification === "AMBIGUOUS_SAME_5M")
      .map((result) => result.timestamp),
    data_gap_timestamps: results
      .filter((result) => result.classification === "DATA_GAP")
      .map((result) => result.timestamp),
    data_mismatch_timestamps: results
      .filter((result) => result.classification === "DATA_MISMATCH")
      .map((result) => result.timestamp)
  };
}
