import { Link } from "react-router-dom";
import { useFavorites, type FavoriteTeam } from "../favorites";
import { competitionById, teamById } from "../data";
import { useLeague } from "../data/useLeague";
import { FavoriteStar } from "../components/FavoriteStar";

function FavoriteCard({ fav }: { fav: FavoriteTeam }) {
  const competition = competitionById(fav.competitionId);
  const { data, error, loading } = useLeague(fav.competitionId);

  if (loading || error || !data) {
    return (
      <div className="team-card">
        <strong>{competition?.name ?? fav.competitionId}</strong>
        <p style={{ opacity: 0.6, fontSize: "0.85rem", margin: "0.4rem 0 0" }}>
          {error ? `Couldn't load this competition: ${error.message}` : "Loading…"}
        </p>
      </div>
    );
  }

  const team = teamById(data, fav.teamId);
  const standing = data.standings.find((s) => s.id === fav.teamId);
  const nextMatch = data.matches
    .filter((m) => (m.homeTeamId === fav.teamId || m.awayTeamId === fav.teamId) && m.status !== "finished")
    .sort((a, b) => a.utcDate.localeCompare(b.utcDate))[0];

  return (
    <div className="team-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <Link to={`/teams/${fav.competitionId}/${fav.teamId}`} style={{ color: "inherit", textDecoration: "none" }}>
          <strong>{team?.name ?? fav.teamId}</strong>
          <div style={{ opacity: 0.6, fontSize: "0.8rem" }}>{competition?.name ?? fav.competitionId}</div>
        </Link>
        <FavoriteStar teamId={fav.teamId} competitionId={fav.competitionId} />
      </div>
      {standing && (
        <p style={{ margin: "0.5rem 0 0", fontSize: "0.85rem" }}>
          #{standing.position} · {standing.points} pts · {standing.playedGames} GP
        </p>
      )}
      {nextMatch && (
        <p style={{ margin: "0.25rem 0 0", fontSize: "0.85rem", opacity: 0.75 }}>
          <Link to={`/matches/${fav.competitionId}/${nextMatch.id}`}>
            Next: {new Date(nextMatch.utcDate).toLocaleDateString()}
          </Link>
        </p>
      )}
    </div>
  );
}

export default function Favorites() {
  const favs = useFavorites();

  return (
    <div>
      <h1>Your teams</h1>

      {favs.length === 0 && <p>Star a team from its Teams page or team page to track it here.</p>}

      {favs.length > 0 && (
        <div className="team-grid">
          {favs.map((f) => (
            <FavoriteCard key={`${f.competitionId}-${f.teamId}`} fav={f} />
          ))}
        </div>
      )}
    </div>
  );
}
