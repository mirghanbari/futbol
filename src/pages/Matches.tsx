import { useMemo } from "react";
import { useParams } from "react-router-dom";
import { teamById } from "../data";
import { useCompetitionPage } from "../data/useCompetitionPage";
import { LeagueStatus } from "../components/LeagueStatus";
import { LiveNow } from "../components/LiveNow";
import { MatchCard, isLiveMatch } from "../components/MatchCard";
import { applyLive, useLiveData } from "../data/live";
import { computeRatings, expectedGoals, matchProbabilities } from "../data/ratings";
import { useSeo } from "../data/seo";
import type { Match } from "../data/types";

function groupByDay(list: Match[]): [string, Match[]][] {
  const groups = new Map<string, Match[]>();
  for (const match of list) {
    const day = match.utcDate.slice(0, 10);
    if (!groups.has(day)) groups.set(day, []);
    groups.get(day)!.push(match);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
}

export default function Matches() {
  const { competitionId } = useParams();
  const { competition, data, error, loading, isPriorSeason } = useCompetitionPage(competitionId);
  const live = useLiveData();

  useSeo({
    title: `${competition?.name ?? competitionId ?? "Matches"} Matches`,
    description: competition ? `Fixtures and results for ${competition.name}.` : undefined,
  });

  // Odds only depend on team pairing + the ratings model, never on live
  // status/score — computed once per data load here, keyed on `data` alone
  // (NOT on `live`, which changes every 60s via useLiveData's poll and would
  // otherwise force this same double-Poisson-sum work to rerun for every
  // scheduled match on every poll tick, whether or not anything live-related
  // actually changed).
  const oddsByMatchId = useMemo(() => {
    if (!data) return new Map<string, { home: number; draw: number; away: number }>();
    const model = computeRatings(data.ratingsStandings);
    const map = new Map<string, { home: number; draw: number; away: number }>();
    for (const match of data.matches) {
      if (match.status !== "scheduled") continue;
      const xg = expectedGoals(model, match.homeTeamId, match.awayTeamId);
      if (xg) map.set(match.id, matchProbabilities(xg.home, xg.away));
    }
    return map;
  }, [data]);

  const withLive = data ? applyLive(data.matches, live, competitionId) : [];
  const sorted = [...withLive].sort((a, b) => a.utcDate.localeCompare(b.utcDate));
  // Live matches are lifted out of their day group into the "Live now" strip
  // rather than shown in both places — one card per match, always the one
  // that's easiest to find.
  const groups = groupByDay(sorted.filter((match) => !isLiveMatch(match)));

  return (
    <div>
      <h1>{competition?.name ?? competitionId} matches</h1>

      <LeagueStatus error={error} loading={loading} />

      {data && <LiveNow matches={sorted} data={data} competitionId={competitionId} showDate />}

      {isPriorSeason && (
        <p className="season-banner">
          Showing the {competition?.season}–{competition?.season ? Number(competition.season) + 1 : ""} season —
          the new league-phase fixture list hasn't been published yet.
        </p>
      )}

      {data && sorted.length === 0 && <p>No match data yet — run `npm run ingest`.</p>}
      {groups.map(([day, dayMatches]) => (
        <div className="match-day" key={day}>
          <h3>{day}</h3>
          <div className="matches-grid">
            {dayMatches.map((match) => (
              <MatchCard
                key={match.id}
                match={match}
                competitionId={competitionId}
                home={data && teamById(data, match.homeTeamId)}
                away={data && teamById(data, match.awayTeamId)}
                odds={oddsByMatchId.get(match.id)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
