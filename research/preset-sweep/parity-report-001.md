# Preset Sweep — Parity Report 001

Status: **Passed**

Two independent implementations were compared on the same candles and the same rules:

- **Generated Pine**, compiled by `lib/` and executed by TradingView on a live chart
- **Sweep engine**, `research/preset-sweep/engine.mjs`, executed over Binance monthly archives

## Configuration under test

| Field | Value |
|---|---|
| Preset | `vwap_session_trader` |
| Symbol | ETHUSDT (Binance) |
| Chart timeframe | 4 hours |
| Signal mode | Score, minimum 60 |
| Risk/reward | 4.0 |
| Entry type | Market, next candle open |
| Stop confirmation | Wick touch |
| Commission + slippage | 0.01% per side |
| Counting window | trades entered 2023-12-31 through 2024-12-31 |

## Result

| Metric | TradingView panel | Sweep engine | Difference |
|---|---|---|---|
| Wins / losses | 12 / 33 | 12 / 33 | none |
| Trades | 45 | 45 | none |
| Win rate after costs | 26.7% | 26.7% | none |
| Net R | +14.88R | +15.02R | 0.14R (0.9%) |

Trade count, win count and win rate match exactly. The residual 0.14R is 0.003R per
trade and is attributed to indicator warm-up: TradingView seeds its EMA, RSI and ATR
from however much history the chart loaded, while the sweep seeds from 2019-01-01.
No rule difference is implied.

## Why the counting window starts 2023-12-31

The first comparison used 2024-01-01 and produced 12 / 32 against the panel's 12 / 33.
The panel's "count from" input had been entered as 02:00 in a UTC+3 chart timezone,
which resolves to 2023-12-31 23:00 UTC and admits one earlier losing trade. Re-running
the sweep from 2023-12-31 reproduced 12 / 33 exactly. The discrepancy was an input
timezone offset, not an engine disagreement.

## What this licenses

Per `research/validation-protocol-v1.md` section 7, performance results are not
interpretable until implementation parity passes. This report closes that gate for the
preset sweep, so the sweep's development and validation metrics may now be read as
measurements of the shipped indicator rather than of a separate reimplementation.

The 2025+ final holdout remains closed; no holdout data has been downloaded or opened.

## Reproduction

```
safe-npm run sweep:parity -- --preset=vwap_session_trader --timeframe=240 \
  --symbol=ETHUSDT --mode=score-60 --rr=4 --from=2023-12-31 --to=2025-01-01
```
