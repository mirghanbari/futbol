import { Link } from "react-router-dom";
import { matches, teamById } from "../data";
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
  const sorted = [...matches].sort((a, b) => a.utcDate.localeCompare(b.utcDate));
  const groups = groupByDay(sorted);

  return (
    <div>
      <h1>Matches</h1>
      {groups.length === 0 && <p>No match data yet — run `npm run ingest`.</p>}
      {groups.map(([day, dayMatches]) => (
        <div className="match-day" key={day}>
          <h3>{day}</h3>
          {dayMatches.map((match) => {
            const home = teamById(match.homeTeamId);
            const away = teamById(match.awayTeamId);
            return (
              <Link className="match-row" to={`/matches/${match.id}`} key={match.id}>
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
