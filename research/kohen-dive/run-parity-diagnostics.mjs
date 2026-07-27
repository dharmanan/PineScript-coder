// Narrow diagnostics for matching compiler-v30 against TradingView screenshots.
import { aggregate } from "../preset-sweep/data.mjs";
import { loadAll } from "../preset-sweep/dataset.mjs";
import {
  buildKohenContext,
  buildKohenSignals,
  metrics,
  simulateKohen
} from "./core.mjs";

const architecture = {
  symmetricVwap: false,
  reversalWindow: 8,
  reversalConfirmation: "strict",
  continuation: "current",
  continuationLookback: 8,
  continuationRsiLevel: 50,
  regimeSlopeBars: 3,
  cooldownBars: 5,
  triggerWindow: 1
};
const risk = { atrMultiple: 2, riskReward: 2, costPerSide: 0.01 };
const countRange = {
  start: Date.parse("2024-01-01T00:00:00Z"),
  endExclusive: Date.parse("2027-01-01T00:00:00Z")
};
const { bySymbol } = await loadAll();

for (const symbol of ["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT"]) {
  const context = buildKohenContext(aggregate(bySymbol.get(symbol), 48));
  const signals = buildKohenSignals(context, architecture);
  const trades = simulateKohen(context, signals, risk);
  const selected = trades.filter((trade) =>
    trade.entryTimestamp >= countRange.start && trade.entryTimestamp < countRange.endExclusive
  );
  const gated = context.candles.reduce((count, candle, index) => {
    if (candle.timestamp < countRange.start || candle.timestamp >= countRange.endExclusive) return count;
    return count + (
      signals.rawLong[index] && signals.strongBear[index] ||
      signals.rawShort[index] && signals.strongBull[index]
        ? 1
        : 0
    );
  }, 0);
  const longEvents = signals.long.reduce((count, value, index) =>
    count + (value && context.candles[index].timestamp >= countRange.start ? 1 : 0), 0);
  const shortEvents = signals.short.reduce((count, value, index) =>
    count + (value && context.candles[index].timestamp >= countRange.start ? 1 : 0), 0);
  console.log(`\n${symbol} ${JSON.stringify(metrics(trades, countRange))}`);
  console.log(`gated=${gated} longEvents=${longEvents} shortEvents=${shortEvents}`);
  if (symbol === "ETHUSDT") {
    for (const stamp of ["2026-05-07T04:00:00Z", "2026-05-07T08:00:00Z"]) {
      const index = context.candles.findIndex((candle) => candle.timestamp === Date.parse(stamp));
      if (index >= 0) {
        console.log(
          `probe ${stamp} O=${context.candles[index].open} C=${context.candles[index].close} ` +
          `ATR=${context.atr[index]} risk=${context.atr[index] * 2}`
        );
      }
    }
  }
  for (const trade of selected.slice(-12)) {
    console.log(
      `${new Date(trade.entryTimestamp).toISOString()} -> ` +
      `${new Date(trade.exitTimestamp).toISOString()} ` +
      `${trade.direction === 1 ? "L" : "S"} ${trade.family === 1 ? "CONT" : "REV"} ` +
      `${trade.netR.toFixed(3)}R`
    );
  }
}
