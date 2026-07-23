# Regime Trend v1 — Frozen 5-Minute Target-Triggered Ratchet Plan

Status: **Frozen before ratchet results are viewed**

Purpose: test whether a favorable 5-minute excursion should change the position's risk state without forcing a full take-profit exit.

The existing 4-hour entry, trend exit, ATR definition and trailing-stop schedule remain unchanged. The overlay only raises the active stop after a frozen favorable-excursion trigger.

## 1. Research boundary

Evaluate separately:

- Development: 2019-01-01 through 2022-12-31 UTC
- Validation/research: 2023-01-01 through 2024-12-31 UTC

Because validation has already informed rule design, 2019–2024 is now treated as the research/design set. The final holdout beginning 2025-01-01 remains closed.

## 2. Frozen candidates

Only these five candidates are allowed:

1. `touch-1.50-lock-0.00`
   - activation: price reaches +1.50 frozen entry ATR
   - new minimum net stop result: 0.00 ATR

2. `touch-1.50-lock-0.50`
   - activation: price reaches +1.50 frozen entry ATR
   - new minimum net stop result: +0.50 ATR

3. `touch-2.00-lock-0.00`
   - activation: price reaches +2.00 frozen entry ATR
   - new minimum net stop result: 0.00 ATR

4. `touch-2.00-lock-0.50`
   - activation: price reaches +2.00 frozen entry ATR
   - new minimum net stop result: +0.50 ATR

5. `touch-2.00-lock-1.00`
   - activation: price reaches +2.00 frozen entry ATR
   - new minimum net stop result: +1.00 ATR

No additional activation or floor may be introduced after viewing results.

## 3. Activation semantics

Activation occurs when a 5-minute candle open or high reaches:

`entry_fill + activation_atr * frozen_entry_atr`

The ratchet floor becomes active at the next expected 5-minute candle timestamp. It is never active inside the activation candle.

If the original active stop is touched in the same 5-minute candle as the activation threshold, the original stop outcome is retained. The overlay does not invent intrabar ordering or retroactively activate the new floor.

## 4. Net floor definition

Each floor is specified as a desired net result in frozen entry-ATR units after:

- entry commission already paid,
- 0.10% exit commission,
- 0.05% adverse exit slippage.

The raw stop reference is solved so that an exact stop touch realizes the requested net ATR result under normal costs.

A gap below the floor exits at the actual 5-minute open with adverse slippage. The realized result may therefore be below the desired floor.

## 5. Stop precedence

At every 5-minute timestamp, the active stop is the maximum of:

- the frozen original 4-hour strategy stop active at that timestamp,
- the ratchet floor, once activated.

Original 4-hour stop updates become active only at the following 4-hour open. No future 4-hour close may be used early.

## 6. Baseline exit horizon

- For a baseline `trend_exit`, replay ends at the recorded exit open unless the ratchet stop has exited earlier.
- For a baseline `initial_stop` or `trailing_stop`, replay includes the full recorded 4-hour stop-exit candle, as defined by Intrabar Replay Errata 001.
- Missing 5-minute data before resolution produces `DATA_GAP`.
- A fully covered baseline stop candle that cannot reproduce the stop produces `DATA_MISMATCH`.

`DATA_GAP` and `DATA_MISMATCH` retain the baseline trade result for neutral aggregate comparison and prevent the candidate from being marked fully resolved.

## 7. Required outputs

For every candidate and partition report:

- baseline and overlay total net PnL,
- net-PnL change,
- baseline and overlay profit factor,
- baseline and overlay win rate,
- baseline and overlay maximum drawdown,
- activation count,
- ratchet-exit count,
- activated trades retaining the baseline exit,
- non-activated trades,
- losing trades converted to winners,
- losing trades improved but still losing,
- baseline winners reduced,
- baseline winners converted to losses,
- baseline winners preserving at least 90% of original net PnL,
- data-gap and data-mismatch counts,
- results by symbol and original baseline exit quarter.

Also evaluate the same frozen candidates with commission and slippage both doubled.

## 8. Advancement discipline

A candidate may advance to a frozen strategy specification only if it:

- improves total net PnL in both development and validation/research,
- does not reduce profit factor in either partition,
- does not increase maximum drawdown in either partition,
- preserves at least 80% of baseline winners at 90% or more of their original net PnL,
- converts no more than 5% of baseline winners into losses,
- improves more than one symbol,
- remains an improvement under doubled execution costs,
- has no unresolved `DATA_MISMATCH` and only separately reviewed `DATA_GAP` cases.

If none pass, fixed target-triggered full-position ratchets are rejected. The next frozen study may combine a small partial realization with a looser runner, but no such rule is authorized by this plan.

This stage does not authorize live trading, Pine implementation or final-holdout access.
