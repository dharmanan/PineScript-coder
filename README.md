# PineScript Coder / PineForge Studio

A deterministic Pine Script v6 strategy and indicator builder. It is not a small snippet generator: users choose trading style, direction, entry event, higher-timeframe bias, trend filters, momentum, volume, divergence, exits, risk rules, alerts and visuals. The app explains the exact behavior before generating editable Pine code.

## What changed in v0.2

- Separate generation paths for `long_short`, `long_only` and `spot_buy_exit`
- Spot mode produces real BUY and EXIT events and never emits short logic
- Spot state prevents EXIT labels before a BUY and duplicate BUY labels while active
- Closed higher-timeframe bias mode uses the last confirmed HTF candle
- Confirmed-candle input now actually controls signal confirmation
- Event-based entry triggers: EMA cross, EMA reclaim, VWAP reclaim, Supertrend flip and breakout
- Preset selection is visibly highlighted
- Common timeframes, lengths, thresholds, multipliers and risk settings are dropdown choices
- Mode-specific controls hide irrelevant values
- Dashboard content changes for spot, long-only and long/short modes
- Generated explanation matches the selected logic

## Run in GitHub Codespaces

Place the project files in the root of your `PineScript-coder` Codespace, then run:

```bash
npm install
npm run dev
```

Open the forwarded port shown in the **Ports** panel.

## Optional AI planner

The guided builder works without AI. The optional planner uses the user's own provider key and should only convert plain language into the same visible deterministic configuration. Review the form before generating Pine code.

Copy `.env.example` to `.env.local` and add one provider key:

```env
AI_PROVIDER=gemini
GEMINI_API_KEY=your_key
```

or:

```env
AI_PROVIDER=openai
OPENAI_API_KEY=your_key
```

Never commit `.env.local`.

## Important

Generated scripts are rule implementations, not profitability guarantees. Compile, inspect and backtest every result in TradingView before real use.

## License

MIT
