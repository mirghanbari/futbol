import { Link, useParams } from "react-router-dom";
import { competitionById, teamById } from "../data";
import { useLeague } from "../data/useLeague";
import { applyLive, useLiveData } from "../data/live";
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
    const clock = match.status === "paused" ? "HT" : (match.minute ?? "live");
    return `${match.homeTeam.goals}–${match.awayTeam.goals} (${clock}')`;
  }
  if (match.status === "finished") {
    return `${match.homeTeam.goals}–${match.awayTeam.goals}`;
  }
  return match.status;
}

export default function Matches() {
  const { competitionId } = useParams();
  const competition = competitionId ? competitionById(competitionId) : undefined;
  const { data, error, loading } = useLeague(competitionId);
  const live = useLiveData();

  const withLive = data ? applyLive(data.matches, live, competitionId) : [];
  const sorted = [...withLive].sort((a, b) => a.utcDate.localeCompare(b.utcDate));
  const groups = groupByDay(sorted);

  return (
    <div>
      <h1>{competition?.name ?? competitionId} matches</h1>

      {error && <p>Couldn't load this competition: {error.message}</p>}
      {loading && !error && <p>Loading…</p>}

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
