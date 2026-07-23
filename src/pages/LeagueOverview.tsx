import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { playerById, teamById } from "../data";
import { useCompetitionPage } from "../data/useCompetitionPage";
import { LeagueStatus } from "../components/LeagueStatus";
import { useSeo } from "../data/seo";
import type { LeagueData } from "../data";
import type { Match } from "../data/types";

const RECENT_MATCHDAYS = 8;

interface MatchdayGoals {
  matchday: number;
  goals: number;
}

// Only regular-season/league-phase matches carry a round-robin "matchday" —
// knockout ties reuse the field to mean "leg 1"/"leg 2" (see MatchStage in
// types.ts), which isn't a meaningful bucket for a goals-per-round chart.
function goalsByMatchday(matches: Match[]): MatchdayGoals[] {
  const totals = new Map<number, number>();
  for (const match of matches) {
    if (match.status !== "finished") continue;
    if (match.stage !== "regular" && match.stage !== "league-phase") continue;
    if (match.matchday === null) continue;
    totals.set(match.matchday, (totals.get(match.matchday) ?? 0) + match.homeTeam.goals + match.awayTeam.goals);
  }
  return [...totals.entries()]
    .map(([matchday, goals]) => ({ matchday, goals }))
    .sort((a, b) => a.matchday - b.matchday);
}

function TopScorers({ data, competitionId }: { data: LeagueData; competitionId: string }) {
  const rows = [...data.playerStats]
    .filter((s) => s.goals > 0)
    .sort((a, b) => b.goals - a.goals)
    .slice(0, 5);
  if (rows.length === 0) return null;

  return (
    <div className="card" style={{ padding: "1.1rem 1.1rem 0.6rem" }}>
      <h3 style={{ margin: "0 0 0.5rem" }}>Top scorers</h3>
      <table>
        <thead>
          <tr>
            <th>Player</th>
            <th className="num">G</th>
            <th className="num">A</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => {
            const player = playerById(data, s.playerId);
            const team = player ? teamById(data, player.teamId) : undefined;
            return (
              <tr key={s.playerId}>
                <td>
                  <Link
                    to={`/players/${competitionId}/${s.playerId}`}
                    style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontWeight: 700, textDecoration: "none" }}
                  >
                    {team?.crest && <img className="crest" src={team.crest} alt="" style={{ width: 18, height: 18 }} />}
                    {player?.name ?? s.playerId}
                  </Link>
                </td>
                <td className="num">{s.goals}</td>
                <td className="num">{s.assists}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function GoalsByMatchday({ matches }: { matches: Match[] }) {
  const [expanded, setExpanded] = useState(false);
  const rows = goalsByMatchday(matches);
  if (rows.length === 0) return null;
  const visible = expanded ? rows : rows.slice(-RECENT_MATCHDAYS);
  // Scaled against the season's max, not just the visible slice's — so a
  // bar's width means the same thing whether the chart is collapsed or
  // expanded, and clicking "View all" doesn't visibly rescale bars that
  // were already on screen.
  const max = Math.max(...rows.map((r) => r.goals));

  return (
    <div className="card" style={{ padding: "1.1rem 1.1rem 0.6rem" }}>
      <h3 style={{ margin: "0 0 0.75rem" }}>Goals by matchday</h3>
      <div>
        {visible.map((row) => (
          <div className="bar-row" key={row.matchday} role="img" aria-label={`Matchday ${row.matchday}: ${row.goals} goals`}>
            <span className="bar-label" aria-hidden="true">
              MD {row.matchday}
            </span>
            <span className="bar-track" aria-hidden="true">
              <span className="bar-fill" style={{ width: `${max > 0 ? (row.goals / max) * 100 : 0}%` }} />
            </span>
            <strong className="bar-value" aria-hidden="true">
              {row.goals}
            </strong>
          </div>
        ))}
      </div>
      {rows.length > RECENT_MATCHDAYS && (
        <button type="button" className="stat-expand-toggle" onClick={() => setExpanded((v) => !v)}>
          {expanded ? `Show last ${RECENT_MATCHDAYS}` : `View all ${rows.length} →`}
        </button>
      )}
    </div>
  );
}

function LatestResults({ data, competitionId }: { data: LeagueData; competitionId: string }) {
  const rows = [...data.matches]
    .filter((m) => m.status === "finished")
    .sort((a, b) => b.utcDate.localeCompare(a.utcDate))
    .slice(0, 5);
  if (rows.length === 0) return null;

  return (
    <div>
      <h3 style={{ margin: "0 0 0.6rem" }}>Latest results</h3>
      {rows.map((match) => {
        const home = teamById(data, match.homeTeamId);
        const away = teamById(data, match.awayTeamId);
        return (
          <div className="match-row" key={match.id}>
            <Link
              className="row-cover-link"
              to={`/matches/${competitionId}/${match.id}`}
              aria-label={`${home?.name ?? match.homeTeamId} vs ${away?.name ?? match.awayTeamId}`}
            />
            <div className="match-team-row">
              <Link className="row-team-link" to={`/teams/${competitionId}/${match.homeTeamId}`}>
                {home?.crest && <img className="crest" src={home.crest} alt="" />}
                <span>{home?.shortName ?? match.homeTeamId}</span>
              </Link>
              <span style={{ color: "var(--muted)", fontWeight: 600 }}>vs</span>
              <Link className="row-team-link" to={`/teams/${competitionId}/${match.awayTeamId}`}>
                {away?.crest && <img className="crest" src={away.crest} alt="" />}
                <span>{away?.shortName ?? match.awayTeamId}</span>
              </Link>
            </div>
            <span className="match-status">
              {match.homeTeam.goals}–{match.awayTeam.goals}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function LeagueOverview() {
  const { competitionId } = useParams();
  const { competition, data, error, loading } = useCompetitionPage(competitionId);

  useSeo({
    title: competition ? `${competition.name} Overview` : "Overview",
    description: competition ? `Stats, top scorers and latest results for ${competition.name}.` : undefined,
  });

  if (error || loading) return <LeagueStatus error={error} loading={loading} />;
  if (!data || !competition || !competitionId) return null;

  const finished = data.matches.filter((m) => m.status === "finished");
  const totalGoals = finished.reduce((sum, m) => sum + m.homeTeam.goals + m.awayTeam.goals, 0);
  const avgGoals = finished.length > 0 ? (totalGoals / finished.length).toFixed(1) : null;

  return (
    <div>
      <div className="hero">
        <div className="hero-ball"></div>
        <h1>{competition.name}</h1>
        <p>
          {competition.country}
          {competition.season ? ` · ${competition.season} season` : ""}
        </p>
      </div>

      {data.isFallbackStats && (
        <p className="season-banner">
          Showing {data.statsSeason ?? "last"} season — {competition.name}'s current season hasn't kicked off yet.
        </p>
      )}

      <div className="stat-tiles">
        <div className="stat-tile">
          <div className="stat-tile-value">{finished.length}</div>
          <div className="stat-tile-label">Matches played · {data.matches.length} total</div>
        </div>
        <div className="stat-tile">
          <div className="stat-tile-value">{totalGoals}</div>
          <div className="stat-tile-label">Goals scored{avgGoals ? ` · ${avgGoals} / match` : ""}</div>
        </div>
        <div className="stat-tile">
          <div className="stat-tile-value">{data.teams.length}</div>
          <div className="stat-tile-label">Teams</div>
        </div>
        <div className="stat-tile">
          <div className="stat-tile-value">{data.players.length}</div>
          <div className="stat-tile-label">Players tracked</div>
        </div>
      </div>

      {finished.length === 0 && (
        <p style={{ color: "var(--muted)" }}>No matches played yet this season — check back once fixtures kick off.</p>
      )}

      {/* Top scorers is driven by playerStats, which already falls back to
          last season's real data via isFallbackStats/isSeasonNotStarted
          (see src/data/index.ts) — it can render even when `finished` above
          is empty, so it's not gated on it like the two matches-derived
          panels below (which naturally render nothing of their own accord
          when there's no finished-match data to draw from). */}
      <div className="stats-grid" style={{ marginTop: "0.5rem" }}>
        <TopScorers data={data} competitionId={competitionId} />
        <GoalsByMatchday matches={data.matches} />
      </div>

      <div style={{ marginTop: "1.5rem" }}>
        <LatestResults data={data} competitionId={competitionId} />
      </div>
    </div>
  );
}
