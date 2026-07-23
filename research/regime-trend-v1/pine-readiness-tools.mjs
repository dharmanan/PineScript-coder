import { createHash } from "node:crypto";

export function sha256Text(text) {
  return createHash("sha256").update(text).digest("hex");
}

export const REQUIRED_PINE_MARKERS = Object.freeze([
  { id: "version", value: "//@version=6" },
  { id: "strategy", value: "strategy(" },
  { id: "five-minute-guard", value: "timeframe.multiplier == 5" },
  { id: "four-hour-source", value: 'const string BASE_TF = "240"' },
  { id: "closed-htf-source", value: "lookahead = barmerge.lookahead_off" },
  { id: "ema50", value: "ta.ema(close, 50)" },
  { id: "ema200", value: "ta.ema(close, 200)" },
  { id: "atr14", value: "ta.atr(14)" },
  { id: "donchian-excludes-current", value: "ta.highest(high[1], 20)" },
  { id: "activation-multiple", value: "const float ACTIVATION_ATR = 2.0" },
  { id: "ratchet-next-bar-arm", value: "ratchetArmed := true" },
  { id: "ratchet-next-bar-activate", value: "if modelInTrade and ratchetArmed" },
  { id: "break-even-floor", value: "f_breakEvenRawFloor" },
  { id: "combined-stop", value: "math.max(originalStop, nz(activeRatchetFloor, originalStop))" },
  { id: "gap-detection", value: "time - time[1] != FIVE_MINUTES_MS" },
  { id: "gap-disables-ratchet", value: "ratchetActive and not parityGap" },
  { id: "long-only-entry", value: 'strategy.entry("Long", strategy.long' },
  { id: "stop-order", value: 'strategy.exit("Long Stop", "Long"' },
  { id: "trend-exit", value: 'strategy.close("Long"' }
]);

export function validateAcceptedPine(code) {
  const checks = REQUIRED_PINE_MARKERS.map((marker) => ({
    ...marker,
    passed: code.includes(marker.value)
  }));

  const forbidden = [
    { id: "short-entry", pattern: /strategy\.entry\([^\n]*strategy\.short/ },
    { id: "lookahead-on", pattern: /barmerge\.lookahead_on/ },
    { id: "future-holdout-date", pattern: /2025-01-01|2026-/ }
  ].map((item) => ({
    id: item.id,
    passed: !item.pattern.test(code)
  }));

  return {
    passed: checks.every((item) => item.passed) && forbidden.every((item) => item.passed),
    checks,
    forbidden,
    sha256: sha256Text(code)
  };
}
