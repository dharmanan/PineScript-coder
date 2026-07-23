# Regime Trend v1 — Frozen Profit Protection Matrix

Status: **Frozen before counterfactual overlay results are viewed**

Purpose: test whether completed-bar profit protection can improve the frozen 4-hour strategy without destroying its large right-tail winners.

This stage is counterfactual research. It does not change the baseline strategy and does not open the final holdout.

## 1. Data boundary

Evaluate the existing partitions separately:

- Development: 2019-01-01 through 2022-12-31 UTC
- Validation/research: 2023-01-01 through 2024-12-31 UTC

The final holdout beginning 2025-01-01 remains closed.

## 2. Activation rule

A protection rule activates only after a completed 4-hour candle closes at or above:

`entry_fill + activation_atr * frozen_entry_atr`

The protection floor becomes active on the next 4-hour candle. It never acts inside the activation candle.

The actual exit candle close is not eligible to activate protection because the baseline position may already have exited before that close.

## 3. Net floor definition

Each floor is specified as a desired net result in frozen entry-ATR units after normal exit slippage and commission when the floor is touched exactly.

The raw stop reference is solved from:

- baseline entry fill,
- baseline quantity,
- already-paid entry commission,
- exit commission of 0.10%,
- exit slippage of 0.05%.

A gap below the floor exits at the actual candle open with adverse slippage; therefore realized net result may be below the desired floor.

## 4. Frozen candidates

Only these seven candidates are allowed:

1. `activate-0.50-lock-0.00`
   - activation: +0.50 ATR completed-bar close
   - net floor: 0.00 ATR

2. `activate-1.00-lock-0.00`
   - activation: +1.00 ATR completed-bar close
   - net floor: 0.00 ATR

3. `activate-1.00-lock-0.25`
   - activation: +1.00 ATR completed-bar close
   - net floor: +0.25 ATR

4. `activate-1.00-lock-0.50`
   - activation: +1.00 ATR completed-bar close
   - net floor: +0.50 ATR

5. `activate-1.50-lock-0.00`
   - activation: +1.50 ATR completed-bar close
   - net floor: 0.00 ATR

6. `activate-1.50-lock-0.50`
   - activation: +1.50 ATR completed-bar close
   - net floor: +0.50 ATR

7. `activate-1.50-lock-1.00`
   - activation: +1.50 ATR completed-bar close
   - net floor: +1.00 ATR

No additional trigger or floor may be introduced after viewing results.

## 5. Conservative execution policy

For candles after activation and before the baseline exit candle:

- if open is at or below the floor, exit at open with adverse slippage,
- otherwise if low reaches the floor, exit at the floor with adverse slippage.

On the baseline exit candle, only an opening gap through the floor may create an overlay exit. The later high/low path of that candle is not used because baseline exit ordering is already in force and intrabar sequence is unknown.

If the overlay does not produce a provably earlier exit, the original baseline trade is retained unchanged.

## 6. Required outputs

For every candidate and partition report:

- baseline and overlay total net PnL,
- change in total net PnL,
- baseline and overlay profit factor,
- baseline and overlay win rate,
- baseline and overlay maximum drawdown,
- activation count,
- earlier overlay-exit count,
- losing trades converted to winners,
- losing trades improved but still losing,
- winners reduced,
- winners converted to losses,
- unchanged trades,
- median, 90th-percentile and maximum realized net ATR,
- number of baseline winners preserving at least 90% of their original net PnL,
- results by symbol.

## 7. Interpretation discipline

A candidate is not accepted because it has the highest validation result.

A viable profit-protection hypothesis must:

- improve development and validation/research total net PnL,
- not reduce profit factor in either partition,
- not increase maximum drawdown in either partition,
- preserve at least 80% of baseline winning trades at 90% or more of their original net PnL,
- avoid converting more than 5% of baseline winners into losses,
- show improvement across more than one symbol.

If no frozen candidate satisfies these conditions, completed-bar fixed-floor protection is rejected and the next research step becomes a separately specified lower-timeframe exit overlay or entry/no-trade filter.

No final holdout access is allowed during this stage.
