// Kohen Dive Adaptive 4h robustness study.
//
// The study mirrors compiler-v30's confirmed-bar, next-open lifecycle. Selection is made
// on 2024, checked on 2025, and only then reported on 2026. Symbols are never pooled:
// ranking uses the weakest symbol so a single market cannot carry a candidate.
import { aggregate } from "../preset-sweep/data.mjs";
import { loadAll } from "../preset-sweep/dataset.mjs";
import {
  buildKohenContext,
  buildKohenSignals,
  metrics,
  simulateKohen
} from "./core.mjs";

const PERIODS = Object.freeze({
  development: {
    start: Date.parse("2024-01-01T00:00:00Z"),
    endExclusive: Date.parse("2025-01-01T00:00:00Z")
  },
  validation: {
    start: Date.parse("2025-01-01T00:00:00Z"),
    endExclusive: Date.parse("2026-01-01T00:00:00Z")
  },
  forward: {
    start: Date.parse("2026-01-01T00:00:00Z"),
    endExclusive: Date.parse("2027-01-01T00:00:00Z")
  },
  full: {
    start: Date.parse("2024-01-01T00:00:00Z"),
    endExclusive: Date.parse("2027-01-01T00:00:00Z")
  }
});

const { bySymbol, provenance } = await loadAll();
const symbols = ["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT"];
const contexts = new Map();
for (const symbol of symbols) {
  const candles = aggregate(bySymbol.get(symbol), 48);
  contexts.set(symbol, buildKohenContext(candles));
}

const baselineArchitecture = Object.freeze({
  symmetricVwap: false,
  reversalWindow: 8,
  reversalConfirmation: "strict",
  continuation: "current",
  continuationLookback: 8,
  continuationRsiLevel: 50,
  regimeSlopeBars: 3,
  cooldownBars: 5,
  triggerWindow: 1
});
const baselineRisk = Object.freeze({ atrMultiple: 2, riskReward: 2, costPerSide: 0.01 });

const measure = (architecture, risk) => {
  const perSymbol = new Map();
  for (const symbol of symbols) {
    const context = contexts.get(symbol);
    const signals = buildKohenSignals(context, architecture);
    const trades = simulateKohen(context, signals, risk);
    perSymbol.set(symbol, Object.fromEntries(
      Object.entries(PERIODS).map(([name, range]) => [name, metrics(trades, range)])
    ));
  }
  return perSymbol;
};

const minimum = (values) => Math.min(...values);
const median = (values) => {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
};
const rank = (result, period) => {
  const rows = symbols.map((symbol) => result.get(symbol)[period]);
  return {
    positive: rows.filter((row) => row.netR > 0 && row.profitFactor > 1).length,
    minNetR: minimum(rows.map((row) => row.netR)),
    minProfitFactor: minimum(rows.map((row) => row.profitFactor)),
    minTrades: minimum(rows.map((row) => row.trades)),
    medianTrades: median(rows.map((row) => row.trades)),
    minWinRate: minimum(rows.map((row) => row.winRate)),
    medianWinRate: median(rows.map((row) => row.winRate))
  };
};
const compare = (left, right, period) => {
  const a = left.ranks[period];
  const b = right.ranks[period];
  return (
    b.positive - a.positive ||
    b.minProfitFactor - a.minProfitFactor ||
    b.minNetR - a.minNetR ||
    b.minTrades - a.minTrades ||
    b.medianWinRate - a.medianWinRate
  );
};
const format = (row) =>
  `${String(row.trades).padStart(3)}t ` +
  `%${(row.winRate * 100).toFixed(1).padStart(4)} ` +
  `${row.netR >= 0 ? "+" : ""}${row.netR.toFixed(2).padStart(6)}R ` +
  `PF${Number.isFinite(row.profitFactor) ? row.profitFactor.toFixed(2) : "∞"} ` +
  `DD${row.maxDrawdownR.toFixed(2)} ` +
  `C/R ${row.continuationTrades}/${row.reversalTrades}`;
const print = (title, candidate, periods = ["development", "validation", "forward", "full"]) => {
  console.log(`\n${title}`);
  console.log(`  architecture=${JSON.stringify(candidate.architecture)} risk=${JSON.stringify(candidate.risk)}`);
  for (const period of periods) {
    console.log(`  ${period}`);
    for (const symbol of symbols) {
      console.log(`    ${symbol.replace("USDT", "").padEnd(4)} ${format(candidate.result.get(symbol)[period])}`);
    }
  }
};

console.log("KOHEN DIVE ADAPTIVE — 4 SAAT ROBUSTLUK CALISMASI");
console.log("Secim 2024, dogrulama 2025, ileri rapor 2026. Semboller havuzlanmaz.");
console.log(`Kaynaklar: ${provenance.map((item) => `${item.source}:${item.files}`).join(", ")}`);

const baselineResult = measure(baselineArchitecture, baselineRisk);
const baseline = {
  architecture: baselineArchitecture,
  risk: baselineRisk,
  result: baselineResult,
  ranks: {
    development: rank(baselineResult, "development"),
    validation: rank(baselineResult, "validation")
  }
};
print("MEVCUT REFERANS", baseline);

const architectures = [];
for (const symmetricVwap of [false, true]) {
  for (const reversalWindow of [8, 12, 16, 24]) {
    for (const reversalConfirmation of ["strict", "state", "ema", "pressure"]) {
      for (const continuation of ["current", "rsi", "ema", "hybrid"]) {
        for (const cooldownBars of [2, 5]) {
          const architecture = {
            symmetricVwap,
            reversalWindow,
            reversalConfirmation,
            continuation,
            continuationLookback: 8,
            continuationRsiLevel: 50,
            regimeSlopeBars: 3,
            cooldownBars,
            triggerWindow: 1
          };
          const result = measure(architecture, baselineRisk);
          architectures.push({
            architecture,
            risk: baselineRisk,
            result,
            ranks: {
              development: rank(result, "development"),
              validation: rank(result, "validation")
            }
          });
        }
      }
    }
  }
}

const developmentFinalists = architectures
  .sort((left, right) => compare(left, right, "development"))
  .slice(0, 24);
const architectureWinner = developmentFinalists
  .sort((left, right) => compare(left, right, "validation"))[0];

console.log("\nSINYAL MIMARISI — 2024 SECIMINDEN CIKAN 24 ADAYIN 2025 ILK 5'I");
for (const [index, candidate] of developmentFinalists
  .sort((left, right) => compare(left, right, "validation"))
  .slice(0, 5)
  .entries()) {
  print(`SINYAL #${index + 1}`, candidate, ["development", "validation", "forward"]);
}

const riskCandidates = [];
for (const atrMultiple of [1.5, 1.75, 2, 2.25, 2.5]) {
  for (const riskReward of [1, 1.25, 1.5, 1.75, 2]) {
    const risk = { atrMultiple, riskReward, costPerSide: 0.01 };
    const result = measure(architectureWinner.architecture, risk);
    riskCandidates.push({
      architecture: architectureWinner.architecture,
      risk,
      result,
      ranks: {
        development: rank(result, "development"),
        validation: rank(result, "validation")
      }
    });
  }
}
const riskFinalists = riskCandidates
  .sort((left, right) => compare(left, right, "development"))
  .slice(0, 12);
const winner = riskFinalists
  .sort((left, right) => compare(left, right, "validation"))[0];

console.log("\nRISK — 2024 SECIMINDEN CIKAN 12 ADAYIN 2025 ILK 5'I");
for (const [index, candidate] of riskFinalists
  .sort((left, right) => compare(left, right, "validation"))
  .slice(0, 5)
  .entries()) {
  print(`RISK #${index + 1}`, candidate, ["development", "validation", "forward"]);
}

print("ONERILEN ADAY — 2026 ILERI RAPOR DAHIL", winner);

// Stress search: this is not used to claim an untouched validation result. It answers the
// user's current question more honestly: whether any setting in the constrained grid stays
// usable across all three known years instead of looking excellent only before 2026.
const stressCandidates = [];
const uniqueArchitectures = new Map();
for (const candidate of developmentFinalists) {
  uniqueArchitectures.set(JSON.stringify(candidate.architecture), candidate.architecture);
}
for (const architecture of uniqueArchitectures.values()) {
  for (const atrMultiple of [1.5, 1.75, 2, 2.25, 2.5]) {
    for (const riskReward of [1, 1.25, 1.5, 1.75, 2]) {
      const risk = { atrMultiple, riskReward, costPerSide: 0.01 };
      const result = measure(architecture, risk);
      const cells = ["development", "validation", "forward"].flatMap((period) =>
        symbols.map((symbol) => result.get(symbol)[period])
      );
      stressCandidates.push({
        architecture,
        risk,
        result,
        positiveCells: cells.filter((row) => row.netR > 0 && row.profitFactor > 1).length,
        worstProfitFactor: Math.min(...cells.map((row) => row.profitFactor)),
        worstNetR: Math.min(...cells.map((row) => row.netR)),
        worstWinRate: Math.min(...cells.map((row) => row.winRate)),
        worstTrades: Math.min(...cells.map((row) => row.trades)),
        medianTrades: median(cells.map((row) => row.trades))
      });
    }
  }
}
stressCandidates.sort((left, right) =>
  right.positiveCells - left.positiveCells ||
  right.worstProfitFactor - left.worstProfitFactor ||
  right.worstNetR - left.worstNetR ||
  right.worstTrades - left.worstTrades ||
  right.medianTrades - left.medianTrades ||
  right.worstWinRate - left.worstWinRate
);
console.log("\nUC YIL STRES TARAMASI — ilk 5 (secim iddiasi degil)");
for (const [index, candidate] of stressCandidates.slice(0, 5).entries()) {
  console.log(
    `\nSTRES #${index + 1} pozitif hucre ${candidate.positiveCells}/12 ` +
    `en kotu PF ${candidate.worstProfitFactor.toFixed(2)} ` +
    `en kotu net ${candidate.worstNetR.toFixed(2)}R`
  );
  print(`STRES #${index + 1}`, candidate, ["development", "validation", "forward"]);
}

console.log("\nKARAR OZETI");
console.log(`  referans 2025 en zayif: ${JSON.stringify(baseline.ranks.validation)}`);
console.log(`  aday 2025 en zayif:     ${JSON.stringify(winner.ranks.validation)}`);
console.log("  2026 satirlari secimde kullanilmadi; yalniz secim tamamlandiktan sonra raporlandi.");
