import { describe, expect, it } from "vitest";
import { orderPresetsForDisplay, presetDisplayOrder } from "../lib/preset-display-order";
import { presets } from "../lib/presets";

describe("preset display order", () => {
  it("puts Kohen Dive first and keeps the locked efficiency order", () => {
    expect(orderPresetsForDisplay(presets).map((preset) => preset.presetId)).toEqual(presetDisplayOrder);
  });

  it("contains every available preset exactly once", () => {
    expect(new Set(presetDisplayOrder).size).toBe(presetDisplayOrder.length);
    expect([...presetDisplayOrder].sort()).toEqual(
      presets.map((preset) => preset.presetId).sort()
    );
  });
});
