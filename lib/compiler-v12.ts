import { compilePine as compileBase } from "./compiler-v11";
import type { StrategyConfig } from "./types";

export function compilePine(config: StrategyConfig): string {
  let code = compileBase(config);
  const hasVisualRisk =
    config.outputMode === "indicator" &&
    (config.risk.stopMode !== "none" || config.risk.takeProfitMode !== "none");

  if (hasVisualRisk) {
    const outcomeLabel =
      "        label.new(bar_index, outcomePrice, lastRiskOutcome, style=label.style_label_left, color=outcomeColor, textcolor=color.white, size=size.small)";
    const alignedOutcomeLabel =
      "        outcomeStyle = riskAmbiguous ? label.style_label_left : riskDirection == 1 ? (riskStopHit ? label.style_label_up : label.style_label_down) : (riskStopHit ? label.style_label_down : label.style_label_up)\n" +
      "        label.new(bar_index, outcomePrice, lastRiskOutcome, style=outcomeStyle, color=outcomeColor, textcolor=color.white, size=size.small)";

    if (!code.includes(outcomeLabel)) {
      throw new Error("Compiler transform anchor missing: risk outcome label");
    }
    code = code.replace(outcomeLabel, alignedOutcomeLabel);
  }

  if (config.execution.showDashboard) {
    let dashboardCells = 0;
    code = code.replace(/^    table\.cell\(dashboard,.*\)$/gm, (line) => {
      dashboardCells += 1;
      const additions: string[] = [];
      if (!line.includes("bgcolor=")) additions.push("bgcolor=color.new(color.black, 18)");
      if (!line.includes("text_size=")) additions.push("text_size=size.small");
      if (additions.length === 0) return line;
      return `${line.slice(0, -1)}, ${additions.join(", ")})`;
    });

    if (dashboardCells === 0) {
      throw new Error("Compiler transform anchor missing: dashboard cells");
    }
  }

  return code;
}
