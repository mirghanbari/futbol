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

**Phase 1 (vertical slice, Premier League only) is scaffolded.** Standings, Matches,
Match detail, Teams and Team detail pages work off ingested football-data.org data;
the other 8 competitions, the ESPN live layer, FotMob advanced stats, and the Champions
League engineering are not built yet (Phases 2–7).

## Development

```sh
npm install
FOOTBALL_DATA_API_KEY=... npm run ingest   # populates src/data/leagues/PL/*.json
npm run dev
```

`npm run build` type-checks and builds to `dist/` (with a `404.html` fallback for
GitHub Pages' static hosting, since the app uses client-side routing). CI in
`.github/workflows/deploy.yml` runs ingest → build → deploy on every push to `main`,
using a `FOOTBALL_DATA_API_KEY` repository secret.
