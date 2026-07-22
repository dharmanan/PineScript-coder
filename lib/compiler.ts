import type { StrategyConfig } from "./types";

const b = (value: boolean) => (value ? "true" : "false");

export function compilePine(c: StrategyConfig): string {
  const strategy = c.outputMode === "strategy";
  const declaration = strategy
    ? `strategy("${c.name}", overlay=true, pyramiding=0, process_orders_on_close=true, initial_capital=10000, commission_type=strategy.commission.percent, commission_value=0.1)`
    : `indicator("${c.name}", overlay=true, max_labels_count=500)`;

  const lines: string[] = [
    "//@version=6",
    "// Generated deterministically by PineForge Studio",
    "// Review and test this script in TradingView before using it with real capital.",
    declaration,
    "",
    "// === Inputs ===",
    `confirmedOnly = input.bool(${b(c.confirmedBarsOnly)}, "Confirmed candles only")`,
    `cooldownBars = input.int(${c.execution.cooldownBars}, "Signal cooldown bars", minval=0)`,
  ];

  if (c.trend.emaEnabled) {
    lines.push(`emaFastLen = input.int(${c.trend.emaFast}, "Fast EMA", minval=1)`);
    lines.push(`emaSlowLen = input.int(${c.trend.emaSlow}, "Slow EMA", minval=1)`);
  }
  if (c.trend.longMaEnabled) lines.push(`longMaLen = input.int(${c.trend.longMaLength}, "Long MA", minval=1)`);
  if (c.momentum.rsiEnabled || c.momentum.divergenceEnabled) {
    lines.push(`rsiLen = input.int(${c.momentum.rsiLength}, "RSI length", minval=2)`);
    lines.push(`rsiLongLevel = input.float(${c.momentum.rsiLong}, "RSI long threshold")`);
    lines.push(`rsiShortLevel = input.float(${c.momentum.rsiShort}, "RSI short threshold")`);
  }
  if (c.volume.enabled) {
    lines.push(`volumeLen = input.int(${c.volume.averageLength}, "Volume average", minval=1)`);
    lines.push(`volumeMultiplier = input.float(${c.volume.multiplier}, "Volume multiplier", minval=0.1, step=0.05)`);
  }
  if (c.momentum.adxEnabled) {
    lines.push(`adxLen = input.int(${c.momentum.adxLength}, "ADX length", minval=2)`);
    lines.push(`adxThreshold = input.float(${c.momentum.adxThreshold}, "ADX threshold")`);
  }
  if (c.trend.supertrendEnabled) {
    lines.push(`stAtrLen = input.int(${c.trend.supertrendAtrLength}, "Supertrend ATR length", minval=1)`);
    lines.push(`stFactor = input.float(${c.trend.supertrendFactor}, "Supertrend factor", minval=0.1)`);
  }
  if (c.higherTimeframe.enabled) lines.push(`htf = input.timeframe("${c.higherTimeframe.timeframe}", "Higher timeframe")`);
  if (c.execution.sessionEnabled) lines.push(`tradeSession = input.session("${c.execution.session}", "Trading session")`);
  if (strategy && c.risk.stopMode === "atr") {
    lines.push(`atrLen = input.int(${c.risk.atrLength}, "ATR length", minval=1)`);
    lines.push(`atrMultiple = input.float(${c.risk.atrMultiple}, "ATR stop multiple", minval=0.1)`);
  }
  if (strategy && c.risk.stopMode === "percent") lines.push(`stopPercent = input.float(${c.risk.stopPercent}, "Stop %", minval=0.1) / 100`);
  if (strategy && c.risk.takeProfitMode === "risk_reward") lines.push(`riskReward = input.float(${c.risk.riskReward}, "Risk/reward", minval=0.1)`);
  if (strategy && c.risk.takeProfitMode === "percent") lines.push(`takeProfitPercent = input.float(${c.risk.takeProfitPercent}, "Take profit %", minval=0.1) / 100`);

  lines.push("", "// === Core calculations ===");
  if (c.trend.emaEnabled) {
    lines.push("emaFast = ta.ema(close, emaFastLen)", "emaSlow = ta.ema(close, emaSlowLen)");
  }
  if (c.trend.longMaEnabled) {
    lines.push(`longMa = ${c.trend.longMaType === "sma" ? "ta.sma" : "ta.ema"}(close, longMaLen)`);
  }
  if (c.trend.vwapEnabled) lines.push("vwapValue = ta.vwap(hlc3)");
  if (c.trend.supertrendEnabled) lines.push("[supertrendValue, supertrendDirection] = ta.supertrend(stFactor, stAtrLen)");
  if (c.momentum.rsiEnabled || c.momentum.divergenceEnabled) lines.push("rsiValue = ta.rsi(close, rsiLen)");
  if (c.momentum.macdEnabled) lines.push("[macdLine, macdSignal, macdHist] = ta.macd(close, 12, 26, 9)");
  if (c.momentum.adxEnabled) lines.push("[plusDI, minusDI, adxValue] = ta.dmi(adxLen, adxLen)");
  if (c.volume.enabled) lines.push("volumeAverage = ta.sma(volume, volumeLen)");
  if (strategy && c.risk.stopMode === "atr") lines.push("atrValue = ta.atr(atrLen)");

  if (c.momentum.divergenceEnabled) {
    const p = c.momentum.divergencePivot;
    lines.push(
      "",
      "// Confirmed pivot-based RSI divergence. Pivots are only known after the right-side bars complete.",
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
    const expr = c.higherTimeframe.method === "ema"
      ? `close > ta.ema(close, ${c.higherTimeframe.length})`
      : c.higherTimeframe.method === "sma"
        ? `close > ta.sma(close, ${c.higherTimeframe.length})`
        : `close > ta.ema(close, ${c.higherTimeframe.length})`;
    lines.push("", "// Higher-timeframe bias uses lookahead_off to avoid future data.");
    lines.push(`htfBull = request.security(syminfo.tickerid, htf, ${expr}, lookahead=barmerge.lookahead_off)`);
    lines.push("htfBear = not htfBull");
  }

  lines.push("", "// === Conditions ===");
  const longConditions: string[] = [];
  const shortConditions: string[] = [];

  if (c.trend.emaEnabled) {
    longConditions.push("emaFast > emaSlow");
    shortConditions.push("emaFast < emaSlow");
  }
  if (c.trend.longMaEnabled) {
    longConditions.push("close > longMa");
    shortConditions.push("close < longMa");
  }
  if (c.trend.vwapEnabled) {
    longConditions.push("close > vwapValue");
    shortConditions.push("close < vwapValue");
  }
  if (c.trend.supertrendEnabled) {
    longConditions.push("supertrendDirection < 0");
    shortConditions.push("supertrendDirection > 0");
  }
  if (c.momentum.rsiEnabled) {
    longConditions.push("rsiValue >= rsiLongLevel");
    shortConditions.push("rsiValue <= rsiShortLevel");
  }
  if (c.momentum.macdEnabled) {
    longConditions.push("macdLine > macdSignal and macdHist > 0");
    shortConditions.push("macdLine < macdSignal and macdHist < 0");
  }
  if (c.momentum.adxEnabled) {
    longConditions.push("adxValue >= adxThreshold and plusDI > minusDI");
    shortConditions.push("adxValue >= adxThreshold and minusDI > plusDI");
  }
  if (c.momentum.divergenceEnabled) {
    longConditions.push("bullishDivergence");
    shortConditions.push("bearishDivergence");
  }
  if (c.volume.enabled) {
    longConditions.push("volume >= volumeAverage * volumeMultiplier");
    shortConditions.push("volume >= volumeAverage * volumeMultiplier");
  }
  if (c.higherTimeframe.enabled && c.higherTimeframe.blockCounterTrend) {
    longConditions.push("htfBull");
    shortConditions.push("htfBear");
  }
  if (c.execution.sessionEnabled) {
    longConditions.push("not na(time(timeframe.period, tradeSession))");
    shortConditions.push("not na(time(timeframe.period, tradeSession))");
  }
  if (c.confirmedBarsOnly) {
    longConditions.push("barstate.isconfirmed");
    shortConditions.push("barstate.isconfirmed");
  }

  const longBase = longConditions.length ? longConditions.join(" and ") : "true";
  const shortBase = shortConditions.length ? shortConditions.join(" and ") : "true";
  lines.push(`longBase = ${longBase}`);
  lines.push(`shortBase = ${shortBase}`);
  lines.push("var int lastSignalBar = na");
  lines.push("cooldownOk = na(lastSignalBar) or bar_index - lastSignalBar > cooldownBars");
  lines.push("longSignal = longBase and cooldownOk");
  lines.push("shortSignal = shortBase and cooldownOk");
  if (c.direction === "long_only" || c.direction === "spot_buy_exit") lines.push("shortSignal := false");
  lines.push("if longSignal or shortSignal\n    lastSignalBar := bar_index");

  lines.push("", "// === Visuals ===");
  if (c.trend.emaEnabled) lines.push("plot(emaFast, \"Fast EMA\", color=color.aqua)", "plot(emaSlow, \"Slow EMA\", color=color.orange)");
  if (c.trend.longMaEnabled) lines.push("plot(longMa, \"Long MA\", color=color.yellow, linewidth=2)");
  if (c.trend.vwapEnabled) lines.push("plot(vwapValue, \"VWAP\", color=color.purple)");
  if (c.trend.supertrendEnabled) lines.push("plot(supertrendValue, \"Supertrend\", color=supertrendDirection < 0 ? color.lime : color.red, linewidth=2)");
  lines.push("plotshape(longSignal, title=\"Long\", style=shape.labelup, location=location.belowbar, color=color.lime, text=\"LONG\", textcolor=color.black, size=size.tiny)");
  lines.push("plotshape(shortSignal, title=\"Short\", style=shape.labeldown, location=location.abovebar, color=color.red, text=\"SHORT\", textcolor=color.white, size=size.tiny)");
  if (c.execution.showBackground && c.higherTimeframe.enabled) lines.push("bgcolor(htfBull ? color.new(color.green, 92) : color.new(color.red, 92), title=\"HTF bias\")");

  if (c.execution.showDashboard) {
    lines.push(
      "var table dashboard = table.new(position.top_right, 2, 4, border_width=1)",
      "if barstate.islast",
      "    table.cell(dashboard, 0, 0, \"PineForge\", bgcolor=color.new(color.blue, 70), text_color=color.white)",
      `    table.cell(dashboard, 1, 0, "${c.style}")`,
      "    table.cell(dashboard, 0, 1, \"Long ready\")",
      "    table.cell(dashboard, 1, 1, longBase ? \"YES\" : \"NO\", text_color=longBase ? color.lime : color.gray)",
      "    table.cell(dashboard, 0, 2, \"Short ready\")",
      "    table.cell(dashboard, 1, 2, shortBase ? \"YES\" : \"NO\", text_color=shortBase ? color.red : color.gray)",
      "    table.cell(dashboard, 0, 3, \"Confirmed\")",
      "    table.cell(dashboard, 1, 3, barstate.isconfirmed ? \"YES\" : \"WAIT\")"
    );
  }

  if (strategy) {
    lines.push("", "// === Strategy orders ===");
    lines.push("if longSignal and strategy.position_size <= 0\n    strategy.entry(\"Long\", strategy.long, alert_message=\"LONG {{ticker}} @ {{close}}\")");
    if (c.direction === "long_short") lines.push("if shortSignal and strategy.position_size >= 0\n    strategy.entry(\"Short\", strategy.short, alert_message=\"SHORT {{ticker}} @ {{close}}\")");
    if (c.direction === "spot_buy_exit") lines.push("if shortBase and strategy.position_size > 0\n    strategy.close(\"Long\", alert_message=\"SPOT EXIT {{ticker}} @ {{close}}\")");

    if (c.risk.stopMode !== "none" || c.risk.takeProfitMode !== "none") {
      if (c.risk.stopMode === "atr") {
        lines.push("longStop = strategy.position_avg_price - atrValue * atrMultiple", "shortStop = strategy.position_avg_price + atrValue * atrMultiple");
      } else if (c.risk.stopMode === "percent") {
        lines.push("longStop = strategy.position_avg_price * (1 - stopPercent)", "shortStop = strategy.position_avg_price * (1 + stopPercent)");
      } else {
        lines.push("longStop = ta.lowest(low, 10)", "shortStop = ta.highest(high, 10)");
      }
      if (c.risk.takeProfitMode === "risk_reward") {
        lines.push("longTarget = strategy.position_avg_price + (strategy.position_avg_price - longStop) * riskReward", "shortTarget = strategy.position_avg_price - (shortStop - strategy.position_avg_price) * riskReward");
      } else if (c.risk.takeProfitMode === "percent") {
        lines.push("longTarget = strategy.position_avg_price * (1 + takeProfitPercent)", "shortTarget = strategy.position_avg_price * (1 - takeProfitPercent)");
      } else {
        lines.push("float longTarget = na", "float shortTarget = na");
      }
      lines.push("if strategy.position_size > 0\n    strategy.exit(\"Long Exit\", \"Long\", stop=longStop, limit=longTarget, alert_message=\"LONG EXIT {{ticker}}\")");
      if (c.direction === "long_short") lines.push("if strategy.position_size < 0\n    strategy.exit(\"Short Exit\", \"Short\", stop=shortStop, limit=shortTarget, alert_message=\"SHORT EXIT {{ticker}}\")");
    }
    if (c.risk.takeProfitMode === "opposite_signal") {
      lines.push("if shortSignal and strategy.position_size > 0\n    strategy.close(\"Long\")");
      if (c.direction === "long_short") lines.push("if longSignal and strategy.position_size < 0\n    strategy.close(\"Short\")");
    }
  }

  if (c.execution.alertsEnabled) {
    lines.push("", "// === Alerts ===");
    if (strategy) {
      lines.push("if longSignal\n    alert(\"LONG {{ticker}} @ {{close}}\", alert.freq_once_per_bar_close)");
      if (c.direction === "long_short") lines.push("if shortSignal\n    alert(\"SHORT {{ticker}} @ {{close}}\", alert.freq_once_per_bar_close)");
    } else {
      lines.push("alertcondition(longSignal, \"Long signal\", \"LONG {{ticker}} @ {{close}}\")");
      if (c.direction === "long_short") lines.push("alertcondition(shortSignal, \"Short signal\", \"SHORT {{ticker}} @ {{close}}\")");
    }
  }

  return lines.join("\n");
}
