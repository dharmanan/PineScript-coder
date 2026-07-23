# Regime Trend v1 — Frozen Hierarchical Intrabar Replay Plan

Status: **Frozen before lower-timeframe replay results are viewed**

Purpose: resolve the OHLC path ambiguity inside each 4-hour strategy candle and test whether an immediately executable profit target is reached before the active stop.

The existing 4-hour strategy remains the signal generator. Lower-timeframe candles are used only to reconstruct event order and execution.

## 1. Core correction

A 4-hour candle containing both a favorable high and an adverse low does not reveal which event occurred first.

Therefore 4-hour OHLC data alone may not be used to conclude that:

- a target was reached before a stop,
- a stop was reached before a target,
- a favorable excursion was realizable,
- waiting for the 4-hour close was necessary.

## 2. Data boundary

Use only:

- Development: 2019-01-01 through 2022-12-31 UTC
- Validation/research: 2023-01-01 through 2024-12-31 UTC

The final holdout beginning 2025-01-01 remains closed.

## 3. Hierarchical resolution

### Stage 1: 1-hour replay

Download and hash-complete Binance Spot 1-hour candles for BTCUSDT, ETHUSDT and BNBUSDT through 2024-12-31.

Replay every frozen 4-hour baseline trade using the 1-hour candles contained inside its active lifetime.

### Stage 2: selective 15-minute replay

When the same 1-hour candle contains both the active stop and the tested target, classify the event as `AMBIGUOUS_SAME_1H`.

Only these ambiguous 1-hour windows may be refined with 15-minute candles.

If the same 15-minute candle still contains both levels, retain `AMBIGUOUS_SAME_15M`. Do not invent an intrabar path.

## 4. Frozen immediate-exit targets

Test only full-position immediate target exits at:

- +0.50 frozen entry ATR,
- +1.00 frozen entry ATR,
- +1.50 frozen entry ATR,
- +2.00 frozen entry ATR.

The target is measured from the baseline entry fill.

A target exit occurs immediately when the lower-timeframe price first reaches the target. It does not wait for a 4-hour close.

No additional target may be introduced after viewing the replay results.

## 5. Baseline stop schedule

The original initial stop and 4-hour trailing-stop updates remain unchanged.

- The initial stop is active immediately from entry.
- A trailing-stop update calculated from a completed 4-hour candle becomes active only at the next 4-hour candle open.
- A pending trend exit remains an exit at the next 4-hour open.

Lower-timeframe replay must not use future 4-hour closes to update a stop early.

## 6. One-hour event ordering

For each active 1-hour candle:

1. Check opening gaps.
2. If open is at or below the active stop, the stop occurs first.
3. Else if open is at or above the target, the target occurs first.
4. If the candle range reaches both stop and target, classify `AMBIGUOUS_SAME_1H`.
5. If only the target is reached, classify `TARGET_FIRST`.
6. If only the stop is reached, classify `STOP_FIRST`.
7. Otherwise continue to the next 1-hour candle.

If no lower-timeframe target or stop occurs before the original baseline exit, retain `BASELINE_EXIT`.

Any missing lower-timeframe interval inside the required replay window produces `DATA_GAP` rather than a guessed result.

## 7. Execution costs

Use the frozen baseline costs:

- commission: 0.10% per side,
- adverse slippage: 0.05% per side.

A target touch uses the target reference with adverse sell slippage. A stop touch uses the active stop reference with adverse sell slippage. A gap through a stop uses the lower-timeframe candle open with adverse slippage.

## 8. Required reports

For each partition, symbol and target report:

- baseline trade count,
- `TARGET_FIRST` count,
- `STOP_FIRST` count,
- `AMBIGUOUS_SAME_1H` count,
- `BASELINE_EXIT` count,
- `DATA_GAP` count,
- target-first count among baseline winners,
- target-first count among baseline losers,
- stop-first count among baseline winners,
- stop-first count among baseline losers,
- lower-bound total net PnL, treating same-hour ambiguity as stop-first,
- upper-bound total net PnL, treating same-hour ambiguity as target-first,
- profit-factor bounds,
- win-rate bounds,
- results by symbol and by calendar quarter.

Also report the exact 1-hour timestamps requiring selective 15-minute refinement.

## 9. Interpretation discipline

The completed-bar profit-protection matrix is a separate test and must not be used as evidence against immediate intrabar targets.

An immediate target candidate may advance only when:

- its lower-bound result improves both development and validation/research,
- the improvement is not carried by one symbol or one quarter,
- ambiguity is low enough or resolved by selective 15-minute replay,
- doubled execution costs do not remove the improvement.

This stage does not authorize live trading, Pine implementation or final-holdout access.
