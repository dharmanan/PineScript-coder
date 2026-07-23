# Regime Trend v1 — Frozen Exit Timing Diagnostics

Status: **Frozen before timing results are viewed**

Purpose: determine whether the existing 4-hour entry signal produces favorable movement quickly enough to justify a lower-timeframe exit overlay, tactical profit protection, or a faster independent strategy hypothesis.

This stage is diagnostic. It does not change the baseline strategy and does not open the final holdout.

## 1. Data boundary

Analyze the existing partitions separately:

- Development: 2019-01-01 through 2022-12-31 UTC
- Validation: 2023-01-01 through 2024-12-31 UTC

The final holdout beginning 2025-01-01 remains closed.

## 2. Trade populations

Report:

- all closed trades,
- winning trades,
- losing trades,
- each symbol,
- each exit reason.

Development and validation may not be pooled for conclusions.

## 3. Favorable-excursion thresholds

Use the frozen entry ATR for normalization.

Fixed thresholds:

- 0.50 ATR,
- 1.00 ATR,
- 1.50 ATR,
- 2.00 ATR.

For each threshold report two distinct first-passage times:

### Intrabar high touch

The first 4-hour candle whose high reaches `entry_fill + threshold * entry_atr` while the position is still open.

This identifies movement that may be capturable by a lower-timeframe or intrabar exit system. It does not prove that an executable lower-timeframe rule exists.

### Completed-bar close confirmation

The first 4-hour candle whose close reaches `entry_fill + threshold * entry_atr` while the position is still open.

This is slower but does not depend on unknown intrabar ordering.

## 4. Timing windows

For each threshold, count first passage within:

- entry candle: 0 bars,
- 1 bar,
- 2 bars,
- 3 bars,
- 6 bars,
- 12 bars,
- 24 bars.

One 4-hour bar equals four hours. Three bars equal twelve hours, six bars equal one day, and 24 bars equal four days.

## 5. Intrabar ambiguity policy

The actual exit candle is excluded from favorable-excursion timing because its high may occur after an open or intrabar exit.

When entry and exit occur on the same candle, no favorable threshold is treated as proven.

A high touch on an earlier active-position candle is retained as an intrabar upper-bound observation. A close confirmation is retained as completed-bar evidence.

## 6. Giveback measurements

For each trade report:

- conservative peak high MFE in ATR,
- conservative peak close MFE in ATR,
- bars from entry to peak high,
- bars from entry to peak close,
- realized net result in ATR,
- peak-high-to-realized giveback in ATR,
- peak-close-to-realized giveback in ATR.

## 7. Interpretation discipline

This report does not authorize a scalp strategy.

Evidence for a lower-timeframe exit overlay requires the fast favorable-excursion pattern to appear in both development and validation and across more than one symbol.

- Fast high touches with much slower close confirmations support investigating a 1-hour or 30-minute exit overlay.
- Slow high touches and slow close confirmations support trend-management research rather than scalp research.
- Few favorable touches among losers support entry filtering or no-trade logic rather than faster exits.

No EMA length, timeframe, target, stop, or overlay rule may be selected from this report. Any candidate overlay must be frozen in a separate specification before it is backtested.
