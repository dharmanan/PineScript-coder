# Indicator Completion Checklist

## Completed

- [x] Integrated RSI divergence pane for Fast EMA Scalper.
- [x] Integrated RSI divergence pane for Balanced Intraday.
- [x] Integrated RSI divergence pane for VWAP Session Trader.
- [x] Integrated RSI divergence pane for RSI Divergence Reversal.
- [x] Integrated RSI divergence pane for 4H Swing Trend.
- [x] Regular divergence labels and RSI Divergence Reversal entries share the same confirmed event.
- [x] RSI Divergence Reversal reuses the main RSI calculation.
- [x] RSI Divergence Reversal no longer resets active risk levels on same-direction signals.
- [x] Apply safe indicator risk lifecycle handling to every non-spot Indicator output with visual risk.
- [x] Show LONG/SHORT labels only when a new visual trade is actually accepted.
- [x] Fire LONG/SHORT alerts only when a new visual trade is actually accepted.
- [x] Report accepted entries, rather than ignored repeat signals, in the dashboard.

## In progress

- [ ] Align Strategy output with the same confirmed regular-divergence engine.

## Remaining

- [ ] Keep panel and entry divergence aligned whenever Confirmed RSI divergence is enabled.
- [ ] Add the integrated RSI pane to the remaining supported presets with preset-specific hidden-divergence defaults.
- [ ] Add focused generator tests for every preset and output mode affected by the RSI pane.
- [ ] Remove the temporary `/rsi-companion` page and standalone companion generator after integrated output coverage is complete.
- [ ] Review RSI Divergence Reversal confirmation quality only after correctness work is complete; do not tune thresholds from isolated screenshots.
