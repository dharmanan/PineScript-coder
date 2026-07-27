# Contributing to Kohen Pine Studio

Thanks for helping improve Kohen Pine Studio. The project values small, reviewable changes that make generated Pine indicators easier to inspect, test and use responsibly.

## Before opening an issue

- Use the current version of the Studio and reproduce the behavior with a saved configuration.
- Search existing issues and Discussions first.
- Do not include provider keys, account details, private trading data or other sensitive information.
- Use **Discussions** for questions and broad preset ideas. Use an **Issue** for a reproducible defect or a clearly scoped enhancement.

## Before opening a pull request

1. Discuss substantial changes in an issue first.
2. Keep one pull request focused on one concern.
3. Preserve deterministic code generation. Do not add hidden signal decisions or profitability claims.
4. Add or update tests whenever compiler behavior, a preset, an explanation or a language string changes.
5. Run the test suite and production build before requesting review.
6. Explain the user-visible behavior and any TradingView validation you performed.

## Local workflow

Use a current Node.js release compatible with the repository, install dependencies, then run:

```bash
npm test
npm run build
```

For local interface work, start the development server with `npm run dev`. The protected macOS environment used by maintainers has safe Node wrappers; use those wrappers when they are available.

## Pine Script changes

- Generate only Pine Script v6 code.
- Keep chart-timeframe enforcement, confirmed-candle behavior and visual risk semantics truthful.
- Do not present backtests, presets or dashboards as profit guarantees.
- When a preset changes, state the affected symbols, timeframe, date range and settings used for any validation.

## Pull request checklist

- [ ] The change has one clear purpose.
- [ ] Tests cover changed behavior or explain why no test is needed.
- [ ] `npm test` and `npm run build` pass locally.
- [ ] User-facing text is clear in both English and Turkish where applicable.
- [ ] No secrets, `.env` files, generated research output or local archives are included.
- [ ] The README or relevant documentation is updated when public behavior changes.
