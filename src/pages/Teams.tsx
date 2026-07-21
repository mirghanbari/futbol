import { Link, useParams } from "react-router-dom";
import { competitionById } from "../data";
import { useLeague } from "../data/useLeague";
import { FavoriteStar } from "../components/FavoriteStar";

export default function Teams() {
  const { competitionId } = useParams();
  const competition = competitionId ? competitionById(competitionId) : undefined;
  const { data, error, loading } = useLeague(competitionId);

  return (
    <div>
      <h1>{competition?.name ?? competitionId} teams</h1>

      {error && <p>Couldn't load this competition: {error.message}</p>}
      {loading && !error && <p>Loading…</p>}

      {data && data.teams.length === 0 && (
        <p>No team data yet for this competition — run `npm run ingest`.</p>
      )}
      {data && (
        <div className="team-grid">
          {data.teams.map((team) => (
            <Link
              className="team-card team-card-fav"
              to={`/teams/${competitionId}/${team.id}`}
              key={team.id}
            >
              {team.name}
              {competitionId && <FavoriteStar teamId={team.id} competitionId={competitionId} />}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
