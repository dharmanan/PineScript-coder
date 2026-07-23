export type Timestamp = number;

export type Candle = {
  timestamp: Timestamp;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type ExitReason =
  | "initial_stop"
  | "trailing_stop"
  | "trend_exit"
  | "immediate_entry_stop";

export type SignalRecord = {
  signalIndex: number;
  signalTimestamp: Timestamp;
  atr: number;
  breakoutLevel: number;
};

export type StopUpdate = {
  index: number;
  timestamp: Timestamp;
  previousStop: number;
  candidateStop: number;
  activeStop: number;
};

export type TradeLedger = {
  strategy_id: "regime-trend-v1";
  implementation_version: "typescript-reference-v1";
  dataset_hash: string;
  symbol: string;
  timeframe: "4h";
  direction: "long";
  signal_timestamp: Timestamp;
  entry_timestamp: Timestamp;
  raw_entry_open: number;
  entry_fill: number;
  entry_atr: number;
  initial_stop: number;
  exit_timestamp: Timestamp;
  raw_exit_reference: number;
  exit_fill: number;
  exit_reason: ExitReason;
  quantity: number;
  entry_fee: number;
  exit_fee: number;
  gross_pnl: number;
  net_pnl: number;
  net_return: number;
  bars_held: number;
  immediate_entry_stop_flag: boolean;
};

export type OpenPosition = {
  signalIndex: number;
  signalTimestamp: Timestamp;
  entryIndex: number;
  entryTimestamp: Timestamp;
  rawEntryOpen: number;
  entryFill: number;
  entryAtr: number;
  quantity: number;
  entryFee: number;
  initialStop: number;
  activeStop: number;
  highestCloseSinceEntry: number;
  trailingActivated: boolean;
};

export type BacktestResult = {
  trades: TradeLedger[];
  signals: SignalRecord[];
  stopUpdates: StopUpdate[];
  openPosition: OpenPosition | null;
};

const EMA_FAST = 50;
const EMA_SLOW = 200;
const DONCHIAN = 20;
const ATR_LENGTH = 14;
const ATR_FLOOR = 0.005;
const INITIAL_STOP_ATR = 2.5;
const TRAILING_STOP_ATR = 3;
const COMMISSION = 0.001;
const SLIPPAGE = 0.0005;
const WARMUP_INDEX = Math.max(EMA_SLOW, DONCHIAN, ATR_LENGTH) - 1;

function assertCandle(candle: Candle, index: number): void {
  const values = [candle.open, candle.high, candle.low, candle.close, candle.volume];
  if (!Number.isFinite(candle.timestamp) || values.some((value) => !Number.isFinite(value))) {
    throw new Error(`Invalid candle at index ${index}`);
  }
  if (candle.high < Math.max(candle.open, candle.close) || candle.low > Math.min(candle.open, candle.close)) {
    throw new Error(`Invalid OHLC bounds at index ${index}`);
  }
  if (candle.low > candle.high || candle.open <= 0 || candle.high <= 0 || candle.low <= 0 || candle.close <= 0) {
    throw new Error(`Invalid positive OHLC values at index ${index}`);
  }
}

function validateCandles(candles: Candle[]): void {
  candles.forEach(assertCandle);
  for (let index = 1; index < candles.length; index += 1) {
    if (candles[index].timestamp <= candles[index - 1].timestamp) {
      throw new Error(`Candles must have strictly increasing timestamps at index ${index}`);
    }
  }
}

export function ema(values: number[], length: number): Array<number | undefined> {
  if (!Number.isInteger(length) || length <= 0) throw new Error("EMA length must be positive");
  if (values.length === 0) return [];

  const alpha = 2 / (length + 1);
  const output: Array<number | undefined> = new Array(values.length);
  output[0] = values[0];
  for (let index = 1; index < values.length; index += 1) {
    output[index] = alpha * values[index] + (1 - alpha) * (output[index - 1] as number);
  }
  return output;
}

export function wilderAtr(candles: Candle[], length = ATR_LENGTH): Array<number | undefined> {
  if (!Number.isInteger(length) || length <= 0) throw new Error("ATR length must be positive");
  const output: Array<number | undefined> = new Array(candles.length);
  if (candles.length === 0) return output;

  const trueRanges = candles.map((candle, index) => {
    if (index === 0) return candle.high - candle.low;
    const previousClose = candles[index - 1].close;
    return Math.max(
      candle.high - candle.low,
      Math.abs(candle.high - previousClose),
      Math.abs(candle.low - previousClose)
    );
  });

  if (candles.length < length) return output;
  let seed = 0;
  for (let index = 0; index < length; index += 1) seed += trueRanges[index];
  output[length - 1] = seed / length;

  for (let index = length; index < candles.length; index += 1) {
    output[index] = ((output[index - 1] as number) * (length - 1) + trueRanges[index]) / length;
  }
  return output;
}

function highestPreviousHigh(candles: Candle[], index: number): number | undefined {
  if (index < DONCHIAN) return undefined;
  let highest = Number.NEGATIVE_INFINITY;
  for (let cursor = index - DONCHIAN; cursor < index; cursor += 1) {
    highest = Math.max(highest, candles[cursor].high);
  }
  return highest;
}

function closeTrade(args: {
  position: OpenPosition;
  exitIndex: number;
  exitTimestamp: Timestamp;
  rawExitReference: number;
  exitFill: number;
  exitReason: ExitReason;
  datasetHash: string;
  symbol: string;
}): TradeLedger {
  const { position, exitIndex, exitTimestamp, rawExitReference, exitFill, exitReason, datasetHash, symbol } = args;
  const exitFee = exitFill * position.quantity * COMMISSION;
  const grossPnl = (exitFill - position.entryFill) * position.quantity;
  const netPnl = grossPnl - position.entryFee - exitFee;
  const entryNotional = position.entryFill * position.quantity;

  return {
    strategy_id: "regime-trend-v1",
    implementation_version: "typescript-reference-v1",
    dataset_hash: datasetHash,
    symbol,
    timeframe: "4h",
    direction: "long",
    signal_timestamp: position.signalTimestamp,
    entry_timestamp: position.entryTimestamp,
    raw_entry_open: position.rawEntryOpen,
    entry_fill: position.entryFill,
    entry_atr: position.entryAtr,
    initial_stop: position.initialStop,
    exit_timestamp: exitTimestamp,
    raw_exit_reference: rawExitReference,
    exit_fill: exitFill,
    exit_reason: exitReason,
    quantity: position.quantity,
    entry_fee: position.entryFee,
    exit_fee: exitFee,
    gross_pnl: grossPnl,
    net_pnl: netPnl,
    net_return: netPnl / entryNotional,
    bars_held: exitIndex - position.entryIndex,
    immediate_entry_stop_flag: exitReason === "immediate_entry_stop"
  };
}

export function runRegimeTrendV1(
  candles: Candle[],
  options: { datasetHash?: string; symbol?: string } = {}
): BacktestResult {
  validateCandles(candles);

  const datasetHash = options.datasetHash ?? "synthetic";
  const symbol = options.symbol ?? "TESTUSDT";
  const closes = candles.map((candle) => candle.close);
  const ema50 = ema(closes, EMA_FAST);
  const ema200 = ema(closes, EMA_SLOW);
  const atr14 = wilderAtr(candles, ATR_LENGTH);

  const trades: TradeLedger[] = [];
  const signals: SignalRecord[] = [];
  const stopUpdates: StopUpdate[] = [];
  let position: OpenPosition | null = null;
  let pendingEntry: SignalRecord | null = null;
  let pendingTrendExit = false;

  for (let index = 0; index < candles.length; index += 1) {
    const candle = candles[index];
    let exitedThisBar = false;

    if (pendingEntry) {
      const entryFill = candle.open * (1 + SLIPPAGE);
      const quantity = 1 / entryFill;
      const entryFee = entryFill * quantity * COMMISSION;
      const initialStop = entryFill - INITIAL_STOP_ATR * pendingEntry.atr;
      position = {
        signalIndex: pendingEntry.signalIndex,
        signalTimestamp: pendingEntry.signalTimestamp,
        entryIndex: index,
        entryTimestamp: candle.timestamp,
        rawEntryOpen: candle.open,
        entryFill,
        entryAtr: pendingEntry.atr,
        quantity,
        entryFee,
        initialStop,
        activeStop: initialStop,
        highestCloseSinceEntry: candle.close,
        trailingActivated: false
      };
      pendingEntry = null;

      if (candle.open <= initialStop) {
        const exitFill = candle.open * (1 - SLIPPAGE);
        trades.push(
          closeTrade({
            position,
            exitIndex: index,
            exitTimestamp: candle.timestamp,
            rawExitReference: candle.open,
            exitFill,
            exitReason: "immediate_entry_stop",
            datasetHash,
            symbol
          })
        );
        position = null;
        exitedThisBar = true;
      }
    }

    if (position && !exitedThisBar) {
      const stop = position.activeStop;
      if (candle.open <= stop) {
        const exitFill = candle.open * (1 - SLIPPAGE);
        trades.push(
          closeTrade({
            position,
            exitIndex: index,
            exitTimestamp: candle.timestamp,
            rawExitReference: candle.open,
            exitFill,
            exitReason: position.trailingActivated ? "trailing_stop" : "initial_stop",
            datasetHash,
            symbol
          })
        );
        position = null;
        pendingTrendExit = false;
        exitedThisBar = true;
      } else if (candle.low <= stop) {
        const exitFill = stop * (1 - SLIPPAGE);
        trades.push(
          closeTrade({
            position,
            exitIndex: index,
            exitTimestamp: candle.timestamp,
            rawExitReference: stop,
            exitFill,
            exitReason: position.trailingActivated ? "trailing_stop" : "initial_stop",
            datasetHash,
            symbol
          })
        );
        position = null;
        pendingTrendExit = false;
        exitedThisBar = true;
      }
    }

    if (position && pendingTrendExit && !exitedThisBar) {
      const exitFill = candle.open * (1 - SLIPPAGE);
      trades.push(
        closeTrade({
          position,
          exitIndex: index,
          exitTimestamp: candle.timestamp,
          rawExitReference: candle.open,
          exitFill,
          exitReason: "trend_exit",
          datasetHash,
          symbol
        })
      );
      position = null;
      pendingTrendExit = false;
      exitedThisBar = true;
    }

    if (position && !exitedThisBar) {
      position.highestCloseSinceEntry = Math.max(position.highestCloseSinceEntry, candle.close);
      const currentAtr = atr14[index];
      if (currentAtr !== undefined) {
        const previousStop = position.activeStop;
        const candidateStop = position.highestCloseSinceEntry - TRAILING_STOP_ATR * currentAtr;
        const activeStop = Math.max(previousStop, candidateStop);
        if (activeStop > previousStop) position.trailingActivated = true;
        position.activeStop = activeStop;
        stopUpdates.push({
          index,
          timestamp: candle.timestamp,
          previousStop,
          candidateStop,
          activeStop
        });
      }

      const fast = ema50[index];
      if (fast !== undefined && candle.close < fast && index + 1 < candles.length) {
        pendingTrendExit = true;
      }
    }

    if (!position && !pendingEntry && !exitedThisBar && index >= WARMUP_INDEX && index + 1 < candles.length) {
      const fast = ema50[index];
      const slow = ema200[index];
      const atr = atr14[index];
      const breakoutLevel = highestPreviousHigh(candles, index);
      if (fast !== undefined && slow !== undefined && atr !== undefined && breakoutLevel !== undefined) {
        const bullishRegime = fast > slow && candle.close > slow;
        const breakout = candle.close > breakoutLevel;
        const volatilityAllowed = atr / candle.close >= ATR_FLOOR;
        if (bullishRegime && breakout && volatilityAllowed) {
          pendingEntry = {
            signalIndex: index,
            signalTimestamp: candle.timestamp,
            atr,
            breakoutLevel
          };
          signals.push(pendingEntry);
        }
      }
    }
  }

  return { trades, signals, stopUpdates, openPosition: position };
}
