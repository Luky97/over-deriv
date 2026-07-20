# Deriv Adaptive ML Research Lab

A browser-only, research-only laboratory for studying the last digit of Deriv's standard Volatility indices. It uses public market data, chronological online learning, shadow evaluation, and simulated virtual contracts. It cannot authorize an account, request a proposal, buy, sell, or execute a real trade.

Live site: <https://luky97.github.io/over-deriv/>

## Safety boundary

- Public WebSocket calls are limited to `active_symbols`, `ticks_history`, `ticks`, `forget`, and `ping`.
- There are no token fields, account controls, proposal calls, payout assumptions, or trading endpoints.
- Every prediction is frozen before its result tick. Models and confidence evidence update only after settlement.
- Historical ticks warm model parameters but never count as forward validation evidence.
- Connection gaps, reloads, and session changes invalidate any incomplete virtual round rather than guessing its result.
- “Active virtual” means stricter simulated execution; it still never places a real trade.

## Markets and timing

The app validates `active_symbols` and only admits these non-1-second synthetic indices:

- `R_10` — Volatility 10 Index
- `R_25` — Volatility 25 Index
- `R_50` — Volatility 50 Index
- `R_75` — Volatility 75 Index
- `R_100` — Volatility 100 Index

Each enabled market owns an isolated rolling window of 1,000 unique ticks, feature pipeline, model ensemble, strategy laboratory, metrics, and persisted state. The last digit is extracted from the quote at the market's declared pip precision, including trailing zeroes.

The fixed virtual round scheduler is:

1. A selected digit or qualified automatic signal triggers a round.
2. The immediate next live tick is skipped.
3. Features and a prediction are frozen on that skipped tick.
4. The following tick settles the virtual contract.
5. Steps 2–4 repeat until 4 wins, 5 contracts, or 3 consecutive losses.

The default minimum is 50 exact strategy-target forward samples and 80% system confidence before a signal may qualify for active virtual mode. These gates are intentionally difficult to pass; the UI explains every no-trade decision.

## Research system

Features cover rolling windows of 20, 50, 100, 250, 500, and 1,000 ticks. They include digit counts and tie-aware ranks, slopes and acceleration, parity and over/under transitions, streaks, first- and second-order Markov context, n-grams, repeats, autocorrelation, quote movement, entropy, chi-square statistics, Jensen-Shannon divergence, stability, drift, and UTC server-epoch time features.

The online ensemble combines logistic SGD, first- and second-order Markov models, frequency momentum, n-grams, regime-conditioned estimates, Naive Bayes, nearest-context matching, and an experimental time model. Out-of-sample scores determine bounded ensemble weights. A separate online no-trade model learns whether to reject a candidate. Confidence combines Wilson and Bayesian estimates, recent and long-run performance, calibration, agreement, regime stability, context match, sample-size caps, and loss/drift penalties.

Strategy Lab runs bounded UCB1 champion/challenger experiments. Formula Lab evaluates fixed, safe operator trees without `eval` or generated code and rejects candidates on chronological validation. Drift monitoring combines Page-Hinkley, CUSUM, adaptive error windows, distribution divergence, and regime change detection.

## Data and privacy

Dexie/IndexedDB stores settings, isolated market engines, frozen contract evidence, rounds, and logs locally in the browser. JSON export includes restorable research state; CSV export includes virtual contract records. Imports are schema-validated. Reset controls can clear one market, preserve its models, clear round history, or reset all local learning.

No account identity or authentication token is requested or stored.

## Local development

Use Node.js 22 and npm:

```bash
npm ci
npm run dev
```

Quality checks:

```bash
npm run typecheck
npm test
npm run build
```

The production build uses Next.js static export with the `/over-deriv` base path and writes the site to `out/`. Webpack is selected explicitly so the module worker is emitted as a deployable JavaScript chunk.

## Deployment

Pushes to `main` run [the GitHub Pages workflow](.github/workflows/main.yml), which installs from the lockfile, type-checks, tests, builds, uploads `out/`, and deploys it to GitHub Pages.

## Interpretation and limitations

Synthetic-index last digits may be indistinguishable from random at useful horizons. A high displayed confidence is a conservative evidence score, not a guaranteed probability of profit. Multiple testing, regime changes, browser suspension, finite samples, and data interruptions can all weaken an apparent pattern. The app has no real contract pricing, payout, slippage, latency, or profitability model, so its virtual outcomes must not be interpreted as trading returns or financial advice.
