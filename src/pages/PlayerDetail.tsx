import { Link, useParams } from "react-router-dom";
import { competitionById, playerById, teamById } from "../data";
import { useLeague } from "../data/useLeague";

function ageFrom(dateOfBirth: string | null): number | null {
  if (!dateOfBirth) return null;
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const beforeBirthday =
    now.getMonth() < dob.getMonth() ||
    (now.getMonth() === dob.getMonth() && now.getDate() < dob.getDate());
  if (beforeBirthday) age -= 1;
  return age;
}

export default function PlayerDetail() {
  const { competitionId, playerId } = useParams();
  const competition = competitionId ? competitionById(competitionId) : undefined;
  const { data, error, loading } = useLeague(competitionId);

  if (error) return <p>Couldn't load this competition: {error.message}</p>;
  if (loading) return <p>Loading…</p>;
  if (!data) return null;

  const player = playerId ? playerById(data, playerId) : undefined;
  if (!player) return <p>Player not found.</p>;

  const team = teamById(data, player.teamId);
  const age = ageFrom(player.dateOfBirth);

  return (
    <div>
      <p>
        <Link to={`/players/${competitionId}`}>← Back to {competition?.name ?? "players"}</Link>
      </p>
      <h1>{player.name}</h1>
      <p>
        {player.position ?? "Position unknown"} ·{" "}
        {team ? <Link to={`/teams/${competitionId}/${team.id}`}>{team.name}</Link> : player.teamId}
      </p>
      <p>
        {player.nationality}
        {age !== null && ` · Age ${age}`}
        {player.dateOfBirth && ` · Born ${new Date(player.dateOfBirth).toLocaleDateString()}`}
      </p>
    </div>
  );
}
