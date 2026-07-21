// Ingests all 9 tracked competitions from football-data.org's free tier (v4
// API, 10 req/min) into
// src/data/leagues/{code}/{teams,matches,standings,players}.json, plus a
// src/data/competitions.json manifest (static metadata + each competition's
// current season/matchday from the API).
//
// Consumes the /standings response as-is (already points/GD/goals sorted by
// the API) rather than reimplementing tiebreaker logic.
//
// Free tier is 10 req/min: 9 competitions x 3 calls (standings, matches,
// teams-with-squads) = 27 calls, so each call is paced ~6.5s apart (a full
// pass takes ~3 minutes). A single competition's failure (e.g. season not
// yet loaded) is logged and skipped — it doesn't abort the rest of the run
// or touch that competition's last-good JSON on disk.
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { COMPETITIONS } from "./competitions.mjs";
import { PACE_MS, fetchFdJson, sleep, toMatch, toPlayers, toStanding, toTeam } from "./football-data-shared.mjs";

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return [];
  }
}

const DATA_DIR = fileURLToPath(new URL("../src/data/", import.meta.url));

const apiKey = process.env.FOOTBALL_DATA_API_KEY;
if (!apiKey) {
  console.error("Missing FOOTBALL_DATA_API_KEY environment variable.");
  process.exit(1);
}

async function ingestCompetition(meta) {
  const { code } = meta;
  console.log(`[${code}] fetching standings...`);
  const standingsRes = await fetchFdJson(`/competitions/${code}/standings`, apiKey);
  await sleep(PACE_MS);

  console.log(`[${code}] fetching matches...`);
  const matchesRes = await fetchFdJson(`/competitions/${code}/matches`, apiKey);
  await sleep(PACE_MS);

  console.log(`[${code}] fetching squads...`);
  const teamsRes = await fetchFdJson(`/competitions/${code}/teams`, apiKey);
  await sleep(PACE_MS);
  const players = toPlayers(teamsRes, code);

  const season = String(standingsRes.season.startDate.slice(0, 4));

  // In the close-season window, football-data.org has been observed to serve
  // the *new* season's metadata (correct startDate/currentMatchday) paired
  // with the *previous* season's standings table (full playedGames/points) —
  // stale data mislabeled under the new season, not a "one game played"
  // rounding artifact. Detect it by cross-checking against the matches feed
  // (always correctly scoped to the current season): if nothing's finished
  // yet but the table shows games played, the table doesn't belong to this
  // season — discard it rather than show a fabricated-looking "current"
  // table that's actually last year's final standings.
  const finishedCount = matchesRes.matches.filter((m) => m.status === "FINISHED").length;
  let table = standingsRes.standings.find((s) => s.type === "TOTAL") ?? standingsRes.standings[0];
  if (table && finishedCount === 0 && table.table.some((row) => row.playedGames > 0)) {
    console.warn(`[${code}] standings look stale (0 finished matches, but table shows games played) — dropping.`);
    table = undefined;
  }
  const standings = table ? table.table.map((entry) => toStanding(entry, code)) : [];

  const teamMap = new Map();
  for (const entry of table?.table ?? []) {
    teamMap.set(String(entry.team.id), toTeam(entry.team, code));
  }
  // Standings can be empty (pre-season, or just discarded as stale above);
  // matches always carry both teams, so backfill the team list from there
  // too (keeps Teams/TeamDetail working even before a ball's been kicked).
  for (const match of matchesRes.matches) {
    for (const side of [match.homeTeam, match.awayTeam]) {
      if (!teamMap.has(String(side.id))) {
        teamMap.set(String(side.id), toTeam(side, code));
      }
    }
  }
  const teams = [...teamMap.values()];

  const matches = matchesRes.matches.map((match) => toMatch(match, code, season));

  // Carry forward FotMob's per-match `stats` (scripts/ingest-fotmob.mjs)
  // across this rebuild — this script is the source of truth for
  // teams/standings/matches/players, but not for FotMob's advanced stats,
  // and a fresh football-data.org pull would otherwise silently wipe them
  // every ~30 minutes.
  const outDir = `${DATA_DIR}leagues/${code}/`;
  const existingMatches = await readJson(`${outDir}matches.json`);
  const existingStatsById = new Map(
    existingMatches.filter((m) => m.stats).map((m) => [m.id, m.stats]),
  );
  for (const match of matches) {
    const stats = existingStatsById.get(match.id);
    if (stats) match.stats = stats;
  }
  await writeFile(`${outDir}teams.json`, JSON.stringify(teams, null, 2) + "\n");
  await writeFile(`${outDir}standings.json`, JSON.stringify(standings, null, 2) + "\n");
  await writeFile(`${outDir}matches.json`, JSON.stringify(matches, null, 2) + "\n");
  await writeFile(`${outDir}players.json`, JSON.stringify(players, null, 2) + "\n");

  console.log(
    `[${code}] wrote ${teams.length} teams, ${standings.length} standings rows, ${matches.length} matches, ${players.length} players.`,
  );

  return {
    id: meta.code,
    name: meta.name,
    country: meta.country,
    tier: meta.tier,
    season,
    currentMatchday: standingsRes.season.currentMatchday ?? null,
    hasFinishedMatches: matches.some((m) => m.status === "finished"),
  };
}

async function main() {
  // On a per-competition failure, reuse its PRIOR manifest entry (season,
  // matchday, hasFinishedMatches) rather than writing a degraded stub — the
  // per-competition JSON on disk is untouched by the failure, so competitions.json
  // shouldn't regress to say otherwise (that was flipping hasFinishedMatches to
  // false and spuriously switching Players/Stats to fallback data on a transient
  // API error). Only a competition with no prior entry (first-ever run) falls
  // back to the degraded stub, since there's nothing better to report.
  const priorManifest = await readJson(`${DATA_DIR}competitions.json`);
  const priorByCode = new Map(priorManifest.map((c) => [c.id, c]));

  const manifest = [];
  for (const meta of COMPETITIONS) {
    try {
      manifest.push(await ingestCompetition(meta));
    } catch (err) {
      console.error(`[${meta.code}] ingest failed (non-fatal, leaving prior data in place):`, err.message);
      const prior = priorByCode.get(meta.code);
      manifest.push({
        id: meta.code,
        name: meta.name,
        country: meta.country,
        tier: meta.tier,
        season: prior?.season ?? null,
        currentMatchday: prior?.currentMatchday ?? null,
        hasFinishedMatches: prior?.hasFinishedMatches ?? false,
      });
    }
  }

  await writeFile(`${DATA_DIR}competitions.json`, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`Wrote competitions.json (${manifest.length} competitions).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
