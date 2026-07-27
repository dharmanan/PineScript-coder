import { buildBehaviorPlan } from "./behavior-plan";
import type { StrategyConfig } from "./types";

const bool = (value: boolean) => (value ? "true" : "false");
const q = (value: string) => value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
const joinConditions = (items: string[]) => (items.length ? items.join(" and ") : "true");

export function compilePine(c: StrategyConfig): string {
  const plan = buildBehaviorPlan(c);
  const isStrategy = plan.output === "strategy";
  const isSpot = plan.mode === "spot_buy_exit";
  const allowShort = plan.entry.hasShort;
  const needsEma = c.trend.emaEnabled || c.entryTrigger === "ema_cross" || c.entryTrigger === "pullback_reclaim" || c.spotExitMode === "ema_cross" || c.spotExitMode === "combined";
  const needsLongMa = c.trend.longMaEnabled || c.spotExitMode === "trend_break" || c.spotExitMode === "combined";
  const needsRsi = c.momentum.rsiEnabled || c.momentum.divergenceEnabled || isSpot;
  const needsSupertrend = c.trend.supertrendEnabled || c.entryTrigger === "supertrend_flip" || c.higherTimeframe.method === "supertrend";
  const needsAtr = c.risk.stopMode === "atr";

  const declaration = isStrategy
    ? `strategy("${q(c.name)}", overlay=true, pyramiding=0, process_orders_on_close=true, initial_capital=10000, commission_type=strategy.commission.percent, commission_value=0.1)`
    : `indicator("${q(c.name)}", overlay=true, max_labels_count=500, max_lines_count=500)`;

  const lines: string[] = [
    "//@version=6",
    "// Generated deterministically by Kohen Pine Studio",
    "// Review and test this script in TradingView before using it with real capital.",
    declaration,
    "",
    "// === Inputs ===",
    `confirmedOnly = input.bool(${bool(c.confirmedBarsOnly)}, "Confirmed candles only")`,
    `cooldownBars = input.int(${c.execution.cooldownBars}, "Signal cooldown bars", minval=0)`
  ];

  if (needsEma) {
    lines.push(`emaFastLen = input.int(${c.trend.emaFast}, "Fast EMA", minval=1)`);
    lines.push(`emaSlowLen = input.int(${c.trend.emaSlow}, "Slow EMA", minval=1)`);
  }
  if (needsLongMa) lines.push(`longMaLen = input.int(${c.trend.longMaLength}, "Long MA", minval=1)`);
  if (needsRsi) {
    lines.push(`rsiLen = input.int(${c.momentum.rsiLength}, "RSI length", minval=2)`);
    lines.push(`rsiLongLevel = input.float(${c.momentum.rsiLong}, "RSI long threshold")`);
    if (allowShort) lines.push(`rsiShortLevel = input.float(${c.momentum.rsiShort}, "RSI short threshold")`);
    if (isSpot && (c.spotExitMode === "rsi_overbought" || c.spotExitMode === "combined")) {
      lines.push(`rsiExitLevel = input.float(${c.momentum.rsiExit}, "RSI spot exit threshold")`);
    }
  }
  if (c.volume.enabled) {
    lines.push(`volumeLen = input.int(${c.volume.averageLength}, "Volume average", minval=1)`);
    lines.push(`volumeMultiplier = input.float(${c.volume.multiplier}, "Volume multiplier", minval=0.1, step=0.05)`);
  }
  if (c.momentum.adxEnabled) {
    lines.push(`adxLen = input.int(${c.momentum.adxLength}, "ADX length", minval=2)`);
    lines.push(`adxThreshold = input.float(${c.momentum.adxThreshold}, "ADX threshold")`);
  }
  if (needsSupertrend) {
    lines.push(`stAtrLen = input.int(${c.trend.supertrendAtrLength}, "Supertrend ATR length", minval=1)`);
    lines.push(`stFactor = input.float(${c.trend.supertrendFactor}, "Supertrend factor", minval=0.1)`);
  }
  if (c.entryTrigger === "breakout") lines.push(`breakoutLen = input.int(${c.trend.breakoutLength}, "Breakout lookback", minval=2)`);
  if (c.higherTimeframe.enabled) lines.push(`htf = input.timeframe("${q(c.higherTimeframe.timeframe)}", "Higher timeframe")`);
  if (c.execution.sessionEnabled) lines.push(`tradeSession = input.session("${q(c.execution.session)}", "Trading session")`);

  if (needsAtr) {
    lines.push(`atrLen = input.int(${c.risk.atrLength}, "ATR length", minval=1)`);
    lines.push(`atrMultiple = input.float(${c.risk.atrMultiple}, "ATR stop multiple", minval=0.1)`);
  }
  if (c.risk.stopMode === "percent") lines.push(`stopPercent = input.float(${c.risk.stopPercent}, "Stop %", minval=0.1) / 100`);
  if (c.risk.stopMode === "swing") lines.push(`swingLen = input.int(${c.risk.swingLength}, "Swing stop lookback", minval=2)`);
  if (c.risk.takeProfitMode === "risk_reward") lines.push(`riskReward = input.float(${c.risk.riskReward}, "Risk/reward", minval=0.1)`);
  if (c.risk.takeProfitMode === "percent") lines.push(`takeProfitPercent = input.float(${c.risk.takeProfitPercent}, "Take profit %", minval=0.1) / 100`);

  lines.push("", "// === Core calculations ===");
  if (needsEma) lines.push("emaFast = ta.ema(close, emaFastLen)", "emaSlow = ta.ema(close, emaSlowLen)");
  if (needsLongMa) lines.push(`longMa = ${c.trend.longMaType === "sma" ? "ta.sma" : "ta.ema"}(close, longMaLen)`);
  if (c.trend.vwapEnabled || c.entryTrigger === "vwap_reclaim") lines.push("vwapValue = ta.vwap(hlc3)");
  if (needsSupertrend) lines.push("[supertrendValue, supertrendDirection] = ta.supertrend(stFactor, stAtrLen)");
  if (needsRsi) lines.push("rsiValue = ta.rsi(close, rsiLen)");
  if (c.momentum.macdEnabled) lines.push("[macdLine, macdSignal, macdHist] = ta.macd(close, 12, 26, 9)");
  if (c.momentum.adxEnabled) lines.push("[plusDI, minusDI, adxValue] = ta.dmi(adxLen, adxLen)");
  if (c.volume.enabled) lines.push("volumeAverage = ta.sma(volume, volumeLen)");
  if (needsAtr) lines.push("atrValue = ta.atr(atrLen)");
  if (c.entryTrigger === "breakout") lines.push("previousHigh = ta.highest(high, breakoutLen)[1]", "previousLow = ta.lowest(low, breakoutLen)[1]");

  if (c.momentum.divergenceEnabled) {
    const p = c.momentum.divergencePivot;
    lines.push(
      "",
      "// Confirmed pivot-based RSI divergence. Pivots appear after right-side bars complete.",
      `pricePivotLow = ta.pivotlow(low, ${p}, ${p})`,
      `pricePivotHigh = ta.pivothigh(high, ${p}, ${p})`,
      `rsiPivotLow = ta.pivotlow(rsiValue, ${p}, ${p})`,
      `rsiPivotHigh = ta.pivothigh(rsiValue, ${p}, ${p})`,
      "prevPriceLow = ta.valuewhen(not na(pricePivotLow), pricePivotLow, 1)",
      "prevRsiLow = ta.valuewhen(not na(rsiPivotLow), rsiPivotLow, 1)",
      "prevPriceHigh = ta.valuewhen(not na(pricePivotHigh), pricePivotHigh, 1)",
      "prevRsiHigh = ta.valuewhen(not na(rsiPivotHigh), rsiPivotHigh, 1)",
      "bullishDivergence = not na(pricePivotLow) and not na(rsiPivotLow) and pricePivotLow < prevPriceLow and rsiPivotLow > prevRsiLow",
      "bearishDivergence = not na(pricePivotHigh) and not na(rsiPivotHigh) and pricePivotHigh > prevPriceHigh and rsiPivotHigh < prevRsiHigh"
    );
  }

  if (c.higherTimeframe.enabled) {
    lines.push("", c.higherTimeframe.closedBarOnly
      ? "// Uses the previous confirmed higher-timeframe candle with lookahead_on to avoid future leakage."
      : "// Uses the developing higher-timeframe candle with lookahead_off; values may change before it closes.");
    const offset = c.higherTimeframe.closedBarOnly ? "[1]" : "";
    const lookahead = c.higherTimeframe.closedBarOnly ? "barmerge.lookahead_on" : "barmerge.lookahead_off";
    if (c.higherTimeframe.method === "supertrend") {
      lines.push(`f_htfSupertrendBull() =>\n    [_, direction] = ta.supertrend(${c.trend.supertrendFactor}, ${c.trend.supertrendAtrLength})\n    direction${offset} < 0`);
      lines.push(`htfBull = request.security(syminfo.tickerid, htf, f_htfSupertrendBull(), lookahead=${lookahead})`);
    } else {
      const fn = c.higherTimeframe.method === "ema" ? "ta.ema" : "ta.sma";
      lines.push(`htfBull = request.security(syminfo.tickerid, htf, close${offset} > ${fn}(close, ${c.higherTimeframe.length})${offset}, lookahead=${lookahead})`);
    }
    lines.push("htfBear = not htfBull");
  }

  lines.push("", "// === Filters and triggers ===", "confirmationOk = not confirmedOnly or barstate.isconfirmed");
  if (c.execution.sessionEnabled) lines.push("sessionOk = not na(time(timeframe.period, tradeSession))");

  const longFilters = plan.entry.filters.map((filter) => filter.longExpression);
  const shortFilters = plan.entry.filters.map((filter) => filter.shortExpression).filter((value): value is string => Boolean(value));
  lines.push(`longSetup = ${joinConditions(longFilters)}`);
  if (allowShort) lines.push(`shortSetup = ${joinConditions(shortFilters)}`);
  lines.push(`longTrigger = ${plan.entry.trigger.longExpression}`);
  if (allowShort) lines.push(`shortTrigger = ${plan.entry.trigger.shortExpression ?? "false"}`);
  lines.push("var int lastSignalBar = na", "cooldownOk = na(lastSignalBar) or bar_index - lastSignalBar > cooldownBars");

  if (isSpot) {
    const exitParts: string[] = ["confirmationOk"];
    if (c.spotExitMode === "trend_break") exitParts.push("ta.crossunder(close, longMa)");
    if (c.spotExitMode === "ema_cross") exitParts.push("ta.crossunder(emaFast, emaSlow)");
    if (c.spotExitMode === "rsi_overbought") exitParts.push("ta.crossunder(rsiValue, rsiExitLevel)");
    if (c.spotExitMode === "htf_bearish") exitParts.push(c.higherTimeframe.enabled ? "htfBear and not htfBear[1]" : "false");
    if (c.spotExitMode === "combined") {
      const combined = ["ta.crossunder(close, longMa)", "ta.crossunder(emaFast, emaSlow)", "ta.crossunder(rsiValue, rsiExitLevel)"];
      if (c.higherTimeframe.enabled) combined.push("htfBear and not htfBear[1]");
      exitParts.push(`(${combined.join(" or ")})`);
    }
    lines.push("buySetup = longSetup", "var bool spotActive = false", "buySignal = buySetup and longTrigger and cooldownOk and not spotActive");
    lines.push(`rawExitSignal = ${joinConditions(exitParts)}`, "exitSignal = rawExitSignal and spotActive");
    lines.push("if buySignal\n    spotActive := true\n    lastSignalBar := bar_index", "if exitSignal\n    spotActive := false");
  } else {
    lines.push("longSignal = longSetup and longTrigger and cooldownOk");
    if (allowShort) lines.push("shortSignal = shortSetup and shortTrigger and cooldownOk");
    lines.push(allowShort ? "if longSignal or shortSignal\n    lastSignalBar := bar_index" : "if longSignal\n    lastSignalBar := bar_index");
  }

  lines.push("", "// === Visuals ===");
  if (needsEma) lines.push("plot(emaFast, \"Fast EMA\", color=color.aqua)", "plot(emaSlow, \"Slow EMA\", color=color.orange)");
  if (needsLongMa) lines.push("plot(longMa, \"Long MA\", color=color.yellow, linewidth=2)");
  if (c.trend.vwapEnabled || c.entryTrigger === "vwap_reclaim") lines.push("plot(vwapValue, \"VWAP\", color=color.purple)");
  if (needsSupertrend) lines.push("plot(supertrendValue, \"Supertrend\", color=supertrendDirection < 0 ? color.lime : color.red, linewidth=2)");
  if (plan.entry.trigger.plotsBreakoutLevels) {
    lines.push("plot(previousHigh, \"Breakout High\", color=color.new(color.green, 45), style=plot.style_stepline)");
    lines.push("plot(previousLow, \"Breakout Low\", color=color.new(color.red, 45), style=plot.style_stepline)");
  }

  if (isSpot) {
    lines.push("plotshape(buySignal, title=\"Spot buy\", style=shape.labelup, location=location.belowbar, color=color.lime, text=\"BUY\", textcolor=color.black, size=size.tiny)");
    lines.push("plotshape(exitSignal, title=\"Spot exit\", style=shape.labeldown, location=location.abovebar, color=color.orange, text=\"EXIT\", textcolor=color.black, size=size.tiny)");
  } else {
    lines.push("plotshape(longSignal, title=\"Long\", style=shape.labelup, location=location.belowbar, color=color.lime, text=\"LONG\", textcolor=color.black, size=size.tiny)");
    if (allowShort) lines.push("plotshape(shortSignal, title=\"Short\", style=shape.labeldown, location=location.abovebar, color=color.red, text=\"SHORT\", textcolor=color.white, size=size.tiny)");
  }

  if (!isStrategy && plan.risk.enabled) {
    lines.push("var float riskEntry = na", "var float riskStop = na", "var float riskTarget = na", "var int riskDirection = 0");
    const longEvent = isSpot ? "buySignal" : "longSignal";
    lines.push(`if ${longEvent}\n    riskEntry := close\n    riskDirection := 1`);
    if (c.risk.stopMode === "atr") lines.push("    riskStop := close - atrValue * atrMultiple");
    if (c.risk.stopMode === "percent") lines.push("    riskStop := close * (1 - stopPercent)");
    if (c.risk.stopMode === "swing") lines.push("    riskStop := ta.lowest(low, swingLen)");
    if (c.risk.stopMode === "none") lines.push("    riskStop := na");
    if (c.risk.takeProfitMode === "risk_reward") lines.push("    riskTarget := close + (close - riskStop) * riskReward");
    if (c.risk.takeProfitMode === "percent") lines.push("    riskTarget := close * (1 + takeProfitPercent)");
    if (c.risk.takeProfitMode === "none" || c.risk.takeProfitMode === "opposite_signal") lines.push("    riskTarget := na");
    if (allowShort) {
      lines.push("if shortSignal\n    riskEntry := close\n    riskDirection := -1");
      if (c.risk.stopMode === "atr") lines.push("    riskStop := close + atrValue * atrMultiple");
      if (c.risk.stopMode === "percent") lines.push("    riskStop := close * (1 + stopPercent)");
      if (c.risk.stopMode === "swing") lines.push("    riskStop := ta.highest(high, swingLen)");
      if (c.risk.stopMode === "none") lines.push("    riskStop := na");
      if (c.risk.takeProfitMode === "risk_reward") lines.push("    riskTarget := close - (riskStop - close) * riskReward");
      if (c.risk.takeProfitMode === "percent") lines.push("    riskTarget := close * (1 - takeProfitPercent)");
      if (c.risk.takeProfitMode === "none" || c.risk.takeProfitMode === "opposite_signal") lines.push("    riskTarget := na");
    }
    lines.push("plot(riskStop, \"Risk Stop\", color=color.red, linewidth=2, style=plot.style_linebr)");
    lines.push("plot(riskTarget, \"Risk Target\", color=color.green, linewidth=2, style=plot.style_linebr)");
  }

  if (c.execution.showBackground && c.higherTimeframe.enabled) lines.push("bgcolor(htfBull ? color.new(color.green, 92) : color.new(color.red, 92), title=\"HTF bias\")");

  if (c.execution.showDashboard) {
    if (isSpot) {
      lines.push(
        "var table dashboard = table.new(position.top_right, 2, 5, border_width=1)",
        "if barstate.islast",
        "    table.cell(dashboard, 0, 0, \"Kohen Pine\", bgcolor=color.new(color.blue, 70), text_color=color.white)",
        "    table.cell(dashboard, 1, 0, \"SPOT\")",
        "    table.cell(dashboard, 0, 1, \"Buy setup\")",
        "    table.cell(dashboard, 1, 1, buySetup ? \"READY\" : \"NO\", text_color=buySetup ? color.lime : color.gray)",
        "    table.cell(dashboard, 0, 2, \"Buy signal\")",
        "    table.cell(dashboard, 1, 2, buySignal ? \"YES\" : \"WAIT\", text_color=buySignal ? color.lime : color.gray)",
        "    table.cell(dashboard, 0, 3, \"Position state\")",
        "    table.cell(dashboard, 1, 3, spotActive ? \"ACTIVE\" : \"FLAT\")",
        "    table.cell(dashboard, 0, 4, \"Exit signal\")",
        "    table.cell(dashboard, 1, 4, exitSignal ? \"YES\" : \"NO\", text_color=exitSignal ? color.orange : color.gray)"
      );
    } else {
      const rows = allowShort ? 5 : 4;
      lines.push(
        `var table dashboard = table.new(position.top_right, 2, ${rows}, border_width=1)`,
        "if barstate.islast",
        "    table.cell(dashboard, 0, 0, \"Kohen Pine\", bgcolor=color.new(color.blue, 70), text_color=color.white)",
        `    table.cell(dashboard, 1, 0, \"${allowShort ? "LONG/SHORT" : "LONG ONLY"}\")`,
        "    table.cell(dashboard, 0, 1, \"Long setup\")",
        "    table.cell(dashboard, 1, 1, longSetup ? \"READY\" : \"NO\", text_color=longSetup ? color.lime : color.gray)",
        "    table.cell(dashboard, 0, 2, \"Long signal\")",
        "    table.cell(dashboard, 1, 2, longSignal ? \"YES\" : \"WAIT\", text_color=longSignal ? color.lime : color.gray)"
      );
      if (allowShort) lines.push(
        "    table.cell(dashboard, 0, 3, \"Short setup\")",
        "    table.cell(dashboard, 1, 3, shortSetup ? \"READY\" : \"NO\", text_color=shortSetup ? color.red : color.gray)",
        "    table.cell(dashboard, 0, 4, \"Short signal\")",
        "    table.cell(dashboard, 1, 4, shortSignal ? \"YES\" : \"WAIT\", text_color=shortSignal ? color.red : color.gray)"
      );
      else lines.push(
        "    table.cell(dashboard, 0, 3, \"Confirmed\")",
        "    table.cell(dashboard, 1, 3, confirmationOk ? \"YES\" : \"WAIT\")"
      );
    }
  }

  if (isStrategy) {
    lines.push("", "// === Strategy orders ===");
    if (isSpot) {
      lines.push("if buySignal and strategy.position_size <= 0\n    strategy.entry(\"Spot Long\", strategy.long, alert_message=\"SPOT BUY {{ticker}} @ {{close}}\")");
      lines.push("if exitSignal and strategy.position_size > 0\n    strategy.close(\"Spot Long\", alert_message=\"SPOT EXIT {{ticker}} @ {{close}}\")");
    } else {
      lines.push("if longSignal and strategy.position_size <= 0\n    strategy.entry(\"Long\", strategy.long, alert_message=\"LONG {{ticker}} @ {{close}}\")");
      if (allowShort) lines.push("if shortSignal and strategy.position_size >= 0\n    strategy.entry(\"Short\", strategy.short, alert_message=\"SHORT {{ticker}} @ {{close}}\")");
    }

    if (plan.risk.enabled) {
      if (c.risk.stopMode === "atr") {
        lines.push("longStop = strategy.position_avg_price - atrValue * atrMultiple");
        if (allowShort) lines.push("shortStop = strategy.position_avg_price + atrValue * atrMultiple");
      } else if (c.risk.stopMode === "percent") {
        lines.push("longStop = strategy.position_avg_price * (1 - stopPercent)");
        if (allowShort) lines.push("shortStop = strategy.position_avg_price * (1 + stopPercent)");
      } else if (c.risk.stopMode === "swing") {
        lines.push("longStop = ta.lowest(low, swingLen)");
        if (allowShort) lines.push("shortStop = ta.highest(high, swingLen)");
      } else {
        lines.push("float longStop = na");
        if (allowShort) lines.push("float shortStop = na");
      }

      if (c.risk.takeProfitMode === "risk_reward") {
        lines.push("longTarget = strategy.position_avg_price + (strategy.position_avg_price - longStop) * riskReward");
        if (allowShort) lines.push("shortTarget = strategy.position_avg_price - (shortStop - strategy.position_avg_price) * riskReward");
      } else if (c.risk.takeProfitMode === "percent") {
        lines.push("longTarget = strategy.position_avg_price * (1 + takeProfitPercent)");
        if (allowShort) lines.push("shortTarget = strategy.position_avg_price * (1 - takeProfitPercent)");
      } else {
        lines.push("float longTarget = na");
        if (allowShort) lines.push("float shortTarget = na");
      }

      const longEntryId = isSpot ? "Spot Long" : "Long";
      lines.push(`if strategy.position_size > 0\n    strategy.exit("Long Risk Exit", "${longEntryId}", stop=longStop, limit=longTarget, alert_message="LONG EXIT {{ticker}}")`);
      if (allowShort) lines.push("if strategy.position_size < 0\n    strategy.exit(\"Short Risk Exit\", \"Short\", stop=shortStop, limit=shortTarget, alert_message=\"SHORT EXIT {{ticker}}\")");
    }

    if (!isSpot && c.risk.takeProfitMode === "opposite_signal" && allowShort) {
      lines.push("if shortSignal and strategy.position_size > 0\n    strategy.close(\"Long\")");
      lines.push("if longSignal and strategy.position_size < 0\n    strategy.close(\"Short\")");
    }
  }

  if (c.execution.alertsEnabled) {
    lines.push("", "// === Alerts ===");
    if (isSpot) {
      lines.push("alertcondition(buySignal, \"Spot buy signal\", \"SPOT BUY {{ticker}} @ {{close}}\")");
      lines.push("alertcondition(exitSignal, \"Spot exit signal\", \"SPOT EXIT {{ticker}} @ {{close}}\")");
    } else {
      lines.push("alertcondition(longSignal, \"Long signal\", \"LONG {{ticker}} @ {{close}}\")");
      if (allowShort) lines.push("alertcondition(shortSignal, \"Short signal\", \"SHORT {{ticker}} @ {{close}}\")");
    }
  }

  return lines.join("\n");
}
