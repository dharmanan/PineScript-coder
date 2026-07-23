import { compilePine as compileBase } from "./compiler-v9";
import type { StrategyConfig } from "./types";

const profileLabel = (profile: StrategyConfig["visual"]["profile"]) =>
  profile === "clean" ? "Clean" : profile === "enhanced" ? "Enhanced" : "Advanced";

const replaceRequired = (source: string, search: string, replacement: string): string => {
  if (!source.includes(search)) throw new Error(`Compiler transform anchor missing: ${search.slice(0, 80)}`);
  return source.replace(search, replacement);
};

export function compilePine(config: StrategyConfig): string {
  let code = compileBase(config);
  const label = profileLabel(config.visual.profile);
  const runtimeInput = `visualProfile = input.string("${label}", "Visual profile", options=["Clean", "Enhanced", "Advanced"])`;
  const bakedProfile = `visualProfile = "${label}" // Selected in PineForge Studio`;

  code = replaceRequired(code, runtimeInput, bakedProfile);

  if (config.direction !== "spot_buy_exit") {
    code = replaceRequired(
      code,
      'plotshape(longSignal, title="Long", style=shape.labelup, location=location.belowbar, color=color.lime, text="LONG", textcolor=color.black, size=size.normal)',
      'if longSignal\n    label.new(bar_index, low, "LONG\\n" + str.tostring(close, format.mintick), style=label.style_label_up, color=color.lime, textcolor=color.black, size=size.normal)'
    );

    if (config.direction === "long_short") {
      code = replaceRequired(
        code,
        'plotshape(shortSignal, title="Short", style=shape.labeldown, location=location.abovebar, color=color.red, text="SHORT", textcolor=color.white, size=size.normal)',
        'if shortSignal\n    label.new(bar_index, high, "SHORT\\n" + str.tostring(close, format.mintick), style=label.style_label_down, color=color.red, textcolor=color.white, size=size.normal)'
      );
    }
  }

  return code;
}
