import { compilePine as compileBase } from "./compiler-v13";
import type { StrategyConfig } from "./types";

const appendForceOverlay = (line: string): string => {
  if (line.includes("force_overlay=")) return line;
  return `${line.slice(0, -1)}, force_overlay=true)`;
};

export function compilePine(config: StrategyConfig): string {
  let code = compileBase(config);
  const supportsIntegratedRsiPane =
    config.name === "Fast EMA Scalper" ||
    config.name === "Balanced Intraday" ||
    config.name === "VWAP Session Trader";
  const useIntegratedRsiPane = supportsIntegratedRsiPane && config.outputMode === "indicator";

  if (!useIntegratedRsiPane) return code;

  const declaration = `indicator("${config.name}", overlay=true, max_labels_count=500, max_lines_count=500)`;
  const paneDeclaration = `indicator("${config.name}", overlay=false, max_labels_count=500, max_lines_count=500)`;
  if (!code.includes(declaration)) {
    throw new Error("Compiler transform anchor missing: integrated RSI indicator declaration");
  }
  code = code.replace(declaration, paneDeclaration);

  let overlayVisuals = 0;
  code = code.replace(/^(bgcolor|plot)\(.*\)$/gm, (line) => {
    overlayVisuals += 1;
    return appendForceOverlay(line);
  });

  code = code.replace(/^\s*label\.new\(.*\)$/gm, (line) => {
    overlayVisuals += 1;
    return appendForceOverlay(line);
  });

  if (config.execution.showDashboard) {
    const tablePattern = /var table dashboard = table\.new\(position\.top_right, 2, (\d+), border_width=1\)/;
    if (!tablePattern.test(code)) {
      throw new Error("Compiler transform anchor missing: integrated RSI dashboard table");
    }
    code = code.replace(
      tablePattern,
      "var table dashboard = table.new(position.top_right, 2, $1, border_width=1, force_overlay=true)"
    );
  }

  if (overlayVisuals === 0) {
    throw new Error("Compiler transform anchor missing: integrated RSI overlay visuals");
  }

  const alertsAnchor = "// === Alerts ===";
  if (!code.includes(alertsAnchor)) {
    throw new Error("Compiler transform anchor missing: alerts section");
  }

  const divergencePane = `// === Integrated RSI divergence pane ===
divRsiLength = input.int(14, "Divergence RSI period", minval=1)
divPivotLeft = input.int(5, "Divergence pivot left", minval=1)
divPivotRight = input.int(5, "Divergence pivot right", minval=1)
divRangeMinimum = input.int(5, "Divergence minimum pivot range", minval=1)
divRangeMaximum = input.int(60, "Divergence maximum pivot range", minval=2)
showRegularBullDiv = input.bool(true, "Show regular bullish divergence")
showHiddenBullDiv = input.bool(false, "Show hidden bullish divergence")
showRegularBearDiv = input.bool(true, "Show regular bearish divergence")
showHiddenBearDiv = input.bool(false, "Show hidden bearish divergence")

divRsi = ta.rsi(close, divRsiLength)
divRegularBullColor = color.green
divRegularBearColor = color.red
divHiddenBullColor = color.new(color.green, 35)
divHiddenBearColor = color.new(color.red, 35)
divTransparentColor = color.new(color.white, 100)

plot(divRsi, "RSI divergence", linewidth=2, color=color.rgb(41, 98, 255))
divMiddleLine = hline(50, "RSI middle", color=color.rgb(120, 123, 134), linestyle=hline.style_dotted)
divOverboughtLine = hline(70, "RSI overbought", color=color.rgb(120, 123, 134), linestyle=hline.style_dotted)
divOversoldLine = hline(30, "RSI oversold", color=color.rgb(120, 123, 134), linestyle=hline.style_dotted)
fill(divOverboughtLine, divOversoldLine, color=color.rgb(33, 150, 243, 90), title="RSI divergence background")

divPivotLowFound = not na(ta.pivotlow(divRsi, divPivotLeft, divPivotRight))
divPivotHighFound = not na(ta.pivothigh(divRsi, divPivotLeft, divPivotRight))

divInRange(condition) =>
    divBarsSince = ta.barssince(condition)
    divRangeMinimum <= divBarsSince and divBarsSince <= divRangeMaximum

divPreviousLowInRange = divInRange(divPivotLowFound[1])
divRsiHigherLow = divRsi[divPivotRight] > ta.valuewhen(divPivotLowFound, divRsi[divPivotRight], 1) and divPreviousLowInRange
divPriceLowerLow = low[divPivotRight] < ta.valuewhen(divPivotLowFound, low[divPivotRight], 1)
divRegularBullAlert = divPriceLowerLow and divRsiHigherLow and divPivotLowFound
divRegularBull = showRegularBullDiv and divRegularBullAlert
plot(divPivotLowFound ? divRsi[divPivotRight] : na, offset=-divPivotRight, title="Regular bullish divergence", linewidth=2, color=divRegularBull ? divRegularBullColor : divTransparentColor)
plotshape(divRegularBull ? divRsi[divPivotRight] : na, offset=-divPivotRight, title="Regular bullish label", text="Bull", style=shape.labelup, location=location.absolute, color=divRegularBullColor, textcolor=color.white)

divRsiLowerLow = divRsi[divPivotRight] < ta.valuewhen(divPivotLowFound, divRsi[divPivotRight], 1) and divPreviousLowInRange
divPriceHigherLow = low[divPivotRight] > ta.valuewhen(divPivotLowFound, low[divPivotRight], 1)
divHiddenBullAlert = divPriceHigherLow and divRsiLowerLow and divPivotLowFound
divHiddenBull = showHiddenBullDiv and divHiddenBullAlert
plot(divPivotLowFound ? divRsi[divPivotRight] : na, offset=-divPivotRight, title="Hidden bullish divergence", linewidth=2, color=divHiddenBull ? divHiddenBullColor : divTransparentColor)
plotshape(divHiddenBull ? divRsi[divPivotRight] : na, offset=-divPivotRight, title="Hidden bullish label", text="H Bull", style=shape.labelup, location=location.absolute, color=divHiddenBullColor, textcolor=color.white)

divPreviousHighInRange = divInRange(divPivotHighFound[1])
divRsiLowerHigh = divRsi[divPivotRight] < ta.valuewhen(divPivotHighFound, divRsi[divPivotRight], 1) and divPreviousHighInRange
divPriceHigherHigh = high[divPivotRight] > ta.valuewhen(divPivotHighFound, high[divPivotRight], 1)
divRegularBearAlert = divPriceHigherHigh and divRsiLowerHigh and divPivotHighFound
divRegularBear = showRegularBearDiv and divRegularBearAlert
plot(divPivotHighFound ? divRsi[divPivotRight] : na, offset=-divPivotRight, title="Regular bearish divergence", linewidth=2, color=divRegularBear ? divRegularBearColor : divTransparentColor)
plotshape(divRegularBear ? divRsi[divPivotRight] : na, offset=-divPivotRight, title="Regular bearish label", text="Bear", style=shape.labeldown, location=location.absolute, color=divRegularBearColor, textcolor=color.white)

divRsiHigherHigh = divRsi[divPivotRight] > ta.valuewhen(divPivotHighFound, divRsi[divPivotRight], 1) and divPreviousHighInRange
divPriceLowerHigh = high[divPivotRight] < ta.valuewhen(divPivotHighFound, high[divPivotRight], 1)
divHiddenBearAlert = divPriceLowerHigh and divRsiHigherHigh and divPivotHighFound
divHiddenBear = showHiddenBearDiv and divHiddenBearAlert
plot(divPivotHighFound ? divRsi[divPivotRight] : na, offset=-divPivotRight, title="Hidden bearish divergence", linewidth=2, color=divHiddenBear ? divHiddenBearColor : divTransparentColor)
plotshape(divHiddenBear ? divRsi[divPivotRight] : na, offset=-divPivotRight, title="Hidden bearish label", text="H Bear", style=shape.labeldown, location=location.absolute, color=divHiddenBearColor, textcolor=color.white)

alertcondition(divRegularBullAlert, "Regular bullish divergence", "A new regular bullish RSI divergence was confirmed.")
alertcondition(divHiddenBullAlert, "Hidden bullish divergence", "A new hidden bullish RSI divergence was confirmed.")
alertcondition(divRegularBearAlert, "Regular bearish divergence", "A new regular bearish RSI divergence was confirmed.")
alertcondition(divHiddenBearAlert, "Hidden bearish divergence", "A new hidden bearish RSI divergence was confirmed.")

`;

  return code.replace(alertsAnchor, divergencePane + alertsAnchor);
}
