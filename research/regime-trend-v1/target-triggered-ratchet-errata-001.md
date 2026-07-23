# Regime Trend v1 — Target-Triggered Ratchet Errata 001

Status: **Accepted before corrected ratchet results are viewed**

## Invalidated advancement decision

The first `target-triggered-ratchet-report.json` must not be used to advance or reject a candidate. Its directional output may motivate correction, but its net-PnL changes and doubled-cost robustness values are not clean causal comparisons.

The final holdout remains closed.

## 1. Mixed-resolution baseline

The first report compared:

- the original four-hour baseline trade ledger, against
- a five-minute replay of the candidate overlay.

Even when a ratchet floor was not binding, the five-minute replay could change stop execution because a five-minute candle may open through a stop inside a four-hour candle. That execution difference is independent of the ratchet rule.

Therefore the corrected comparison must use:

- a five-minute-resolved baseline with the original strategy stops and no ratchet, against
- the same five-minute replay with the candidate ratchet enabled.

Both sides must share identical data-gap, gap-fill, stop-update and baseline-exit semantics.

## 2. Doubled-cost baseline error

The first doubled-cost report applied doubled commission and slippage only to the overlay. It compared that overlay with a normal-cost baseline trade ledger.

The corrected doubled-cost test must:

1. rerun the reference strategy with doubled entry commission and entry slippage,
2. produce a doubled-cost baseline ledger and stop schedule,
3. resolve that baseline through five-minute data,
4. apply the ratchet using the same doubled costs,
5. compare doubled-cost ratchet against doubled-cost five-minute baseline.

Trade counts may differ under doubled costs and must not be forced to match normal-cost counts.

## 3. Causal exit attribution

The original `RATCHET_EXIT` label was assigned to any stop exit after activation, including exits where the original four-hour strategy stop remained the binding stop.

Corrected reporting must distinguish:

- `RATCHET_EXIT`: ratchet floor is binding and changes the exit reference or causes an earlier stop,
- `BASELINE_STOP_AFTER_ACTIVATION`: activation occurred, but the original strategy stop remains binding or would exit at the same gap open,
- `BASELINE_STOP`: no activation before the original stop,
- `ACTIVATED_BASELINE_EXIT`: activation occurred but no stop exited before the baseline trend exit,
- `NOT_ACTIVATED`, `DATA_GAP`, and `DATA_MISMATCH`.

## 4. Missing required quarter output

The frozen plan required results by original baseline exit quarter. The first runner emitted symbol groups but not quarter groups. The corrected report must include normal- and doubled-cost results by symbol and quarter.

## 5. Research consequence

The first report's apparent strongest candidate, `touch-2.00-lock-0.00`, remains only a provisional hypothesis. It is neither accepted nor rejected until the corrected report is produced.
