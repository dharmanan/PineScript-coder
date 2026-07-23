# PineForge Strategy Validation Protocol v1

Status: **Frozen for the first research pilot**

This protocol separates two questions that must never be mixed:

1. Was the strategy implemented exactly as specified?
2. Did that correctly implemented strategy show a robust positive historical edge after costs?

A positive backtest is invalid until implementation parity passes. A correct implementation is not considered useful unless it passes the performance gates below.

## 1. Research order

Every strategy version must follow this order:

1. Write and freeze a human-readable strategy specification.
2. Create synthetic candle scenarios with manually known outcomes.
3. Implement the Python reference engine.
4. Pass unit, lookahead and recursive-stability checks.
5. Evaluate development data without opening the final holdout.
6. Implement an independent Pine Script version from the same specification.
7. Compare Python and TradingView trades line by line.
8. Open the final holdout only after parity passes.
9. Run robustness and doubled-cost tests.
10. Classify the strategy as Rejected, Experimental, Paper Candidate or Validated.

No user-interface integration is allowed before step 8.

## 2. Versioning and change control

- Every rule set has an immutable version such as `regime-trend-v1`.
- Any change to an entry, exit, indicator, parameter, cost, data split or execution assumption creates a new version.
- Historical results from one version must never be presented as results for another version.
- Holdout results may not be used to tune the same strategy version.
- A failed version is retained with its failure report; it is not silently rewritten.

## 3. Data integrity

Every run must record:

- exchange and market type,
- symbol,
- candle interval,
- UTC start and end timestamps,
- row count,
- source file SHA-256,
- missing or duplicated candle count,
- timezone normalization rule,
- warm-up bar count,
- code commit SHA,
- strategy-spec version.

Candles must be sorted, unique and continuous for the expected interval. Missing data must fail the run unless the manifest explicitly documents an approved gap policy.

## 4. Frozen data partitions

The pilot uses chronological partitions; no random shuffle is allowed.

- Development: 2019-01-01 00:00 UTC through 2022-12-31 23:59 UTC
- Validation: 2023-01-01 00:00 UTC through 2024-12-31 23:59 UTC
- Final holdout: 2025-01-01 00:00 UTC through 2026-06-30 23:59 UTC

If a symbol does not have complete data for all partitions, it must be excluded or assigned a separately frozen later start before any results are viewed.

The final holdout remains closed until:

- synthetic tests pass,
- Python reference tests pass,
- lookahead checks pass,
- Pine/Python parity passes on development and validation data.

## 5. Execution and cost model

Unless a strategy specification explicitly overrides a field, the pilot uses:

- signal calculation: completed candle only,
- order fill: next candle open,
- commission: 0.10% per side,
- slippage: 0.05% per side,
- pyramiding: disabled,
- one position per symbol,
- no same-bar re-entry after an exit,
- no intrabar assumptions beyond recorded OHLC,
- ambiguous stop/exit ordering: conservative outcome wins,
- funding, borrow fees and liquidation: not applicable to the first long-only spot pilot.

Costs must be charged on both entry and exit. Gross and net results must both be reported.

## 6. Synthetic correctness gates

Before market backtesting, deterministic fixtures must cover at least:

- no entry before indicator warm-up,
- valid long entry,
- rejected entry outside the regime,
- rejected duplicate entry while already long,
- initial stop hit,
- trailing stop ratchet and hit,
- trend exit,
- simultaneous exit conditions,
- next-bar-open fill behavior,
- commission and slippage arithmetic,
- no future-bar access,
- stable output when additional earlier warm-up candles are prepended.

Each fixture must state the expected signal bar, fill bar, fill price, stop, exit reason and net PnL before implementation code is written.

## 7. Independent implementation parity

The Python reference and Pine Script implementations must be written independently from the same specification.

For identical OHLCV data, compare every trade by:

- symbol,
- direction,
- signal timestamp,
- entry timestamp,
- entry price,
- initial stop,
- exit timestamp,
- exit price,
- exit reason,
- gross PnL,
- fees,
- slippage,
- net PnL.

Parity gate:

- trade count match: 100%,
- signal and entry timestamps: exact match,
- exit reason: exact match,
- price tolerance: one market tick maximum,
- unexplained missing or extra trades: zero.

Performance metrics are ignored until this gate passes.

## 8. Lookahead and recursive-stability gates

The strategy must not use information unavailable at the decision timestamp.

Required checks:

- indicators use current and past completed bars only,
- rolling highs/lows exclude the current signal bar when specified,
- higher-timeframe values use completed higher-timeframe candles only,
- no centered windows or negative shifts,
- a truncated-data run produces the same historical signals as the full-data run up to the truncation point,
- prepending additional warm-up history does not materially change post-warm-up signals.

Any unexplained violation rejects the implementation result.

## 9. Pre-registered performance gates

These are PineForge product-quality gates, not promises of future returns.

A correctly implemented pilot becomes a **Paper Candidate** only if all core gates pass on combined validation plus final holdout data after costs:

- net expectancy per trade greater than zero,
- profit factor at least 1.15,
- at least 100 combined closed trades across all approved symbols,
- at least 60% of chronological evaluation blocks have positive net expectancy,
- no single symbol contributes more than 60% of total net profit,
- maximum portfolio drawdown no greater than 25%,
- doubled commission and slippage produce profit factor at least 1.00,
- nearby parameter values do not cause immediate collapse,
- buy-and-hold comparison and exposure time are reported, not hidden.

A strategy is rejected if:

- net expectancy is non-positive,
- profit factor is below 1.00,
- lookahead or parity fails,
- results depend on one symbol or one short interval,
- small parameter changes reverse the result,
- doubled costs destroy the edge.

Borderline results are classified Experimental and are not promoted as ready strategies.

## 10. Required artifacts

Every completed version must produce:

- `spec.md`,
- `dataset-manifest.json`,
- synthetic fixture files,
- Python unit-test report,
- Python trade ledger CSV,
- TradingView trade ledger CSV,
- `parity-report.json`,
- lookahead report,
- recursive-stability report,
- development metrics,
- validation metrics,
- final-holdout metrics,
- doubled-cost metrics,
- parameter-sensitivity report,
- final classification with explicit failure reasons.

## 11. Stop rule for this pilot

The first pilot stops without further parameter chasing if `regime-trend-v1` is correctly implemented but fails the pre-registered validation gates.

A different strategy family may be proposed later, but the failed version will not be repeatedly tuned against the final holdout. No profitability claim may be made from development results alone.
