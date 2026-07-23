# RSI Divergence Reversal — Frozen Baseline Research Plan v1

Status: baseline completed; current preset failed development and validation performance checks

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

## Frozen baseline rules

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
- TradingView preset order quantity: one instrument unit, inherited from the existing generated Strategy declaration
- normalized reference research: one independent return unit per trade, without compounding
- pyramiding: disabled
- opposite accepted signal reverses the position at that bar's close
- ATR14 frozen at entry
- initial stop: 2 ATR
- target: 2:1 reward/risk, equal to 4 ATR from entry
- stop and target become eligible from the first bar after entry

The TradingView dollar result and the reference engine's normalized return total are therefore not expected to have the same numerical scale. Trade timestamps, directions, stop/target levels and exit reasons are the parity targets.

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

## Baseline conclusion

The current preset failed in both development and validation. All three symbols were negative, profit factor was below one in every profile, and realistic costs worsened the result. This result is the frozen baseline for the separately specified improvement study; it must not be overwritten or presented as a profitable strategy.

## Correctness gates retained

- generated Pine freezes ATR at entry
- indicator and strategy use the same confirmed regular-divergence events
- no future-data lookahead and no 2025+ data
- aggregation uses only complete contiguous groups of three official 5-minute candles
- synthetic tests cover aggregation, divergence confirmation, next-bar risk activation, ambiguous intrabar ordering and cost arithmetic

No improved rule may replace the preset until it is selected from development data and independently passes the frozen validation gates.
