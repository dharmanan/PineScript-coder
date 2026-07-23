import { summarizeTrades } from "./backtest-tools.mjs";

export const PROFIT_PROTECTION_CANDIDATES = Object.freeze([
  { id: "activate-0.50-lock-0.00", activationAtr: 0.5, floorAtr: 0 },
  { id: "activate-1.00-lock-0.00", activationAtr: 1, floorAtr: 0 },
  { id: "activate-1.00-lock-0.25", activationAtr: 1, floorAtr: 0.25 },
  { id: "activate-1.00-lock-0.50", activationAtr: 1, floorAtr: 0.5 },
  { id: "activate-1.50-lock-0.00", activationAtr: 1.5, floorAtr: 0 },
  { id: "activate-1.50-lock-0.50", activationAtr: 1.5, floorAtr: 0.5 },
  { id: "activate-1.50-lock-1.00", activationAtr: 1.5, floorAtr: 1 }
]);

const COMMISSION = 0.001;
const SLIPPAGE = 0.0005;

export function percentile(values, probability) {
  if (values.length === 0) return null;
  const ordered = [...values].sort((a, b) => a - b);
  const index = Math.ceil(probability * ordered.length) - 1;
  return ordered[Math.max(0, Math.min(index, ordered.length - 1))];
}

export function solveRawFloor(trade, floorAtr, commission = COMMISSION, slippage = SLIPPAGE) {
  const desiredNetPnl = floorAtr * trade.entry_atr / trade.entry_fill;
  const numerator = desiredNetPnl + trade.quantity * trade.entry_fill + trade.entry_fee;
  const exitFill = numerator / (trade.quantity * (1 - commission));
  return exitFill / (1 - slippage);
}

function makeOverlayTrade(trade, candle, rawReference, reason, commission, slippage) {
  const exitFill = rawReference * (1 - slippage);
  const exitFee = exitFill * trade.quantity * commission;
  const grossPnl = (exitFill - trade.entry_fill) * trade.quantity;
  const netPnl = grossPnl - trade.entry_fee - exitFee;
  const entryNotional = trade.entry_fill * trade.quantity;
  return {
    ...trade,
    implementation_version: `${trade.implementation_version}:profit-protection`,
    exit_timestamp: candle.timestamp,
    raw_exit_reference: rawReference,
    exit_fill: exitFill,
    exit_reason: reason,
    exit_fee: exitFee,
    gross_pnl: grossPnl,
    net_pnl: netPnl,
    net_return: netPnl / entryNotional,
    bars_held: trade.bars_held
  };
}

export function applyProfitProtection(
  trade,
  candles,
  candidate,
  { commission = COMMISSION, slippage = SLIPPAGE } = {}
) {
  const indexByTimestamp = new Map(candles.map((candle, index) => [candle.timestamp, index]));
  const entryIndex = indexByTimestamp.get(trade.entry_timestamp);
  const exitIndex = indexByTimestamp.get(trade.exit_timestamp);
  if (entryIndex === undefined || exitIndex === undefined || exitIndex < entryIndex) {
    throw new Error(`Trade timestamps not found for ${trade.symbol}`);
  }

  const activationPrice = trade.entry_fill + candidate.activationAtr * trade.entry_atr;
  let activationIndex = null;
  for (let index = entryIndex; index < exitIndex; index += 1) {
    if (candles[index].close >= activationPrice) {
      activationIndex = index;
      break;
    }
  }

  if (activationIndex === null || activationIndex + 1 > exitIndex) {
    return { trade, activated: false, exitedEarlier: false, activationIndex };
  }

  const floor = solveRawFloor(trade, candidate.floorAtr, commission, slippage);
  for (let index = activationIndex + 1; index < exitIndex; index += 1) {
    const candle = candles[index];
    if (candle.open <= floor) {
      return {
        trade: makeOverlayTrade(trade, candle, candle.open, "profit_protection_gap", commission, slippage),
        activated: true,
        exitedEarlier: true,
        activationIndex,
        floor
      };
    }
    if (candle.low <= floor) {
      return {
        trade: makeOverlayTrade(trade, candle, floor, "profit_protection_stop", commission, slippage),
        activated: true,
        exitedEarlier: true,
        activationIndex,
        floor
      };
    }
  }

  const baselineExitCandle = candles[exitIndex];
  if (baselineExitCandle.open <= floor) {
    return {
      trade: makeOverlayTrade(
        trade,
        baselineExitCandle,
        baselineExitCandle.open,
        "profit_protection_gap",
        commission,
        slippage
      ),
      activated: true,
      exitedEarlier: baselineExitCandle.timestamp < trade.exit_timestamp,
      activationIndex,
      floor
    };
  }

  return { trade, activated: true, exitedEarlier: false, activationIndex, floor };
}

function netAtr(trade) {
  return trade.net_pnl * trade.entry_fill / trade.entry_atr;
}

export function summarizeCandidate(baselineTrades, overlayResults) {
  const overlayTrades = overlayResults.map((result) => result.trade);
  const baseline = summarizeTrades(baselineTrades);
  const overlay = summarizeTrades(overlayTrades);
  const comparisons = baselineTrades.map((trade, index) => ({
    baseline: trade,
    overlay: overlayTrades[index],
    result: overlayResults[index]
  }));
  const baselineWinners = comparisons.filter((item) => item.baseline.net_pnl > 0);
  const preservedWinners = baselineWinners.filter(
    (item) => item.overlay.net_pnl >= 0.9 * item.baseline.net_pnl
  ).length;

  const overlayAtr = overlayTrades.map(netAtr);
  return {
    baseline_metrics: baseline,
    overlay_metrics: overlay,
    net_pnl_change: overlay.total_net_pnl - baseline.total_net_pnl,
    activation_count: overlayResults.filter((item) => item.activated).length,
    earlier_overlay_exit_count: overlayResults.filter((item) => item.exitedEarlier).length,
    losing_to_winning: comparisons.filter(
      (item) => item.baseline.net_pnl < 0 && item.overlay.net_pnl > 0
    ).length,
    losing_improved_still_losing: comparisons.filter(
      (item) => item.baseline.net_pnl < 0 &&
        item.overlay.net_pnl > item.baseline.net_pnl &&
        item.overlay.net_pnl <= 0
    ).length,
    winners_reduced: baselineWinners.filter(
      (item) => item.overlay.net_pnl < item.baseline.net_pnl
    ).length,
    winners_to_losses: baselineWinners.filter((item) => item.overlay.net_pnl < 0).length,
    unchanged_trades: comparisons.filter(
      (item) => Math.abs(item.overlay.net_pnl - item.baseline.net_pnl) < 1e-12
    ).length,
    baseline_winners: baselineWinners.length,
    winners_preserved_90pct: preservedWinners,
    winners_preserved_90pct_rate: baselineWinners.length ? preservedWinners / baselineWinners.length : null,
    overlay_net_atr_distribution: {
      median: percentile(overlayAtr, 0.5),
      p90: percentile(overlayAtr, 0.9),
      max: overlayAtr.length ? Math.max(...overlayAtr) : null
    }
  };
}
