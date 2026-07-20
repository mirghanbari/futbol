import { Link } from "react-router-dom";
import { matches, standings, teamById } from "../data";

export default function Overview() {
  const upcoming = matches
    .filter((match) => match.status === "scheduled")
    .sort((a, b) => a.utcDate.localeCompare(b.utcDate))
    .slice(0, 5);
  const top5 = standings.slice(0, 5);

  return (
    <div>
      <h1>Premier League</h1>

      <section>
        <h2>Top of the table</h2>
        {top5.length === 0 && <p>No standings data yet — run `npm run ingest`.</p>}
        <ol>
          {top5.map((row) => (
            <li key={row.id}>
              {row.name} — {row.points} pts
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h2>Upcoming matches</h2>
        {upcoming.length === 0 && <p>No upcoming matches loaded yet.</p>}
        <ul>
          {upcoming.map((match) => {
            const home = teamById(match.homeTeamId);
            const away = teamById(match.awayTeamId);
            return (
              <li key={match.id}>
                <Link to={`/matches/${match.id}`}>
                  {home?.shortName ?? match.homeTeamId} vs {away?.shortName ?? match.awayTeamId}
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
