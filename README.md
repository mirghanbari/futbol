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

**Phases 1–6 done.** All 9 competitions (Premier League, Championship, La Liga,
Bundesliga, Serie A, Ligue 1, Eredivisie, Primeira Liga, Champions League) ingest from
football-data.org into `src/data/leagues/{code}/`, each lazy-loaded on demand. Standings,
Matches, Match detail, Teams, Team detail, Players, Player detail, and a new Stats
leaderboard page all take a `:competitionId` route param and a competition switcher in
the nav. Live scores overlay on top from ESPN's public API
(`scripts/ingest-espn-live.mjs` + `public/live.json`, polled client-side every 60s) —
keyless, joined to football-data.org's matches by team name. Squads come from
football-data.org's `/competitions/{code}/teams` (full roster inline, no per-team calls
needed).

FotMob adds both team-level match stats (xG, shots, possession, duels won, touches in
the opposition box) shown on Match detail, and **player-level season stats** (goals,
assists, xG, xA, tackles, minutes, avg. rating) shown on Players/Player
detail/Stats — extracted from the same per-match FotMob response (no extra API calls),
summed into season totals at ingest time from per-match data, never an incrementally
updated total (so a season rollover — see the CL note below — can't corrupt it). Player
name matching needed real work: football-data.org often lists a short "known as" name
("Martinelli") where FotMob uses the fuller one ("Gabriel Martinelli") — falls back to
subset-of-words matching, but only when exactly one squad candidate qualifies (never
guesses between two players sharing a first name). Team-name matching across ESPN and
FotMob (two independent, differing naming conventions) is verified via `npm run
ingest:live:check` / `npm run ingest:fotmob:check` — 0 unmatched across all 9
competitions for both.

**Since none of the 8 domestic leagues have any 2026-27 matches played yet**, their
Players/Stats pages show last season's real, complete stats instead (via
`scripts/ingest-fotmob-fallback.mjs`, a one-time backfill — not part of the recurring
ingest cadence), clearly labeled, and flip to the current season automatically the
moment it has its first finished match — no "wait for a meaningful sample" threshold.
Champions League never needs this: its own "current" data already is last season's
complete season (see below). All 7 domestic leagues needing a fallback are fully
backfilled — 100% of last season's finished matches have real FotMob stats (fixed a
real gap along the way: a handful of clubs relegated/promoted since last season weren't
covered by the current-season team-name alias table).

The Champions League's Swiss-format league phase (36-team single table) plus two-legged
knockout (`src/data/knockout.ts` pairs legs by team identity, aggregates goals, falls to
a shootout if level — new Knockout page) both consume football-data.org's own stage
classification (`REGULAR_SEASON`/`LEAGUE_STAGE`/`PLAYOFFS`/`LAST_16`/`QUARTER_FINALS`/
`SEMI_FINALS`/`FINAL`), which Phase 2 had been discarding (blanket-tagged everything
"league-phase"). Verified against the real, complete 2025-26 bracket — fully consistent,
PSG beat Arsenal on penalties in the final. Building this surfaced a real, previously-
shipped bug: football-data's `fullTime` score *includes* the shootout tally for
penalty-shootout matches (the CL final showed "5-4" when the real 120-minute score was
1-1) — fixed for every competition's knockout stage, not just CL; the real goal count is
now `regularTime + extraTime`, with the shootout split into its own `Match.shootout`
field.

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
npm run ingest:fotmob                      # adds FotMob team + player stats to finished matches
npm run ingest:fotmob:check                # verifies every team resolves to a FotMob match
npm run ingest:fallback                    # one-time: last-season player stats for leagues with no current-season matches yet
npm run dev
```

`npm run build` type-checks and builds to `dist/` (with a `404.html` fallback for
GitHub Pages' static hosting, since the app uses client-side routing). CI in
`.github/workflows/deploy.yml` runs ingest → build → deploy on every push to `main`,
using a `FOOTBALL_DATA_API_KEY` repository secret.
