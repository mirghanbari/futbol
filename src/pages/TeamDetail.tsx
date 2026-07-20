import { Link, useParams } from "react-router-dom";
import { competitionById, matchesByTeam, teamById } from "../data";
import { useLeague } from "../data/useLeague";

export default function TeamDetail() {
  const { competitionId, teamId } = useParams();
  const competition = competitionId ? competitionById(competitionId) : undefined;
  const { data, error, loading } = useLeague(competitionId);

  if (error) return <p>Couldn't load this competition: {error.message}</p>;
  if (loading) return <p>Loading…</p>;
  if (!data) return null;

  const team = teamId ? teamById(data, teamId) : undefined;
  if (!team) return <p>Team not found.</p>;

  const fixtures = teamId ? matchesByTeam(data, teamId) : [];

  return (
    <div>
      <p>
        <Link to={`/teams/${competitionId}`}>← Back to {competition?.name ?? "teams"}</Link>
      </p>
      <h1>{team.name}</h1>
      <h2>Fixtures</h2>
      <ul>
        {fixtures.map((match) => (
          <li key={match.id}>
            <Link to={`/matches/${competitionId}/${match.id}`}>
              {new Date(match.utcDate).toLocaleDateString()} — matchday {match.matchday}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
