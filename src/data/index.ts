import teamsData from "./leagues/PL/teams.json";
import matchesData from "./leagues/PL/matches.json";
import standingsData from "./leagues/PL/standings.json";
import type { Match, Standing, Team } from "./types";

export const teams = teamsData as Team[];
export const matches = matchesData as Match[];
export const standings = standingsData as Standing[];

export function teamById(id: string): Team | undefined {
  return teams.find((team) => team.id === id);
}

export function matchById(id: string): Match | undefined {
  return matches.find((match) => match.id === id);
}

export function matchesByTeam(teamId: string): Match[] {
  return matches.filter((match) => match.homeTeamId === teamId || match.awayTeamId === teamId);
}
