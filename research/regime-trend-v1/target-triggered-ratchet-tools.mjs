import { summarizeTrades } from "./backtest-tools.mjs";
import { FIVE_MINUTES_MS } from "./five-minute-data-tools.mjs";
import { solveRawFloor } from "./profit-protection-tools.mjs";

export const TARGET_TRIGGERED_RATCHET_CANDIDATES = Object.freeze([
  { id: "touch-1.50-lock-0.00", activationAtr: 1.5, floorAtr: 0 },
  { id: "touch-1.50-lock-0.50", activationAtr: 1.5, floorAtr: 0.5 },
  { id: "touch-2.00-lock-0.00", activationAtr: 2, floorAtr: 0 },
  { id: "touch-2.00-lock-0.50", activationAtr: 2, floorAtr: 0.5 },
  { id: "touch-2.00-lock-1.00", activationAtr: 2, floorAtr: 1 }
]);

const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;
const COMMISSION = 0.001;
const SLIPPAGE = 0.0005;

function isBaselineStopExit(trade) {
  return trade.exit_reason === "initial_stop" || trade.exit_reason === "trailing_stop";
}

function replayEndExclusive(trade) {
  return isBaselineStopExit(trade) ? trade.exit_timestamp + FOUR_HOURS_MS : trade.exit_timestamp;
}

function normalizedStopUpdates(trade, stopUpdates, endExclusive) {
  return stopUpdates
    .filter((update) => update.timestamp >= trade.entry_timestamp && update.timestamp < endExclusive)
    .map((update) => ({
      activationTimestamp: update.timestamp + FOUR_HOURS_MS,
      activeStop: update.activeStop
    }))
    .filter((update) => update.activationTimestamp < endExclusive)
    .sort((a, b) => a.activationTimestamp - b.activationTimestamp);
}

function makeExitTrade(trade, timestamp, rawReference, reason, commission, slippage) {
  const exitFill = rawReference * (1 - slippage);
  const exitFee = exitFill * trade.quantity * commission;
  const grossPnl = (exitFill - trade.entry_fill) * trade.quantity;
  const netPnl = grossPnl - trade.entry_fee - exitFee;
  return {
    ...trade,
    implementation_version: `${trade.implementation_version}:5m-ratchet`,
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

export function applyTargetTriggeredRatchet(
  trade,
  stopUpdates,
  candleByTimestamp,
  candidate,
  { commission = COMMISSION, slippage = SLIPPAGE } = {}
) {
  const activationPrice = trade.entry_fill + candidate.activationAtr * trade.entry_atr;
  const ratchetFloor = solveRawFloor(trade, candidate.floorAtr, commission, slippage);
  const endExclusive = replayEndExclusive(trade);
  const updates = normalizedStopUpdates(trade, stopUpdates, endExclusive);
  let activeStop = trade.initial_stop;
  let updateIndex = 0;
  let activated = false;
  let ratchetActiveFrom = null;

  for (let timestamp = trade.entry_timestamp; timestamp < endExclusive; timestamp += FIVE_MINUTES_MS) {
    while (updateIndex < updates.length && updates[updateIndex].activationTimestamp <= timestamp) {
      activeStop = Math.max(activeStop, updates[updateIndex].activeStop);
      updateIndex += 1;
    }
    if (ratchetActiveFrom !== null && ratchetActiveFrom <= timestamp) {
      activeStop = Math.max(activeStop, ratchetFloor);
    }

    const candle = candleByTimestamp.get(timestamp);
    if (!candle) {
      return { classification: "DATA_GAP", trade, activated, timestamp };
    }

    if (candle.open <= activeStop) {
      const overlay = makeExitTrade(trade, timestamp, candle.open, "target_ratchet_gap", commission, slippage);
      return { classification: activated ? "RATCHET_EXIT" : "BASELINE_STOP", trade: overlay, activated, timestamp };
    }

    const stopTouched = candle.low <= activeStop;
    const activationTouched = candle.open >= activationPrice || candle.high >= activationPrice;

    if (stopTouched) {
      const overlay = makeExitTrade(trade, timestamp, activeStop, "target_ratchet_stop", commission, slippage);
      return { classification: activated ? "RATCHET_EXIT" : "BASELINE_STOP", trade: overlay, activated, timestamp };
    }

    if (!activated && activationTouched) {
      activated = true;
      ratchetActiveFrom = timestamp + FIVE_MINUTES_MS;
    }
  }

  if (isBaselineStopExit(trade)) {
    return { classification: "DATA_MISMATCH", trade, activated, timestamp: trade.exit_timestamp };
  }
  return { classification: activated ? "ACTIVATED_BASELINE_EXIT" : "NOT_ACTIVATED", trade, activated, timestamp: trade.exit_timestamp };
}

export function summarizeRatchetCandidate(baselineTrades, results) {
  const overlayTrades = results.map((result) => result.trade);
  const baseline = summarizeTrades(baselineTrades);
  const overlay = summarizeTrades(overlayTrades);
  const pairs = baselineTrades.map((trade, index) => ({ baseline: trade, overlay: overlayTrades[index], result: results[index] }));
  const winners = pairs.filter((item) => item.baseline.net_pnl > 0);
  const preserved = winners.filter((item) => item.overlay.net_pnl >= 0.9 * item.baseline.net_pnl).length;
  return {
    baseline_metrics: baseline,
    overlay_metrics: overlay,
    net_pnl_change: overlay.total_net_pnl - baseline.total_net_pnl,
    activation_count: results.filter((r) => r.activated).length,
    ratchet_exit_count: results.filter((r) => r.classification === "RATCHET_EXIT").length,
    activated_baseline_exit_count: results.filter((r) => r.classification === "ACTIVATED_BASELINE_EXIT").length,
    not_activated_count: results.filter((r) => r.classification === "NOT_ACTIVATED" || r.classification === "BASELINE_STOP").length,
    data_gap_count: results.filter((r) => r.classification === "DATA_GAP").length,
    data_mismatch_count: results.filter((r) => r.classification === "DATA_MISMATCH").length,
    losing_to_winning: pairs.filter((p) => p.baseline.net_pnl < 0 && p.overlay.net_pnl > 0).length,
    losing_improved_still_losing: pairs.filter((p) => p.baseline.net_pnl < 0 && p.overlay.net_pnl > p.baseline.net_pnl && p.overlay.net_pnl <= 0).length,
    winners_reduced: winners.filter((p) => p.overlay.net_pnl < p.baseline.net_pnl).length,
    winners_to_losses: winners.filter((p) => p.overlay.net_pnl < 0).length,
    baseline_winners: winners.length,
    winners_preserved_90pct: preserved,
    winners_preserved_90pct_rate: winners.length ? preserved / winners.length : null,
    fully_resolved: results.every((r) => r.classification !== "DATA_GAP" && r.classification !== "DATA_MISMATCH")
  };
}
