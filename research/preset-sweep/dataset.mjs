import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArchiveCsv, sha256File } from "../regime-trend-v1/five-minute-data-tools.mjs";
import { exists } from "./archive-tools.mjs";

// Four downloads, one history per symbol. Every file is checked against the hash its
// own manifest recorded, so a swapped or truncated CSV fails the run instead of quietly
// changing a result. The last one is July 2026, pulled from the daily archive because the
// monthly one does not exist until the month ends.
const directory = dirname(fileURLToPath(import.meta.url));
const SOURCES = [
  { root: join(directory, "..", "regime-trend-v1", "data-5m"), manifest: "five-minute-manifest.json" },
  { root: join(directory, "data-holdout"), manifest: "holdout-manifest.json" },
  { root: join(directory, "data-extra"), manifest: "extra-manifest.json" },
  { root: join(directory, "data-july"), manifest: "july-manifest.json" }
];

// 2025 stopped being a holdout the moment it was read, so it now sits with the other
// evaluation data and 2026 is the only untouched partition left.
export const PARTITIONS = Object.freeze({
  development: { start: Date.parse("2019-01-01T00:00:00Z"), endExclusive: Date.parse("2023-01-01T00:00:00Z") },
  validation: { start: Date.parse("2023-01-01T00:00:00Z"), endExclusive: Date.parse("2026-01-01T00:00:00Z") },
  holdout: { start: Date.parse("2026-01-01T00:00:00Z"), endExclusive: Date.parse("2027-01-01T00:00:00Z") }
});

// Per-symbol expectancy across all nine presets averages about +0.30R per trade for
// 2019-2022 and about +0.09R from 2023 onward — the same drop, in the same year, on all
// four symbols. Selecting on 2019-2022 therefore tunes for a market that no longer exists.
// This layout keeps the split shape but moves it forward, so the same machinery can ask
// what today's market prefers. The 2026 holdout stays untouched in both.
export const MODERN_PARTITIONS = Object.freeze({
  development: { start: Date.parse("2023-01-01T00:00:00Z"), endExclusive: Date.parse("2025-01-01T00:00:00Z") },
  validation: { start: Date.parse("2025-01-01T00:00:00Z"), endExclusive: Date.parse("2026-01-01T00:00:00Z") },
  holdout: { start: Date.parse("2026-01-01T00:00:00Z"), endExclusive: Date.parse("2027-01-01T00:00:00Z") }
});

// July 2026 as its own partition. Nothing in this project has ever been selected, tuned or
// filtered on it, which is the only property that makes a test mean anything at this point:
// the 2026 holdout has been read four times and can no longer settle a question.
export const JULY_PARTITIONS = Object.freeze({
  development: { start: Date.parse("2019-01-01T00:00:00Z"), endExclusive: Date.parse("2023-01-01T00:00:00Z") },
  validation: { start: Date.parse("2023-01-01T00:00:00Z"), endExclusive: Date.parse("2026-01-01T00:00:00Z") },
  holdout: { start: Date.parse("2026-01-01T00:00:00Z"), endExclusive: Date.parse("2026-07-01T00:00:00Z") },
  july: { start: Date.parse("2026-07-01T00:00:00Z"), endExclusive: Date.parse("2026-08-01T00:00:00Z") }
});

export function partitionsFor(name) {
  if (name === "modern") return MODERN_PARTITIONS;
  if (name === "july") return JULY_PARTITIONS;
  if (name === "classic" || name === undefined) return PARTITIONS;
  throw new Error(`Unknown partition layout: ${name}`);
}

export function partitionOf(timestamp, layout = PARTITIONS) {
  for (const [name, range] of Object.entries(layout)) {
    if (timestamp >= range.start && timestamp < range.endExclusive) return name;
  }
  return null;
}

export function quarterOf(timestamp) {
  const date = new Date(timestamp);
  return `${date.getUTCFullYear()}Q${Math.floor(date.getUTCMonth() / 3) + 1}`;
}

export async function loadAll({ verify = true } = {}) {
  const bySymbol = new Map();
  const provenance = [];

  for (const source of SOURCES) {
    const manifestPath = join(source.root, source.manifest);
    if (!(await exists(manifestPath))) continue;
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    for (const entry of manifest.files) {
      const path = join(source.root, "csv", entry.file);
      if (verify && (await sha256File(path)) !== entry.csv_sha256) {
        throw new Error(`CSV SHA-256 mismatch: ${entry.file}`);
      }
      const candles = parseArchiveCsv(await readFile(path, "utf8"));
      if (!bySymbol.has(entry.symbol)) bySymbol.set(entry.symbol, []);
      bySymbol.get(entry.symbol).push(...candles);
    }
    provenance.push({ source: source.manifest, files: manifest.files.length });
  }

  for (const [symbol, candles] of bySymbol) {
    candles.sort((left, right) => left.timestamp - right.timestamp);
    // A month can appear in more than one download; keep one candle per timestamp.
    const unique = [];
    for (const candle of candles) {
      if (unique.length && unique.at(-1).timestamp === candle.timestamp) continue;
      unique.push(candle);
    }
    bySymbol.set(symbol, unique);
  }
  return { bySymbol, provenance };
}
