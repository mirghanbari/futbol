import { useParams } from "react-router-dom";
import { useCompetitionPage } from "../data/useCompetitionPage";
import { LeagueStatus } from "../components/LeagueStatus";

export default function Standings() {
  const { competitionId } = useParams();
  const { competition, data, error, loading } = useCompetitionPage(competitionId);

  return (
    <div>
      <h1>{competition?.name ?? competitionId} standings</h1>

      <LeagueStatus error={error} loading={loading} />

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
