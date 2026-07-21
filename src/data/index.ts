import competitionsData from "./competitions.json";
import type { Competition, Match, Player, PlayerSeasonStats, Standing, Team } from "./types";

export const competitions = competitionsData as Competition[];

export function competitionById(id: string): Competition | undefined {
  return competitions.find((c) => c.id === id);
}

export interface LeagueData {
  teams: Team[];
  matches: Match[];
  standings: Standing[];
  // `players`/`playerStats` are current-season, UNLESS the competition has no
  // finished matches yet — then both flip together to last season's real
  // data (fallback-players.json / fallback-player-stats.json), so a
  // competition never shows "this season's empty squad" mixed with "last
  // season's stats". Flips back automatically the moment the current season
  // has its first finished match — no "wait for a meaningful sample size".
  players: Player[];
  playerStats: PlayerSeasonStats[];
  statsSeason: string | null;
  isFallbackStats: boolean;
}

// Lazy-loaded per-competition JSON, one dynamic import per file — loading
// only the competition a page actually needs, rather than bundling all 9 up
// front. Matters most for players.json: ~4,000+ players across the 9
// competitions would be a real bundle-size hit if imported eagerly.
const teamsGlob = import.meta.glob<{ default: Team[] }>("./leagues/*/teams.json");
const matchesGlob = import.meta.glob<{ default: Match[] }>("./leagues/*/matches.json");
const standingsGlob = import.meta.glob<{ default: Standing[] }>("./leagues/*/standings.json");
const playersGlob = import.meta.glob<{ default: Player[] }>("./leagues/*/players.json");
const playerStatsGlob = import.meta.glob<{ default: PlayerSeasonStats[] }>("./leagues/*/player-stats.json");
// Fallback files only exist for competitions ingest-fotmob-fallback.mjs has
// backfilled (domestic leagues awaiting their current season) — absent
// entries are expected, not a bug (CL never has one; see types.ts).
const fallbackPlayersGlob = import.meta.glob<{ default: Player[] }>("./leagues/*/fallback-players.json");
const fallbackPlayerStatsGlob = import.meta.glob<{ default: PlayerSeasonStats[] }>(
  "./leagues/*/fallback-player-stats.json",
);
const fallbackMetaGlob = import.meta.glob<{ default: { season: string } }>("./leagues/*/fallback-meta.json");

const leagueCache = new Map<string, LeagueData>();
const leagueLoading = new Map<string, Promise<LeagueData>>();

async function loadLeagueData(competitionId: string): Promise<LeagueData> {
  const teamsLoader = teamsGlob[`./leagues/${competitionId}/teams.json`];
  const matchesLoader = matchesGlob[`./leagues/${competitionId}/matches.json`];
  const standingsLoader = standingsGlob[`./leagues/${competitionId}/standings.json`];
  const playersLoader = playersGlob[`./leagues/${competitionId}/players.json`];
  const playerStatsLoader = playerStatsGlob[`./leagues/${competitionId}/player-stats.json`];
  if (!teamsLoader || !matchesLoader || !standingsLoader || !playersLoader || !playerStatsLoader) {
    throw new Error(`Unknown competition "${competitionId}"`);
  }

  const [teamsMod, matchesMod, standingsMod] = await Promise.all([
    teamsLoader(),
    matchesLoader(),
    standingsLoader(),
  ]);

  const competition = competitionById(competitionId);
  const fallbackPlayersLoader = fallbackPlayersGlob[`./leagues/${competitionId}/fallback-players.json`];
  const fallbackPlayerStatsLoader =
    fallbackPlayerStatsGlob[`./leagues/${competitionId}/fallback-player-stats.json`];
  const fallbackMetaLoader = fallbackMetaGlob[`./leagues/${competitionId}/fallback-meta.json`];
  const useFallback = Boolean(
    competition &&
      !competition.hasFinishedMatches &&
      fallbackPlayersLoader !== undefined &&
      fallbackPlayerStatsLoader !== undefined,
  );

  let players: Player[];
  let playerStats: PlayerSeasonStats[];
  let statsSeason: string | null;

  if (useFallback) {
    const [playersMod, playerStatsMod] = await Promise.all([
      fallbackPlayersLoader(),
      fallbackPlayerStatsLoader(),
    ]);
    players = playersMod.default;
    playerStats = playerStatsMod.default;
    statsSeason = fallbackMetaLoader !== undefined ? (await fallbackMetaLoader()).default.season : null;
  } else {
    const [playersMod, playerStatsMod] = await Promise.all([playersLoader(), playerStatsLoader()]);
    players = playersMod.default;
    playerStats = playerStatsMod.default;
    statsSeason = competition?.season ?? null;
  }

  return {
    teams: teamsMod.default,
    matches: matchesMod.default,
    standings: standingsMod.default,
    players,
    playerStats,
    statsSeason,
    isFallbackStats: useFallback,
  };
}

export function loadLeague(competitionId: string): Promise<LeagueData> {
  const cached = leagueCache.get(competitionId);
  if (cached) return Promise.resolve(cached);

  const inFlight = leagueLoading.get(competitionId);
  if (inFlight) return inFlight;

  const promise = loadLeagueData(competitionId).then(
    (data) => {
      leagueCache.set(competitionId, data);
      leagueLoading.delete(competitionId);
      return data;
    },
    (err) => {
      // Clear the in-flight entry on failure too, so a transient error
      // (network blip, a flaky dynamic import) doesn't permanently block
      // retrying this competition for the rest of the session.
      leagueLoading.delete(competitionId);
      throw err;
    },
  );
  leagueLoading.set(competitionId, promise);
  return promise;
}

export function teamById(data: LeagueData, id: string): Team | undefined {
  return data.teams.find((team) => team.id === id);
}

export function matchById(data: LeagueData, id: string): Match | undefined {
  return data.matches.find((match) => match.id === id);
}

export function matchesByTeam(data: LeagueData, teamId: string): Match[] {
  return data.matches.filter((match) => match.homeTeamId === teamId || match.awayTeamId === teamId);
}

export function playerById(data: LeagueData, id: string): Player | undefined {
  return data.players.find((player) => player.id === id);
}

export function playersByTeam(data: LeagueData, teamId: string): Player[] {
  return data.players.filter((player) => player.teamId === teamId);
}

export function statsForPlayer(data: LeagueData, playerId: string): PlayerSeasonStats | undefined {
  return data.playerStats.find((s) => s.playerId === playerId);
}
