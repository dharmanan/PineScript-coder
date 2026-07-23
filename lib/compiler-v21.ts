import { compilePine as compileBase } from "./compiler-v19";
import type { StrategyConfig } from "./types";

const PROFILE = "bnb_30m_ema_confirmed_regular_divergence_v1";

function compileValidatedBnb30m(config: StrategyConfig): string {
  const isStrategy = config.outputMode === "strategy";
  const declaration = isStrategy
    ? 'strategy("RSI Divergence Reversal · BNBUSDT 30m", overlay=true, pyramiding=0, process_orders_on_close=true, initial_capital=10000, commission_type=strategy.commission.percent, commission_value=0.15)'
    : 'indicator("RSI Divergence Reversal · BNBUSDT 30m", overlay=true, max_labels_count=500, max_lines_count=500)';

  const lines = [
    "//@version=6",
    "// PineForge validated profile: BNBUSDT, 30-minute chart.",
    "// Development: 2019-2022. Validation: 2023-2024. Final 2025+ holdout was not opened.",
    "// Commission 0.15% per side is used as a TradingView proxy for the research model's 0.10% commission plus 0.05% adverse slippage.",
    "// Review and test this script before using real capital.",
    declaration,
    "",
    "// === Validated profile constants ===",
    'expectedTicker = "BNBUSDT"',
    'expectedTimeframe = "30"',
    "profileMarketOk = syminfo.ticker == expectedTicker",
    "profileTimeframeOk = timeframe.period == expectedTimeframe",
    "profileAllowed = profileMarketOk and profileTimeframeOk",
    "confirmedOnly = input.bool(true, \"Confirmed candles only\")",
    "rsiLength = input.int(14, \"RSI length\", minval=2)",
    "pivotLeft = input.int(5, \"Divergence pivot left\", minval=1)",
    "pivotRight = input.int(5, \"Divergence pivot right\", minval=1)",
    "pivotRangeMin = input.int(5, \"Minimum pivot range\", minval=1)",
    "pivotRangeMax = input.int(60, \"Maximum pivot range\", minval=2)",
    "confirmationExpiry = input.int(30, \"EMA confirmation expiry bars\", minval=1)",
    "swingLength = input.int(15, \"Swing stop lookback\", minval=2)",
    "riskReward = input.float(1.8, \"Risk/reward target\", minval=0.1, step=0.1)",
    "volumeLength = input.int(20, \"Volume average length\", minval=1)",
    "volumeMultiplier = input.float(0.8, \"Minimum volume multiplier\", minval=0.1, step=0.05)",
    "",
    "// === Core calculations ===",
    "rsiValue = ta.rsi(close, rsiLength)",
    "ema9 = ta.ema(close, 9)",
    "wma45 = ta.wma(close, 45)",
    "ema50 = ta.ema(close, 50)",
    "ema200 = ta.ema(close, 200)",
    "volumeAverage = ta.sma(volume, volumeLength)",
    "confirmationOk = not confirmedOnly or barstate.isconfirmed",
    "volumeOk = volume >= volumeAverage * volumeMultiplier",
    "longTrendOk = ema50 > ema200 and close > ema200",
    "shortTrendOk = ema50 < ema200 and close < ema200",
    "",
    "// === Confirmed regular RSI divergence ===",
    "pivotLowFound = not na(ta.pivotlow(rsiValue, pivotLeft, pivotRight))",
    "pivotHighFound = not na(ta.pivothigh(rsiValue, pivotLeft, pivotRight))",
    "inPivotRange(condition) =>",
    "    barsSince = ta.barssince(condition)",
    "    pivotRangeMin <= barsSince and barsSince <= pivotRangeMax",
    "previousLowInRange = inPivotRange(pivotLowFound[1])",
    "rsiHigherLow = rsiValue[pivotRight] > ta.valuewhen(pivotLowFound, rsiValue[pivotRight], 1) and previousLowInRange",
    "priceLowerLow = low[pivotRight] < ta.valuewhen(pivotLowFound, low[pivotRight], 1)",
    "regularBullishDivergence = pivotLowFound and rsiHigherLow and priceLowerLow",
    "previousHighInRange = inPivotRange(pivotHighFound[1])",
    "rsiLowerHigh = rsiValue[pivotRight] < ta.valuewhen(pivotHighFound, rsiValue[pivotRight], 1) and previousHighInRange",
    "priceHigherHigh = high[pivotRight] > ta.valuewhen(pivotHighFound, high[pivotRight], 1)",
    "regularBearishDivergence = pivotHighFound and rsiLowerHigh and priceHigherHigh",
    "",
    "// === Divergence is armed until EMA9/WMA45 confirms ===",
    "var int pendingDirection = 0",
    "var int pendingExpiresAt = na",
    "if regularBullishDivergence",
    "    pendingDirection := 1",
    "    pendingExpiresAt := bar_index + confirmationExpiry",
    "if regularBearishDivergence",
    "    pendingDirection := -1",
    "    pendingExpiresAt := bar_index + confirmationExpiry",
    "if not na(pendingExpiresAt) and bar_index > pendingExpiresAt",
    "    pendingDirection := 0",
    "    pendingExpiresAt := na",
    "longConfirmation = pendingDirection == 1 and ta.crossover(ema9, wma45)",
    "shortConfirmation = pendingDirection == -1 and ta.crossunder(ema9, wma45)",
    "longSignal = profileAllowed and confirmationOk and volumeOk and longTrendOk and longConfirmation",
    "shortSignal = profileAllowed and confirmationOk and volumeOk and shortTrendOk and shortConfirmation",
    "if longSignal or shortSignal",
    "    pendingDirection := 0",
    "    pendingExpiresAt := na",
    "",
    "// === Frozen swing risk captured at entry ===",
    "var float activeStop = na",
    "var float activeTarget = na",
    "var int activeDirection = 0",
    "flatNow = " + (isStrategy ? "strategy.position_size == 0" : "activeDirection == 0"),
    "acceptedLongSignal = longSignal and flatNow",
    "acceptedShortSignal = shortSignal and flatNow",
    "if acceptedLongSignal",
    "    activeStop := ta.lowest(low, swingLength)",
    "    activeTarget := close + (close - activeStop) * riskReward",
    "    activeDirection := 1",
    "if acceptedShortSignal",
    "    activeStop := ta.highest(high, swingLength)",
    "    activeTarget := close - (activeStop - close) * riskReward",
    "    activeDirection := -1"
  ];

  if (isStrategy) {
    lines.push(
      "",
      "// === Strategy orders ===",
      'if acceptedLongSignal\n    strategy.entry("Long", strategy.long, alert_message="BNBUSDT 30m LONG {{close}}")',
      'if acceptedShortSignal\n    strategy.entry("Short", strategy.short, alert_message="BNBUSDT 30m SHORT {{close}}")',
      'if strategy.position_size > 0 and activeDirection == 1\n    strategy.exit("Long Risk Exit", "Long", stop=activeStop, limit=activeTarget, alert_message="BNBUSDT 30m LONG EXIT")',
      'if strategy.position_size < 0 and activeDirection == -1\n    strategy.exit("Short Risk Exit", "Short", stop=activeStop, limit=activeTarget, alert_message="BNBUSDT 30m SHORT EXIT")',
      "positionJustClosed = strategy.position_size == 0 and strategy.position_size[1] != 0",
      "if positionJustClosed",
      "    activeStop := na",
      "    activeTarget := na",
      "    activeDirection := 0"
    );
  } else {
    lines.push(
      "",
      "// === Indicator risk lifecycle ===",
      "var int entryBar = na",
      "if acceptedLongSignal or acceptedShortSignal",
      "    entryBar := bar_index",
      "riskCanResolve = activeDirection != 0 and not na(entryBar) and bar_index > entryBar",
      "longStopHit = riskCanResolve and activeDirection == 1 and low <= activeStop",
      "longTargetHit = riskCanResolve and activeDirection == 1 and high >= activeTarget",
      "shortStopHit = riskCanResolve and activeDirection == -1 and high >= activeStop",
      "shortTargetHit = riskCanResolve and activeDirection == -1 and low <= activeTarget",
      "riskResolved = longStopHit or longTargetHit or shortStopHit or shortTargetHit",
      "if riskResolved",
      "    activeStop := na",
      "    activeTarget := na",
      "    activeDirection := 0",
      "    entryBar := na"
    );
  }

  lines.push(
    "",
    "// === Visuals ===",
    'plot(ema9, "EMA 9", color=color.aqua)',
    'plot(wma45, "WMA 45", color=color.orange)',
    'plot(ema50, "EMA 50", color=color.new(color.green, 20))',
    'plot(ema200, "EMA 200", color=color.yellow, linewidth=2)',
    'plot(activeStop, "Frozen swing stop", color=color.red, linewidth=2, style=plot.style_linebr)',
    'plot(activeTarget, "1.8R target", color=color.green, linewidth=2, style=plot.style_linebr)',
    'plotshape(acceptedLongSignal, title="Validated long", style=shape.labelup, location=location.belowbar, color=color.lime, text="LONG", textcolor=color.black)',
    'plotshape(acceptedShortSignal, title="Validated short", style=shape.labeldown, location=location.abovebar, color=color.red, text="SHORT", textcolor=color.white)',
    'bgcolor(not profileMarketOk or not profileTimeframeOk ? color.new(color.red, 88) : na, title="Wrong market or timeframe")',
    "",
    "// === Status ===",
    "var table status = table.new(position.top_right, 2, 5, border_width=1)",
    "if barstate.islast",
    '    table.cell(status, 0, 0, "Validated profile", bgcolor=color.new(color.blue, 70), text_color=color.white)',
    '    table.cell(status, 1, 0, "BNBUSDT 30m", text_color=color.white)',
    '    table.cell(status, 0, 1, "Market")',
    '    table.cell(status, 1, 1, profileMarketOk ? "OK" : "USE BNBUSDT", text_color=profileMarketOk ? color.lime : color.red)',
    '    table.cell(status, 0, 2, "Timeframe")',
    '    table.cell(status, 1, 2, profileTimeframeOk ? "OK" : "USE 30m", text_color=profileTimeframeOk ? color.lime : color.red)',
    '    table.cell(status, 0, 3, "Pending divergence")',
    '    table.cell(status, 1, 3, pendingDirection == 1 ? "BULLISH" : pendingDirection == -1 ? "BEARISH" : "NONE", text_color=pendingDirection == 1 ? color.lime : pendingDirection == -1 ? color.red : color.gray)',
    '    table.cell(status, 0, 4, "Risk state")',
    '    table.cell(status, 1, 4, activeDirection == 1 ? "ACTIVE LONG" : activeDirection == -1 ? "ACTIVE SHORT" : "FLAT")',
    "",
    "// === Alerts ===",
    'alertcondition(acceptedLongSignal, "Validated BNBUSDT 30m long", "BNBUSDT 30m validated long @ {{close}}")',
    'alertcondition(acceptedShortSignal, "Validated BNBUSDT 30m short", "BNBUSDT 30m validated short @ {{close}}")'
  );

  return lines.join("\n");
}

export function compilePine(config: StrategyConfig): string {
  if (config.researchProfile === PROFILE) return compileValidatedBnb30m(config);
  return compileBase(config);
}
