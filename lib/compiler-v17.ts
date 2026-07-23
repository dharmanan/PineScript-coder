import { compilePine as compileBase } from "./compiler-v16";
import type { StrategyConfig } from "./types";

const removeRequired = (source: string, pattern: RegExp, label: string): { code: string; match: string } => {
  const match = source.match(pattern)?.[0];
  if (!match) throw new Error(`Compiler transform anchor missing: ${label}`);
  return { code: source.replace(match, ""), match };
};

export function compilePine(config: StrategyConfig): string {
  let code = compileBase(config);
  const hasVisualRisk =
    config.outputMode === "indicator" &&
    config.direction !== "spot_buy_exit" &&
    (config.risk.stopMode !== "none" || config.risk.takeProfitMode !== "none");

  if (!hasVisualRisk) return code;

  const longLabelPattern = /^if longSignal\n    label\.new\(bar_index, low, "LONG\\n" \+ str\.tostring\(close, format\.mintick\),.*\)\n/m;
  const removedLong = removeRequired(code, longLabelPattern, "long signal label");
  code = removedLong.code;

  let shortLabel = "";
  if (config.direction === "long_short") {
    const shortLabelPattern = /^if shortSignal\n    label\.new\(bar_index, high, "SHORT\\n" \+ str\.tostring\(close, format\.mintick\),.*\)\n/m;
    const removedShort = removeRequired(code, shortLabelPattern, "short signal label");
    code = removedShort.code;
    shortLabel = removedShort.match.replace(/^if shortSignal/m, "if acceptedShortSignal");
  }

  const riskStateAnchor = 'var string lastRiskOutcome = "NONE"';
  if (!code.includes(riskStateAnchor)) {
    throw new Error("Compiler transform anchor missing: indicator risk state");
  }

  const acceptedSignals =
    `${riskStateAnchor}\n` +
    "acceptedLongSignal = longSignal and riskDirection != 1\n" +
    (config.direction === "long_short" ? "acceptedShortSignal = shortSignal and riskDirection != -1\n" : "") +
    removedLong.match.replace(/^if longSignal/m, "if acceptedLongSignal") +
    shortLabel;
  code = code.replace(riskStateAnchor, acceptedSignals);

  const longRiskEntryPattern = /^if longSignal(?: and riskDirection == 0)?\n(?=    riskEntry := close$)/m;
  if (!longRiskEntryPattern.test(code)) {
    throw new Error("Compiler transform anchor missing: accepted long risk entry");
  }
  code = code.replace(longRiskEntryPattern, "if acceptedLongSignal and riskDirection == 0\n");

  if (config.direction === "long_short") {
    const shortRiskEntryPattern = /^if shortSignal(?: and riskDirection == 0)?\n(?=    riskEntry := close$)/m;
    if (!shortRiskEntryPattern.test(code)) {
      throw new Error("Compiler transform anchor missing: accepted short risk entry");
    }
    code = code.replace(shortRiskEntryPattern, "if acceptedShortSignal and riskDirection == 0\n");
  }

  code = code.replace(/longSignal \? "YES" : "WAIT"/g, 'acceptedLongSignal ? "YES" : "WAIT"');
  code = code.replace(/text_color=longSignal \? color\.lime : color\.gray/g, "text_color=acceptedLongSignal ? color.lime : color.gray");
  code = code.replace(/alertcondition\(longSignal, "Long signal"/g, 'alertcondition(acceptedLongSignal, "Long signal"');

  if (config.direction === "long_short") {
    code = code.replace(/shortSignal \? "YES" : "WAIT"/g, 'acceptedShortSignal ? "YES" : "WAIT"');
    code = code.replace(/text_color=shortSignal \? color\.red : color\.gray/g, "text_color=acceptedShortSignal ? color.red : color.gray");
    code = code.replace(/alertcondition\(shortSignal, "Short signal"/g, 'alertcondition(acceptedShortSignal, "Short signal"');
  }

  return code;
}
