import { compilePine as compileBase } from "./compiler-v8";
import type { StrategyConfig } from "./types";

export function compilePine(config: StrategyConfig): string {
  let code = compileBase(config);
  if (!config.execution.sessionEnabled || !config.execution.showDashboard) return code;

  code = code.replace(
    /var table dashboard = table\.new\(position\.top_right, 2, (\d+), border_width=1\)/,
    (_match, rows) => `var table dashboard = table.new(position.top_right, 2, ${Number(rows) + 1}, border_width=1)`
  );

  const lastResultValue = /    table\.cell\(dashboard, 1, (\d+), lastRiskOutcome, text_color=lastRiskOutcome == "TARGET HIT" \? color\.lime : lastRiskOutcome == "STOP HIT" \? color\.red : lastRiskOutcome == "NONE" \? color\.gray : color\.orange\)/;
  const chartTfValue = /    table\.cell\(dashboard, 1, (\d+), chartTimeframeOk \? "OK" : "WRONG: " \+ expectedChartTimeframe, text_color=chartTimeframeOk \? color\.lime : color\.red\)/;
  const match = code.match(lastResultValue) ?? code.match(chartTfValue);
  if (!match) throw new Error("Compiler transform anchor missing: dashboard final status row");

  const sessionRow = Number(match[1]) + 1;
  const anchor = match[0];
  const replacement = `${anchor}
    table.cell(dashboard, 0, ${sessionRow}, "Session")
    table.cell(dashboard, 1, ${sessionRow}, sessionOk ? "ACTIVE" : "CLOSED", text_color=sessionOk ? color.lime : color.gray)`;

  return code.replace(anchor, replacement);
}
