import { Link, useParams } from "react-router-dom";
import { playerById, statsForPlayer, teamById } from "../data";
import { useCompetitionPage } from "../data/useCompetitionPage";
import { LeagueStatus } from "../components/LeagueStatus";
import type { PlayerSeasonStats } from "../data/types";

type StatKey = Exclude<keyof PlayerSeasonStats, "playerId" | "season">;

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

const STAT_LABELS: { key: StatKey; label: string }[] = [
  { key: "matchesPlayed", label: "Appearances" },
  { key: "minutes", label: "Minutes" },
  { key: "goals", label: "Goals" },
  { key: "assists", label: "Assists" },
  { key: "xg", label: "xG" },
  { key: "xa", label: "xA" },
  { key: "shots", label: "Shots" },
  { key: "shotsOnTarget", label: "Shots on target" },
  { key: "tackles", label: "Tackles" },
  { key: "interceptions", label: "Interceptions" },
  { key: "clearances", label: "Clearances" },
  { key: "duelsWon", label: "Duels won" },
  { key: "avgRating", label: "Avg. rating" },
];

export default function PlayerDetail() {
  const { competitionId, playerId } = useParams();
  const { competition, data, error, loading } = useCompetitionPage(competitionId);

  if (error || loading) return <LeagueStatus error={error} loading={loading} />;
  if (!data) return null;

  const player = playerId ? playerById(data, playerId) : undefined;
  if (!player) return <p>Player not found.</p>;

  const team = teamById(data, player.teamId);
  const age = ageFrom(player.dateOfBirth);
  const stats = statsForPlayer(data, player.id);

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

      {data.isFallbackStats && (
        <p className="season-banner">Showing {data.statsSeason ?? "last"} season stats.</p>
      )}

      {stats ? (
        <>
          <h2>{data.statsSeason ?? "Season"} stats</h2>
          <p style={{ opacity: 0.7, fontSize: "0.85rem" }}>Source: FotMob</p>
          <table>
            <tbody>
              {STAT_LABELS.map(({ key, label }) => (
                <tr key={key}>
                  <td style={{ opacity: 0.7 }}>{label}</td>
                  <td>{stats[key] ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : (
        <p>No stats recorded yet this season.</p>
      )}
    </div>
  );
}
