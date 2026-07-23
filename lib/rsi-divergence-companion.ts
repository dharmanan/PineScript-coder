const quote = (value: string): string => value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

export function compileRsiDivergenceCompanion(sourceName: string): string {
  const title = `${sourceName} RSI Divergence Companion`;

  return `//@version=6
// Generated deterministically by PineForge Studio
// Companion panel for ${quote(sourceName)}. It does not change the main script's signals.
// Pivot labels appear on the pivot bar after the right-lookback bars confirm the divergence.
indicator("${quote(title)}", shorttitle="PineForge RSI Div", overlay=false, format=format.price)

// === Inputs ===
rsiLength = input.int(14, "RSI period", minval=1)
rsiSource = input.source(close, "RSI source")
pivotLeft = input.int(5, "Pivot lookback left", minval=1)
pivotRight = input.int(5, "Pivot lookback right", minval=1)
rangeMinimum = input.int(5, "Minimum pivot range", minval=1)
rangeMaximum = input.int(60, "Maximum pivot range", minval=2)
showRegularBull = input.bool(true, "Show regular bullish")
showHiddenBull = input.bool(true, "Show hidden bullish")
showRegularBear = input.bool(true, "Show regular bearish")
showHiddenBear = input.bool(true, "Show hidden bearish")

// === RSI pane ===
rsiValue = ta.rsi(rsiSource, rsiLength)
regularBullColor = color.green
regularBearColor = color.red
hiddenBullColor = color.new(color.green, 35)
hiddenBearColor = color.new(color.red, 35)
transparentColor = color.new(color.white, 100)

plot(rsiValue, "RSI", linewidth=2, color=color.rgb(41, 98, 255))
middleLine = hline(50, "Middle line", color=color.rgb(120, 123, 134), linestyle=hline.style_dotted)
overboughtLine = hline(70, "Overbought", color=color.rgb(120, 123, 134), linestyle=hline.style_dotted)
oversoldLine = hline(30, "Oversold", color=color.rgb(120, 123, 134), linestyle=hline.style_dotted)
fill(overboughtLine, oversoldLine, "RSI background", color=color.rgb(33, 150, 243, 90))

pivotLowFound = not na(ta.pivotlow(rsiValue, pivotLeft, pivotRight))
pivotHighFound = not na(ta.pivothigh(rsiValue, pivotLeft, pivotRight))

inRange(condition) =>
    barsSince = ta.barssince(condition)
    rangeMinimum <= barsSince and barsSince <= rangeMaximum

// === Regular bullish: price lower low, RSI higher low ===
previousLowInRange = inRange(pivotLowFound[1])
rsiHigherLow = rsiValue[pivotRight] > ta.valuewhen(pivotLowFound, rsiValue[pivotRight], 1) and previousLowInRange
priceLowerLow = low[pivotRight] < ta.valuewhen(pivotLowFound, low[pivotRight], 1)
regularBullAlert = priceLowerLow and rsiHigherLow and pivotLowFound
regularBull = showRegularBull and regularBullAlert

plot(pivotLowFound ? rsiValue[pivotRight] : na, offset=-pivotRight, title="Regular bullish", linewidth=2, color=regularBull ? regularBullColor : transparentColor)
plotshape(regularBull ? rsiValue[pivotRight] : na, offset=-pivotRight, title="Regular bullish label", text="Bull", style=shape.labelup, location=location.absolute, color=regularBullColor, textcolor=color.white)

// === Hidden bullish: price higher low, RSI lower low ===
rsiLowerLow = rsiValue[pivotRight] < ta.valuewhen(pivotLowFound, rsiValue[pivotRight], 1) and previousLowInRange
priceHigherLow = low[pivotRight] > ta.valuewhen(pivotLowFound, low[pivotRight], 1)
hiddenBullAlert = priceHigherLow and rsiLowerLow and pivotLowFound
hiddenBull = showHiddenBull and hiddenBullAlert

plot(pivotLowFound ? rsiValue[pivotRight] : na, offset=-pivotRight, title="Hidden bullish", linewidth=2, color=hiddenBull ? hiddenBullColor : transparentColor)
plotshape(hiddenBull ? rsiValue[pivotRight] : na, offset=-pivotRight, title="Hidden bullish label", text="H Bull", style=shape.labelup, location=location.absolute, color=hiddenBullColor, textcolor=color.white)

// === Regular bearish: price higher high, RSI lower high ===
previousHighInRange = inRange(pivotHighFound[1])
rsiLowerHigh = rsiValue[pivotRight] < ta.valuewhen(pivotHighFound, rsiValue[pivotRight], 1) and previousHighInRange
priceHigherHigh = high[pivotRight] > ta.valuewhen(pivotHighFound, high[pivotRight], 1)
regularBearAlert = priceHigherHigh and rsiLowerHigh and pivotHighFound
regularBear = showRegularBear and regularBearAlert

plot(pivotHighFound ? rsiValue[pivotRight] : na, offset=-pivotRight, title="Regular bearish", linewidth=2, color=regularBear ? regularBearColor : transparentColor)
plotshape(regularBear ? rsiValue[pivotRight] : na, offset=-pivotRight, title="Regular bearish label", text="Bear", style=shape.labeldown, location=location.absolute, color=regularBearColor, textcolor=color.white)

// === Hidden bearish: price lower high, RSI higher high ===
rsiHigherHigh = rsiValue[pivotRight] > ta.valuewhen(pivotHighFound, rsiValue[pivotRight], 1) and previousHighInRange
priceLowerHigh = high[pivotRight] < ta.valuewhen(pivotHighFound, high[pivotRight], 1)
hiddenBearAlert = priceLowerHigh and rsiHigherHigh and pivotHighFound
hiddenBear = showHiddenBear and hiddenBearAlert

plot(pivotHighFound ? rsiValue[pivotRight] : na, offset=-pivotRight, title="Hidden bearish", linewidth=2, color=hiddenBear ? hiddenBearColor : transparentColor)
plotshape(hiddenBear ? rsiValue[pivotRight] : na, offset=-pivotRight, title="Hidden bearish label", text="H Bear", style=shape.labeldown, location=location.absolute, color=hiddenBearColor, textcolor=color.white)

// === Alerts ===
alertcondition(regularBullAlert, "Regular bullish divergence", "A new regular bullish RSI divergence was confirmed.")
alertcondition(hiddenBullAlert, "Hidden bullish divergence", "A new hidden bullish RSI divergence was confirmed.")
alertcondition(regularBearAlert, "Regular bearish divergence", "A new regular bearish RSI divergence was confirmed.")
alertcondition(hiddenBearAlert, "Hidden bearish divergence", "A new hidden bearish RSI divergence was confirmed.")
`;
}
