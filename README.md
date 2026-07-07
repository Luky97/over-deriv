# Deriv Digit Movement Analyzer

A public, analysis-only Next.js dashboard for monitoring last-digit movement across a rolling sample of 1,000 Deriv ticks.

The analyzer:

- connects to Deriv's public WebSocket endpoint;
- keeps a rolling 1,000-tick window for the selected symbol;
- ranks digits 0, 1, 2, 3, 6, 7, 8, and 9 with correct tie handling;
- compares individual and grouped movement at fixed five-minute intervals;
- never requests proposals, buys, sells, authorization, or contract execution.

## Local development

Use Node.js 22, then run:

```bash
npm install
npm run dev
```

The GitHub Pages base path is `/over-deriv`. For a production check:

```bash
npm run build
```

The static export is written to `out/`.

## Deployment

Pushes to `main` run `.github/workflows/main.yml`, build the static export, and deploy it to GitHub Pages:

https://luky97.github.io/over-deriv/
