// Advanced match stats from FotMob's public JSON API — team-level (xG,
// shots, possession, duels, touches in the opposition box) and player-level
// (xG, xA, goals, assists, tackles, minutes, rating) for the CURRENT season.
// football-data.org has none of this; ESPN's scoreboard (Phase 3) only
// carries live status/scores, not box-score stats.
//
// Why FotMob and not FBref (the more obvious source for this class of data)?
// FBref sits behind Cloudflare's managed challenge, which a CI runner on a
// datacenter IP can't reliably pass — world-cup hit this exact wall and
// routed around it via FotMob; same call here, no need to relitigate it.
//
// FotMob and football-data.org don't share match IDs, so matches are joined
// by competition + calendar day + normalized team name (scripts/fotmob-
// shared.mjs ALIASES + findFixture). Player identity is joined separately,
// per team (small candidate pool), by normalized full name.
//
// Incremental by design: only fetches matchDetails for finished matches that
// don't already have `stats` on disk, so a full season's worth of matches
// doesn't mean re-fetching all of them every run. Player-level per-match
// stats land in player-match-stats.json (source of truth); player-stats.json
// (season totals) is always a fresh sum over that file, recomputed every
// run — cheap, no network calls, and automatically correct across a season
// rollover (stale match ids get pruned before the rollup).
//
// ingest-football-data.mjs carries match.stats forward across its own
// rebuilds so this doesn't get wiped by the next football-data.org refresh
// (same reason world-cup's ingest-espn preserves FotMob fields across its
// rebuilds).
//
// For last season's fallback data (domestic leagues before their current
// season has any finished matches — see Competition.hasFinishedMatches),
// see ingest-fotmob-fallback.mjs, a separate one-time backfill script that
// reuses the same extraction helpers from fotmob-shared.mjs.
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { COMPETITIONS } from "./competitions.mjs";
import {
  FOTMOB,
  FOTMOB_LEAGUE_IDS,
  PAUSE_MS,
  extractMatchPlayerStats,
  extractTeamStats,
  findFixture,
  getJson,
  playersByTeamMap,
  readJson,
  rollupSeasonStats,
  sleep,
} from "./fotmob-shared.mjs";

const DATA_DIR = fileURLToPath(new URL("../src/data/", import.meta.url));

async function ingestCompetition(code) {
  const leagueId = FOTMOB_LEAGUE_IDS[code];
  const dir = `${DATA_DIR}leagues/${code}/`;
  const matches = await readJson(`${dir}matches.json`, []);
  const teams = await readJson(`${dir}teams.json`, []);
  const players = await readJson(`${dir}players.json`, []);
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const playersByTeam = playersByTeamMap(players);
  const playerMatchStats = await readJson(`${dir}player-match-stats.json`, {});

  // Prune entries for matches no longer present (a season rollover replaces
  // the whole matches.json with a new match-id space — see types.ts
  // PlayerMatchStats doc comment) before fetching or rolling up, so stale
  // history never leaks into the current season's totals.
  const currentMatchIds = new Set(matches.map((m) => m.id));
  for (const matchId of Object.keys(playerMatchStats)) {
    if (!currentMatchIds.has(matchId)) delete playerMatchStats[matchId];
  }

  // Needs (re-)fetching if either team stats or player stats are missing —
  // matchDetails gives both in one response, so a match with team stats but
  // no player-match-stats entry yet (e.g. ingested before player-level
  // extraction existed) still needs a pass.
  const toFetch = matches.filter(
    (m) => m.status === "finished" && (!m.stats || !playerMatchStats[m.id]),
  );
  if (toFetch.length === 0) {
    console.log(`[${code}] nothing new to fetch (${matches.length} matches, all finished ones already have stats).`);
  } else {
    console.log(`[${code}] ${toFetch.length} finished match(es) need FotMob stats...`);

    // Fetch the league's fixture list once per competition (cheap, one
    // call), reused to resolve every match's FotMob id below rather than
    // one league call per match.
    const league = await getJson(`${FOTMOB}/leagues?id=${leagueId}`);
    await sleep(PAUSE_MS);
    const fixtures = league.fixtures?.allMatches ?? [];

    let updated = 0;
    for (const match of toFetch) {
      const home = teamById.get(match.homeTeamId);
      const away = teamById.get(match.awayTeamId);
      if (!home || !away) continue;

      const dateStr = match.utcDate.slice(0, 10);
      const fixture = findFixture(fixtures, home.name, away.name, dateStr);
      if (!fixture) {
        console.warn(`[${code}] no FotMob match found for ${home.name} vs ${away.name} on ${dateStr}`);
        continue;
      }

      try {
        const details = await getJson(`${FOTMOB}/matchDetails?matchId=${fixture.id}`);
        const homeStats = extractTeamStats(details, "home");
        const awayStats = extractTeamStats(details, "away");
        if (homeStats && awayStats) {
          match.stats = { home: homeStats, away: awayStats };
          updated++;

          playerMatchStats[match.id] = extractMatchPlayerStats(
            details,
            match.homeTeamId,
            match.awayTeamId,
            playersByTeam,
            (name) => console.warn(`[${code}] no player match for "${name}" in match ${match.id}`),
          );
        }
      } catch (err) {
        console.warn(`[${code}] FotMob matchDetails fetch failed for match ${fixture.id}: ${err.message}`);
      }
      await sleep(PAUSE_MS);
    }

    await writeFile(`${dir}matches.json`, JSON.stringify(matches, null, 2) + "\n");
    console.log(`[${code}] wrote stats for ${updated}/${toFetch.length} matches.`);
  }

  await writeFile(`${dir}player-match-stats.json`, JSON.stringify(playerMatchStats, null, 2) + "\n");

  const season = matches[0]?.season ?? null;
  const seasonStats = season ? rollupSeasonStats(playerMatchStats, season) : [];
  await writeFile(`${dir}player-stats.json`, JSON.stringify(seasonStats, null, 2) + "\n");
  console.log(`[${code}] player-stats.json: ${seasonStats.length} players with season totals.`);
}

// Maintenance mode: `node scripts/ingest-fotmob.mjs --check` verifies every
// team in every competition's teams.json resolves to a FotMob team via
// ALIASES + normalizeTeamName, independent of any match being finished.
async function checkAliases() {
  const { ALIASES } = await import("./fotmob-shared.mjs");
  const { normalizeTeamName } = await import("./name-match.mjs");
  let unmatchedTotal = 0;
  for (const { code } of COMPETITIONS) {
    const leagueId = FOTMOB_LEAGUE_IDS[code];
    const teams = await readJson(`${DATA_DIR}leagues/${code}/teams.json`, []);
    const league = await getJson(`${FOTMOB}/leagues?id=${leagueId}`);
    await sleep(PAUSE_MS);
    const fmNames = new Set(
      (league.fixtures?.allMatches ?? []).flatMap((m) => [m.home.name, m.away.name]),
    );
    const fmNorm = new Set([...fmNames].map(normalizeTeamName));
    const unmatched = teams.filter((t) => !fmNorm.has(normalizeTeamName(ALIASES[t.name] ?? t.name)));
    unmatchedTotal += unmatched.length;
    console.log(`[${code}] ${unmatched.length}/${teams.length} unmatched`);
    for (const t of unmatched) console.log(`  ${t.name}`);
  }
  console.log(unmatchedTotal === 0 ? "All teams matched." : `${unmatchedTotal} unmatched total.`);
  if (unmatchedTotal > 0) process.exitCode = 1;
}

async function main() {
  if (process.argv.includes("--check")) return checkAliases();

  for (const { code } of COMPETITIONS) {
    try {
      await ingestCompetition(code);
    } catch (err) {
      console.error(`[${code}] FotMob ingest failed (non-fatal):`, err.message);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
