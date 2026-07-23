# Indicator Completion Checklist

## Completed

- [x] Public builder is indicator-only and does not expose Strategy Tester output.
- [x] Integrated RSI divergence pane for Balanced Intraday.
- [x] Integrated RSI divergence pane for Fast EMA Scalper.
- [x] Integrated RSI divergence pane for VWAP Session Trader.
- [x] Integrated RSI divergence pane for 4H Swing Trend.
- [x] Integrated RSI divergence pane for Spot Accumulation.
- [x] Integrated RSI divergence pane for Breakout Momentum.
- [x] Integrated RSI divergence pane for RSI Divergence Reversal.
- [x] Integrated RSI divergence pane for Selective Multi-Timeframe.
- [x] Integrated RSI divergence pane for Long-Term Trend Guard.
- [x] Keep Supertrend Volume without an RSI pane because its RSI and divergence filters are disabled.
- [x] Regular divergence labels and RSI Divergence Reversal entries share the same confirmed event.
- [x] RSI Divergence Reversal reuses the main RSI calculation.
- [x] RSI Divergence Reversal no longer resets active risk levels on same-direction signals.
- [x] Apply safe indicator risk lifecycle handling to every non-spot Indicator output with visual risk.
- [x] Show LONG/SHORT labels only when a new visual trade is actually accepted.
- [x] Fire LONG/SHORT alerts only when a new visual trade is actually accepted.
- [x] Report accepted entries, rather than ignored repeat signals, in the dashboard.
- [x] Remove the temporary `/rsi-companion` page, standalone companion generator and companion test.
- [x] Add focused generator tests for all nine RSI-pane presets and verify Supertrend Volume remains panel-free.

## Remaining

- [ ] Verify main-chart routing for LONG/SHORT/BUY/EXIT labels, overlays, risk levels and dashboard on all affected presets.
- [ ] Read RSI length and divergence pivot strength from each preset configuration instead of fixed panel defaults.
- [ ] Decouple RSI-pane eligibility from the editable script name.
- [ ] Define and test preset-specific hidden-divergence defaults.
- [ ] Keep panel and entry divergence aligned whenever Confirmed RSI divergence is enabled.
- [ ] Compile and visually verify all ten generated indicators in TradingView.
- [ ] Review RSI Divergence Reversal confirmation quality only after correctness work is complete; do not tune thresholds from isolated screenshots.
