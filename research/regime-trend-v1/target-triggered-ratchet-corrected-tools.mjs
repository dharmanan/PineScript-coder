import { summarizeTrades } from "./backtest-tools.mjs";
import { FIVE_MINUTES_MS } from "./five-minute-data-tools.mjs";
import { solveRawFloor } from "./profit-protection-tools.mjs";
import { TARGET_TRIGGERED_RATCHET_CANDIDATES } from "./target-triggered-ratchet-tools.mjs";

export { TARGET_TRIGGERED_RATCHET_CANDIDATES };

const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;
const DEFAULT_COMMISSION = 0.001;
const DEFAULT_SLIPPAGE = 0.0005;
const EPSILON = 1e-12;

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
      activationTimestamp: update.timestamp + FOUR_HOURS_MS,
      activeStop: update.activeStop
    }))
    .filter((update) => update.activationTimestamp < endExclusive)
    .sort((left, right) => left.activationTimestamp - right.activationTimestamp);
}

function makeExitTrade(trade, timestamp, rawReference, reason, commission, slippage) {
  const exitFill = rawReference * (1 - slippage);
  const exitFee = exitFill * trade.quantity * commission;
  const grossPnl = (exitFill - trade.entry_fill) * trade.quantity;
  const netPnl = grossPnl - trade.entry_fee - exitFee;
  return {
    ...trade,
    implementation_version: `${trade.implementation_version}:5m-corrected`,
    exit_timestamp: timestamp,
    raw_exit_reference: rawReference,
    exit_fill: exitFill,
    exit_reason: reason,
    exit_fee: exitFee,
    gross_pnl: grossPnl,
    net_pnl: netPnl,
    net_return: netPnl / (trade.entry_fill * trade.quantity),
    bars_held: Math.max(0, (timestamp - trade.entry_timestamp) / FOUR_HOURS_MS)
  };
}

export function replayBaselineTrade5m(
  trade,
  stopUpdates,
  candleByTimestamp,
  { commission = DEFAULT_COMMISSION, slippage = DEFAULT_SLIPPAGE } = {}
) {
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
      updates[updateIndex].activationTimestamp <= timestamp
    ) {
      activeStop = Math.max(activeStop, updates[updateIndex].activeStop);
      updateIndex += 1;
    }

    const candle = candleByTimestamp.get(timestamp);
    if (!candle) {
      return {
        status: "DATA_GAP",
        exitKind: null,
        trade,
        timestamp,
        activeStop
      };
    }

    if (candle.open <= activeStop) {
      return {
        status: "RESOLVED",
        exitKind: "stop",
        trade: makeExitTrade(
          trade,
          timestamp,
          candle.open,
          "baseline_5m_stop_gap",
          commission,
          slippage
        ),
        timestamp,
        activeStop
      };
    }

    if (candle.low <= activeStop) {
      return {
        status: "RESOLVED",
        exitKind: "stop",
        trade: makeExitTrade(
          trade,
          timestamp,
          activeStop,
          "baseline_5m_stop",
          commission,
          slippage
        ),
        timestamp,
        activeStop
      };
    }
  }

  if (isBaselineStopExit(trade)) {
    return {
      status: "DATA_MISMATCH",
      exitKind: null,
      trade,
      timestamp: trade.exit_timestamp,
      activeStop
    };
  }

  return {
    status: "RESOLVED",
    exitKind: "trend_exit",
    trade,
    timestamp: trade.exit_timestamp,
    activeStop
  };
}

export function replayRatchetTrade5m(
  trade,
  stopUpdates,
  candleByTimestamp,
  candidate,
  { commission = DEFAULT_COMMISSION, slippage = DEFAULT_SLIPPAGE } = {}
) {
  const activationPrice = trade.entry_fill + candidate.activationAtr * trade.entry_atr;
  const ratchetFloor = solveRawFloor(trade, candidate.floorAtr, commission, slippage);
  const endExclusive = replayEndExclusive(trade);
  const updates = normalizedStopUpdates(trade, stopUpdates, endExclusive);
  let originalStop = trade.initial_stop;
  let updateIndex = 0;
  let activated = false;
  let ratchetActiveFrom = null;

  for (
    let timestamp = trade.entry_timestamp;
    timestamp < endExclusive;
    timestamp += FIVE_MINUTES_MS
  ) {
    while (
      updateIndex < updates.length &&
      updates[updateIndex].activationTimestamp <= timestamp
    ) {
      originalStop = Math.max(originalStop, updates[updateIndex].activeStop);
      updateIndex += 1;
    }

    const ratchetIsActive = ratchetActiveFrom !== null && ratchetActiveFrom <= timestamp;
    const combinedStop = ratchetIsActive
      ? Math.max(originalStop, ratchetFloor)
      : originalStop;

    const candle = candleByTimestamp.get(timestamp);
    if (!candle) {
      return {
        status: "DATA_GAP",
        exitKind: null,
        trade,
        activated,
        ratchetBinding: false,
        timestamp,
        originalStop,
        ratchetFloor
      };
    }

    if (candle.open <= combinedStop) {
      const ratchetBinding =
        ratchetIsActive &&
        ratchetFloor > originalStop + EPSILON &&
        candle.open > originalStop;
      return {
        status: "RESOLVED",
        exitKind: "stop",
        trade: makeExitTrade(
          trade,
          timestamp,
          candle.open,
          ratchetBinding ? "target_ratchet_gap" : "baseline_5m_stop_gap",
          commission,
          slippage
        ),
        activated,
        ratchetBinding,
        timestamp,
        originalStop,
        ratchetFloor
      };
    }

    if (candle.low <= combinedStop) {
      const ratchetBinding =
        ratchetIsActive && ratchetFloor > originalStop + EPSILON;
      return {
        status: "RESOLVED",
        exitKind: "stop",
        trade: makeExitTrade(
          trade,
          timestamp,
          combinedStop,
          ratchetBinding ? "target_ratchet_stop" : "baseline_5m_stop",
          commission,
          slippage
        ),
        activated,
        ratchetBinding,
        timestamp,
        originalStop,
        ratchetFloor
      };
    }

    const activationTouched =
      candle.open >= activationPrice || candle.high >= activationPrice;
    if (!activated && activationTouched) {
      activated = true;
      ratchetActiveFrom = timestamp + FIVE_MINUTES_MS;
    }
  }

  if (isBaselineStopExit(trade)) {
    return {
      status: "DATA_MISMATCH",
      exitKind: null,
      trade,
      activated,
      ratchetBinding: false,
      timestamp: trade.exit_timestamp,
      originalStop,
      ratchetFloor
    };
  }

  return {
    status: "RESOLVED",
    exitKind: "trend_exit",
    trade,
    activated,
    ratchetBinding: false,
    timestamp: trade.exit_timestamp,
    originalStop,
    ratchetFloor
  };
}

function sameResolvedExit(left, right) {
  return (
    left.exitKind === right.exitKind &&
    left.trade.exit_timestamp === right.trade.exit_timestamp &&
    Math.abs(left.trade.raw_exit_reference - right.trade.raw_exit_reference) <= EPSILON
  );
}

export function compareTradeWithRatchet5m(
  trade,
  stopUpdates,
  candleByTimestamp,
  candidate,
  costs
) {
  const baseline = replayBaselineTrade5m(trade, stopUpdates, candleByTimestamp, costs);
  const overlay = replayRatchetTrade5m(
    trade,
    stopUpdates,
    candleByTimestamp,
    candidate,
    costs
  );

  if (baseline.status === "DATA_MISMATCH" || overlay.status === "DATA_MISMATCH") {
    return {
      classification: "DATA_MISMATCH",
      baseline_trade: trade,
      overlay_trade: trade,
      baseline,
      overlay
    };
  }

  if (baseline.status === "DATA_GAP" || overlay.status === "DATA_GAP") {
    return {
      classification: "DATA_GAP",
      baseline_trade: trade,
      overlay_trade: trade,
      baseline,
      overlay
    };
  }

  if (overlay.ratchetBinding) {
    return {
      classification: "RATCHET_EXIT",
      baseline_trade: baseline.trade,
      overlay_trade: overlay.trade,
      baseline,
      overlay
    };
  }

  if (!sameResolvedExit(baseline, overlay)) {
    return {
      classification: "DATA_MISMATCH",
      baseline_trade: trade,
      overlay_trade: trade,
      baseline,
      overlay
    };
  }

  let classification;
  if (overlay.exitKind === "stop") {
    classification = overlay.activated
      ? "BASELINE_STOP_AFTER_ACTIVATION"
      : "BASELINE_STOP";
  } else {
    classification = overlay.activated
      ? "ACTIVATED_BASELINE_EXIT"
      : "NOT_ACTIVATED";
  }

  return {
    classification,
    baseline_trade: baseline.trade,
    overlay_trade: overlay.trade,
    baseline,
    overlay
  };
}

export function summarizeCorrectedRatchetCandidate(comparisons) {
  const baselineTrades = comparisons.map((item) => item.baseline_trade);
  const overlayTrades = comparisons.map((item) => item.overlay_trade);
  const baseline = summarizeTrades(baselineTrades);
  const overlay = summarizeTrades(overlayTrades);
  const counts = {
    RATCHET_EXIT: 0,
    BASELINE_STOP_AFTER_ACTIVATION: 0,
    BASELINE_STOP: 0,
    ACTIVATED_BASELINE_EXIT: 0,
    NOT_ACTIVATED: 0,
    DATA_GAP: 0,
    DATA_MISMATCH: 0
  };
  for (const item of comparisons) counts[item.classification] += 1;

  const pairs = comparisons.map((item) => ({
    baseline: item.baseline_trade,
    overlay: item.overlay_trade,
    comparison: item
  }));
  const winners = pairs.filter((item) => item.baseline.net_pnl > 0);
  const preserved = winners.filter(
    (item) => item.overlay.net_pnl >= 0.9 * item.baseline.net_pnl
  ).length;

  return {
    baseline_metrics: baseline,
    overlay_metrics: overlay,
    net_pnl_change: overlay.total_net_pnl - baseline.total_net_pnl,
    counts,
    activation_count: comparisons.filter((item) => item.overlay.activated).length,
    ratchet_exit_count: counts.RATCHET_EXIT,
    activated_baseline_exit_count: counts.ACTIVATED_BASELINE_EXIT,
    baseline_stop_after_activation_count: counts.BASELINE_STOP_AFTER_ACTIVATION,
    not_activated_count: counts.NOT_ACTIVATED + counts.BASELINE_STOP,
    data_gap_count: counts.DATA_GAP,
    data_mismatch_count: counts.DATA_MISMATCH,
    losing_to_winning: pairs.filter(
      (item) => item.baseline.net_pnl < 0 && item.overlay.net_pnl > 0
    ).length,
    losing_improved_still_losing: pairs.filter(
      (item) =>
        item.baseline.net_pnl < 0 &&
        item.overlay.net_pnl > item.baseline.net_pnl &&
        item.overlay.net_pnl <= 0
    ).length,
    winners_reduced: winners.filter(
      (item) => item.overlay.net_pnl < item.baseline.net_pnl
    ).length,
    winners_to_losses: winners.filter((item) => item.overlay.net_pnl < 0).length,
    baseline_winners: winners.length,
    winners_preserved_90pct: preserved,
    winners_preserved_90pct_rate: winners.length ? preserved / winners.length : null,
    fully_resolved: counts.DATA_GAP === 0 && counts.DATA_MISMATCH === 0
  };
}
