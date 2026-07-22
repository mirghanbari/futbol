import { Link, useParams } from "react-router-dom";
import { matchById, teamById } from "../data";
import { useCompetitionPage } from "../data/useCompetitionPage";
import { LeagueStatus } from "../components/LeagueStatus";
import { applyLive, useLiveData } from "../data/live";
import { useSeo } from "../data/seo";
import type { Match, MatchAdvancedStats } from "../data/types";

// schema.org's EventStatusType has no "finished"/"live" value — only
// postponed/cancelled are worth flagging explicitly, everything else is left
// as the default EventScheduled.
function eventStatus(status: Match["status"]): string | undefined {
  if (status === "postponed") return "https://schema.org/EventPostponed";
  if (status === "cancelled") return "https://schema.org/EventCancelled";
  return undefined;
}

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
      <span className="source-badge">FotMob</span>
      <table style={{ marginTop: "0.75rem" }}>
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
  const { competition, data, error, loading } = useCompetitionPage(competitionId);
  const live = useLiveData();

  const rawMatch = data && matchId ? matchById(data, matchId) : undefined;
  const match = rawMatch ? applyLive([rawMatch], live, competitionId)[0] : undefined;
  const home = data && match ? teamById(data, match.homeTeamId) : undefined;
  const away = data && match ? teamById(data, match.awayTeamId) : undefined;
  const status = match ? eventStatus(match.status) : undefined;

  useSeo({
    title: match && home && away ? `${home.name} vs ${away.name}` : "Match",
    description:
      match && home && away
        ? `${home.name} vs ${away.name} — ${competition?.name ?? "match"} on ${new Date(match.utcDate).toLocaleDateString()}.`
        : undefined,
    jsonLd:
      match && home && away
        ? {
            "@context": "https://schema.org",
            "@type": "SportsEvent",
            name: `${home.name} vs ${away.name}`,
            startDate: match.utcDate,
            ...(status ? { eventStatus: status } : {}),
            homeTeam: { "@type": "SportsTeam", name: home.name },
            awayTeam: { "@type": "SportsTeam", name: away.name },
          }
        : undefined,
  });

  if (error || loading) return <LeagueStatus error={error} loading={loading} />;
  if (!data) return null;
  if (!rawMatch || !match) return <p>Match not found.</p>;

  const isLive = match.status === "in-play" || match.status === "paused";
  const isHalfTime = match.status === "paused";
  const clock = isHalfTime ? "HT" : match.minute;

  return (
    <div>
      <p>
        <Link to={`/matches/${competitionId}`}>← Back to {competition?.name ?? "matches"}</Link>
      </p>

      <div className="card">
        <div className="match-head">
          <Link className="match-head-team" to={`/teams/${competitionId}/${match.homeTeamId}`}>
            {home?.crest && <img className="crest" src={home.crest} alt="" />}
            {home?.name ?? match.homeTeamId}
          </Link>
          <div className="score-big">
            {match.homeTeam.goals} – {match.awayTeam.goals}
          </div>
          <Link className="match-head-team" to={`/teams/${competitionId}/${match.awayTeamId}`}>
            {away?.crest && <img className="crest" src={away.crest} alt="" />}
            {away?.name ?? match.awayTeamId}
          </Link>
        </div>
      </div>
      <p className="match-meta">
        {match.matchday !== null && `Matchday ${match.matchday} · `}
        {new Date(match.utcDate).toLocaleString()} ·{" "}
        {isLive && <span className="live-dot" aria-label="Live" />}
        {isLive && clock ? (isHalfTime ? clock : `${clock}'`) : match.status}
      </p>

      {match.stats && (
        <div className="card">
          <StatsTable home={match.stats.home} away={match.stats.away} />
        </div>
      )}
    </div>
  );
}
