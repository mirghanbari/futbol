import competitionsData from "./competitions.json";
import type { Competition, Match, Standing, Team } from "./types";

export const competitions = competitionsData as Competition[];

export function competitionById(id: string): Competition | undefined {
  return competitions.find((c) => c.id === id);
}

export interface LeagueData {
  teams: Team[];
  matches: Match[];
  standings: Standing[];
}

// Lazy-loaded per-competition JSON, one dynamic import per file. Domestic
// standings/fixtures alone stay small enough to import all 9 eagerly, but
// full squads land in Phase 5 (~4,000+ players across the 9 competitions) —
// loading only the competition a page actually needs, rather than bundling
// all 9 up front, avoids a bundle-size cliff then and costs nothing now.
const teamsGlob = import.meta.glob<{ default: Team[] }>("./leagues/*/teams.json");
const matchesGlob = import.meta.glob<{ default: Match[] }>("./leagues/*/matches.json");
const standingsGlob = import.meta.glob<{ default: Standing[] }>("./leagues/*/standings.json");

const leagueCache = new Map<string, LeagueData>();
const leagueLoading = new Map<string, Promise<LeagueData>>();

export function loadLeague(competitionId: string): Promise<LeagueData> {
  const cached = leagueCache.get(competitionId);
  if (cached) return Promise.resolve(cached);

  const inFlight = leagueLoading.get(competitionId);
  if (inFlight) return inFlight;

  const teamsLoader = teamsGlob[`./leagues/${competitionId}/teams.json`];
  const matchesLoader = matchesGlob[`./leagues/${competitionId}/matches.json`];
  const standingsLoader = standingsGlob[`./leagues/${competitionId}/standings.json`];
  if (!teamsLoader || !matchesLoader || !standingsLoader) {
    return Promise.reject(new Error(`Unknown competition "${competitionId}"`));
  }

  const promise = Promise.all([teamsLoader(), matchesLoader(), standingsLoader()]).then(
    ([teamsMod, matchesMod, standingsMod]) => {
      const data: LeagueData = {
        teams: teamsMod.default,
        matches: matchesMod.default,
        standings: standingsMod.default,
      };
      leagueCache.set(competitionId, data);
      leagueLoading.delete(competitionId);
      return data;
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
