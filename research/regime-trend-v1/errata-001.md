# Regime Trend v1 — Errata 001

Status: **Accepted before any market-data evaluation**

This errata corrects two contradictions discovered by synthetic-test design. No market data or performance result was viewed before these corrections.

## 1. Remove unreachable immediate-entry-stop rule

The frozen specification stated that an entry candle could open below the newly computed initial stop.

That state is unreachable because:

- `entry_fill = open * (1 + buy_slippage)`
- `initial_stop = entry_fill - 2.5 * entry_atr`
- `entry_atr > 0`

Therefore `initial_stop` is always strictly below `entry_fill`, while `entry_fill` is above the raw open. The raw open cannot be less than or equal to the new initial stop.

Corrections:

- remove `immediate_entry_stop` from exit reasons,
- remove `immediate_entry_stop_flag` from the ledger,
- the entry candle is handled by the normal initial-stop rule after the entry fills.

## 2. Correct next-open trend-exit ordering

A trend-exit signal is created at candle `t` close and must execute at candle `t+1` open.

Correct ordering at `t+1` open:

1. If `open[t+1] <= active_stop`, classify the fill as a gap stop and use adverse sell slippage from the open.
2. Otherwise fill the pending trend exit at the same open with adverse sell slippage.
3. Do not inspect the later intrabar low before executing an already pending next-open trend exit.

The earlier reference engine incorrectly checked the full low of `t+1` before the pending trend exit, which could reclassify a required open exit as an intrabar stop.

## Version impact

- Strategy ID remains `regime-trend-v1` because these are logical corrections made before market evaluation.
- Reference implementation version becomes `typescript-reference-v1.0.1`.
- All later implementations and parity reports must apply this errata together with `spec.md`.
