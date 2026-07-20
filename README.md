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

**Phases 1–4 done.** All 9 competitions (Premier League, Championship, La Liga,
Bundesliga, Serie A, Ligue 1, Eredivisie, Primeira Liga, Champions League) ingest from
football-data.org into `src/data/leagues/{code}/`, each lazy-loaded on demand. Standings,
Matches, Match detail, Teams, Team detail, Players and Player detail all take a
`:competitionId` route param and a competition switcher in the nav. Live scores overlay
on top from ESPN's public API (`scripts/ingest-espn-live.mjs` + `public/live.json`,
polled client-side every 60s) — keyless, joined to football-data.org's matches by team
name (see `ALIASES` in that script for the ~50 naming mismatches between the two
providers). Squads come from football-data.org's `/competitions/{code}/teams` (full
roster inline, no per-team calls needed). FotMob advanced stats and the Champions League
Swiss-format/knockout engineering are not built yet (Phases 5–7, reordered from the
original plan — see `PLAN.md`).

Note: as of 2026-07-20, football-data.org hadn't yet populated 2026-27 squads for La
Liga, Serie A, Ligue 1, Eredivisie, or Primeira Liga (Premier League, Championship,
Bundesliga, and Champions League already had theirs) — those competitions' Players/squad
sections are correctly empty rather than showing last season's departed players. Expect
this to fill in as football-data.org's own data catches up; no code change needed when
it does.

Three GitHub Actions workflows, deliberately decoupled so a live-score update never
re-runs the slow football-data.org pass: `update-data.yml` (football-data.org, every
~30 min), `update-live.yml` (ESPN live scores, every ~10 min), `deploy.yml` (build +
publish whatever's committed, triggered by either of the above). The higher-frequency
Cloudflare Worker cadence world-cup uses (dispatches every ~1–2 min during a live match)
isn't set up yet — this repo doesn't have Cloudflare infrastructure provisioned, and
that's a deliberate follow-up rather than an oversight.

Note: in the close-season window, football-data.org has been observed to serve a
competition's *new*-season metadata paired with the *previous* season's standings table.
`scripts/ingest-football-data.mjs` detects this (0 finished matches but a table showing
games played) and drops the stale table rather than show it as current.

## Development

```sh
npm install
FOOTBALL_DATA_API_KEY=... npm run ingest   # populates src/data/leagues/{code}/*.json
npm run ingest:live                        # populates public/live.json from ESPN
npm run ingest:live:check                  # verifies every team resolves to an ESPN match
npm run dev
```

`npm run build` type-checks and builds to `dist/` (with a `404.html` fallback for
GitHub Pages' static hosting, since the app uses client-side routing). CI in
`.github/workflows/deploy.yml` runs ingest → build → deploy on every push to `main`,
using a `FOOTBALL_DATA_API_KEY` repository secret.
