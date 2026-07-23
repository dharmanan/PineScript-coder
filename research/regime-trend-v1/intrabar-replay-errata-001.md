# Regime Trend v1 — Intrabar Replay Errata 001

Status: **Accepted before corrected replay results are viewed**

## Invalidated report

The first `intrabar-replay-report.json` produced by the original 5-minute replay implementation is invalid and must not be used for research conclusions.

The invalid output was identifiable because every target reported zero `STOP_FIRST` trades despite the baseline ledger containing initial-stop and trailing-stop exits.

## Root cause

The baseline 4-hour engine records a stop exit timestamp as the opening timestamp of the 4-hour candle whose open or low triggers the stop.

The original replay iterated only while:

`five_minute_timestamp < baseline_exit_timestamp`

This excluded the entire 4-hour stop-exit candle, including the five-minute candle in which the stop actually occurred.

The original replay also excluded a trailing-stop update whose activation timestamp equaled the baseline stop-exit candle open. Such an update is active for that candle and must be included.

## Corrected replay horizon

### Baseline trend exit

A baseline `trend_exit` executes at the recorded 4-hour open. Replay remains strictly before the baseline exit timestamp:

`[entry_timestamp, baseline_exit_timestamp)`

The baseline trend exit has precedence at its recorded open.

### Baseline initial or trailing stop exit

A baseline `initial_stop` or `trailing_stop` timestamp identifies the opening of the 4-hour candle containing the stop event. Replay must include the full candle:

`[entry_timestamp, baseline_exit_timestamp + 4 hours)`

Within that final 4-hour candle, five-minute candles determine whether the frozen target or active stop occurs first.

## Stop-update activation

A stop update calculated at 4-hour timestamp `T` becomes active at `T + 4 hours`.

An update with activation timestamp equal to the baseline stop-exit candle open must be included.

## Consistency failure

If a baseline stop-exit candle has complete five-minute coverage but replay finds neither the target nor active stop during that candle, classify the trade as `DATA_MISMATCH` rather than silently retaining `BASELINE_EXIT`.

A missing five-minute candle before resolution remains `DATA_GAP`.

## Research consequence

All net-PnL, profit-factor and event-count results from the invalid first replay are discarded. Only the corrected report may be interpreted.

The final holdout remains closed.
