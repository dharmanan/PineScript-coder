import { compilePine as compileBase } from "./compiler-v9";
import type { StrategyConfig } from "./types";

const profileLabel = (profile: StrategyConfig["visual"]["profile"]) =>
  profile === "clean" ? "Clean" : profile === "enhanced" ? "Enhanced" : "Advanced";

const replaceRegexRequired = (source: string, pattern: RegExp, replacement: string): string => {
  if (!pattern.test(source)) throw new Error(`Compiler transform anchor missing: ${pattern.source.slice(0, 80)}`);
  return source.replace(pattern, replacement);
};

export function compilePine(config: StrategyConfig): string {
  let code = compileBase(config);
  const label = profileLabel(config.visual.profile);
  const runtimeInput = `visualProfile = input.string("${label}", "Visual profile", options=["Clean", "Enhanced", "Advanced"])`;
  const bakedProfile = `visualProfile = "${label}" // Selected in PineForge Studio`;

  if (!code.includes(runtimeInput)) throw new Error("Compiler transform anchor missing: visual profile input");
  code = code.replace(runtimeInput, bakedProfile);

  if (config.direction !== "spot_buy_exit") {
    code = replaceRegexRequired(
      code,
      /plotshape\(longSignal, title="Long", style=shape\.labelup, location=location\.belowbar, color=color\.lime, text="LONG", textcolor=color\.black, size=size\.(?:tiny|small|normal)\)/,
      'if longSignal\n    label.new(bar_index, low, "LONG\\n" + str.tostring(close, format.mintick), style=label.style_label_up, color=color.lime, textcolor=color.black, size=size.normal)'
    );

    if (config.direction === "long_short") {
      code = replaceRegexRequired(
        code,
        /plotshape\(shortSignal, title="Short", style=shape\.labeldown, location=location\.abovebar, color=color\.red, text="SHORT", textcolor=color\.white, size=size\.(?:tiny|small|normal)\)/,
        'if shortSignal\n    label.new(bar_index, high, "SHORT\\n" + str.tostring(close, format.mintick), style=label.style_label_down, color=color.red, textcolor=color.white, size=size.normal)'
      );
    }
  }

  if (config.execution.showBackground && config.higherTimeframe.enabled) {
    const oldHtfBackground = 'bgcolor(htfBull ? color.new(color.green, 92) : color.new(color.red, 92), title="HTF bias")';
    const profileAwareHtfBackground = 'bgcolor(showTrendRibbon and visualProfile != "Clean" ? (htfBull ? color.new(color.green, 99) : color.new(color.red, 99)) : na, title="HTF bias")';
    if (!code.includes(oldHtfBackground)) throw new Error("Compiler transform anchor missing: HTF bias background");
    code = code.replace(oldHtfBackground, profileAwareHtfBackground);
  }

  return code;
}
