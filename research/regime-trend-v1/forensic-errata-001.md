# Regime Trend v1 Forensics — Errata 001

Status: **Accepted before the corrected forensic report is viewed**

This errata corrects an intrabar-order ambiguity discovered after the first forensic report.

## Problem

The original forensic path calculation included the full high and low of the actual exit candle when calculating MFE and MAE.

The baseline dataset contains 4-hour OHLC candles. It does not reveal whether the candle high occurred before or after an intrabar stop exit. For a trend exit or gap stop executed at the candle open, all later high and low values on that candle are definitely outside the position lifetime.

Therefore the original MFE count was an optimistic upper bound and could incorrectly label a losing trade as having first achieved a favorable excursion.

The same issue existed in post-exit counterfactual excursion measurements: the full high and low of the fixed-horizon exit candle were included even though the counterfactual position exits at that candle's open.

## Correction

### Original-trade MFE

Two values are retained:

- `mfe_atr_upper_bound`: uses the full OHLC envelope through the exit candle and is explicitly labeled optimistic.
- `mfe_atr`: the conservative value used for classification.

The conservative MFE includes complete candles from the entry candle through the candle immediately before the exit candle.

- When entry and exit occur on the same candle, conservative MFE is zero because no favorable intrabar path is guaranteed.
- The exit candle high is never used in conservative MFE.

The `gave_back_favorable_excursion` flag and all MFE bins use conservative MFE.

### Original-trade MAE

Conservative MAE uses completed pre-exit candle lows plus the actual raw exit reference when available. It does not use post-exit portions of the exit candle.

### Counterfactual excursions

For a counterfactual entered at one candle open and exited at a later candle open, excursion calculations include the entry candle through the candle immediately before the horizon exit candle. The horizon exit candle's later high and low are excluded.

Fixed-horizon long and short returns were already calculated from open to open and are unchanged.

## Opportunity magnitude extension

The original positive-versus-non-positive classification remains descriptive, but it is insufficient to identify economically meaningful opportunities.

The corrected report additionally classifies counterfactual outcomes at fixed net thresholds normalized by the original trade's frozen entry ATR:

- 0.25 ATR,
- 0.50 ATR,
- 1.00 ATR.

At each threshold:

- `SHORT_REVERSAL`: short net result reaches the threshold and long does not,
- `LONG_RECOVERY`: long net result reaches the threshold and short does not,
- `NO_TRADE`: neither direction reaches the threshold.

For qualifying opportunities, the report includes adverse excursion and net-reward-to-adverse-excursion ratios.

## Interpretation

The first forensic report remains preserved as an exploratory result. It must not be used to conclude that 53 losing trades achieved a realizable 1 ATR MFE.

Only the corrected conservative report may be used for subsequent exit-overlay, lower-timeframe, short, or no-trade hypotheses.
