import { Link, useParams } from "react-router-dom";
import { competitionById, matchById, teamById } from "../data";
import { useLeague } from "../data/useLeague";

export default function MatchDetail() {
  const { competitionId, matchId } = useParams();
  const competition = competitionId ? competitionById(competitionId) : undefined;
  const { data, error, loading } = useLeague(competitionId);

  if (error) return <p>Couldn't load this competition: {error.message}</p>;
  if (loading) return <p>Loading…</p>;
  if (!data) return null;

  const match = matchId ? matchById(data, matchId) : undefined;
  if (!match) return <p>Match not found.</p>;

  const home = teamById(data, match.homeTeamId);
  const away = teamById(data, match.awayTeamId);

  return (
    <div>
      <p>
        <Link to={`/matches/${competitionId}`}>← Back to {competition?.name ?? "matches"}</Link>
      </p>
      <h1>
        {home?.name ?? match.homeTeamId} vs {away?.name ?? match.awayTeamId}
      </h1>
      <p>
        Matchday {match.matchday} · {new Date(match.utcDate).toLocaleString()} · {match.status}
      </p>
      <p style={{ fontSize: "2rem" }}>
        {match.homeTeam.goals} – {match.awayTeam.goals}
      </p>
    </div>
  );
}
