import { describe, expect, it } from "vitest";
import { compilePine } from "../lib/compiler";
import { presets } from "../lib/presets";

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

describe("strategy execution hardening", () => {
  for (const preset of presets) {
    it(`${preset.name} uses executable equity sizing in Strategy mode`, () => {
      const config = clone(preset);
      config.outputMode = "strategy";
      const code = compilePine(config);

      expect(code).toContain("process_orders_on_close=true");
      expect(code).toContain("calc_on_order_fills=true");
      expect(code).toContain("default_qty_type=strategy.percent_of_equity");
      expect(code).toContain("default_qty_value=100");
      expect(code).toContain("margin_long=100");
      expect(code).toContain("margin_short=100");
    });
  }

  it("keeps Indicator output free of strategy sizing arguments", () => {
    const code = compilePine(clone(presets[0]));
    expect(code).not.toContain("default_qty_type=strategy.percent_of_equity");
    expect(code).not.toContain("calc_on_order_fills=true");
  });
});
