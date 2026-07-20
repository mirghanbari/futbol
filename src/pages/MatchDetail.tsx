import { Link, useParams } from "react-router-dom";
import { competitionById, matchById, teamById } from "../data";
import { useLeague } from "../data/useLeague";
import { applyLive, useLiveData } from "../data/live";
import type { MatchAdvancedStats } from "../data/types";

interface StatRowDef {
  key: keyof MatchAdvancedStats;
  label: string;
  suffix?: string;
}

const STAT_ROWS: StatRowDef[] = [
  { key: "possession", label: "Possession", suffix: "%" },
  { key: "xg", label: "Expected goals (xG)" },
  { key: "shots", label: "Shots" },
  { key: "shotsOnTarget", label: "Shots on target" },
  { key: "accuratePasses", label: "Accurate passes" },
  { key: "duelsWon", label: "Duels won" },
  { key: "boxTouches", label: "Touches in opposition box" },
  { key: "corners", label: "Corners" },
  { key: "fouls", label: "Fouls" },
  { key: "offsides", label: "Offsides" },
  { key: "saves", label: "Saves" },
];

function StatsTable({ home, away }: { home: MatchAdvancedStats; away: MatchAdvancedStats }) {
  const rows = STAT_ROWS.filter((row) => home[row.key] !== undefined || away[row.key] !== undefined);
  if (rows.length === 0) return null;

  return (
    <div>
      <h2>Match stats</h2>
      <p style={{ opacity: 0.7, fontSize: "0.85rem" }}>Source: FotMob</p>
      <table>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <td style={{ textAlign: "right" }}>
                {home[row.key] ?? "—"}
                {row.suffix ?? ""}
              </td>
              <td style={{ textAlign: "center", opacity: 0.7 }}>{row.label}</td>
              <td>
                {away[row.key] ?? "—"}
                {row.suffix ?? ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

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

      {match.stats && <StatsTable home={match.stats.home} away={match.stats.away} />}
    </div>
  );
}
