import { standings } from "../data";

export default function Standings() {
  return (
    <div>
      <h1>Standings</h1>
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
          {standings.map((row) => (
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
      {standings.length === 0 && <p>No standings data yet — run `npm run ingest`.</p>}
    </div>
  );
}
