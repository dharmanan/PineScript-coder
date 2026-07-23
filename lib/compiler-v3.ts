import { compilePine as compileBase } from "./compiler-v2";
import { buildVisualPlan } from "./visual-plan";
import type { StrategyConfig } from "./types";

const q = (value: string) => value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
const bool = (value: boolean) => (value ? "true" : "false");

const profileLabel = (profile: StrategyConfig["visual"]["profile"]) =>
  profile === "clean" ? "Clean" : profile === "enhanced" ? "Enhanced" : "Advanced";

const replaceRequired = (source: string, search: string, replacement: string): string => {
  if (!source.includes(search)) throw new Error(`Compiler transform anchor missing: ${search.slice(0, 80)}`);
  return source.replace(search, replacement);
};

export function compilePine(config: StrategyConfig): string {
  const visual = buildVisualPlan(config);
  const isStrategy = config.outputMode === "strategy";
  const isSpot = config.direction === "spot_buy_exit";
  const allowShort = config.direction === "long_short";
  let code = compileBase(config);

  code = replaceRequired(
    code,
    `cooldownBars = input.int(${config.execution.cooldownBars}, "Signal cooldown bars", minval=0)`,
    `cooldownBars = input.int(${config.execution.cooldownBars}, "Signal cooldown bars", minval=0)\nexpectedChartTimeframe = input.timeframe("${q(config.chartTimeframe)}", "Expected chart timeframe")\nenforceChartTimeframe = input.bool(${bool(config.execution.enforceChartTimeframe)}, "Block signals on a different chart timeframe")\nvisualProfile = input.string("${profileLabel(config.visual.profile)}", "Visual profile", options=["Clean", "Enhanced", "Advanced"])\ncolorSignalBars = input.bool(${bool(visual.colorBars)}, "Color bars by current setup")\nshowTrendRibbon = input.bool(${bool(visual.showTrendRibbon)}, "Show trend ribbon")\nshowRiskOutcomeLabels = input.bool(${bool(visual.showRiskOutcomeLabels)}, "Show stop/target outcome labels")`
  );

  code = replaceRequired(
    code,
    `// === Filters and triggers ===\nconfirmationOk = not confirmedOnly or barstate.isconfirmed`,
    `// === Filters and triggers ===\nconfirmationOk = not confirmedOnly or barstate.isconfirmed\nchartTimeframeAliasOk = (timeframe.period == "1D" and expectedChartTimeframe == "D") or (timeframe.period == "D" and expectedChartTimeframe == "1D")\nchartTimeframeOk = timeframe.period == expectedChartTimeframe or chartTimeframeAliasOk\nchartTimeframeAllowed = not enforceChartTimeframe or chartTimeframeOk`
  );

  if (isSpot) {
    code = replaceRequired(
      code,
      "buySignal = buySetup and longTrigger and cooldownOk and not spotActive",
      "buySignal = chartTimeframeAllowed and buySetup and longTrigger and cooldownOk and not spotActive"
    );
  } else {
    code = replaceRequired(
      code,
      "longSignal = longSetup and longTrigger and cooldownOk",
      "longSignal = chartTimeframeAllowed and longSetup and longTrigger and cooldownOk"
    );
    if (allowShort) {
      code = replaceRequired(
        code,
        "shortSignal = shortSetup and shortTrigger and cooldownOk",
        "shortSignal = chartTimeframeAllowed and shortSetup and shortTrigger and cooldownOk"
      );
    }
  }

  const labelSize = visual.labelSize === "tiny" ? "size.tiny" : visual.labelSize === "small" ? "size.small" : "size.normal";
  code = code.replace(/size=size\.tiny\)/g, `size=${labelSize})`);

  const advancedLongBar = "color.new(color.rgb(0, 165, 90), 15)";
  const enhancedLongBar = "color.new(color.lime, 60)";
  const advancedShortBar = "color.new(color.rgb(220, 50, 60), 15)";
  const enhancedShortBar = "color.new(color.red, 60)";
  const longBarColor = `visualProfile == "Advanced" ? ${advancedLongBar} : ${enhancedLongBar}`;
  const shortBarColor = `visualProfile == "Advanced" ? ${advancedShortBar} : ${enhancedShortBar}`;

  const setupColorExpression = isSpot
    ? `buySetup ? (${longBarColor}) : na`
    : allowShort
      ? `longSetup ? (${longBarColor}) : shortSetup ? (${shortBarColor}) : na`
      : `longSetup ? (${longBarColor}) : na`;

  const ribbonExpression = config.higherTimeframe.enabled
    ? "showTrendRibbon and visualProfile != \"Clean\" ? (htfBull ? color.new(color.lime, 95) : color.new(color.red, 95)) : na"
    : isSpot
      ? "showTrendRibbon and visualProfile != \"Clean\" ? (buySetup ? color.new(color.lime, 95) : na) : na"
      : "showTrendRibbon and visualProfile != \"Clean\" ? (longSetup ? color.new(color.lime, 95) : " + (allowShort ? "shortSetup ? color.new(color.red, 95) : na" : "na") + ") : na";

  code = replaceRequired(
    code,
    "// === Visuals ===",
    `// === Visuals ===\nbarcolor(colorSignalBars and visualProfile != "Clean" ? ${setupColorExpression} : na, title="Setup bar color")\nbgcolor(${ribbonExpression}, title="Trend ribbon")`
  );

  if (!isStrategy && (config.risk.stopMode !== "none" || config.risk.takeProfitMode !== "none")) {
    code = replaceRequired(
      code,
      "var float riskEntry = na\nvar float riskStop = na\nvar float riskTarget = na\nvar int riskDirection = 0",
      "var float riskEntry = na\nvar float riskStop = na\nvar float riskTarget = na\nvar int riskDirection = 0\nvar int riskStartedBar = na\nvar string riskState = \"NONE\"\nvar string lastRiskOutcome = \"NONE\""
    );

    code = code
      .replace(/riskDirection := 1/g, "riskDirection := 1\n    riskStartedBar := bar_index\n    riskState := \"ACTIVE LONG\"")
      .replace(/riskDirection := -1/g, "riskDirection := -1\n    riskStartedBar := bar_index\n    riskState := \"ACTIVE SHORT\"");

    const lifecycle = `\nriskCanResolve = riskDirection != 0 and not na(riskStartedBar) and bar_index > riskStartedBar\nlongStopHit = riskCanResolve and riskDirection == 1 and not na(riskStop) and low <= riskStop\nlongTargetHit = riskCanResolve and riskDirection == 1 and not na(riskTarget) and high >= riskTarget\nshortStopHit = riskCanResolve and riskDirection == -1 and not na(riskStop) and high >= riskStop\nshortTargetHit = riskCanResolve and riskDirection == -1 and not na(riskTarget) and low <= riskTarget\nriskStopHit = longStopHit or shortStopHit\nriskTargetHit = longTargetHit or shortTargetHit\nriskAmbiguous = riskStopHit and riskTargetHit\nif riskCanResolve and (riskStopHit or riskTargetHit)\n    lastRiskOutcome := riskAmbiguous ? \"AMBIGUOUS\" : riskStopHit ? \"STOP HIT\" : \"TARGET HIT\"\n    riskState := lastRiskOutcome\n    if showRiskOutcomeLabels\n        label.new(bar_index, close, lastRiskOutcome, style=label.style_label_left, color=riskStopHit ? color.red : color.green, textcolor=color.white, size=size.small)\n    riskEntry := na\n    riskStop := na\n    riskTarget := na\n    riskDirection := 0\n    riskStartedBar := na\n`;

    code = replaceRequired(
      code,
      'plot(riskTarget, "Risk Target", color=color.green, linewidth=2, style=plot.style_linebr)',
      'plot(riskTarget, "Risk Target", color=color.green, linewidth=2, style=plot.style_linebr)' + lifecycle
    );
  }

  if (config.execution.showDashboard) {
    code = code.replace(
      /var table dashboard = table\.new\(position\.top_right, 2, (\d+), border_width=1\)/,
      (_match, rows) => `var table dashboard = table.new(position.top_right, 2, ${Number(rows) + 1}, border_width=1)`
    );

    const anchor = isSpot
      ? '    table.cell(dashboard, 1, 4, exitSignal ? "YES" : "NO", text_color=exitSignal ? color.orange : color.gray)'
      : allowShort
        ? '    table.cell(dashboard, 1, 4, shortSignal ? "YES" : "WAIT", text_color=shortSignal ? color.red : color.gray)'
        : '    table.cell(dashboard, 1, 3, confirmationOk ? "YES" : "WAIT")';

    const row = isSpot || allowShort ? 5 : 4;
    code = replaceRequired(
      code,
      anchor,
      `${anchor}\n    table.cell(dashboard, 0, ${row}, "Chart TF")\n    table.cell(dashboard, 1, ${row}, chartTimeframeOk ? "OK" : "WRONG: " + expectedChartTimeframe, text_color=chartTimeframeOk ? color.lime : color.red)`
    );
  }

  return code;
}
