export type Timestamp = number;

export type Candle = {
  timestamp: Timestamp;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type ExitReason = "initial_stop" | "trailing_stop" | "trend_exit";

export type StrategyParameters = {
  emaFast: number;
  emaSlow: number;
  donchianLookback: number;
  atrLength: number;
  atrFloor: number;
  initialStopAtr: number;
  trailingStopAtr: number;
  commission: number;
  slippage: number;
};

export const REGIME_TREND_V1_DEFAULTS: Readonly<StrategyParameters> = Object.freeze({
  emaFast: 50,
  emaSlow: 200,
  donchianLookback: 20,
  atrLength: 14,
  atrFloor: 0.005,
  initialStopAtr: 2.5,
  trailingStopAtr: 3,
  commission: 0.001,
  slippage: 0.0005
});

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
  implementation_version: string;
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

function validateParameters(parameters: StrategyParameters): void {
  const positiveIntegers = [parameters.emaFast, parameters.emaSlow, parameters.donchianLookback, parameters.atrLength];
  if (positiveIntegers.some((value) => !Number.isInteger(value) || value <= 0)) {
    throw new Error("Indicator lengths must be positive integers");
  }
  if (parameters.emaFast >= parameters.emaSlow) throw new Error("emaFast must be less than emaSlow");
  const positive = [parameters.atrFloor, parameters.initialStopAtr, parameters.trailingStopAtr];
  if (positive.some((value) => !Number.isFinite(value) || value <= 0)) {
    throw new Error("ATR parameters must be positive");
  }
  if (parameters.commission < 0 || parameters.slippage < 0) {
    throw new Error("Costs cannot be negative");
  }
}

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

export function wilderAtr(candles: Candle[], length = 14): Array<number | undefined> {
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

function highestPreviousHigh(candles: Candle[], index: number, lookback: number): number | undefined {
  if (index < lookback) return undefined;
  let highest = Number.NEGATIVE_INFINITY;
  for (let cursor = index - lookback; cursor < index; cursor += 1) {
    highest = Math.max(highest, candles[cursor].high);
  }
  return highest;
}

function stopReason(position: OpenPosition): ExitReason {
  return position.trailingActivated ? "trailing_stop" : "initial_stop";
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
  commission: number;
  implementationVersion: string;
}): TradeLedger {
  const {
    position,
    exitIndex,
    exitTimestamp,
    rawExitReference,
    exitFill,
    exitReason,
    datasetHash,
    symbol,
    commission,
    implementationVersion
  } = args;
  const exitFee = exitFill * position.quantity * commission;
  const grossPnl = (exitFill - position.entryFill) * position.quantity;
  const netPnl = grossPnl - position.entryFee - exitFee;
  const entryNotional = position.entryFill * position.quantity;

  return {
    strategy_id: "regime-trend-v1",
    implementation_version: implementationVersion,
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
    bars_held: exitIndex - position.entryIndex
  };
}

export function runRegimeTrendV1(
  candles: Candle[],
  options: {
    datasetHash?: string;
    symbol?: string;
    parameters?: Partial<StrategyParameters>;
    implementationVersion?: string;
  } = {}
): BacktestResult {
  validateCandles(candles);

  const parameters: StrategyParameters = {
    ...REGIME_TREND_V1_DEFAULTS,
    ...(options.parameters ?? {})
  };
  validateParameters(parameters);

  const datasetHash = options.datasetHash ?? "synthetic";
  const symbol = options.symbol ?? "TESTUSDT";
  const implementationVersion = options.implementationVersion ?? "typescript-reference-v1.1.0";
  const warmupIndex = Math.max(
    parameters.emaSlow,
    parameters.donchianLookback,
    parameters.atrLength
  ) - 1;
  const closes = candles.map((candle) => candle.close);
  const fastEma = ema(closes, parameters.emaFast);
  const slowEma = ema(closes, parameters.emaSlow);
  const atr = wilderAtr(candles, parameters.atrLength);

  const trades: TradeLedger[] = [];
  const signals: SignalRecord[] = [];
  const stopUpdates: StopUpdate[] = [];
  let position: OpenPosition | null = null;
  let pendingEntry: SignalRecord | null = null;
  let pendingTrendExit = false;

  const recordExit = (
    exitIndex: number,
    rawExitReference: number,
    exitFill: number,
    exitReason: ExitReason
  ): void => {
    if (!position) throw new Error("Cannot close a missing position");
    trades.push(
      closeTrade({
        position,
        exitIndex,
        exitTimestamp: candles[exitIndex].timestamp,
        rawExitReference,
        exitFill,
        exitReason,
        datasetHash,
        symbol,
        commission: parameters.commission,
        implementationVersion
      })
    );
    position = null;
    pendingTrendExit = false;
  };

  for (let index = 0; index < candles.length; index += 1) {
    const candle = candles[index];
    let exitedThisBar = false;

    if (pendingEntry) {
      const entryFill = candle.open * (1 + parameters.slippage);
      const quantity = 1 / entryFill;
      const entryFee = entryFill * quantity * parameters.commission;
      const initialStop = entryFill - parameters.initialStopAtr * pendingEntry.atr;
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
    }

    if (position && pendingTrendExit) {
      if (candle.open <= position.activeStop) {
        recordExit(index, candle.open, candle.open * (1 - parameters.slippage), stopReason(position));
      } else {
        recordExit(index, candle.open, candle.open * (1 - parameters.slippage), "trend_exit");
      }
      exitedThisBar = true;
    }

    if (position && !exitedThisBar) {
      const stop = position.activeStop;
      if (candle.open <= stop) {
        recordExit(index, candle.open, candle.open * (1 - parameters.slippage), stopReason(position));
        exitedThisBar = true;
      } else if (candle.low <= stop) {
        recordExit(index, stop, stop * (1 - parameters.slippage), stopReason(position));
        exitedThisBar = true;
      }
    }

    if (position && !exitedThisBar) {
      position.highestCloseSinceEntry = Math.max(position.highestCloseSinceEntry, candle.close);
      const currentAtr = atr[index];
      if (currentAtr !== undefined) {
        const previousStop = position.activeStop;
        const candidateStop = position.highestCloseSinceEntry - parameters.trailingStopAtr * currentAtr;
        const activeStop = Math.max(previousStop, candidateStop);
        if (activeStop > previousStop) position.trailingActivated = true;
        position.activeStop = activeStop;
        stopUpdates.push({ index, timestamp: candle.timestamp, previousStop, candidateStop, activeStop });
      }

      const fast = fastEma[index];
      if (fast !== undefined && candle.close < fast && index + 1 < candles.length) {
        pendingTrendExit = true;
      }
    }

    if (!position && !pendingEntry && !exitedThisBar && index >= warmupIndex && index + 1 < candles.length) {
      const fast = fastEma[index];
      const slow = slowEma[index];
      const currentAtr = atr[index];
      const breakoutLevel = highestPreviousHigh(candles, index, parameters.donchianLookback);
      if (fast !== undefined && slow !== undefined && currentAtr !== undefined && breakoutLevel !== undefined) {
        const bullishRegime = fast > slow && candle.close > slow;
        const breakout = candle.close > breakoutLevel;
        const volatilityAllowed = currentAtr / candle.close >= parameters.atrFloor;
        if (bullishRegime && breakout && volatilityAllowed) {
          pendingEntry = {
            signalIndex: index,
            signalTimestamp: candle.timestamp,
            atr: currentAtr,
            breakoutLevel
          };
          signals.push(pendingEntry);
        }
      }
    }
  }

  return { trades, signals, stopUpdates, openPosition: position };
}
