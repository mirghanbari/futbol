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
  // Basis for the strength-rating/prediction engine (src/data/ratings.ts,
  // predictions.ts) ONLY — `standings` itself when non-empty, else last
  // season's final table (fallback-standings.json), gated the exact same way
  // as players/playerStats above. Never use this as a season BASELINE (points
  // to start simulating from) — it can be last season's final points total,
  // not this season's actual (usually zero, pre-season) state; `standings` is
  // still the real, current source of truth for that.
  ratingsStandings: Standing[];
  // True when ratingsStandings is actually the fallback table (last
  // season's), not this season's `standings` — use this for any "seeded
  // from last season" vs "from this season's results" label instead of
  // re-deriving it from `standings.length`, which misses the case where
  // `standings` is non-empty but every row is still tied at 0 games played
  // (season not started, but football-data.org still returned a table).
  isFallbackRatings: boolean;
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
const fallbackStandingsGlob = import.meta.glob<{ default: Standing[] }>("./leagues/*/fallback-standings.json");

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

  const standings = standingsMod.default;
  const fallbackStandingsLoader = fallbackStandingsGlob[`./leagues/${competitionId}/fallback-standings.json`];
  // Before a season kicks off, football-data.org's standings response can be
  // a real, non-empty table where every team is tied at 0 points/games
  // played (confirmed on real data — Serie A, Ligue 1, others), not just an
  // empty one — computeRatings() filters to playedGames > 0, so an all-zero
  // table silently produces an EMPTY model (no ratings, Predictions page
  // renders blank) instead of falling back to last season's real table like
  // it correctly does when standings.json is literally empty (PL, La Liga,
  // etc). Gated on the same hasFinishedMatches flag as `useFallback` above,
  // not reusing that flag directly since it also depends on the player-
  // fallback files existing, which is a separate concern from this one.
  const isFallbackRatings =
    (standings.length === 0 || isSeasonNotStarted(competition)) && fallbackStandingsLoader !== undefined;
  const ratingsStandings = isFallbackRatings ? (await fallbackStandingsLoader!()).default : standings;

  return {
    teams: teamsMod.default,
    matches: matchesMod.default,
    standings,
    players,
    playerStats,
    statsSeason,
    isFallbackStats: useFallback,
    ratingsStandings,
    isFallbackRatings,
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

export function ageFrom(dateOfBirth: string | null): number | null {
  if (!dateOfBirth) return null;
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const beforeBirthday =
    now.getMonth() < dob.getMonth() || (now.getMonth() === dob.getMonth() && now.getDate() < dob.getDate());
  if (beforeBirthday) age -= 1;
  return age;
}

// CL-specific: its own competitions.json `season` lags the 8 domestic
// leagues' by one year until football-data.org publishes the new UCL
// league-phase fixture list (the draw happens after domestic leagues have
// already kicked off — see PROGRESS.md). Compares against the domestic
// leagues' season rather than a hardcoded year, so this clears itself
// automatically the moment CL's data catches up, no code change needed.
export function isPriorSeasonCompetition(competition: Competition): boolean {
  if (competition.id !== "CL") return false;
  const domesticSeason = competitions.find((c) => c.id !== "CL")?.season;
  return domesticSeason !== undefined && competition.season !== domesticSeason;
}

// Before a season kicks off, football-data.org's standings response can be a
// real, non-empty table where every team is tied at 0 points/games played
// (confirmed on real data — Serie A, Ligue 1, others), not just an empty
// one. Standings.tsx, TableRaces.tsx, and TeamDetail.tsx all use this to
// avoid rendering that all-zero table as if it were meaningful (everyone
// "1st place", every row getting a qualification-zone badge); loadLeagueData
// above uses the same flag to decide whether ratingsStandings needs the
// last-season fallback too.
export function isSeasonNotStarted(competition: Competition | undefined): boolean {
  return competition ? !competition.hasFinishedMatches : false;
}
