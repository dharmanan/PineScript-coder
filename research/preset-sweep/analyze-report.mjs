// Reads a sweep report and applies the stopping rule the user agreed to: selection from
// development only, then two sigma over break-even in validation, then a positive holdout.
// Symbols are never merged into one number — a configuration that only works on one symbol
// is a configuration that does not work.
import { readFileSync } from "node:fs";

const path = process.argv.find((item) => item.startsWith("--report="))?.split("=")[1]
  ?? "research/preset-sweep/results/preset-sweep-v3-fixedstop.json";
const report = JSON.parse(readFileSync(path, "utf8"));
const rows = report.rows;
const symbols = report.symbols ?? [];

// The report keeps totals, not per-trade returns, so the spread is reconstructed from a
// Bernoulli win/loss model: a win pays rr, a loss costs one unit. Trailing and break-even
// exits land between those, which narrows the real spread, so this understates t.
const tStat = (bucket, rr) => {
  const { trades, win_rate: p, expectancy_r: e } = bucket;
  if (!trades || p === null) return null;
  const sd = (rr + 1) * Math.sqrt(Math.max(p * (1 - p), 1e-9));
  return (e * Math.sqrt(trades)) / sd;
};

const label = (r) => `${r.timeframe}m ${r.signal_mode.padEnd(8)} w${String(r.trigger_window).padEnd(2)} rr=${String(r.risk_reward).padEnd(3)} ${r.exit}`;

const devGate = (r) =>
  r.development.trades >= 150 &&
  r.development.expectancy_r > 0 &&
  r.quarters.quarter_hit_rate >= 0.6;

// A configuration passes the symbol gate when every symbol with a usable sample is
// positive in the holdout, and no single symbol carries more than 60% of the total.
const symbolGate = (r) => {
  const entries = Object.entries(r.by_symbol ?? {});
  if (!entries.length) return { ok: false, reason: "sembol kirilimi yok" };
  const usable = entries.filter(([, s]) => s.holdout?.trades >= 20);
  if (usable.length < 3) return { ok: false, reason: `holdout'ta yeterli ornekli sembol ${usable.length}/${entries.length}` };
  const negative = usable.filter(([, s]) => s.holdout.expectancy_r <= 0).map(([sym]) => sym);
  if (negative.length) return { ok: false, reason: `holdout'ta negatif: ${negative.join(", ")}` };
  const total = entries.reduce((sum, [, s]) => sum + s.net_r, 0);
  const top = entries.reduce((best, [sym, s]) => (s.net_r > best.value ? { sym, value: s.net_r } : best), { sym: null, value: -Infinity });
  const share = total > 0 ? top.value / total : 1;
  if (share > 0.6) return { ok: false, reason: `${top.sym} karin %${(share * 100).toFixed(0)}'ini tasiyor` };
  return { ok: true, share };
};

const printSymbols = (r, indent = "     ") => {
  for (const symbol of symbols) {
    const s = r.by_symbol?.[symbol];
    if (!s || !s.development) continue;
    const part = (b) =>
      `${String(b.trades).padStart(5)}t ${b.win_rate === null ? "  -   " : (b.win_rate * 100).toFixed(1).padStart(5) + "%"} ` +
      `${b.expectancy_r === null ? "    -    " : (b.expectancy_r >= 0 ? "+" : "") + b.expectancy_r.toFixed(4) + "R"}`;
    console.log(`${indent}${symbol.padEnd(9)} dev ${part(s.development)} | val ${part(s.validation)} | hld ${part(s.holdout)}`);
  }
};

console.log(`Rapor: ${path}`);
console.log(`Semboller: ${symbols.join(", ")}\n`);

console.log("=== 1. Her preset icin development'in en iyisi (secim SADECE dev'den) ===\n");
for (const preset of [...new Set(rows.map((r) => r.preset))]) {
  const pool = rows.filter((r) => r.preset === preset && devGate(r));
  if (!pool.length) { console.log(`${preset}: development kapisini gecen konfig YOK\n`); continue; }
  pool.sort((a, b) => b.development.expectancy_r - a.development.expectancy_r);
  const best = pool[0];
  const t = tStat(best.validation, best.risk_reward);
  const gate = symbolGate(best);
  console.log(`${preset}  ${label(best)}`);
  console.log(`   dev ${String(best.development.trades).padStart(5)}t ${(best.development.win_rate * 100).toFixed(1)}% ${best.development.expectancy_r.toFixed(4)}R  ceyrek %${(best.quarters.quarter_hit_rate * 100).toFixed(0)}`);
  console.log(`   val ${String(best.validation.trades).padStart(5)}t ${(best.validation.win_rate * 100).toFixed(1)}% ${best.validation.expectancy_r.toFixed(4)}R  t=${t === null ? "-" : t.toFixed(2)}${t !== null && t >= 2 ? "  [2 sigma GECTI]" : "  [2 sigma GECMEDI]"}`);
  console.log(`   hld ${String(best.holdout.trades).padStart(5)}t ${best.holdout.win_rate === null ? "-" : (best.holdout.win_rate * 100).toFixed(1) + "%"} ${best.holdout.expectancy_r === null ? "-" : best.holdout.expectancy_r.toFixed(4) + "R"}`);
  console.log(`   sembol kapisi: ${gate.ok ? "GECTI" : "KALDI — " + gate.reason}`);
  printSymbols(best);
  console.log();
}

console.log("\n=== 2. Uc kapiyi birden gecenler (dev gate + val t>=2 + holdout pozitif + sembol kapisi) ===\n");
const survivors = rows
  .filter(devGate)
  .map((r) => ({ r, t: tStat(r.validation, r.risk_reward), gate: symbolGate(r) }))
  .filter(({ r, t, gate }) => t !== null && t >= 2 && r.holdout.expectancy_r > 0 && gate.ok)
  .sort((a, b) => b.t - a.t);

const devPool = rows.filter(devGate).length;
console.log(`${survivors.length} / ${devPool} konfig kaldi (dev kapisini gecen ${devPool} konfigden)\n`);

const perPreset = new Map();
for (const item of survivors) {
  if (!perPreset.has(item.r.preset)) perPreset.set(item.r.preset, []);
  perPreset.get(item.r.preset).push(item);
}
for (const [preset, items] of perPreset) {
  console.log(`${preset}: ${items.length} konfig hayatta, en yuksek t=${items[0].t.toFixed(2)}`);
}

console.log("\n--- Hayatta kalanlarin en iyi 10'u, sembol sembol ---\n");
for (const { r, t } of survivors.slice(0, 10)) {
  console.log(`${r.preset} ${label(r)}  | val t=${t.toFixed(2)} ${r.validation.expectancy_r.toFixed(4)}R | hld ${r.holdout.trades}t ${r.holdout.expectancy_r.toFixed(4)}R`);
  printSymbols(r);
  console.log();
}

console.log("\n=== 3. Zaman dilimi (dev kapisini gecenlerin val beklenti medyani) ===\n");
for (const tf of report.timeframes) {
  const pool = rows.filter((r) => r.timeframe === tf && devGate(r)).map((r) => r.validation.expectancy_r).sort((a, b) => a - b);
  const median = pool.length ? pool[Math.floor(pool.length / 2)] : null;
  const positive = pool.filter((v) => v > 0).length;
  console.log(`${tf}m: ${String(pool.length).padStart(5)} konfig, medyan ${median === null ? "-" : median.toFixed(4)}R, artida %${pool.length ? ((positive / pool.length) * 100).toFixed(1) : "-"}`);
}
