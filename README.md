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

**Phases 1–5 done** (Phase 5 partially — see below). All 9 competitions (Premier League,
Championship, La Liga, Bundesliga, Serie A, Ligue 1, Eredivisie, Primeira Liga, Champions
League) ingest from football-data.org into `src/data/leagues/{code}/`, each lazy-loaded
on demand. Standings, Matches, Match detail, Teams, Team detail, Players and Player
detail all take a `:competitionId` route param and a competition switcher in the nav.
Live scores overlay on top from ESPN's public API (`scripts/ingest-espn-live.mjs` +
`public/live.json`, polled client-side every 60s) — keyless, joined to football-data.org's
matches by team name. Squads come from football-data.org's `/competitions/{code}/teams`
(full roster inline, no per-team calls needed).

FotMob adds **team-level** advanced match stats (xG, shots, possession, duels won,
touches in the opposition box, etc.) to finished matches, shown on Match detail — but
**not** a full player-level Stats leaderboard page, which was the original Phase 5 scope.
That needs a second name-matching layer plus season-long accumulation that can't be
verified against real current-season data yet (essentially 0 matches played anywhere as
of 2026-07-20); tracked as Phase 5b. Team/FotMob name matching across ESPN and FotMob
(two independent, differing naming conventions) is verified via `npm run
ingest:live:check` / `npm run ingest:fotmob:check` — 0 unmatched across all 9
competitions for both. The Champions League Swiss-format/knockout engineering (Phase 6)
isn't built yet — see `PLAN.md`.

Data-source quirks found and handled, not bugs in this codebase:
- **Stale standings** (close-season window): some competitions' standings endpoint
  briefly serves the *previous* season's final table under the *new* season's metadata.
  Detected (0 finished matches but a table showing games played) and dropped rather than
  shown as current.
- **Squads not yet populated**: as of 2026-07-20, La Liga/Serie A/Ligue 1/Eredivisie/
  Primeira Liga's 2026-27 squads aren't live on football-data.org yet (Premier League,
  Championship, Bundesliga, Champions League already have theirs) — left empty rather
  than falling back to last season's departed players.
- **Champions League showing last season**: CL's fixture list is still 2025-26 (complete,
  189/189 finished) because the 2026-27 league-phase draw hasn't happened yet — this is
  correctly labeled (not stale data), just a season behind the 8 domestic leagues, with
  no UI indicator of that yet.

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
npm run ingest:fotmob                      # adds FotMob team-level stats to finished matches
npm run ingest:fotmob:check                # verifies every team resolves to a FotMob match
npm run dev
```

`npm run build` type-checks and builds to `dist/` (with a `404.html` fallback for
GitHub Pages' static hosting, since the app uses client-side routing). CI in
`.github/workflows/deploy.yml` runs ingest → build → deploy on every push to `main`,
using a `FOOTBALL_DATA_API_KEY` repository secret.
