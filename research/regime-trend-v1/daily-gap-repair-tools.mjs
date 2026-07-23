export const BINANCE_DAILY_ARCHIVE_BASE =
  "https://data.binance.vision/data/spot/daily/klines";

export function dayId(timestamp) {
  if (!Number.isFinite(timestamp)) throw new Error(`Invalid timestamp: ${timestamp}`);
  return new Date(timestamp).toISOString().slice(0, 10);
}

export function monthIdFromTimestamp(timestamp) {
  if (!Number.isFinite(timestamp)) throw new Error(`Invalid timestamp: ${timestamp}`);
  return new Date(timestamp).toISOString().slice(0, 7);
}

export function dailyArchiveFileName(symbol, day) {
  if (!/^[A-Z0-9]+$/.test(symbol)) throw new Error(`Invalid symbol: ${symbol}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error(`Invalid day: ${day}`);
  return `${symbol}-5m-${day}.zip`;
}

export function dailyArchiveUrl(symbol, day) {
  const fileName = dailyArchiveFileName(symbol, day);
  return `${BINANCE_DAILY_ARCHIVE_BASE}/${symbol}/5m/${fileName}`;
}

export function dailyChecksumUrl(symbol, day) {
  return `${dailyArchiveUrl(symbol, day)}.CHECKSUM`;
}

export function parseRawKlineRows(csv) {
  const rows = [];
  for (const [index, line] of csv.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    const columns = line.split(",");
    const first = columns[0]?.trim();
    if (!/^\d+$/.test(first)) {
      if (index === 0) continue;
      throw new Error(`Unexpected kline header at row ${index + 1}`);
    }
    const timestamp = Number(first);
    if (!Number.isFinite(timestamp)) throw new Error(`Invalid timestamp at row ${index + 1}`);
    rows.push({ timestamp, raw: line });
  }
  if (rows.length === 0) throw new Error("Kline CSV contains no rows");
  return rows;
}

export function selectRawKlineRows(csv, targetTimestamps) {
  const targets = new Set(targetTimestamps);
  const selected = new Map();
  for (const row of parseRawKlineRows(csv)) {
    if (targets.has(row.timestamp)) selected.set(row.timestamp, row.raw);
  }
  return selected;
}

export function insertRawKlineRows(monthlyCsv, rawRows) {
  const existingRows = parseRawKlineRows(monthlyCsv);
  const rowByTimestamp = new Map(existingRows.map((row) => [row.timestamp, row.raw]));
  const inserted = [];
  const alreadyPresent = [];

  for (const row of rawRows) {
    const current = rowByTimestamp.get(row.timestamp);
    if (current !== undefined) {
      if (current !== row.raw) {
        throw new Error(`Conflicting kline row at ${row.timestamp}`);
      }
      alreadyPresent.push(row.timestamp);
      continue;
    }
    rowByTimestamp.set(row.timestamp, row.raw);
    inserted.push(row.timestamp);
  }

  const csv = `${[...rowByTimestamp.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, raw]) => raw)
    .join("\n")}\n`;

  return { csv, inserted, alreadyPresent };
}

export function unresolvedTargetsFromReport(report) {
  const unique = new Map();
  for (const partition of report.partitions ?? []) {
    const diagnostics = partition.unresolved_diagnostics?.normal_costs ?? [];
    for (const item of diagnostics) {
      if (item.classification !== "DATA_GAP" || !item.missing_5m_timestamp) continue;
      const timestamp = Date.parse(item.missing_5m_timestamp);
      if (!Number.isFinite(timestamp)) {
        throw new Error(`Invalid diagnostic timestamp: ${item.missing_5m_timestamp}`);
      }
      const key = `${item.symbol}:${timestamp}`;
      if (!unique.has(key)) {
        unique.set(key, {
          symbol: item.symbol,
          timestamp,
          timestamp_iso: new Date(timestamp).toISOString(),
          day: dayId(timestamp),
          month: monthIdFromTimestamp(timestamp),
          partitions: [partition.id]
        });
      } else if (!unique.get(key).partitions.includes(partition.id)) {
        unique.get(key).partitions.push(partition.id);
      }
    }
  }
  return [...unique.values()].sort(
    (left, right) => left.timestamp - right.timestamp || left.symbol.localeCompare(right.symbol)
  );
}
