// One-time backfill of LAST season's player stats AND final standings (the
// latter feeds the prediction engine's strength model, src/data/ratings.ts)
// for domestic leagues whose current season has no finished matches yet (see
// Competition.hasFinishedMatches and src/data/useLeague.ts's flip logic). Not part of the recurring ingest
// cadence (update-data.yml) — run manually (`npm run ingest:fallback`)
// whenever a league needs (re-)seeding. Safe to re-run: skips any
// competition whose current season already has real finished matches, so it
// naturally stops doing anything once each league's 2026-27 season starts.
//
// CL is deliberately excluded: its own "current" data already IS last
// season's complete season (football-data.org hasn't published 2026-27 CL
// fixtures yet — see PROGRESS.md), so it never needs a separate fallback.
//
// This is the slow one: up to ~380 matches per league through FotMob's
// matchDetails at the same polite 1.5s pacing as the regular ingest, so a
// full league can take several minutes and all 8 domestic leagues together
// is a genuinely long-running job. Expect this, don't assume it's stuck.
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { COMPETITIONS } from "./competitions.mjs";
import { PACE_MS, fetchFdJson, sleep as fdSleep, toMatch, toPlayers, toStanding, toTeam } from "./football-data-shared.mjs";
import {
  FOTMOB,
  FOTMOB_LEAGUE_IDS,
  PAUSE_MS,
  extractMatchPlayerStats,
  findFixture,
  getJson,
  playersByTeamMap,
  readJson,
  rollupSeasonStats,
  sleep,
} from "./fotmob-shared.mjs";

const DATA_DIR = fileURLToPath(new URL("../src/data/", import.meta.url));

const apiKey = process.env.FOOTBALL_DATA_API_KEY;
if (!apiKey) {
  console.error("Missing FOOTBALL_DATA_API_KEY environment variable.");
  process.exit(1);
}

// seasons[0] from /competitions/{code} is the current (possibly not-yet-
// started) season; seasons[1] is the most recently completed one. More
// robust than assuming "current year - 1", which doesn't hold for every
// competition's calendar convention.
async function lastCompletedSeasonYear(code) {
  const res = await fetchFdJson(`/competitions/${code}`, apiKey);
  await fdSleep(PACE_MS);
  const last = res.seasons?.[1];
  if (!last) throw new Error(`no completed season found for ${code}`);
  return String(last.startDate.slice(0, 4));
}

async function backfillCompetition(code) {
  const dir = `${DATA_DIR}leagues/${code}/`;
  const currentMatches = await readJson(`${dir}matches.json`, []);
  if (currentMatches.some((m) => m.status === "finished")) {
    console.log(`[${code}] current season already has finished matches — skipping fallback.`);
    return;
  }

  const seasonYear = await lastCompletedSeasonYear(code);
  console.log(`[${code}] backfilling ${seasonYear} season as fallback...`);

  console.log(`[${code}] fetching ${seasonYear} matches...`);
  const matchesRes = await fetchFdJson(`/competitions/${code}/matches?season=${seasonYear}`, apiKey);
  await fdSleep(PACE_MS);

  console.log(`[${code}] fetching ${seasonYear} squads...`);
  const teamsRes = await fetchFdJson(`/competitions/${code}/teams?season=${seasonYear}`, apiKey);
  await fdSleep(PACE_MS);

  // For the prediction engine's strength model (src/data/ratings.ts) — last
  // season's final points/goals table, used as the ratings basis while this
  // season has no finished matches of its own yet (never as a season
  // baseline; see LeagueData.ratingsStandings' own comment for why that
  // distinction matters).
  console.log(`[${code}] fetching ${seasonYear} final standings...`);
  const standingsRes = await fetchFdJson(`/competitions/${code}/standings?season=${seasonYear}`, apiKey);
  await fdSleep(PACE_MS);
  const standingsTable = standingsRes.standings.find((s) => s.type === "TOTAL") ?? standingsRes.standings[0];
  const fallbackStandings = standingsTable ? standingsTable.table.map((entry) => toStanding(entry, code)) : [];
  await writeFile(`${dir}fallback-standings.json`, JSON.stringify(fallbackStandings, null, 2) + "\n");

  const players = toPlayers(teamsRes, code);
  const teams = teamsRes.teams.map((t) => toTeam(t, code));
  const matches = matchesRes.matches.map((m) => toMatch(m, code, seasonYear));
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const playersByTeam = playersByTeamMap(players);

  await writeFile(`${dir}fallback-players.json`, JSON.stringify(players, null, 2) + "\n");
  await writeFile(`${dir}fallback-meta.json`, JSON.stringify({ season: seasonYear }, null, 2) + "\n");

  const finished = matches.filter((m) => m.status === "finished");
  console.log(`[${code}] ${finished.length} finished matches to pull FotMob stats for (this takes a while)...`);

  const leagueId = FOTMOB_LEAGUE_IDS[code];
  const league = await getJson(
    `${FOTMOB}/leagues?id=${leagueId}&season=${seasonYear}/${Number(seasonYear) + 1}`,
  );
  await sleep(PAUSE_MS);
  const fixtures = league.fixtures?.allMatches ?? [];

  const playerMatchStats = {};
  let processed = 0;
  for (const match of finished) {
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
      playerMatchStats[match.id] = extractMatchPlayerStats(
        details,
        match.homeTeamId,
        match.awayTeamId,
        playersByTeam,
        (name) => console.warn(`[${code}] no player match for "${name}" in match ${match.id}`),
      );
      processed++;
      if (processed % 20 === 0) console.log(`[${code}] ${processed}/${finished.length}...`);
    } catch (err) {
      console.warn(`[${code}] FotMob matchDetails fetch failed for match ${fixture.id}: ${err.message}`);
    }
    await sleep(PAUSE_MS);
  }

  const seasonStats = rollupSeasonStats(playerMatchStats, seasonYear);
  await writeFile(`${dir}fallback-player-match-stats.json`, JSON.stringify(playerMatchStats, null, 2) + "\n");
  await writeFile(`${dir}fallback-player-stats.json`, JSON.stringify(seasonStats, null, 2) + "\n");
  console.log(
    `[${code}] wrote fallback data: ${players.length} players, ${seasonStats.length} with stats, ${processed}/${finished.length} matches processed.`,
  );
}

async function main() {
  const targets = COMPETITIONS.filter((c) => c.code !== "CL");
  for (const { code } of targets) {
    try {
      await backfillCompetition(code);
    } catch (err) {
      console.error(`[${code}] fallback backfill failed (non-fatal):`, err.message);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
