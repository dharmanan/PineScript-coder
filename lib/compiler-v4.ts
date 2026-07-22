import { compilePine as compileBase } from "./compiler-v3";
import type { StrategyConfig } from "./types";

const q = (value: string) => value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

export function compilePine(config: StrategyConfig): string {
  let code = compileBase(config);
  if (!config.execution.sessionEnabled) return code;

  const sessionInput = `tradeSession = input.session("${q(config.execution.session)}", "Trading session")`;
  if (!code.includes(sessionInput)) {
    throw new Error("Compiler transform anchor missing: Trading session input");
  }

  code = code.replace(
    sessionInput,
    `${sessionInput}\nsessionTimezoneMode = input.string("${q(config.execution.sessionTimezone)}", "Session timezone", options=["exchange", "America/New_York", "Europe/London", "Europe/Istanbul", "UTC"])\nsessionTimezone = sessionTimezoneMode == "exchange" ? syminfo.timezone : sessionTimezoneMode`
  );

  const sessionCheck = "sessionOk = not na(time(timeframe.period, tradeSession))";
  if (!code.includes(sessionCheck)) {
    throw new Error("Compiler transform anchor missing: Session check");
  }

  return code.replace(
    sessionCheck,
    "sessionOk = not na(time(timeframe.period, tradeSession, sessionTimezone))"
  );
}
