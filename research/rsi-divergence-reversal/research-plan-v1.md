# RSI Divergence Reversal — Frozen Research Plan v1

Status: frozen before performance results

## Scope

This study measures the existing PineForge `RSI Divergence Reversal` preset without changing its signal thresholds after viewing results.

Markets:

- Binance Spot BTCUSDT
- Binance Spot ETHUSDT
- Binance Spot BNBUSDT

Chart timeframe: 15 minutes UTC

Research window:

- development: 2019-01-01 through 2022-12-31
- validation: 2023-01-01 through 2024-12-31
- final holdout: 2025-01-01 onward, closed

## Frozen strategy rules

- long and short
- confirmed candles only
- RSI length 14
- regular bullish/bearish RSI divergence
- pivot left 5, pivot right 5
- previous confirmed pivot range 5 to 60 bars
- long requires RSI >= 40 at the divergence confirmation bar
- short requires RSI <= 60 at the divergence confirmation bar
- cooldown: more than 5 bars since the previous accepted long or short signal
- entry: confirmation-bar close
- position sizing: 100% of strategy equity
- pyramiding: disabled
- opposite accepted signal reverses the position at that bar's close
- ATR14 frozen at entry
- initial stop: 2 ATR
- target: 2:1 reward/risk, equal to 4 ATR from entry
- stop and target become eligible from the first bar after entry

## Execution profiles

1. `tradingview_default`
   - 0.10% commission per side
   - no added slippage
   - TradingView historical intrabar path assumption

2. `conservative_intrabar`
   - 0.10% commission per side
   - no added slippage
   - stop first when stop and target are both touched in one bar

3. `realistic_costs`
   - 0.10% commission per side
   - 0.05% adverse slippage per side
   - TradingView historical intrabar path assumption

4. `stress`
   - 0.20% commission per side
   - 0.10% adverse slippage per side
   - stop first on ambiguous bars

## Report requirements

For each partition, profile and symbol:

- closed trades
- winning and losing trades
- win rate
- total normalized net return
- average normalized net return
- profit factor
- maximum normalized drawdown
- ambiguous intrabar trade count
- long/short trade counts
- exit-reason counts

A combined trade ledger must be written for each execution profile.

## Correctness gates before interpretation

- generated Pine strategy uses 100% equity sizing
- generated Pine freezes ATR at entry
- indicator and strategy use the same confirmed regular-divergence events
- no lookahead or 2025+ data
- aggregation uses only complete contiguous groups of three official 5-minute candles
- synthetic tests cover aggregation, divergence confirmation, next-bar risk activation, ambiguous intrabar ordering and cost arithmetic

No claim of profitability is allowed until the runner and all tests complete successfully.
