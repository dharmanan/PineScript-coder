import { compilePine as compileBase } from "./compiler-v9";
import type { StrategyConfig } from "./types";

const profileLabel = (profile: StrategyConfig["visual"]["profile"]) =>
  profile === "clean" ? "Clean" : profile === "enhanced" ? "Enhanced" : "Advanced";

const replaceRegexRequired = (source: string, pattern: RegExp, replacement: string): string => {
  if (!pattern.test(source)) throw new Error(`Compiler transform anchor missing: ${pattern.source.slice(0, 80)}`);
  return source.replace(pattern, replacement);
};

export function compilePine(config: StrategyConfig): string {
  let code = compileBase(config);
  const label = profileLabel(config.visual.profile);
  const runtimeInput = `visualProfile = input.string("${label}", "Visual profile", options=["Clean", "Enhanced", "Advanced"])`;
  const bakedProfile = `visualProfile = "${label}" // Selected in Kohen Pine Studio`;

  if (!code.includes(runtimeInput)) throw new Error("Compiler transform anchor missing: visual profile input");
  code = code.replace(runtimeInput, bakedProfile);

  if (config.direction !== "spot_buy_exit") {
    code = replaceRegexRequired(
      code,
      /plotshape\(longSignal, title="Long", style=shape\.labelup, location=location\.belowbar, color=color\.lime, text="LONG", textcolor=color\.black, size=size\.(?:tiny|small|normal)\)/,
      'if longSignal\n    label.new(bar_index, low, "LONG\\n" + str.tostring(close, format.mintick), style=label.style_label_up, color=color.lime, textcolor=color.black, size=size.normal)'
    );

    if (config.direction === "long_short") {
      code = replaceRegexRequired(
        code,
        /plotshape\(shortSignal, title="Short", style=shape\.labeldown, location=location\.abovebar, color=color\.red, text="SHORT", textcolor=color\.white, size=size\.(?:tiny|small|normal)\)/,
        'if shortSignal\n    label.new(bar_index, high, "SHORT\\n" + str.tostring(close, format.mintick), style=label.style_label_down, color=color.red, textcolor=color.white, size=size.normal)'
      );
    }
  }

  if (config.execution.showBackground && config.higherTimeframe.enabled) {
    const oldHtfBackground = 'bgcolor(htfBull ? color.new(color.green, 92) : color.new(color.red, 92), title="HTF bias")';
    const profileAwareHtfBackground = 'bgcolor(showTrendRibbon and visualProfile != "Clean" ? (htfBull ? color.new(color.green, 99) : color.new(color.red, 99)) : na, title="HTF bias")';
    if (!code.includes(oldHtfBackground)) throw new Error("Compiler transform anchor missing: HTF bias background");
    code = code.replace(oldHtfBackground, profileAwareHtfBackground);
  }

  const hasVisualRisk = config.outputMode === "indicator" && (config.risk.stopMode !== "none" || config.risk.takeProfitMode !== "none");
  if (hasVisualRisk) {
    const outcomeState = 'var string lastRiskOutcome = "NONE"';
    const outcomeStateWithPrices = `${outcomeState}\nvar float lastOutcomeEntry = na\nvar float lastOutcomePrice = na`;
    if (!code.includes(outcomeState)) throw new Error("Compiler transform anchor missing: last risk outcome state");
    code = code.replace(outcomeState, outcomeStateWithPrices);

    if (code.includes('lastRiskOutcome := "REVERSED"')) {
      code = code.replace(
        'lastRiskOutcome := "REVERSED"',
        'lastRiskOutcome := "REVERSED"\n    lastOutcomeEntry := riskEntry\n    lastOutcomePrice := close'
      );
    }

    const outcomePriceAnchor = 'outcomePrice = riskAmbiguous ? math.avg(riskStop, riskTarget) : riskStopHit ? riskStop : riskTarget';
    if (!code.includes(outcomePriceAnchor)) throw new Error("Compiler transform anchor missing: risk outcome price");
    code = code.replace(
      outcomePriceAnchor,
      `${outcomePriceAnchor}\n    lastOutcomeEntry := riskEntry\n    lastOutcomePrice := outcomePrice`
    );

    if (config.execution.showDashboard) {
      code = code.replace(
        /var table dashboard = table\.new\(position\.top_right, 2, (\d+), border_width=1\)/,
        (_match, rows) => `var table dashboard = table.new(position.top_right, 2, ${Number(rows) + 2}, border_width=1)`
      );

      const sessionValue = /    table\.cell\(dashboard, 1, (\d+), sessionOk \? "ACTIVE" : "CLOSED", text_color=sessionOk \? color\.lime : color\.gray\)/;
      const resultValue = /    table\.cell\(dashboard, 1, (\d+), lastRiskOutcome, text_color=lastRiskOutcome == "TARGET HIT" \? color\.lime : lastRiskOutcome == "STOP HIT" \? color\.red : lastRiskOutcome == "NONE" \? color\.gray : color\.orange\)/;
      const match = code.match(sessionValue) ?? code.match(resultValue);
      if (!match) throw new Error("Compiler transform anchor missing: dashboard final risk row");

      const entryRow = Number(match[1]) + 1;
      const priceRow = entryRow + 1;
      const anchor = match[0];
      const replacement = `${anchor}\n    table.cell(dashboard, 0, ${entryRow}, "Last entry")\n    table.cell(dashboard, 1, ${entryRow}, na(lastOutcomeEntry) ? "NONE" : str.tostring(lastOutcomeEntry, format.mintick), text_color=na(lastOutcomeEntry) ? color.gray : color.white)\n    table.cell(dashboard, 0, ${priceRow}, "Result price")\n    table.cell(dashboard, 1, ${priceRow}, na(lastOutcomePrice) ? "NONE" : str.tostring(lastOutcomePrice, format.mintick), text_color=lastRiskOutcome == "TARGET HIT" ? color.lime : lastRiskOutcome == "STOP HIT" ? color.red : lastRiskOutcome == "NONE" ? color.gray : color.orange)`;
      code = code.replace(anchor, replacement);
    }
  }

  return code;
}
