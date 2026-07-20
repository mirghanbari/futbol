# Futbol — European Top-8 Leagues + Champions League Dashboard

Repo: https://github.com/mirghanbari/futbol.git (currently empty, standalone repo at `~/code/futbol`)

## Context

We're building a companion to `~/code/dashboards/world-cup` (React+TS+Vite dashboard,
GitHub Pages + Actions, ingest scripts hitting free JSON APIs) — same model, new domain:
8 European domestic leagues (Premier League, La Liga, Bundesliga, Serie A, Ligue 1,
Eredivisie, Primeira Liga, Championship) + the UEFA Champions League, using
football-data.org as the primary licensed source, plus the same ESPN/FotMob pattern
the World Cup project already proved out in production for live scores and advanced
stats. The goal of this planning pass is to nail down the architecture *before* writing
code, since this project is meaningfully bigger and longer-lived than the World Cup one
(season-long, ~9x the teams/matches/players, a genuinely different UCL format) and a few
of its patterns don't port over unchanged.

Research done for this plan: read World Cup's `types.ts`, `data/index.ts`, `stats.ts`,
`knockout.ts`, `bracket.ts`, `qualification.ts`, `tiebreakers.ts`, `gen-live.mjs`,
`has-live-match.mjs`, the `cron-trigger` Worker, `App.tsx`/`Nav.tsx`; confirmed the
`futbol` GitHub repo is empty; confirmed football-data.org's free tier (10 req/min,
"scores delayed" — no live in-play, no lineups) **does** cover all 9 target competitions
(Champions League, Premier League, La Liga, Bundesliga, Ligue 1, Eredivisie, Primeira
Liga, Championship, plus World Cup/Euros we don't need) under `/v4/competitions/{code}/{matches,standings,scorers}`.

## Three-source architecture (mirrors World Cup's ESPN+FotMob split, adds football-data.org)

| Source | Role | Auth | Rate limit | Notes |
|---|---|---|---|---|
| **football-data.org** | Canonical backbone: competitions, official standings, fixtures/results, scorers | API key (`X-Auth-Token` header) — free signup | 10 req/min free tier | "Scores delayed," no live in-play, no lineups on free. This is the first source in this project needing a secret (`FOOTBALL_DATA_API_KEY` in Actions). |
| **ESPN public JSON API** (`site.api.espn.com`) | Live scores/minute-by-minute/timeline during match windows, rosters | none | none (courtesy) | Same API family World Cup already uses for `fifa.world` — it also serves club leagues via slug (`eng.1`=PL, `esp.1`=La Liga, `ger.1`=Bundesliga, `ita.1`=Serie A, `fra.1`=Ligue 1, `ned.1`=Eredivisie, `por.1`=Primeira Liga, `eng.2`=Championship, `uefa.champions`=UCL — confirm exact slugs during Phase 0 spike). `ingest-espn.mjs`'s scoreboard/roster logic generalizes almost directly; just parameterize the league slug instead of hardcoding `fifa.world`. |
| **FotMob public JSON API** | Advanced stats: xG, xA, duels, PPDA-approx, field tilt | none (browser UA + Referer, as World Cup already does) | be polite (1.5s pacing, as today) | Same reverse-engineered API `ingest-fotmob.mjs` already uses, proven to work from GitHub Actions CI (unlike FBref, which is Cloudflare-blocked from CI — already learned that lesson in World Cup, don't relitigate it here). Need each league's FotMob league ID (small discovery spike, not guessed). |

**Why not drop football-data.org and just use ESPN+FotMob like World Cup did?** Because
the user explicitly wants it as the licensed/canonical source, and it buys real value:
official standings we don't have to compute ourselves (see below), and reduced reliance
on undocumented endpoints for the numbers that matter most. ESPN/FotMob stay in as the
free, proven, live-capable layer — exactly the role they already play in World Cup.

## Key simplification: standings

World Cup needed a from-scratch tiebreaker engine (`tiebreakers.ts`) because ESPN's own
group standings had bugs. **football-data.org's `/standings` endpoint returns the
official, pre-sorted table directly** — we should consume it as-is for all 8 domestic
leagues rather than reimplementing points→GD→goals→H2H logic. This cuts a whole engine
out of scope. Verify during Phase 0 whether this holds for the Champions League's new
Swiss-format league phase too (see below) — if football-data.org models it correctly, no
custom Swiss standings engine is needed either; if not, we build a minimal `orderBy(points,
GD, goals)` sort (the tiebreakers.ts shape is generic enough to reuse for that fallback).

## Data model — what ports from World Cup vs what's new

Reuse near-verbatim (per the file read): `MatchStatus`, `Position`, `Player` (bios +
basic/advanced/elite stat tiers), `MatchTeamStats`, `MatchEvent`/timeline shape,
`StatDef`/`StatTier`/`StatSource` + the whole `stats.ts` catalog pattern (tiered
metrics, dynamic qualifying thresholds via `avgAttempts`, source badges, `UNAVAILABLE_SOURCES`
for fbref/provider-only metrics we still can't get — same ceiling as World Cup, still no
FBref/tracking data). `Standing extends Team` shape reuses directly, swapping `group:
string` for `competitionId: string`.

Net new:
- **`Competition`** entity: id, name, country, tier, football-data `code`, ESPN slug,
  FotMob league id, logo, current season/matchday.
- **`Match.stage`** needs a wider enum than World Cup's group/knockout ladder: domestic
  leagues are just `"regular"` (round-robin, `matchday` 1–38), UCL needs
  `"league-phase" | "playoff" | "round16" | "quarter" | "semi" | "final"`.
- **Champions League league-phase table**: 36 teams, one flat ranked table (reuse
  `Standing` scoped to `competitionId=CL, phase=league-phase`), not a group.
- **Two-legged ties**: UCL playoff round and R16/QF/SF are two-legged aggregate
  (no away-goals rule since 2021 — dropped). World Cup's `knockout.ts` only models
  single-match (+shootout) elimination. Need a new `Tie{leg1: Match, leg2: Match,
  aggHome, aggAway, winner}` concept layered on top of two `Match` records; the Final
  stays single-match like World Cup's, so `knockout.ts`'s bracket-tree renderer can
  likely still be reused for R16→Final if it operates on `Tie` nodes instead of raw
  `Match` nodes. **This is the single most novel piece of engineering in this project —
  budget real time for it, don't treat it as a copy-paste.**
- **Table-race engine** (title race / European-spot race / relegation battle — the
  analog of World Cup's `qualification.ts`): World Cup could brute-force enumerate every
  remaining group fixture (≤3^6 combos) because groups are tiny. A 38-game league season
  makes brute force infeasible. Use **magic-number / maximum-points-possible math**
  instead (standard "team can no longer be caught" / "already relegated" logic) — simpler
  than World Cup's approach and the right tool for this shape of problem. Skip
  probability/odds modeling (DTAI-style Monte Carlo) for v1; revisit as a stretch goal.

## Scale — the other real difference from World Cup

World Cup: 48 teams, 104 matches, ~1,245 players, single build-time JSON bundle (largest
file `players.json` ~1MB) — fine as eager static imports. This project: 8 leagues × ~20
teams × ~38 matchdays + UCL's 36 teams, on the order of 3,000+ matches/season and
4,000+ players. Eagerly importing one monolithic JSON per data type at build time would
bloat the Vite bundle and slow builds. **Plan: split JSON per competition**
(`src/data/leagues/{code}/{teams,matches,players,standings}.json`) and lazy-load a
league's data via dynamic `import()` when its pages are visited, rather than importing
everything into the main bundle. The Players page in particular needs the same
"hide players with zero activity" filter World Cup added, likely plus real pagination —
4,000+ rows isn't 1,245.

## Live-update pipeline — reuse near-verbatim

`gen-live.mjs` (slim `public/live.json` polled client-side), `has-live-match.mjs`
(exits 0 if anything's live), and the `cron-trigger` Cloudflare Worker (wakes every
minute, dispatches the GitHub Action on a live/idle cadence) all generalize as-is — the
Worker's `isGameOn()` already just checks "is *any* match live," which is exactly what's
needed for concurrent Saturday-3pm kickoffs across leagues, no redesign required. The
Worker deploys manually via `wrangler deploy` (no CI), same as today. Since this repo is
standalone (not living inside the `dashboards` monorepo), GitHub Actions workflows live
at the natural `.github/workflows/` location with no `working-directory: world-cup`
indirection — actually simpler than the current setup.

football-data.org's own free-tier data is delayed/not live, so it's not part of the live
loop — it's the backup/canonical sync (every 15–30 min, rate-limit-aware: 9 competitions
× 3 endpoints = 27 calls at 10/min means a full cycle takes ~3 min; build a small
rate-limited fetch queue helper shared across the football-data ingest script). ESPN
carries the live/minute-by-minute layer, exactly like World Cup.

## Pages (mirrors World Cup's page list, adapted)

Overview (cross-league scoreboard strip, favorites, storylines) · Standings (per-league
table, competition tabs) · Matches (filter by league/matchday/status, live-now pin,
day-grouping — same pattern as World Cup's Matches page) · Match detail (timeline + stats,
reused close to as-is) · Teams / Team detail · Players / Player detail (scale-aware) ·
Stats (leader boards, filterable by league, same `StatDef`/`leaders()` pattern) ·
Champions League hub (league-phase table + playoff + knockout bracket — the new page) ·
Table Races (title / Europe / relegation scenario cards, magic-number based, per league) ·
Favorites (reuse `favorites.ts` localStorage pattern as-is, extended to multi-league).

## Phased build order (so each phase ships something real, not a half-built pipeline)

0. **Spike**: confirm ESPN slugs and FotMob league IDs for all 9 competitions; get a
   football-data.org API key; verify how football-data.org models the new UCL Swiss
   format in its standings/matches response.
1. **Vertical slice, one league**: repo scaffold (Vite/React/TS, same file layout as
   World Cup: `src/{components,pages,data,seo}`, `scripts/ingest-*.mjs`), football-data.org
   ingest for Premier League only, GitHub Actions + Pages deploy proven end-to-end.
2. **All 9 competitions** on football-data.org: competitions/teams/standings/matches/scorers.
   Core pages: Overview, Standings, Matches, Match detail (no live yet), Teams, Team detail.
3. **ESPN live layer**: parameterized ingest across league slugs, `live.json` overlay,
   Cloudflare Worker cadence (fork of `cron-trigger`).
4. **FotMob advanced-stats layer**: parameterized per league id, powers the Stats page.
5. **Players / Player detail**, scale-aware (split JSON, pagination, activity filter).
6. **Champions League**: Swiss league-phase table, playoff round, two-legged knockout
   engine — the biggest net-new engineering, budgeted as its own phase.
7. **Table Races + Favorites**, then polish (schema.org, analytics) mirroring World Cup's
   later punch-list items.

## Verification

Each phase: `npm run build` (type-check + Vite build) clean, `npm run ingest` runs
against live football-data.org/ESPN/FotMob endpoints and produces sane JSON, dev server
smoke-tested in-browser for the pages that phase adds (matches World Cup's own
puppeteer-verification habit noted throughout its dev log). Phase 1 specifically proves
the GitHub Actions → Pages deploy pipeline works before any of the harder engineering
(scale-splitting, UCL format) gets built on top of it.
