import { competitionById, isPriorSeasonCompetition } from "./index";
import { useLeague } from "./useLeague";
import type { LeagueData } from "./index";
import type { Competition } from "./types";

export interface CompetitionPageResult {
  competition: Competition | undefined;
  data: LeagueData | null;
  error: Error | null;
  loading: boolean;
  // True only for CL while its season lags the domestic leagues' (see
  // isPriorSeasonCompetition) — pages showing fixtures/tables/results render
  // a "showing last season" banner when this is set.
  isPriorSeason: boolean;
}

// The competition-lookup + league-data-load pair every :competitionId page
// needs, factored out of ~9 near-identical copies (Standings, Teams, Players,
// Matches, Stats, Knockout, TableRaces, TeamDetail, PlayerDetail, MatchDetail).
export function useCompetitionPage(competitionId: string | undefined): CompetitionPageResult {
  const competition = competitionId ? competitionById(competitionId) : undefined;
  const { data, error, loading } = useLeague(competitionId);
  const isPriorSeason = competition ? isPriorSeasonCompetition(competition) : false;
  return { competition, data, error, loading, isPriorSeason };
}
