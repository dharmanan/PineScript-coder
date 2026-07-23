# Regime Trend v1 — 5-Minute Replay Implementation Notes v1

Status: **Frozen before replay results are viewed**

These notes resolve implementation details not fully specified in `intrabar-replay-plan-v1.md`.

## Data-gap handling

Replay advances in exact five-minute timestamps from the baseline entry timestamp up to, but not including, the baseline exit timestamp.

If an expected five-minute candle is missing before target or stop order is resolved, the trade is classified `DATA_GAP`.

For aggregate lower-bound and upper-bound metrics, a `DATA_GAP` trade retains its original baseline trade result in both bounds. This is a neutral fallback, not evidence for the target candidate.

Any target candidate with one or more `DATA_GAP` trades is reported as incompletely resolved and cannot advance without separate review of those exact gaps.

## Same-five-minute ambiguity

When one five-minute candle reaches both the active stop and target, and neither level is crossed by the candle open:

- lower bound uses stop-first execution,
- upper bound uses target-first execution.

The replay stops at that candle. It does not continue along an invented path.

## Stop-update timing

A stop update emitted from a completed four-hour candle at timestamp `T` becomes active at `T + 4 hours`.

The baseline exit at its recorded four-hour open has precedence. Therefore replay examines five-minute candles strictly before the baseline exit timestamp.

## Group attribution

Symbol grouping uses the baseline symbol.

Calendar-quarter grouping uses the original baseline trade `exit_timestamp`, matching prior forensic and robustness attribution. Overlay exit timestamps do not move trades between research quarters.

## Gap-above-target execution

When a five-minute candle opens above the target, the candidate is conservatively filled at the target reference with adverse sell slippage, not at the more favorable opening price.

## Output bounds

For each target:

- resolved `TARGET_FIRST`, `STOP_FIRST`, and `BASELINE_EXIT` trades have the same trade result in both bounds,
- `AMBIGUOUS_SAME_5M` uses stop execution in the lower bound and target execution in the upper bound,
- `DATA_GAP` uses the baseline result in both bounds and remains explicitly counted.
