import { Link } from "react-router-dom";
import { teams } from "../data";

export default function Teams() {
  return (
    <div>
      <h1>Teams</h1>
      {teams.length === 0 && <p>No team data yet — run `npm run ingest`.</p>}
      <div className="team-grid">
        {teams.map((team) => (
          <Link className="team-card" to={`/teams/${team.id}`} key={team.id}>
            {team.name}
          </Link>
        ))}
      </div>
    </div>
  );
}
