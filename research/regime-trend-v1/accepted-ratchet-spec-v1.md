# Regime Trend v1 — Accepted 5-Minute Ratchet Specification

Status: **Frozen for implementation and parity work**

Strategy ID: `regime-trend-v1-ratchet`

Accepted overlay: `touch-2.00-lock-0.00`

## 1. Decision

The +2 ATR target is accepted as a risk-state trigger, not as a take-profit.

The corrected comparison showed:

- materially higher validation/research net PnL,
- higher profit factor in development and validation/research,
- lower maximum drawdown in both partitions,
- positive development and validation/research changes under doubled costs,
- preservation of 78/87 development winners and 33/36 validation winners at 90% or more of baseline net PnL,
- no `DATA_MISMATCH` cases.

Normal-cost development net change was effectively flat at `-0.0011977778001401873`. This is recorded rather than hidden. The implementation decision accepts the overlay because the combined risk-adjusted evidence is favorable and the loss is negligible relative to the drawdown, profit-factor, validation and doubled-cost improvements.

The 2025+ final holdout remains closed.

## 2. Base strategy

All 4-hour Regime Trend v1 rules remain unchanged:

- BTCUSDT, ETHUSDT and BNBUSDT Binance Spot,
- 4-hour completed-bar EMA50/EMA200 regime,
- 20-bar Donchian breakout,
- Wilder ATR14 and normalized ATR floor,
- next-4-hour-open entry,
- 2.5 ATR initial stop,
- highest completed close minus 3 ATR trailing stop,
- next-4-hour-open trend exit,
- long only,
- 0.10% commission and 0.05% adverse slippage per side.

## 3. Ratchet activation

For each open trade, freeze:

- `entry_fill`,
- `entry_atr`.

Activation price:

`activation_price = entry_fill + 2.00 * entry_atr`

Activation is detected from ordered 5-minute candles. A candle activates the ratchet when either:

- `open >= activation_price`, or
- `high >= activation_price`.

The ratchet is not active inside the activation candle. It becomes active from the next expected 5-minute timestamp.

## 4. Net break-even floor

Once active, solve a raw sell-stop reference that targets net zero PnL after:

- the entry commission already paid,
- exit commission,
- adverse exit slippage.

The active stop at each 5-minute timestamp is:

`max(original_4h_stop_active_at_timestamp, net_break_even_raw_floor)`

The floor never lowers the original stop.

## 5. Execution ordering

At each expected 5-minute timestamp:

1. Apply any original 4-hour stop update that is causally active.
2. Activate the ratchet if its activation timestamp has arrived.
3. Calculate the combined stop.
4. If `open <= combined_stop`, exit from the actual open with adverse sell slippage.
5. Otherwise, if `low <= combined_stop`, exit from the combined stop with adverse sell slippage.
6. Otherwise continue.

If both the original stop and ratchet floor are crossed by the same gap open, the exit is not attributed as a causal ratchet exit unless the original stop alone would not have exited at that timestamp.

## 6. Missing 5-minute data

No candle may be synthesized, interpolated or copied forward.

If an expected 5-minute candle is missing before the trade resolves:

- classification is `DATA_GAP`,
- the original 4-hour baseline trade is retained as a neutral fallback,
- the trade remains explicitly unresolved for 5-minute parity reporting.

The known missing timestamps were checked against checksum-verified Binance monthly and daily Spot archives and were absent from both.

## 7. Implementation boundary

This specification authorizes:

- accepted reference-overlay integration,
- synthetic tests,
- deterministic 5-minute replay,
- Pine implementation and trade-parity work after reference tests pass.

It does not authorize opening the 2025+ final holdout before implementation and parity are frozen.
