import { useParams } from "react-router-dom";
import { competitionById } from "../data";
import { useLeague } from "../data/useLeague";

export default function Standings() {
  const { competitionId } = useParams();
  const competition = competitionId ? competitionById(competitionId) : undefined;
  const { data, error, loading } = useLeague(competitionId);

  return (
    <div>
      <h1>{competition?.name ?? competitionId} standings</h1>

      {error && <p>Couldn't load this competition: {error.message}</p>}
      {loading && !error && <p>Loading…</p>}

      {data && (
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Team</th>
              <th>P</th>
              <th>W</th>
              <th>D</th>
              <th>L</th>
              <th>GD</th>
              <th>Pts</th>
            </tr>
          </thead>
          <tbody>
            {data.standings.map((row) => (
              <tr key={row.id}>
                <td>{row.position}</td>
                <td>{row.name}</td>
                <td>{row.playedGames}</td>
                <td>{row.won}</td>
                <td>{row.draw}</td>
                <td>{row.lost}</td>
                <td>{row.goalDifference}</td>
                <td>{row.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {data && data.standings.length === 0 && (
        <p>No standings data yet for this competition — run `npm run ingest`.</p>
      )}
    </div>
  );
}
