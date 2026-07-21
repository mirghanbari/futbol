import { Link, useParams } from "react-router-dom";
import { playerById, teamById } from "../data";
import { useCompetitionPage } from "../data/useCompetitionPage";
import { LeagueStatus } from "../components/LeagueStatus";
import { useSeo } from "../data/seo";
import type { PlayerSeasonStats } from "../data/types";
import type { LeagueData } from "../data";

const CATEGORIES: { key: keyof PlayerSeasonStats; label: string; minMinutes?: boolean }[] = [
  { key: "goals", label: "Goals" },
  { key: "assists", label: "Assists" },
  { key: "xg", label: "Expected goals (xG)" },
  { key: "xa", label: "Expected assists (xA)" },
  { key: "tackles", label: "Tackles" },
  { key: "duelsWon", label: "Duels won" },
];

function Leaderboard({
  data,
  competitionId,
  category,
}: {
  data: LeagueData;
  competitionId: string;
  category: (typeof CATEGORIES)[number];
}) {
  const top = [...data.playerStats]
    .filter((s) => typeof s[category.key] === "number" && (s[category.key] as number) > 0)
    .sort((a, b) => (b[category.key] as number) - (a[category.key] as number))
    .slice(0, 5);

  if (top.length === 0) return null;

  return (
    <div className="card" style={{ padding: "1.1rem 1.1rem 0.6rem" }}>
      <h3 style={{ margin: "0 0 0.75rem", fontSize: "1rem" }}>{category.label}</h3>
      <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "0.55rem 0" }}>
        {top.map((s, i) => {
          const player = playerById(data, s.playerId);
          const team = player ? teamById(data, player.teamId) : undefined;
          return (
            <li key={s.playerId} style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
              <span style={{ width: "1.1rem", color: "var(--muted)", fontWeight: 700, fontSize: "0.85rem" }}>
                {i + 1}
              </span>
              {team?.crest && <img className="crest" src={team.crest} alt="" style={{ width: 18, height: 18 }} />}
              <Link
                to={`/players/${competitionId}/${s.playerId}`}
                style={{ fontWeight: 700, textDecoration: "none", flex: 1 }}
              >
                {player?.name ?? s.playerId}
              </Link>
              <strong className="num">{String(s[category.key])}</strong>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export default function Stats() {
  const { competitionId } = useParams();
  const { competition, data, error, loading } = useCompetitionPage(competitionId);

  useSeo({
    title: `${competition?.name ?? competitionId ?? "Stats"} Stats`,
    description: competition ? `Goals, assists, xG and other leaderboards for ${competition.name}.` : undefined,
  });

  return (
    <div>
      <h1>{competition?.name ?? competitionId} stats</h1>
      <span className="source-badge">FotMob</span>

      <LeagueStatus error={error} loading={loading} />

      {data?.isFallbackStats && (
        <p className="season-banner">
          Showing {data.statsSeason ?? "last"} season — {competition?.name ?? "this competition"}'s
          current season hasn't kicked off yet.
        </p>
      )}

      {data && data.playerStats.length === 0 && (
        <p>No stats recorded yet — check back once matches have been played.</p>
      )}

      {data && competitionId && (
        <div className="stats-grid">
          {CATEGORIES.map((category) => (
            <Leaderboard key={category.key} data={data} competitionId={competitionId} category={category} />
          ))}
        </div>
      )}
    </div>
  );
}
