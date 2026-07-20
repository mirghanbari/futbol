# Futbol

A dashboard tracking Europe's top 8 leagues (Premier League, La Liga, Bundesliga, Serie
A, Ligue 1, Eredivisie, Primeira Liga, Championship) and the UEFA Champions League.

Modeled on [`dashboards/world-cup`](https://github.com/mirghanbari/dashboards) — same
React + TypeScript + Vite approach, ingest scripts pulling from free/public APIs,
deployed to GitHub Pages via GitHub Actions.

Data sources: [football-data.org](https://www.football-data.org/) (canonical
competitions/standings/fixtures/scorers), ESPN's public JSON API (live scores), FotMob's
public JSON API (advanced stats: xG, xA, duels, PPDA, field tilt).

See [`PLAN.md`](./PLAN.md) for the full architecture and phased build order.

## Status

**Phases 1–2 done.** All 9 competitions (Premier League, Championship, La Liga,
Bundesliga, Serie A, Ligue 1, Eredivisie, Primeira Liga, Champions League) ingest from
football-data.org into `src/data/leagues/{code}/`, each lazy-loaded on demand. Standings,
Matches, Match detail, Teams and Team detail all take a `:competitionId` route param and
a competition switcher in the nav. The ESPN live layer, FotMob advanced stats, Players,
and the Champions League Swiss-format/knockout engineering are not built yet (Phases
3–7) — see `PLAN.md`.

Note: in the close-season window, football-data.org has been observed to serve a
competition's *new*-season metadata paired with the *previous* season's standings table.
`scripts/ingest-football-data.mjs` detects this (0 finished matches but a table showing
games played) and drops the stale table rather than show it as current.

## Development

```sh
npm install
FOOTBALL_DATA_API_KEY=... npm run ingest   # populates src/data/leagues/{code}/*.json
npm run dev
```

`npm run build` type-checks and builds to `dist/` (with a `404.html` fallback for
GitHub Pages' static hosting, since the app uses client-side routing). CI in
`.github/workflows/deploy.yml` runs ingest → build → deploy on every push to `main`,
using a `FOOTBALL_DATA_API_KEY` repository secret.
