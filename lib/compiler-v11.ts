import { compilePine as compileBase } from "./compiler-v10";
import type { StrategyConfig } from "./types";

export function compilePine(config: StrategyConfig): string {
  let code = compileBase(config);
  const hasVisualRisk =
    config.outputMode === "indicator" &&
    (config.risk.stopMode !== "none" || config.risk.takeProfitMode !== "none");

  if (!hasVisualRisk) return code;

  const priceState = "var float lastOutcomePrice = na";
  if (!code.includes(priceState)) {
    throw new Error("Compiler transform anchor missing: last outcome price state");
  }
  code = code.replace(
    priceState,
    `${priceState}\nvar int riskStartedTime = na\nvar int lastOutcomeEntryTime = na\nvar int lastOutcomeTime = na`
  );

  if (!code.includes("riskStartedBar := bar_index")) {
    throw new Error("Compiler transform anchor missing: risk start bar");
  }
  code = code.replaceAll(
    "riskStartedBar := bar_index",
    "riskStartedBar := bar_index\n    riskStartedTime := time"
  );

  if (code.includes('lastRiskOutcome := "REVERSED"')) {
    const reversalPrice = "lastOutcomePrice := close";
    if (!code.includes(reversalPrice)) {
      throw new Error("Compiler transform anchor missing: reversal outcome price");
    }
    code = code.replace(
      reversalPrice,
      `${reversalPrice}\n    lastOutcomeEntryTime := riskStartedTime\n    lastOutcomeTime := time`
    );
  }

  const resolvedPrice = "lastOutcomePrice := outcomePrice";
  if (!code.includes(resolvedPrice)) {
    throw new Error("Compiler transform anchor missing: resolved outcome price");
  }
  code = code.replace(
    resolvedPrice,
    `${resolvedPrice}\n    lastOutcomeEntryTime := riskStartedTime\n    lastOutcomeTime := time`
  );

  code = code.replaceAll(
    "riskStartedBar := na",
    "riskStartedBar := na\n    riskStartedTime := na"
  );

  if (!config.execution.showDashboard) return code;

  code = code.replace(
    /var table dashboard = table\.new\(position\.top_right, 2, (\d+), border_width=1\)/,
    (_match, rows) =>
      `var table dashboard = table.new(position.top_right, 2, ${Number(rows) + 2}, border_width=1)`
  );

  const resultPriceValue =
    /    table\.cell\(dashboard, 1, (\d+), na\(lastOutcomePrice\) \? "NONE" : str\.tostring\(lastOutcomePrice, format\.mintick\), text_color=lastRiskOutcome == "TARGET HIT" \? color\.lime : lastRiskOutcome == "STOP HIT" \? color\.red : lastRiskOutcome == "NONE" \? color\.gray : color\.orange\)/;
  const match = code.match(resultPriceValue);
  if (!match) {
    throw new Error("Compiler transform anchor missing: dashboard result price row");
  }

  const entryDateRow = Number(match[1]) + 1;
  const resultDateRow = entryDateRow + 1;
  const anchor = match[0];
  const replacement = `${anchor}\n    table.cell(dashboard, 0, ${entryDateRow}, "Entry date")\n    table.cell(dashboard, 1, ${entryDateRow}, na(lastOutcomeEntryTime) ? "NONE" : str.format_time(lastOutcomeEntryTime, "yyyy-MM-dd HH:mm"), text_color=na(lastOutcomeEntryTime) ? color.gray : color.white)\n    table.cell(dashboard, 0, ${resultDateRow}, "Result date")\n    table.cell(dashboard, 1, ${resultDateRow}, na(lastOutcomeTime) ? "NONE" : str.format_time(lastOutcomeTime, "yyyy-MM-dd HH:mm"), text_color=na(lastOutcomeTime) ? color.gray : color.white)`;

  return code.replace(anchor, replacement);
}
