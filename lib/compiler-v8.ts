import { compilePine as compileBase } from "./compiler-v7";
import type { StrategyConfig } from "./types";

export function compilePine(config: StrategyConfig): string {
  let code = compileBase(config);
  const hasVisualRisk = config.outputMode === "indicator" && (config.risk.stopMode !== "none" || config.risk.takeProfitMode !== "none");
  if (!hasVisualRisk || !config.execution.showDashboard) return code;

  code = code.replace(
    /var table dashboard = table\.new\(position\.top_right, 2, (\d+), border_width=1\)/,
    (_match, rows) => `var table dashboard = table.new(position.top_right, 2, ${Number(rows) + 2}, border_width=1)`
  );

  const chartTfValue = /    table\.cell\(dashboard, 1, (\d+), chartTimeframeOk \? "OK" : "WRONG: " \+ expectedChartTimeframe, text_color=chartTimeframeOk \? color\.lime : color\.red\)/;
  const match = code.match(chartTfValue);
  if (!match) throw new Error("Compiler transform anchor missing: dashboard chart timeframe row");

  const chartRow = Number(match[1]);
  const riskRow = chartRow + 1;
  const resultRow = chartRow + 2;
  const anchor = match[0];
  const replacement = `${anchor}
    table.cell(dashboard, 0, ${riskRow}, "Risk state")
    table.cell(dashboard, 1, ${riskRow}, riskDirection == 1 ? "ACTIVE LONG" : riskDirection == -1 ? "ACTIVE SHORT" : "NONE", text_color=riskDirection == 1 ? color.lime : riskDirection == -1 ? color.red : color.gray)
    table.cell(dashboard, 0, ${resultRow}, "Last result")
    table.cell(dashboard, 1, ${resultRow}, lastRiskOutcome, text_color=lastRiskOutcome == "TARGET HIT" ? color.lime : lastRiskOutcome == "STOP HIT" ? color.red : lastRiskOutcome == "NONE" ? color.gray : color.orange)`;

  return code.replace(anchor, replacement);
}
