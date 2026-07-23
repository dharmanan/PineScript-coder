import { compilePine as compileBase } from "./compiler-v19";
import type { StrategyConfig } from "./types";

export function compilePine(config: StrategyConfig): string {
  const code = compileBase(config);
  if (config.outputMode !== "strategy") return code;

  const declarationPattern = /^strategy\((.+)\)$/m;
  const declaration = code.match(declarationPattern)?.[0];
  if (!declaration) {
    throw new Error("Compiler transform anchor missing: strategy declaration");
  }
  if (!declaration.includes("process_orders_on_close=true")) {
    throw new Error("Compiler strategy declaration lost on-close execution");
  }

  const hardenedDeclaration = declaration.replace(
    /\)$/,
    ", calc_on_order_fills=true, default_qty_type=strategy.percent_of_equity, default_qty_value=100, margin_long=100, margin_short=100)"
  );

  return code.replace(declaration, hardenedDeclaration);
}
