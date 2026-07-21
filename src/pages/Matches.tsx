import { Link, useParams } from "react-router-dom";
import { teamById } from "../data";
import { useCompetitionPage } from "../data/useCompetitionPage";
import { LeagueStatus } from "../components/LeagueStatus";
import { applyLive, useLiveData } from "../data/live";
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

function scoreLabel(match: Match): string {
  if (match.status === "in-play" || match.status === "paused") {
    if (match.status === "paused") return `${match.homeTeam.goals}–${match.awayTeam.goals} (HT)`;
    const clock = match.minute ?? "live";
    return `${match.homeTeam.goals}–${match.awayTeam.goals} (${clock}')`;
  }
  if (match.status === "finished") {
    return `${match.homeTeam.goals}–${match.awayTeam.goals}`;
  }
  return match.status;
}

export default function Matches() {
  const { competitionId } = useParams();
  const { competition, data, error, loading, isPriorSeason } = useCompetitionPage(competitionId);
  const live = useLiveData();

  useSeo({
    title: `${competition?.name ?? competitionId ?? "Matches"} Matches`,
    description: competition ? `Fixtures and results for ${competition.name}.` : undefined,
  });

  const withLive = data ? applyLive(data.matches, live, competitionId) : [];
  const sorted = [...withLive].sort((a, b) => a.utcDate.localeCompare(b.utcDate));
  const groups = groupByDay(sorted);

  return (
    <div>
      <h1>{competition?.name ?? competitionId} matches</h1>

      <LeagueStatus error={error} loading={loading} />

      {isPriorSeason && (
        <p className="season-banner">
          Showing the {competition?.season}–{competition?.season ? Number(competition.season) + 1 : ""} season —
          the new league-phase fixture list hasn't been published yet.
        </p>
      )}

      {data && groups.length === 0 && <p>No match data yet — run `npm run ingest`.</p>}
      {groups.map(([day, dayMatches]) => (
        <div className="match-day" key={day}>
          <h3>{day}</h3>
          {dayMatches.map((match) => {
            const home = data && teamById(data, match.homeTeamId);
            const away = data && teamById(data, match.awayTeamId);
            const isLive = match.status === "in-play" || match.status === "paused";
            return (
              <Link
                className={isLive ? "match-row match-row-live" : "match-row"}
                to={`/matches/${competitionId}/${match.id}`}
                key={match.id}
              >
                <span>
                  {isLive && <span className="live-dot" aria-label="Live" />}
                  {home?.shortName ?? match.homeTeamId} vs {away?.shortName ?? match.awayTeamId}
                </span>
                <span>{scoreLabel(match)}</span>
              </Link>
            );
          })}
        </div>
      ))}
    </div>
  );
}
