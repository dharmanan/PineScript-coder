import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArchiveCsv, sha256File } from "../regime-trend-v1/five-minute-data-tools.mjs";

const directory = dirname(fileURLToPath(import.meta.url));
const sourceDirectory = join(directory, "..", "regime-trend-v1", "data-5m");
const csvDirectory = join(sourceDirectory, "csv");
const manifestPath = join(sourceDirectory, "five-minute-manifest.json");

const FIVE_MINUTES = 5 * 60 * 1000;

// Chart timeframes the sweep can build from 5-minute source candles.
export const TIMEFRAMES = Object.freeze([
  { id: "5", label: "5m", factor: 1 },
  { id: "15", label: "15m", factor: 3 },
  { id: "30", label: "30m", factor: 6 },
  { id: "60", label: "1h", factor: 12 },
  { id: "240", label: "4h", factor: 48 }
]);

export const HOLDOUT_START = Date.parse("2025-01-01T00:00:00.000Z");

export const PARTITIONS = Object.freeze({
  development: { start: Date.parse("2019-01-01T00:00:00.000Z"), endExclusive: Date.parse("2023-01-01T00:00:00.000Z") },
  validation: { start: Date.parse("2023-01-01T00:00:00.000Z"), endExclusive: HOLDOUT_START }
});

export async function loadManifest() {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (manifest.final_holdout_opened !== false) {
    throw new Error("Manifest reports the final holdout was opened");
  }
  if (Date.parse(manifest.requested_end_exclusive) !== HOLDOUT_START) {
    throw new Error("Manifest window does not end at the frozen holdout boundary");
  }
  return manifest;
}

// Every CSV is checked against the manifest hash before it is used. A silently
// corrupted or swapped file must fail the run, not quietly change a result.
export async function loadSymbol(symbol, manifest, { verify = true } = {}) {
  const entries = manifest.files
    .filter((entry) => entry.symbol === symbol)
    .sort((left, right) => left.month.localeCompare(right.month));
  if (!entries.length) throw new Error(`No manifest entries for ${symbol}`);

  const candles = [];
  for (const entry of entries) {
    const path = join(csvDirectory, entry.file);
    if (verify && (await sha256File(path)) !== entry.csv_sha256) {
      throw new Error(`CSV SHA-256 mismatch: ${entry.file}`);
    }
    for (const candle of parseArchiveCsv(await readFile(path, "utf8"))) {
      if (candle.timestamp >= HOLDOUT_START) throw new Error(`Final holdout opened by ${entry.file}`);
      candles.push(candle);
    }
  }
  candles.sort((left, right) => left.timestamp - right.timestamp);
  return candles;
}

// The same aggregation, but keeping the five-minute candles each higher-timeframe
// candle was built from. A chart candle cannot say whether its high or its low came
// first; its own five-minute candles can.
export function aggregateWithGroups(fiveMinute, factor) {
  if (factor === 1) return { candles: fiveMinute, groups: fiveMinute.map((candle) => [candle]) };
  const candles = aggregate(fiveMinute, factor);
  const interval = FIVE_MINUTES * factor;
  const index = new Map();
  candles.forEach((candle, position) => index.set(candle.timestamp, position));
  const groups = candles.map(() => []);
  for (const candle of fiveMinute) {
    const position = index.get(Math.floor(candle.timestamp / interval) * interval);
    if (position !== undefined) groups[position].push(candle);
  }
  return { candles, groups };
}

// Only complete, correctly aligned groups become a higher-timeframe candle. A
// partial group is dropped rather than aggregated from missing data.
export function aggregate(fiveMinute, factor) {
  if (factor === 1) return fiveMinute;
  const interval = FIVE_MINUTES * factor;
  const output = [];
  for (let index = 0; index + factor - 1 < fiveMinute.length; ) {
    const first = fiveMinute[index];
    const bucket = Math.floor(first.timestamp / interval) * interval;
    if (first.timestamp !== bucket) {
      index += 1;
      continue;
    }
    let complete = true;
    for (let offset = 0; offset < factor; offset += 1) {
      if (fiveMinute[index + offset]?.timestamp !== bucket + offset * FIVE_MINUTES) {
        complete = false;
        break;
      }
    }
    if (!complete) {
      index += 1;
      continue;
    }
    const group = fiveMinute.slice(index, index + factor);
    output.push({
      timestamp: bucket,
      open: group[0].open,
      high: Math.max(...group.map((item) => item.high)),
      low: Math.min(...group.map((item) => item.low)),
      close: group.at(-1).close,
      volume: group.reduce((sum, item) => sum + item.volume, 0)
    });
    index += factor;
  }
  return output;
}

// Indicators are recursive, so a run may only cross an unbroken run of candles. Splitting
// on every missing candle is too strict: the archive has a handful of exchange maintenance
// gaps of a few hours, and cutting there threw away all warm-up behind them. Six years of
// BTC became twenty pieces, none long enough to warm a weekly average, so any preset with a
// slow higher timeframe measured as if it never signalled. A gap shorter than the tolerance
// is stepped over — the candles are simply absent, none are invented — and only a real
// outage starts a new segment.
export const MAX_BRIDGED_GAP_MS = 24 * 60 * 60 * 1000;

export function splitContiguous(candles, intervalMs, maxBridgedGapMs = MAX_BRIDGED_GAP_MS) {
  if (!candles.length) return [];
  const segments = [[candles[0]]];
  for (let index = 1; index < candles.length; index += 1) {
    const delta = candles[index].timestamp - candles[index - 1].timestamp;
    if (delta === intervalMs || (delta > intervalMs && delta <= maxBridgedGapMs)) {
      segments.at(-1).push(candles[index]);
    } else {
      segments.push([candles[index]]);
    }
  }
  return segments;
}

export function intervalMs(timeframe) {
  return FIVE_MINUTES * timeframe.factor;
}
