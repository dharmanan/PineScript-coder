// A preset that ships a win-rate profile has its input declarations renamed, because Pine
// refuses to reassign a variable holding an input value: `riskReward = input.float(...)`
// becomes `riskRewardInput = input.float(...)` with `riskReward` redefined over it. The
// variable name is an implementation detail; what a test should pin is that the preset's
// own value is the one the input carries. This matcher accepts either spelling.
const escape = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// A routed input also gains a note on its label saying it only applies in the Custom
// profile, so the label is matched as a prefix rather than in full.
const NOTE = '( — only in Custom profile)?"';

export function declares(name: string, value: number | string, label: string): RegExp {
  return new RegExp(`^${name}(Input)? = input\\.\\w+\\(${escape(String(value))}, "${escape(label)}${NOTE}`, "m");
}

export function declaresString(name: string, value: string, label: string): RegExp {
  return new RegExp(`^${name}(Input)? = input\\.string\\("${escape(value)}", "${escape(label)}${NOTE}`, "m");
}
