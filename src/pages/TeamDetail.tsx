import { useParams, Link } from "react-router-dom";
import { teamById, matchesByTeam } from "../data";

export default function TeamDetail() {
  const { teamId } = useParams();
  const team = teamId ? teamById(teamId) : undefined;

  if (!team) {
    return <p>Team not found.</p>;
  }

  const fixtures = teamId ? matchesByTeam(teamId) : [];

  return (
    <div>
      <p>
        <Link to="/teams">← Back to teams</Link>
      </p>
      <h1>{team.name}</h1>
      <h2>Fixtures</h2>
      <ul>
        {fixtures.map((match) => (
          <li key={match.id}>
            <Link to={`/matches/${match.id}`}>
              {new Date(match.utcDate).toLocaleDateString()} — matchday {match.matchday}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
