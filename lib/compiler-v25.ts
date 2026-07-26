import { compilePine as compileBase } from "./compiler-v24";
import type { StrategyConfig } from "./types";

export function compilePine(config: StrategyConfig): string {
  const code = compileBase(config);
  if (!config.execution.showDashboard) return code;

  const table = code.match(/^var table dashboard = table\.new\(.*\)$/m);
  if (!table) throw new Error("Compiler transform anchor missing: dashboard table declaration");

  const guard = code.indexOf("if barstate.islast", code.indexOf(table[0]));
  if (guard === -1) throw new Error("Compiler transform anchor missing: dashboard render guard");

  const input = 'showDashboardPanel = input.bool(true, "Show dashboard panel")';
  return (
    code.slice(0, guard) +
    "if barstate.islast and showDashboardPanel" +
    code.slice(guard + "if barstate.islast".length)
  ).replace(table[0], `${input}\n${table[0]}`);
}
