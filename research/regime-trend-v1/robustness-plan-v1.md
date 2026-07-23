# Regime Trend v1 — Frozen Robustness Plan

Status: **Frozen before robustness results are viewed**

This plan evaluates the already frozen `regime-trend-v1` baseline. It is not an optimization plan. No result from these checks may be used to replace the baseline parameters or select a better-looking neighbor.

## 1. Data boundary

Only these partitions may be read:

- Development: 2019-01-01 through 2022-12-31 UTC
- Validation: 2023-01-01 through 2024-12-31 UTC

The final holdout beginning 2025-01-01 remains closed.

## 2. Symbol-distribution gate

Report BTCUSDT, ETHUSDT and BNBUSDT separately.

For validation:

- total net PnL must remain positive,
- no single symbol may contribute more than 60% of the sum of positive symbol profits,
- symbols with negative net PnL remain visible and are not excluded.

This gate prevents one exceptional symbol from hiding weak cross-asset behavior.

## 3. Chronological-block gate

Validation is divided into eight fixed calendar quarters:

- 2023-Q1 through 2024-Q4.

Every quarter is counted, including quarters with zero trades.

Pass condition:

- at least 5 of 8 quarters must have positive net expectancy.

Annual 2023 and 2024 results are also reported but are descriptive rather than a separate pass gate.

## 4. Doubled-cost stress

The frozen baseline uses:

- commission: 0.10% per side,
- slippage: 0.05% per side.

The stress run uses:

- commission: 0.20% per side,
- slippage: 0.10% per side.

All fills, fees, stops and trade outcomes are recalculated from the strategy engine. Existing trade ledgers are not merely repriced.

Pass condition on validation:

- total net PnL remains non-negative,
- profit factor remains at least 1.00.

## 5. One-factor parameter-neighborhood test

The frozen baseline remains unchanged. Each neighbor changes exactly one parameter while all others stay at baseline.

Neighbors:

- EMA fast: 45, 55
- EMA slow: 180, 220
- Donchian lookback: 18, 22
- normalized ATR floor: 0.0045, 0.0055
- initial stop ATR multiple: 2.25, 2.75
- trailing stop ATR multiple: 2.70, 3.30

There are 12 neighbors. No combinatorial grid is allowed.

Pass condition on validation:

- at least 7 of 12 neighbors have positive total net PnL,
- median neighbor profit factor is at least 1.00,
- no more than 3 neighbors have profit factor below 0.90.

A neighbor with no closed trades fails the positive-net count and is reported with an undefined profit factor.

## 6. Overall robustness classification

The robustness stage passes only if all three gates pass:

1. symbol distribution,
2. chronological blocks,
3. doubled costs,
4. parameter neighborhood.

All four are required despite the numbering above. A failure does not permit retuning against validation. The baseline is either advanced unchanged to independent Pine parity work or stopped as `regime-trend-v1`.

The final holdout remains unopened during this stage.
