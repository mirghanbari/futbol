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

// football-data.org's own stage classification — confirmed against real
// data: domestic leagues are uniformly REGULAR_SEASON; CL's 2025-26 season
// (used as-is — see PROGRESS.md) breaks out LEAGUE_STAGE (144 matches),
// PLAYOFFS/LAST_16/QUARTER_FINALS/SEMI_FINALS (16/16/8/4, each two-legged),
// FINAL (1, single match). Anything unrecognized falls back to "regular"
// rather than throwing — a new stage value showing up shouldn't break ingest.
const STAGE_MAP = {
  REGULAR_SEASON: "regular",
  LEAGUE_STAGE: "league-phase",
  PLAYOFFS: "playoff",
  LAST_16: "round16",
  QUARTER_FINALS: "quarter",
  SEMI_FINALS: "semi",
  FINAL: "final",
};

export function toStage(rawStage) {
  return STAGE_MAP[rawStage] ?? "regular";
}

// football-data's `fullTime` score BAKES IN the penalty-shootout tally when
// duration is PENALTY_SHOOTOUT (confirmed on the real CL final: fullTime
// 5-4, but regularTime 1-1 + extraTime 0-0 + penalties 4-3 — the "5-4" is
// not goals scored, it's regularTime+extraTime combined with the shootout
// count). The real goal count for ET/shootout matches is
// regularTime + extraTime; only plain REGULAR-duration matches can use
// fullTime directly. Matters for any competition's knockout stage, not just
// CL — was silently wrong for any penalty-shootout match before this fix.
function toGoals(score, side) {
  if (score.duration === "REGULAR") return score.fullTime?.[side] ?? 0;
  return (score.regularTime?.[side] ?? 0) + (score.extraTime?.[side] ?? 0);
}

function toShootout(score) {
  if (score.duration !== "PENALTY_SHOOTOUT" || !score.penalties) return undefined;
  return { home: score.penalties.home, away: score.penalties.away };
}

export function toMatch(match, competitionId, season) {
  const shootout = toShootout(match.score);
  return {
    id: String(match.id),
    competitionId,
    season,
    matchday: match.matchday,
    stage: toStage(match.stage),
    utcDate: match.utcDate,
    status: toMatchStatus(match.status),
    homeTeamId: String(match.homeTeam.id),
    awayTeamId: String(match.awayTeam.id),
    homeTeam: { goals: toGoals(match.score, "home") },
    awayTeam: { goals: toGoals(match.score, "away") },
    ...(shootout ? { shootout } : {}),
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
