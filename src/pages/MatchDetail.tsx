import { useParams, Link } from "react-router-dom";
import { matchById, teamById } from "../data";

export default function MatchDetail() {
  const { matchId } = useParams();
  const match = matchId ? matchById(matchId) : undefined;

  if (!match) {
    return <p>Match not found.</p>;
  }

  const home = teamById(match.homeTeamId);
  const away = teamById(match.awayTeamId);

  return (
    <div>
      <p>
        <Link to="/matches">← Back to matches</Link>
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
