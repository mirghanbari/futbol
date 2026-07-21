import { Link, useParams } from "react-router-dom";
import { playerById, statsForPlayer, teamById } from "../data";
import { useCompetitionPage } from "../data/useCompetitionPage";
import { LeagueStatus } from "../components/LeagueStatus";
import { useSeo } from "../data/seo";
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
  const player = data && playerId ? playerById(data, playerId) : undefined;
  const team = data && player ? teamById(data, player.teamId) : undefined;

  useSeo({
    title: player ? player.name : "Player",
    description:
      player && team ? `${player.name} (${player.position ?? "player"}) — ${team.name} profile and stats.` : undefined,
    jsonLd: player
      ? {
          "@context": "https://schema.org",
          "@type": "Person",
          name: player.name,
          nationality: player.nationality,
          ...(team ? { memberOf: { "@type": "SportsTeam", name: team.name } } : {}),
        }
      : undefined,
  });

  if (error || loading) return <LeagueStatus error={error} loading={loading} />;
  if (!data) return null;
  if (!player) return <p>Player not found.</p>;

  const age = ageFrom(player.dateOfBirth);
  const stats = statsForPlayer(data, player.id);

  return (
    <div>
      <p>
        <Link to={`/players/${competitionId}`}>← Back to {competition?.name ?? "players"}</Link>
      </p>
      <h1 style={{ display: "flex", alignItems: "center", gap: "0.7rem" }}>
        {team?.crest && <img className="crest" src={team.crest} alt="" style={{ width: 32, height: 32 }} />}
        {player.name}
      </h1>
      <p>
        {player.position ?? "Position unknown"} ·{" "}
        {team ? <Link to={`/teams/${competitionId}/${team.id}`}>{team.name}</Link> : player.teamId}
      </p>
      <p style={{ color: "var(--muted)" }}>
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
          <span className="source-badge">FotMob</span>
          <div className="card" style={{ marginTop: "0.75rem" }}>
            <table>
              <tbody>
                {STAT_LABELS.map(({ key, label }) => (
                  <tr key={key}>
                    <td style={{ color: "var(--muted)" }}>{label}</td>
                    <td className="num" style={{ textAlign: "right", fontWeight: 700 }}>
                      {stats[key] ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <p>No stats recorded yet this season.</p>
      )}
    </div>
  );
}
