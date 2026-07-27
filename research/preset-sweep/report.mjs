// Reporting for every measurement tool in this folder.
//
// Rule 1 of PRESET-REVIEW-PLAN.md: symbols are never pooled. A pooled row inflates the trade
// count without narrowing anything, and it hides the case that actually matters — one symbol
// carrying the result while the other three lose. Every tool used to print a pooled headline
// row and push the symbol breakdown to a footnote, so the pooled number was the one that got
// read and reasoned from. That is why this module exists and why it exports no way to pool:
// `statsFor` takes a symbol, and the printers take a per-symbol map. There is no total.
//
// What a preset is judged on: on each symbol separately, the hit rate and the trade count.
// Not their average, not their sum.

export const MIN_TRADES = 15;

export const stat = (values) => {
  if (!values || !values.length) return null;
  const wins = values.filter((v) => v > 0).length;
  return {
    trades: values.length,
    winRate: wins / values.length,
    expectancy: values.reduce((a, b) => a + b, 0) / values.length
  };
};

const EMPTY = "         —          ";
export const cell = (s) =>
  s
    ? `${String(s.trades).padStart(4)}t %${(s.winRate * 100).toFixed(1).padStart(5)} ${(s.expectancy >= 0 ? "+" : "") + s.expectancy.toFixed(3)}R`
    : EMPTY;

const short = (symbol) => symbol.replace(/USDT?$/, "").slice(0, 4);

/**
 * One block per variant: a header line with the label, then one line per symbol carrying every
 * period. The label never carries numbers of its own, because a single number for a variant is
 * exactly the pooled figure this module refuses to produce.
 */
export function createReporter({ symbols, periods, minTrades = MIN_TRADES, labelWidth = 24 }) {
  const holdoutKey = periods.includes("holdout") ? "holdout" : periods.at(-1);

  const head = () => {
    console.log(
      `  ${"".padEnd(labelWidth)}${periods.map((p) => p.toUpperCase().padEnd(20)).join(" | ")}`
    );
  };

  /** @param result {{ perSymbol: Map<string, Record<string, number[]>> }} */
  const block = (label, result) => {
    console.log(`  ${label}`);
    for (const symbol of symbols) {
      const row = periods.map((p) => cell(stat(result.perSymbol.get(symbol)[p]))).join(" | ");
      console.log(`    ${short(symbol).padEnd(labelWidth - 2)}${row}`);
    }
  };

  /** Symbols whose sample is large enough to read at all, on the named period. */
  const readable = (result, period = holdoutKey) =>
    symbols.filter((s) => (stat(result.perSymbol.get(s)[period])?.trades ?? 0) >= minTrades);

  /** Symbols that are both readable and in profit — the only "wins" this project counts. */
  const sound = (result, period = holdoutKey) =>
    readable(result, period).filter((s) => stat(result.perSymbol.get(s)[period]).expectancy > 0);

  /**
   * Per-symbol comparison against a reference, on one period. A symbol improves only when its
   * own hit rate and its own trade count both hold up — the two things the user reads.
   */
  const compare = (result, reference, period = holdoutKey) =>
    symbols.map((symbol) => {
      const a = stat(result.perSymbol.get(symbol)[period]);
      const b = stat(reference.perSymbol.get(symbol)[period]);
      if (!a || !b) return { symbol, mark: " ", a, b };
      const better = a.winRate > b.winRate && a.trades >= b.trades;
      const worse = a.winRate < b.winRate || a.trades < b.trades;
      return { symbol, a, b, mark: better ? "^" : worse ? "v" : "=" };
    });

  /** The summary the review reads: one column per symbol, hit rate and trade count, no totals. */
  const summary = (rows, reference, period = holdoutKey) => {
    console.log(`\n=== HER SEMBOL AYRI — isabet ve islem sayisi (${period}) ===`);
    console.log(
      `  ${"".padEnd(labelWidth)}${symbols.map((s) => short(s).padEnd(15)).join("")}iyilesen`
    );
    const render = (label, result, ref) => {
      const cells = (ref ? compare(result, ref, period) : symbols.map((symbol) => ({
        symbol, mark: " ", a: stat(result.perSymbol.get(symbol)[period])
      })));
      const text = cells
        .map(({ a, mark }) => `${a ? `%${(a.winRate * 100).toFixed(1).padStart(5)} ${String(a.trades).padStart(3)}t ${mark}` : "—".padStart(11)}`.padEnd(15))
        .join("");
      const gained = ref ? `${cells.filter((c) => c.mark === "^").length}/${symbols.length}` : "—";
      console.log(`  ${label.padEnd(labelWidth)}${text}${gained}`);
    };
    render("referans", reference, null);
    for (const [label, result] of rows) render(label, result, reference);
    console.log(
      `  (^ = bu sembolde hem isabet hem islem sayisi referanstan iyi · v = biri geriledi · ` +
      `< ${minTrades} islem = okunamaz)`
    );
  };

  return { head, block, readable, sound, compare, summary, holdoutKey, stat, cell };
}
