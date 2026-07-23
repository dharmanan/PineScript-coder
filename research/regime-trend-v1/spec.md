# Regime Trend v1 — Frozen Strategy Specification

Status: **Frozen pilot specification**

Strategy ID: `regime-trend-v1`

Purpose: Test whether a simple, cost-aware, long-only trend-following system on liquid crypto spot markets shows a robust positive historical edge under the PineForge validation protocol.

This specification defines the strategy. Code must follow this document; this document must not be rewritten to match code or backtest results.

## 1. Approved market universe

Pilot symbols:

- BTCUSDT spot
- ETHUSDT spot
- BNBUSDT spot

Exchange data source: Binance spot OHLCV.

Base timeframe: 4 hours.

Timezone: UTC.

No short positions, leverage, funding, borrowing or liquidation logic.

## 2. Indicators

All indicators use completed 4-hour candles only.

### 2.1 Trend direction

- Fast EMA length: 50
- Slow EMA length: 200

Trend regime is bullish when both are true at the close of signal candle `t`:

1. `EMA50[t] > EMA200[t]`
2. `close[t] > EMA200[t]`

Otherwise the market is not in the bullish regime.

### 2.2 Breakout trigger

- Donchian lookback: 20 completed candles
- The breakout level at signal candle `t` is the highest high from candles `t-20` through `t-1`.
- The current candle must not be included in the breakout level.

A breakout occurs when:

`close[t] > highest(high[t-20:t-1])`

### 2.3 Volatility

- ATR length: 14
- ATR definition: Wilder RMA true range, equivalent to TradingView `ta.atr(14)` after warm-up.

ATR is measured on signal candle `t` and frozen for the new trade.

### 2.4 Volatility floor

The normalized ATR on signal candle `t` is:

`ATR14[t] / close[t]`

A new position is allowed only when normalized ATR is at least `0.005` (0.50%).

This is intended to avoid entries whose expected movement is too small relative to trading costs.

## 3. Entry rule

A LONG signal occurs at the close of candle `t` only when all conditions are true:

1. All indicators are fully warmed up.
2. No position is open.
3. Bullish trend regime is true.
4. Breakout trigger is true.
5. Normalized ATR is at least 0.50%.

The order is filled at the next candle open, candle `t+1`.

Entry slippage for a buy is adverse:

`entry_fill = open[t+1] * (1 + 0.0005)`

Entry commission:

`entry_fee = entry_fill * quantity * 0.001`

No order is created if candle `t+1` is missing.

## 4. Position sizing

Initial research uses normalized one-unit exposure rather than compounding portfolio risk.

For each trade:

- quantity = `1 / entry_fill`
- gross entry notional is approximately 1 quote-currency unit before slippage and fee.

This keeps percentage returns comparable across assets and prevents equity compounding from hiding strategy behavior.

Portfolio aggregation may sum normalized trade returns but must also report each symbol separately.

## 5. Initial stop

Frozen signal ATR:

`entry_atr = ATR14[t]`

Initial stop distance:

`2.5 * entry_atr`

Initial stop price:

`initial_stop = entry_fill - 2.5 * entry_atr`

The stop is fixed from the entry fill and must never move downward.

## 6. Trailing stop

After entry, calculate a candidate trailing stop at the close of each completed candle `u`:

`candidate_stop[u] = highest_close_since_entry[u] - 3.0 * ATR14[u]`

where `highest_close_since_entry[u]` includes completed closes from the entry candle through candle `u`.

The active stop after candle `u` closes is:

`active_stop[u] = max(previous_active_stop, candidate_stop[u])`

Rules:

- The stop can only stay unchanged or move upward.
- It may not move downward when ATR expands.
- A stop update calculated from candle `u` becomes effective starting with candle `u+1`.
- The entry candle uses the initial stop only; no close-derived trailing update is allowed before that candle closes.

## 7. Trend exit

A trend-exit signal occurs at the close of candle `t` when:

`close[t] < EMA50[t]`

If a position is open and the stop has not already exited the trade during candle `t`, the trend-exit order is filled at the next candle open `t+1`.

Sell slippage is adverse:

`trend_exit_fill = open[t+1] * (1 - 0.0005)`

If candle `t+1` is missing, the trade remains open and must be marked unresolved at dataset end.

## 8. Stop execution using OHLC data

For a candle with an active stop known before the candle opens:

1. If `open <= active_stop`, the stop gaps through and fills at `open * (1 - 0.0005)`.
2. Otherwise, if `low <= active_stop`, it fills at `active_stop * (1 - 0.0005)`.
3. Otherwise, no stop exit occurs on that candle.

A stop exit takes precedence over any trend-exit signal calculated at that candle close.

There is no profit target in v1.

## 9. Same-candle and ordering rules

- Entry orders fill at next-bar open; therefore the signal candle cannot also stop out the new trade.
- On an entry candle, the initial stop is active immediately after the entry fill.
- If the entry candle opens below the computed initial stop, use the conservative immediate exit model: enter at adverse buy fill, then exit at adverse sell fill based on the same open. This event must be flagged in the ledger.
- If a stop is touched during a candle, that exit wins over a trend-exit signal at the close.
- No re-entry is allowed on the same candle as an exit.
- A new signal may be evaluated only at a later completed candle while flat.

## 10. Fees and net PnL

Exit commission:

`exit_fee = exit_fill * quantity * 0.001`

Gross PnL:

`gross_pnl = (exit_fill - entry_fill) * quantity`

Net PnL:

`net_pnl = gross_pnl - entry_fee - exit_fee`

Trade return on entry notional:

`net_return = net_pnl / (entry_fill * quantity)`

All reports must include gross PnL, both fees, slippage-adjusted fills and net PnL.

## 11. End-of-data handling

An open position at the end of a partition is not silently closed at the final close.

It must be reported as an unresolved open trade and excluded from closed-trade performance metrics. Exposure and unrealized PnL may be reported separately.

Partitions must not leak state into one another for headline metrics. Each partition begins with indicator warm-up history but with no inherited open position.

## 12. Required trade-ledger fields

Every closed trade must contain:

- strategy_id
- implementation_version
- dataset_hash
- symbol
- timeframe
- direction
- signal_timestamp
- entry_timestamp
- raw_entry_open
- entry_fill
- entry_atr
- initial_stop
- exit_timestamp
- raw_exit_reference
- exit_fill
- exit_reason (`initial_stop`, `trailing_stop`, `trend_exit`, `immediate_entry_stop`)
- quantity
- entry_fee
- exit_fee
- gross_pnl
- net_pnl
- net_return
- bars_held
- immediate_entry_stop_flag

## 13. Synthetic fixtures required before market data

At minimum:

1. Valid bullish-regime breakout enters on next open.
2. Breakout without bullish regime produces no trade.
3. Bullish regime without breakout produces no trade.
4. Breakout rejected below normalized ATR floor.
5. Current candle high is excluded from Donchian calculation.
6. Duplicate breakout while long produces no second entry.
7. Initial stop is frozen from signal ATR.
8. Rising trailing stop never moves downward after ATR expansion.
9. Gap below stop fills at adverse next-candle open.
10. Intrabar stop touch fills at stop minus sell slippage.
11. Trend exit fills at next open.
12. Stop during candle overrides trend exit at close.
13. Commission and slippage arithmetic matches a hand-calculated trade.
14. Truncated history produces identical earlier signals.
15. Prepended warm-up data does not alter stable-period signals.

## 14. Parameters frozen for v1

- EMA fast: 50
- EMA slow: 200
- Donchian lookback: 20
- ATR length: 14
- normalized ATR floor: 0.50%
- initial stop ATR multiple: 2.5
- trailing stop ATR multiple: 3.0
- commission: 0.10% per side
- slippage: 0.05% per side
- timeframe: 4h
- direction: long only

These parameters may not be optimized after the final holdout is opened. Any change creates `regime-trend-v2`.

## 15. Classification rule

This version is not considered useful because its code compiles or because development data is profitable.

It becomes a Paper Candidate only after:

- synthetic correctness passes,
- Python/Pine trade parity passes,
- lookahead and recursive-stability checks pass,
- validation and final-holdout results satisfy `research/validation-protocol-v1.md`.

If correctly implemented v1 fails those performance gates, v1 stops. Its parameters will not be repeatedly tuned against the final holdout.
