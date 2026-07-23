import { compilePine as compileBase } from "./compiler-v18";
import type { StrategyConfig } from "./types";

export function compilePine(config: StrategyConfig): string {
  let code = compileBase(config);
  const freezeStrategyAtr =
    config.outputMode === "strategy" &&
    config.direction !== "spot_buy_exit" &&
    config.risk.stopMode === "atr";

  if (!freezeStrategyAtr) return code;

  const strategyOrdersAnchor = "// === Strategy orders ===";
  if (!code.includes(strategyOrdersAnchor)) {
    throw new Error("Compiler transform anchor missing: strategy orders section");
  }
  code = code.replace(
    strategyOrdersAnchor,
    `${strategyOrdersAnchor}\n// ATR is captured once when a new strategy position is requested.\nvar float strategyAtrAtEntry = na`
  );

  const longEntryPattern = /if longSignal and strategy\.position_size <= 0\n    strategy\.entry\("Long", strategy\.long, alert_message="LONG \{\{ticker\}\} @ \{\{close\}\}"\)/;
  if (!longEntryPattern.test(code)) {
    throw new Error("Compiler transform anchor missing: strategy long entry");
  }
  code = code.replace(
    longEntryPattern,
    'if longSignal and strategy.position_size <= 0\n    strategyAtrAtEntry := atrValue\n    strategy.entry("Long", strategy.long, alert_message="LONG {{ticker}} @ {{close}}")'
  );

  if (config.direction === "long_short") {
    const shortEntryPattern = /if shortSignal and strategy\.position_size >= 0\n    strategy\.entry\("Short", strategy\.short, alert_message="SHORT \{\{ticker\}\} @ \{\{close\}\}"\)/;
    if (!shortEntryPattern.test(code)) {
      throw new Error("Compiler transform anchor missing: strategy short entry");
    }
    code = code.replace(
      shortEntryPattern,
      'if shortSignal and strategy.position_size >= 0\n    strategyAtrAtEntry := atrValue\n    strategy.entry("Short", strategy.short, alert_message="SHORT {{ticker}} @ {{close}}")'
    );
  }

  const longStop = "longStop = strategy.position_avg_price - atrValue * atrMultiple";
  if (!code.includes(longStop)) {
    throw new Error("Compiler transform anchor missing: strategy long ATR stop");
  }
  code = code.replace(
    longStop,
    "longStop = strategy.position_avg_price - strategyAtrAtEntry * atrMultiple"
  );

  if (config.direction === "long_short") {
    const shortStop = "shortStop = strategy.position_avg_price + atrValue * atrMultiple";
    if (!code.includes(shortStop)) {
      throw new Error("Compiler transform anchor missing: strategy short ATR stop");
    }
    code = code.replace(
      shortStop,
      "shortStop = strategy.position_avg_price + strategyAtrAtEntry * atrMultiple"
    );
  }

  return code;
}
