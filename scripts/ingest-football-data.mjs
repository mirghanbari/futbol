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
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { COMPETITIONS } from "./competitions.mjs";

const API_BASE = "https://api.football-data.org/v4";
const DATA_DIR = fileURLToPath(new URL("../src/data/", import.meta.url));
const PACE_MS = 6500; // stay under 10 req/min with margin

const apiKey = process.env.FOOTBALL_DATA_API_KEY;
if (!apiKey) {
  console.error("Missing FOOTBALL_DATA_API_KEY environment variable.");
  process.exit(1);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(path, tries = 3) {
  for (let i = 0; i < tries; i++) {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: { "X-Auth-Token": apiKey },
    });
    if (res.ok) return res.json();
    // 429 (rate limit) is worth a longer backoff; other errors fail fast.
    if (res.status === 429 && i < tries - 1) {
      console.warn(`  rate limited on ${path}, backing off...`);
      await sleep(15000);
      continue;
    }
    throw new Error(`${path} -> ${res.status} ${res.statusText}: ${await res.text()}`);
  }
}

function toTeam(team, competitionId) {
  return {
    id: String(team.id),
    name: team.name,
    shortName: team.shortName ?? team.name,
    tla: team.tla ?? "",
    crest: team.crest,
    competitionId,
  };
}

function toStanding(entry, competitionId) {
  return {
    ...toTeam(entry.team, competitionId),
    position: entry.position,
    playedGames: entry.playedGames,
    won: entry.won,
    draw: entry.draw,
    lost: entry.lost,
    points: entry.points,
    goalsFor: entry.goalsFor,
    goalsAgainst: entry.goalsAgainst,
    goalDifference: entry.goalDifference,
  };
}

function toMatchStatus(status) {
  switch (status) {
    case "IN_PLAY":
      return "in-play";
    case "PAUSED":
      return "paused";
    case "FINISHED":
      return "finished";
    case "POSTPONED":
      return "postponed";
    case "CANCELLED":
    case "SUSPENDED":
      return "cancelled";
    default:
      return "scheduled";
  }
}

function toMatch(match, competitionId, season) {
  return {
    id: String(match.id),
    competitionId,
    season,
    matchday: match.matchday,
    // CL's round-robin league phase isn't a domestic "regular" season — tag it
    // distinctly now so Phase 6's Swiss-format/knockout engine doesn't have to
    // re-tag existing data. Everything from CL's playoff round onward isn't
    // modeled yet (still comes through as "league-phase" until Phase 6 adds
    // the wider stage enum + two-legged tie handling).
    stage: competitionId === "CL" ? "league-phase" : "regular",
    utcDate: match.utcDate,
    status: toMatchStatus(match.status),
    homeTeamId: String(match.homeTeam.id),
    awayTeamId: String(match.awayTeam.id),
    homeTeam: { goals: match.score.fullTime.home ?? 0 },
    awayTeam: { goals: match.score.fullTime.away ?? 0 },
  };
}

// football-data.org uses British-football position terms; only Goalkeeper
// matches our Position type as-is.
function toPosition(position) {
  switch (position) {
    case "Goalkeeper":
      return "Goalkeeper";
    case "Defence":
      return "Defender";
    case "Midfield":
      return "Midfielder";
    case "Offence":
      return "Forward";
    default:
      return null;
  }
}

function toPlayers(teamsRes, competitionId) {
  const players = [];
  for (const team of teamsRes.teams) {
    for (const p of team.squad ?? []) {
      players.push({
        id: String(p.id),
        name: p.name,
        position: toPosition(p.position),
        nationality: p.nationality,
        dateOfBirth: p.dateOfBirth ?? null,
        teamId: String(team.id),
        competitionId,
      });
    }
  }
  return players;
}

async function ingestCompetition(meta) {
  const { code } = meta;
  console.log(`[${code}] fetching standings...`);
  const standingsRes = await fetchJson(`/competitions/${code}/standings`);
  await sleep(PACE_MS);

  console.log(`[${code}] fetching matches...`);
  const matchesRes = await fetchJson(`/competitions/${code}/matches`);
  await sleep(PACE_MS);

  console.log(`[${code}] fetching squads...`);
  const teamsRes = await fetchJson(`/competitions/${code}/teams`);
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

  const outDir = `${DATA_DIR}leagues/${code}/`;
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
  };
}

async function main() {
  const manifest = [];
  for (const meta of COMPETITIONS) {
    try {
      manifest.push(await ingestCompetition(meta));
    } catch (err) {
      console.error(`[${meta.code}] ingest failed (non-fatal, leaving prior data in place):`, err.message);
      manifest.push({
        id: meta.code,
        name: meta.name,
        country: meta.country,
        tier: meta.tier,
        season: null,
        currentMatchday: null,
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
