# Regime Trend v1 — Frozen Forensic Diagnostics Plan

Status: **Frozen before forensic results are viewed**

Purpose: diagnose why validation long trades lose and determine whether those situations were better treated as short opportunities, no-trade conditions, or exit-management failures.

This is a diagnostic stage. It does not alter the frozen baseline strategy and does not open the final holdout.

## 1. Data boundary

Only validation data from 2023-01-01 through 2024-12-31 UTC may be read.

The final holdout beginning 2025-01-01 remains closed.

## 2. Population

The primary population is every closed baseline validation trade with `net_pnl < 0`.

Winning trades remain in the report only as a comparison group for MFE, MAE and realized capture.

## 3. Original-trade path diagnostics

For each closed trade, measure from the actual entry fill through the exit candle:

- maximum favorable excursion in price,
- maximum adverse excursion in price,
- MFE normalized by frozen entry ATR,
- MAE normalized by frozen entry ATR,
- realized net return,
- realized profit captured as a share of MFE when MFE is positive.

Interpretation is descriptive:

- low MFE and high MAE suggests weak entry quality,
- high MFE and poor realized return suggests exit or giveback problems,
- high MFE followed by a losing close is flagged as `gave_back_favorable_excursion`.

The giveback flag is true when MFE is at least 1.0 entry ATR and realized net PnL is negative.

## 4. Post-loss direction test

A losing long is not automatically inverted on its exit candle.

The counterfactual decision point is the next available contiguous candle open after the long exit.

Fixed horizons:

- 3 bars = 12 hours,
- 6 bars = 1 day,
- 12 bars = 2 days,
- 24 bars = 4 days,
- 42 bars = 1 week.

For each horizon, calculate both counterfactual directions from the same next-bar open:

### Counterfactual long

- buy fill: `entry_open * (1 + 0.0005)`,
- sell fill at horizon open: `horizon_open * (1 - 0.0005)`,
- commission: 0.001 per side.

### Counterfactual short

- sell fill: `entry_open * (1 - 0.0005)`,
- buy-to-cover fill at horizon open: `horizon_open * (1 + 0.0005)`,
- commission: 0.001 per side.

Funding, borrow fees and liquidation are not modeled. Therefore a positive short result is evidence of directional follow-through, not proof of live short tradability.

## 5. Three-way classification

For each horizon:

- `SHORT_REVERSAL`: short net return is positive and long net return is not positive,
- `LONG_RECOVERY`: long net return is positive and short net return is not positive,
- `NO_TRADE`: neither direction is positive after costs.

Both directions cannot be classified positive from the same entry and exit opens after symmetric costs. Any such result is treated as an implementation error.

A trade has no classification for a horizon when the required future candle is unavailable or crosses a dataset gap.

## 6. Post-exit excursion diagnostics

Between the counterfactual entry open and each horizon open, measure:

- maximum downward excursion normalized by original entry ATR,
- maximum upward excursion normalized by original entry ATR.

This distinguishes clean reversal from two-sided volatility even when the fixed-horizon classification is the same.

## 7. Required aggregations

Report results by:

- all losing validation trades,
- symbol,
- exit reason,
- calendar quarter,
- each fixed horizon.

For each group and horizon, report:

- eligible observations,
- short-reversal count and rate,
- long-recovery count and rate,
- no-trade count and rate,
- average counterfactual short net return,
- average counterfactual long net return,
- median normalized downward excursion,
- median normalized upward excursion.

Also report:

- losing trades with at least 1 ATR MFE before loss,
- losing trades with less than 0.5 ATR MFE,
- average realized capture ratio for winners,
- average realized capture ratio for losers where defined.

## 8. Decision discipline

This diagnostic report does not authorize a short strategy or a new filter by itself.

A candidate short or no-trade rule may be proposed only after the report identifies a repeatable condition that is present across more than one quarter and is not carried by a single symbol.

No parameter optimization, final-holdout access or baseline modification is allowed during this stage.
