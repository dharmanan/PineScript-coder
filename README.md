# PineForge Studio

A deterministic, guided Pine Script v6 strategy and indicator builder.

PineForge is not a tiny Pine snippet generator. It starts from complete editable scripts, asks practical trading questions, explains the resulting behavior in plain language, and generates Pine Script v6 from a typed configuration.

## Included in this starter

- Guided strategy builder
- 10 editable full-script presets
- Long/short, long-only and spot buy/exit modes
- Indicator and Strategy Tester output
- Higher-timeframe bias with counter-trend blocking
- EMA, SMA/EMA long MA, VWAP and Supertrend filters
- RSI, MACD, ADX, volume and pivot-confirmed RSI divergence
- Candle-close confirmation and signal cooldown
- ATR, percentage and swing stops
- Risk/reward, percentage and opposite-signal exits
- Alerts, labels, bias background and dashboard
- Plain-language behavior summary before code generation
- Deterministic Pine Script v6 compiler
- Optional BYOK AI planning endpoint for Gemini or OpenAI

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Optional AI planner

The deterministic builder does not need AI. To enable the optional request interpreter:

```bash
cp .env.example .env.local
```

Then set one provider:

```env
AI_PROVIDER=gemini
GEMINI_API_KEY=your_key
GEMINI_MODEL=gemini-2.5-flash
```

or:

```env
AI_PROVIDER=openai
OPENAI_API_KEY=your_key
OPENAI_MODEL=gpt-4.1-mini
```

Keep keys in deployment environment variables. Never commit `.env.local`.

## Deploy your own fork

1. Fork the repository.
2. Import the fork into Vercel.
3. Add optional AI environment variables in Vercel Project Settings.
4. Deploy.

The guided builder remains fully operational without an API key.

## Architecture

- `lib/types.ts` — typed strategy specification
- `lib/presets.ts` — complete editable script presets
- `lib/explain.ts` — plain-language behavior explanation
- `lib/compiler.ts` — deterministic Pine Script v6 code generator
- `app/api/ai-plan` — optional AI plan endpoint
- `app/page.tsx` — guided UI

## Current boundary

The project generates broad, editable Pine v6 scripts, but it is not TradingView's compiler. Generated code must be pasted into TradingView and tested. PineForge does not promise profitability and should not be used as the sole basis for financial decisions.

## Next engineering priorities

- A formal expression tree for nested AND/OR groups
- Multiple entries and partial exits
- Break-even and trailing logic
- Sessions, daily limits and position sizing
- Import/export strategy JSON
- Pine static validation rules
- More visual modules: boxes, zones, lines and configurable tables
- Community module registry
- Automated fixtures for every preset and feature combination
