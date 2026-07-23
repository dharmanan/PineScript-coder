import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  REQUIRED_PINE_MARKERS,
  validateAcceptedPine
} from "../research/regime-trend-v1/pine-readiness-tools.mjs";

const pinePath = join(
  process.cwd(),
  "research",
  "regime-trend-v1",
  "pine",
  "regime-trend-v1-ratchet-v1.pine"
);

describe("Regime Trend v1 accepted Pine strategy", () => {
  it("contains every frozen implementation marker", async () => {
    const code = await readFile(pinePath, "utf8");
    const result = validateAcceptedPine(code);

    expect(result.checks).toHaveLength(REQUIRED_PINE_MARKERS.length);
    expect(result.checks.filter((check) => !check.passed)).toEqual([]);
    expect(result.forbidden.filter((check) => !check.passed)).toEqual([]);
    expect(result.passed).toBe(true);
    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects lookahead and short-entry regressions", () => {
    const unsafe = `//@version=6\nstrategy("unsafe")\nbarmerge.lookahead_on\nstrategy.entry("S", strategy.short)`;
    const result = validateAcceptedPine(unsafe);

    expect(result.passed).toBe(false);
    expect(result.forbidden.find((check) => check.id === "lookahead-on")?.passed).toBe(false);
    expect(result.forbidden.find((check) => check.id === "short-entry")?.passed).toBe(false);
  });
});
