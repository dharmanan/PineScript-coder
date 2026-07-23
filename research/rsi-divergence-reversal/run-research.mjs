import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  aggregate5mTo15m,
  splitContiguous,
  summarize
} from "./reference-engine.mjs";
import { runReference } from "./reference-execution.mjs";
import {
  parseArchiveCsv,
  sha256File
} from "../regime-trend-v1/five-minute-data-tools.mjs";

const directory = dirname(fileURLToPath(import.meta.url));
const sourceDirectory = join(directory, "..", "regime-trend-v1", "data-5m");
const csvDirectory = join(sourceDirectory, "csv");
const resultDirectory = join(directory, "results");
const manifestPath = join(sourceDirectory, "five-minute-manifest.json");
const HOLDOUT = Date.parse("2025-01-01T00:00:00.000Z");
const WARMUP_BARS = 200;

const partitions = Object.freeze([
  {
    id: "development",
    start: Date.parse("2019-01-01T00:00:00.000Z"),
    endExclusive: Date.parse("2023-01-01T00:00:00.000Z")
  },
  {
    id: "validation",
    start: Date.parse("2023-01-01T00:00:00.000Z"),
    endExclusive: HOLDOUT
  }
]);

const profiles = Object.freeze([
  {
    id: "tradingview_default",
    commission: 0.001,
    slippage: 0,
    intrabarPolicy: "tradingview_path"
  },
  {
    id: "conservative_intrabar",
    commission: 0.001,
    slippage: 0,
    intrabarPolicy: "conservative_stop_first"
  },
  {
    id: "realistic_costs",
    commission: 0.001,
    slippage: 0.0005,
    intrabarPolicy: "tradingview_path"
  },
  {
    id: "stress",
    commission: 0.002,
    slippage: 0.001,
    intrabarPolicy: "conservative_stop_first"
  }
]);

function counts(trades, field) {
  return Object.fromEntries(
    [...new Set(trades.map((trade) => trade[field]))]
      .sort()
      .map((value) => [value, trades.filter((trade) => trade[field] === value).length])
  );
}

function detailedSummary(trades) {
  return {
    ...summarize(trades),
    direction_counts: counts(trades, "direction"),
    exit_reason_counts: counts(trades, "exit_reason")
  };
}

function csv(trades) {
  const fields = [
    "strategy_id", "implementation_version", "partition", "profile", "symbol",
    "direction", "signal_timestamp", "entry_timestamp", "entry_fill", "entry_atr",
    "initial_stop", "target", "exit_timestamp", "exit_fill", "exit_reason",
    "net_return", "bars_held", "ambiguous_intrabar"
  ];
  const rows = trades.map((trade) => fields.map((field) => trade[field]).join(","));
  return `${fields.join(",")}\n${rows.join("\n")}${rows.length ? "\n" : ""}`;
}

async function loadSymbol(symbol, manifest) {
  const entries = manifest.files
    .filter((entry) => entry.symbol === symbol)
    .sort((left, right) => left.month.localeCompare(right.month));
  const fiveMinute = [];

  for (const entry of entries) {
    const path = join(csvDirectory, entry.file);
    const actualSha = await sha256File(path);
    if (actualSha !== entry.csv_sha256) {
      throw new Error(`CSV SHA mismatch: ${entry.file}`);
    }
    for (const candle of parseArchiveCsv(await readFile(path, "utf8"))) {
      if (candle.timestamp >= HOLDOUT) {
        throw new Error(`Final holdout opened by ${entry.file}`);
      }
      fiveMinute.push(candle);
    }
  }

  fiveMinute.sort((left, right) => left.timestamp - right.timestamp);
  for (let index = 1; index < fiveMinute.length; index += 1) {
    if (fiveMinute[index].timestamp === fiveMinute[index - 1].timestamp) {
      throw new Error(`Duplicate 5m timestamp: ${symbol} ${fiveMinute[index].timestamp}`);
    }
  }
  return aggregate5mTo15m(fiveMinute);
}

function partitionSegments(candles, partition) {
  const firstInside = candles.findIndex((candle) => candle.timestamp >= partition.start);
  if (firstInside === -1) return [];
  const startIndex = Math.max(0, firstInside - WARMUP_BARS);
  const selected = candles
    .slice(startIndex)
    .filter((candle) => candle.timestamp < partition.endExclusive);
  return splitContiguous(selected).filter((segment) =>
    segment.some((candle) =>
      candle.timestamp >= partition.start && candle.timestamp < partition.endExclusive
    )
  );
}

async function main() {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (manifest.final_holdout_opened !== false) {
    throw new Error("Source manifest holdout flag is not false");
  }
  if (Date.parse(manifest.requested_end_exclusive) !== HOLDOUT) {
    throw new Error("Source data holdout boundary mismatch");
  }

  const candlesBySymbol = {};
  for (const symbol of manifest.symbols) {
    console.log(`Loading and aggregating ${symbol}...`);
    candlesBySymbol[symbol] = await loadSymbol(symbol, manifest);
    console.log(`${symbol}: ${candlesBySymbol[symbol].length} complete 15m candles`);
  }

  const ledgers = Object.fromEntries(profiles.map((profile) => [profile.id, []]));
  const reportPartitions = [];

  for (const partition of partitions) {
    const profileReports = {};
    for (const profile of profiles) {
      const combined = [];
      const bySymbol = {};
      for (const [symbol, candles] of Object.entries(candlesBySymbol)) {
        const trades = [];
        for (const segment of partitionSegments(candles, partition)) {
          const result = runReference(segment, {
            symbol,
            tradeStart: partition.start,
            tradeEndExclusive: partition.endExclusive,
            commission: profile.commission,
            slippage: profile.slippage,
            intrabarPolicy: profile.intrabarPolicy
          });
          trades.push(...result.trades);
        }
        const tagged = trades.map((trade) => ({
          ...trade,
          partition: partition.id,
          profile: profile.id
        }));
        bySymbol[symbol] = detailedSummary(tagged);
        combined.push(...tagged);
        ledgers[profile.id].push(...tagged);
      }
      profileReports[profile.id] = {
        costs: {
          commission: profile.commission,
          slippage: profile.slippage,
          intrabar_policy: profile.intrabarPolicy
        },
        combined: detailedSummary(combined),
        by_symbol: bySymbol
      };
    }
    reportPartitions.push({ id: partition.id, profiles: profileReports });
  }

  const report = {
    schema_version: 1,
    strategy_id: "rsi-divergence-reversal-v1",
    generated_at: new Date().toISOString(),
    source: "checksum-verified Binance Spot 5m archives aggregated to complete 15m candles",
    symbols: manifest.symbols,
    partitions,
    profiles,
    final_holdout_opened: false,
    results: reportPartitions
  };

  await mkdir(resultDirectory, { recursive: true });
  await writeFile(
    join(resultDirectory, "research-report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8"
  );
  for (const profile of profiles) {
    await writeFile(
      join(resultDirectory, `${profile.id}-ledger.csv`),
      csv(ledgers[profile.id]),
      "utf8"
    );
  }

  for (const partition of report.results) {
    console.log(`\n${partition.id.toUpperCase()}`);
    for (const profile of profiles) {
      const metrics = partition.profiles[profile.id].combined;
      console.log(
        `${profile.id}: trades=${metrics.closed_trades}, ` +
        `net=${metrics.total_net_return_units.toFixed(6)}, ` +
        `PF=${metrics.profit_factor?.toFixed(3) ?? "n/a"}, ` +
        `WR=${metrics.win_rate === null ? "n/a" : (100 * metrics.win_rate).toFixed(2) + "%"}, ` +
        `DD=${metrics.max_drawdown_return_units.toFixed(6)}, ` +
        `ambiguous=${metrics.ambiguous_intrabar_trades}`
      );
    }
  }
  console.log(`\nReport written to ${join(resultDirectory, "research-report.json")}`);
  console.log("Final holdout was not opened.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
