import { Link, useParams } from "react-router-dom";
import { competitionById, teamById } from "../data";
import { useLeague } from "../data/useLeague";
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
  const competition = competitionId ? competitionById(competitionId) : undefined;
  const { data, error, loading } = useLeague(competitionId);

  const sorted = data ? [...data.matches].sort((a, b) => a.utcDate.localeCompare(b.utcDate)) : [];
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
            return (
              <Link
                className="match-row"
                to={`/matches/${competitionId}/${match.id}`}
                key={match.id}
              >
                <span>
                  {home?.shortName ?? match.homeTeamId} vs {away?.shortName ?? match.awayTeamId}
                </span>
                <span>
                  {match.status === "finished"
                    ? `${match.homeTeam.goals}–${match.awayTeam.goals}`
                    : match.status}
                </span>
              </Link>
            );
          })}
        </div>
      ))}
    </div>
  );
}
