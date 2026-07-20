import { Link, useParams } from "react-router-dom";
import { competitionById, matchById, teamById } from "../data";
import { useLeague } from "../data/useLeague";
import { applyLive, useLiveData } from "../data/live";

export default function MatchDetail() {
  const { competitionId, matchId } = useParams();
  const competition = competitionId ? competitionById(competitionId) : undefined;
  const { data, error, loading } = useLeague(competitionId);
  const live = useLiveData();

  if (error) return <p>Couldn't load this competition: {error.message}</p>;
  if (loading) return <p>Loading…</p>;
  if (!data) return null;

  const rawMatch = matchId ? matchById(data, matchId) : undefined;
  if (!rawMatch) return <p>Match not found.</p>;
  const match = applyLive([rawMatch], live, competitionId)[0];

  const home = teamById(data, match.homeTeamId);
  const away = teamById(data, match.awayTeamId);
  const isLive = match.status === "in-play" || match.status === "paused";
  const clock = match.status === "paused" ? "HT" : match.minute;

  return (
    <div>
      <p>
        <Link to={`/matches/${competitionId}`}>← Back to {competition?.name ?? "matches"}</Link>
      </p>
      <h1>
        {home?.name ?? match.homeTeamId} vs {away?.name ?? match.awayTeamId}
      </h1>
      <p>
        Matchday {match.matchday} · {new Date(match.utcDate).toLocaleString()} ·{" "}
        {isLive && <span className="live-dot" aria-label="Live" />}
        {isLive && clock ? `${clock}'` : match.status}
      </p>
      <p style={{ fontSize: "2rem" }}>
        {match.homeTeam.goals} – {match.awayTeam.goals}
      </p>
    </div>
  );
}
