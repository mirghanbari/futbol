import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { playerById, teamById } from "../data";
import { useCompetitionPage } from "../data/useCompetitionPage";
import { LeagueStatus } from "../components/LeagueStatus";
import { useSeo } from "../data/seo";
import { teamAdvancedAverages, type TeamAdvancedAverages } from "../data/teamStats";
import type { PlayerSeasonStats } from "../data/types";
import type { LeagueData } from "../data";

type Tier = "basic" | "advanced" | "elite";

const TIERS: { id: Tier; label: string }[] = [
  { id: "basic", label: "Basic" },
  { id: "advanced", label: "Advanced" },
  { id: "elite", label: "Elite" },
];

// Rate stats (per-90, shot accuracy, avg rating) need a minimum sample so one
// substitute appearance can't top a leaderboard on a fluke — same idea as
// World Cup's stats.ts qualifying-threshold pattern (see PLAN.md), simplified
// to a fixed minimum rather than a dynamic average-based one.
const MIN_MINUTES_FOR_RATE = 450; // ~5 full matches
const MIN_APPS_FOR_RATING = 5;
const MIN_SHOTS_FOR_ACCURACY = 10;

interface PlayerCategory {
  type: "player";
  id: string;
  label: string;
  tier: Tier;
  source: "FotMob" | "Derived";
  caption: string;
  unit?: string;
  decimals?: number;
  qualifies?: (s: PlayerSeasonStats) => boolean;
  value: (s: PlayerSeasonStats) => number | undefined;
}

interface TeamCategory {
  type: "team";
  id: string;
  label: string;
  tier: Tier;
  source: "FotMob";
  caption: string;
  unit?: string;
  decimals?: number;
  value: (t: TeamAdvancedAverages) => number | undefined;
}

type StatCategory = PlayerCategory | TeamCategory;

const CATEGORIES: StatCategory[] = [
  // ---- Basic: simple counting stats ----
  { type: "player", id: "goals", label: "Goals", tier: "basic", source: "FotMob", caption: "Player stat", value: (s) => s.goals },
  { type: "player", id: "assists", label: "Assists", tier: "basic", source: "FotMob", caption: "Player stat", value: (s) => s.assists },
  {
    type: "player",
    id: "shotsOnTarget",
    label: "Shots on target",
    tier: "basic",
    source: "FotMob",
    caption: "Player stat",
    value: (s) => s.shotsOnTarget,
  },
  { type: "player", id: "minutes", label: "Minutes played", tier: "basic", source: "FotMob", caption: "Player stat", value: (s) => s.minutes },
  {
    type: "player",
    id: "matchesPlayed",
    label: "Appearances",
    tier: "basic",
    source: "FotMob",
    caption: "Player stat",
    value: (s) => s.matchesPlayed,
  },

  // ---- Advanced: underlying FotMob metrics + team-level match stats ----
  { type: "player", id: "xg", label: "Expected goals (xG)", tier: "advanced", source: "FotMob", caption: "Player stat", decimals: 2, value: (s) => s.xg },
  { type: "player", id: "xa", label: "Expected assists (xA)", tier: "advanced", source: "FotMob", caption: "Player stat", decimals: 2, value: (s) => s.xa },
  { type: "player", id: "shots", label: "Shots", tier: "advanced", source: "FotMob", caption: "Player stat", value: (s) => s.shots },
  { type: "player", id: "tackles", label: "Tackles", tier: "advanced", source: "FotMob", caption: "Player stat", value: (s) => s.tackles },
  {
    type: "player",
    id: "interceptions",
    label: "Interceptions",
    tier: "advanced",
    source: "FotMob",
    caption: "Player stat",
    value: (s) => s.interceptions,
  },
  { type: "player", id: "clearances", label: "Clearances", tier: "advanced", source: "FotMob", caption: "Player stat", value: (s) => s.clearances },
  { type: "player", id: "duelsWon", label: "Duels won", tier: "advanced", source: "FotMob", caption: "Player stat", value: (s) => s.duelsWon },
  {
    type: "team",
    id: "possession",
    label: "Possession",
    tier: "advanced",
    source: "FotMob",
    caption: "Team stat · season avg",
    unit: "%",
    decimals: 1,
    value: (t) => t.avgPossession,
  },
  {
    type: "team",
    id: "teamXg",
    label: "Expected goals (xG) per match",
    tier: "advanced",
    source: "FotMob",
    caption: "Team stat · season avg",
    decimals: 2,
    value: (t) => t.avgXg,
  },
  {
    type: "team",
    id: "teamShots",
    label: "Shots per match",
    tier: "advanced",
    source: "FotMob",
    caption: "Team stat · season avg",
    decimals: 1,
    value: (t) => t.avgShots,
  },

  // ---- Elite: computed rate stats, minimum sample required ----
  {
    type: "player",
    id: "avgRating",
    label: "Average rating",
    tier: "elite",
    source: "FotMob",
    caption: `Player stat · min ${MIN_APPS_FOR_RATING} apps`,
    decimals: 2,
    qualifies: (s) => s.matchesPlayed >= MIN_APPS_FOR_RATING,
    value: (s) => s.avgRating ?? undefined,
  },
  {
    type: "player",
    id: "goalsPer90",
    label: "Goals per 90",
    tier: "elite",
    source: "Derived",
    caption: `Player stat · min ${MIN_MINUTES_FOR_RATE} mins`,
    decimals: 2,
    qualifies: (s) => s.minutes >= MIN_MINUTES_FOR_RATE,
    value: (s) => (s.goals / s.minutes) * 90,
  },
  {
    type: "player",
    id: "contributionsPer90",
    label: "Goal contributions per 90",
    tier: "elite",
    source: "Derived",
    caption: `Player stat · min ${MIN_MINUTES_FOR_RATE} mins`,
    decimals: 2,
    qualifies: (s) => s.minutes >= MIN_MINUTES_FOR_RATE,
    value: (s) => ((s.goals + s.assists) / s.minutes) * 90,
  },
  {
    type: "player",
    id: "shotAccuracy",
    label: "Shot accuracy",
    tier: "elite",
    source: "Derived",
    caption: `Player stat · min ${MIN_SHOTS_FOR_ACCURACY} shots`,
    unit: "%",
    decimals: 1,
    qualifies: (s) => s.shots >= MIN_SHOTS_FOR_ACCURACY,
    value: (s) => (s.shotsOnTarget / s.shots) * 100,
  },
];

interface Row {
  id: string;
  value: number;
}

function rowsFor(category: StatCategory, data: LeagueData): Row[] {
  if (category.type === "player") {
    return data.playerStats
      .filter((s) => !category.qualifies || category.qualifies(s))
      .map((s) => ({ id: s.playerId, value: category.value(s) }))
      .filter((r): r is Row => typeof r.value === "number" && r.value > 0)
      .sort((a, b) => b.value - a.value);
  }
  return teamAdvancedAverages(data)
    .map((t) => ({ id: t.teamId, value: category.value(t) }))
    .filter((r): r is Row => typeof r.value === "number")
    .sort((a, b) => b.value - a.value);
}

function formatValue(value: number, category: StatCategory): string {
  const formatted = category.decimals !== undefined ? value.toFixed(category.decimals) : String(Math.round(value));
  return category.unit ? `${formatted}${category.unit}` : formatted;
}

function Leaderboard({
  data,
  competitionId,
  category,
  rows,
}: {
  data: LeagueData;
  competitionId: string;
  category: StatCategory;
  rows: Row[];
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? rows : rows.slice(0, 5);

  return (
    <div className="card" style={{ padding: "1.1rem 1.1rem 0.6rem" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "0.5rem" }}>
        <div>
          <h3 style={{ margin: 0, fontSize: "1rem" }}>{category.label}</h3>
          <span style={{ fontSize: "0.7rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
            {category.caption}
          </span>
        </div>
        <span className="source-badge">{category.source}</span>
      </div>
      <ol style={{ listStyle: "none", margin: "0.75rem 0 0", padding: 0, display: "grid", gap: "0.55rem 0" }}>
        {visible.map((row, i) => {
          const player = category.type === "player" ? playerById(data, row.id) : undefined;
          const team = category.type === "player" ? (player ? teamById(data, player.teamId) : undefined) : teamById(data, row.id);
          // Team-stat rows use the short name (e.g. "PSG") — leaderboard cards
          // are narrow (grid columns as low as ~220px), and full legal names
          // like "Paris Saint-Germain FC" combined with a value column
          // (e.g. "63.6%") don't fit; see the flex min-width fix below too.
          const name = category.type === "player" ? (player?.name ?? row.id) : (team?.shortName ?? team?.name ?? row.id);
          const href = category.type === "player" ? `/players/${competitionId}/${row.id}` : `/teams/${competitionId}/${row.id}`;
          return (
            <li key={row.id} style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
              <span style={{ width: "1.1rem", color: "var(--muted)", fontWeight: 700, fontSize: "0.85rem" }}>
                {i + 1}
              </span>
              {team?.crest && (
                <Link to={`/teams/${competitionId}/${team.id}`} title={team.name}>
                  <img className="crest" src={team.crest} alt="" style={{ width: 18, height: 18 }} />
                </Link>
              )}
              <Link to={href} style={{ fontWeight: 700, textDecoration: "none", flex: 1, minWidth: 0 }}>
                {name}
              </Link>
              <strong className="num" style={{ flex: "none" }}>
                {formatValue(row.value, category)}
              </strong>
            </li>
          );
        })}
      </ol>
      {rows.length > 5 && (
        <button type="button" className="stat-expand-toggle" onClick={() => setExpanded((v) => !v)}>
          {expanded ? "Show top 5" : `View all ${rows.length} →`}
        </button>
      )}
    </div>
  );
}

export default function Stats() {
  const { competitionId } = useParams();
  const { competition, data, error, loading } = useCompetitionPage(competitionId);
  const [tier, setTier] = useState<Tier>("basic");

  useSeo({
    title: `${competition?.name ?? competitionId ?? "Stats"} Stats`,
    description: competition ? `Goals, assists, xG and other leaderboards for ${competition.name}.` : undefined,
  });

  const tierBoards = data
    ? CATEGORIES.filter((c) => c.tier === tier)
        .map((category) => ({ category, rows: rowsFor(category, data) }))
        .filter((board) => board.rows.length > 0)
    : [];

  return (
    <div>
      <h1>{competition?.name ?? competitionId} stats</h1>

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

      {data && data.playerStats.length > 0 && (
        <div className="tier-tabs">
          {TIERS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={"tier-tab" + (tier === t.id ? " active" : "")}
              onClick={() => setTier(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {data && data.playerStats.length > 0 && tierBoards.length === 0 && (
        <p>No {TIERS.find((t) => t.id === tier)?.label.toLowerCase()} stats qualify yet — check back once more matches have been played.</p>
      )}

      {data && competitionId && tierBoards.length > 0 && (
        <div className="stats-grid">
          {tierBoards.map(({ category, rows }) => (
            <Leaderboard key={category.id} data={data} competitionId={competitionId} category={category} rows={rows} />
          ))}
        </div>
      )}
    </div>
  );
}
