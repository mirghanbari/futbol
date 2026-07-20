// Ingests Premier League data from football-data.org's free tier (v4 API,
// 10 req/min) into src/data/leagues/PL/{teams,matches,standings}.json.
//
// Consumes the /standings response as-is (already points/GD/goals sorted by
// the API) rather than reimplementing tiebreaker logic.
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const API_BASE = "https://api.football-data.org/v4";
const COMPETITION = "PL";
const OUT_DIR = fileURLToPath(new URL("../src/data/leagues/PL/", import.meta.url));

const apiKey = process.env.FOOTBALL_DATA_API_KEY;
if (!apiKey) {
  console.error("Missing FOOTBALL_DATA_API_KEY environment variable.");
  process.exit(1);
}

async function fetchJson(path) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "X-Auth-Token": apiKey },
  });
  if (!res.ok) {
    throw new Error(`${path} -> ${res.status} ${res.statusText}: ${await res.text()}`);
  }
  return res.json();
}

// football-data.org's free tier is 10 req/min; three sequential calls here
// don't need pacing yet, but keep the helper so Phase 2 (9 competitions,
// 27 calls) can reuse it with a delay inserted between calls.
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
    stage: "regular",
    utcDate: match.utcDate,
    status: toMatchStatus(match.status),
    homeTeamId: String(match.homeTeam.id),
    awayTeamId: String(match.awayTeam.id),
    homeTeam: { goals: match.score.fullTime.home ?? 0 },
    awayTeam: { goals: match.score.fullTime.away ?? 0 },
  };
}

async function main() {
  console.log(`Fetching ${COMPETITION} standings...`);
  const standingsRes = await fetchJson(`/competitions/${COMPETITION}/standings`);
  await sleep(6100); // stay under 10 req/min

  console.log(`Fetching ${COMPETITION} matches...`);
  const matchesRes = await fetchJson(`/competitions/${COMPETITION}/matches`);

  const season = String(standingsRes.season.startDate.slice(0, 4));
  const totalTable = standingsRes.standings.find((s) => s.type === "TOTAL");
  const standings = totalTable.table.map((entry) => toStanding(entry, COMPETITION));

  const teamMap = new Map();
  for (const entry of totalTable.table) {
    teamMap.set(String(entry.team.id), toTeam(entry.team, COMPETITION));
  }
  const teams = [...teamMap.values()];

  const matches = matchesRes.matches.map((match) => toMatch(match, COMPETITION, season));

  await writeFile(`${OUT_DIR}teams.json`, JSON.stringify(teams, null, 2) + "\n");
  await writeFile(`${OUT_DIR}standings.json`, JSON.stringify(standings, null, 2) + "\n");
  await writeFile(`${OUT_DIR}matches.json`, JSON.stringify(matches, null, 2) + "\n");

  console.log(
    `Wrote ${teams.length} teams, ${standings.length} standings rows, ${matches.length} matches.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
