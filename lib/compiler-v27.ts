import { compilePine as compileBase } from "./compiler-v26";
import type { StrategyConfig } from "./types";

// A preset carries two measured settings, and the choice between them belongs to whoever is
// looking at the chart, not to whoever generated the script. So both are compiled in and a
// dropdown picks one. The dashboard cannot host the choice — a Pine table only displays —
// so it lives in the indicator's own settings panel.
const MONEY = "Money (larger wins)";
const WIN_RATE = "Win rate (more wins)";
const CUSTOM = "Custom (use inputs below)";

// Pine refuses to reassign a variable that holds an input value, so the profile cannot be
// applied with `:=`. Instead the declaration is renamed and the original name is redefined
// as a plain expression over it. Every later use keeps working untouched, the input stays
// visible and editable in the settings panel, and Custom returns control to it.
const rename = (
  code: string,
  name: string,
  money: string,
  winRate: string
): { code: string; changed: boolean } => {
  const declaration = new RegExp(`^${name} = (input\\.[^\\n]*)$`, "m");
  const match = code.match(declaration);
  if (!match) return { code, changed: false };

  // A routed input does nothing while Money or Win rate is selected, and an input that
  // silently ignores what you typed is worse than no input at all. The label says so, so
  // the reason is visible in the settings panel rather than buried in the code.
  const labelled = match[1].replace(/^(input\.\w+\([^,]+, ")([^"]*)(")/, '$1$2 — only in Custom profile$3');

  const replacement =
    `${name}Input = ${labelled}\n` +
    `${name} = profileMode == "${MONEY}" ? ${money} : profileMode == "${WIN_RATE}" ? ${winRate} : ${name}Input`;
  return { code: code.replace(match[0], replacement), changed: true };
};

// Pine types a float input as float, so an integer literal in the same ternary would make
// the branches disagree.
const float = (value: number): string => (Number.isInteger(value) ? value.toFixed(1) : String(value));
const mode = (value: StrategyConfig["signalMode"]): string => (value === "score" ? '"Score"' : '"All filters"');

export function compilePine(config: StrategyConfig): string {
  let code = compileBase(config);
  const profile = config.winRateProfile;

  // Without a measured alternative there is nothing to switch between, and a dropdown
  // offering one setting would imply a choice that was never measured.
  if (!profile) return code;
  if (config.outputMode !== "indicator" || config.direction === "spot_buy_exit") return code;
  if (config.risk.stopMode === "none" || config.risk.takeProfitMode === "none") return code;

  const fields: Array<[string, string, string]> = [
    ["riskReward", float(config.risk.riskReward), float(profile.riskReward)],
    ["breakEvenAtR", float(config.risk.breakEvenAtR), float(profile.breakEvenAtR)],
    ["trailStartR", float(config.risk.trailStartR), float(profile.trailStartR)],
    ["trailDistanceR", float(config.risk.trailDistanceR), float(profile.trailDistanceR)],
    ["signalMode", mode(config.signalMode), mode(profile.signalMode)],
    ["scoreThreshold", String(config.scoreThreshold), String(profile.scoreThreshold)],
    ["triggerWindow", String(config.triggerWindow), String(profile.triggerWindow)]
  ];

  let applied = 0;
  for (const [name, money, winRate] of fields) {
    // A field the two profiles agree on would compile to a ternary with identical branches,
    // which reads as a choice that changes nothing.
    if (money === winRate) continue;
    const result = rename(code, name, money, winRate);
    if (result.changed) applied += 1;
    code = result.code;
  }
  if (!applied) return code;

  code = insertSelector(code, config.activeProfile === "win_rate" ? WIN_RATE : MONEY);
  return withProfileRow(code, config);
}

// The selector has to be declared before the first field that reads it, and it belongs at
// the top of the settings panel regardless, so it goes ahead of the first input in the file.
function insertSelector(code: string, active: string): string {
  const first = code.match(/^\w+ = input\.[^\n]*$/m);
  if (!first) throw new Error("Compiler transform anchor missing: first input declaration");

  const block = [
    "// === Profile ===",
    "// Both settings were measured on the same data. Money takes fewer, larger wins; Win",
    "// rate takes more, smaller ones. Custom leaves every input below under your control.",
    `profileMode = input.string("${active}", "Profile", options=["${MONEY}", "${WIN_RATE}", "${CUSTOM}"])`,
    "",
    first[0]
  ].join("\n");

  return code.replace(first[0], block);
}

// The dashboard states which profile is driving the numbers beside it, so a hit rate is
// never read against the wrong setting.
function withProfileRow(code: string, config: StrategyConfig): string {
  if (!config.execution.showDashboard) return code;

  const cells = [...code.matchAll(/^    table\.cell\(dashboard, \d+, (\d+),.*$/gm)];
  if (!cells.length) throw new Error("Compiler transform anchor missing: dashboard cells");
  const lastCell = cells[cells.length - 1];
  const row = Math.max(...cells.map((cell) => Number(cell[1]))) + 1;
  const style = "bgcolor=color.new(color.rgb(15, 23, 42), 8), text_size=size.normal";
  const value = `profileMode == "${MONEY}" ? "MONEY" : profileMode == "${WIN_RATE}" ? "WIN RATE" : "CUSTOM"`;

  const grown = code.replace(
    /var table dashboard = table\.new\(position\.top_right, 2, (\d+), border_width=1(, force_overlay=true)?\)/,
    (_match, rows: string, overlay: string | undefined) =>
      `var table dashboard = table.new(position.top_right, 2, ${Number(rows) + 1}, border_width=1${overlay ?? ""})`
  );

  return grown.replace(
    lastCell[0],
    `${lastCell[0]}\n` +
      `    table.cell(dashboard, 0, ${row}, "Profile", text_color=color.white, ${style})\n` +
      `    table.cell(dashboard, 1, ${row}, ${value}, text_color=color.white, ${style})`
  );
}
