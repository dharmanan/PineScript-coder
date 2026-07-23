import { compilePine as compileBase } from "./compiler-v12";
import type { StrategyConfig } from "./types";

export function compilePine(config: StrategyConfig): string {
  let code = compileBase(config);

  if (!config.execution.showDashboard) return code;

  let dashboardCells = 0;
  code = code.replace(/^    table\.cell\(dashboard,.*\)$/gm, (line) => {
    dashboardCells += 1;

    let updated = line
      .replace(/bgcolor=color\.new\(color\.black, 18\)/g, "bgcolor=color.new(color.rgb(15, 23, 42), 8)")
      .replace(/text_size=size\.small/g, "text_size=size.normal");

    if (!updated.includes("text_color=")) {
      updated = `${updated.slice(0, -1)}, text_color=color.white)`;
    }

    return updated;
  });

  if (dashboardCells === 0) {
    throw new Error("Compiler transform anchor missing: dashboard cells");
  }

  return code;
}
