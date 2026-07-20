// Shared football-data.org v4 API helpers + response mapping, used by
// ingest-football-data.mjs (current season, recurring) and
// ingest-fotmob-fallback.mjs (last season, one-time backfill for domestic
// leagues — see Competition.hasFinishedMatches).
export const API_BASE = "https://api.football-data.org/v4";
export const PACE_MS = 6500; // stay under the free tier's 10 req/min, with margin

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchFdJson(path, apiKey, tries = 3) {
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

export function toTeam(team, competitionId) {
  return {
    id: String(team.id),
    name: team.name,
    shortName: team.shortName ?? team.name,
    tla: team.tla ?? "",
    crest: team.crest,
    competitionId,
  };
}

export function toStanding(entry, competitionId) {
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

export function toMatchStatus(status) {
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

export function toMatch(match, competitionId, season) {
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
export function toPosition(position) {
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

export function toPlayers(teamsRes, competitionId) {
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
