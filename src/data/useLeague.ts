import { useEffect, useState } from "react";
import { loadLeague, type LeagueData } from "./index";

export interface UseLeagueResult {
  data: LeagueData | null;
  error: Error | null;
  loading: boolean;
}

// Loads (and caches) one competition's teams/matches/standings on demand.
// Pages call this with the `:competitionId` route param; loadLeague's own
// cache means switching back to an already-visited competition is instant.
export function useLeague(competitionId: string | undefined): UseLeagueResult {
  const [data, setData] = useState<LeagueData | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!competitionId) return;
    setData(null);
    setError(null);
    let cancelled = false;
    loadLeague(competitionId)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err : new Error(String(err)));
      });
    return () => {
      cancelled = true;
    };
  }, [competitionId]);

  return { data, error, loading: !data && !error };
}
