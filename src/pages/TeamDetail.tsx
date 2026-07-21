import { Link, useParams } from "react-router-dom";
import { matchesByTeam, playersByTeam, teamById } from "../data";
import { useCompetitionPage } from "../data/useCompetitionPage";
import { LeagueStatus } from "../components/LeagueStatus";
import type { Player, Position } from "../data/types";
import { FavoriteStar } from "../components/FavoriteStar";
import { useSeo } from "../data/seo";

const POSITION_ORDER: Position[] = ["Goalkeeper", "Defender", "Midfielder", "Forward"];

function groupByPosition(players: Player[]): [string, Player[]][] {
  const groups = new Map<string, Player[]>();
  for (const p of players) {
    const key = p.position ?? "Unknown";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(p);
  }
  const ordered: [string, Player[]][] = [];
  for (const pos of POSITION_ORDER) {
    if (groups.has(pos)) ordered.push([pos, groups.get(pos)!]);
    groups.delete(pos);
  }
  for (const [key, players] of groups) ordered.push([key, players]);
  return ordered;
}

export default function TeamDetail() {
  const { competitionId, teamId } = useParams();
  const { competition, data, error, loading } = useCompetitionPage(competitionId);
  const team = data && teamId ? teamById(data, teamId) : undefined;

  useSeo({
    title: team ? team.name : "Team",
    description: team && competition ? `Squad and fixtures for ${team.name} in ${competition.name}.` : undefined,
    jsonLd:
      team && competition
        ? {
            "@context": "https://schema.org",
            "@type": "SportsTeam",
            name: team.name,
            sport: "Football",
            memberOf: { "@type": "SportsLeague", name: competition.name },
          }
        : undefined,
  });

  if (error || loading) return <LeagueStatus error={error} loading={loading} />;
  if (!data) return null;
  if (!team) return <p>Team not found.</p>;

  const fixtures = teamId ? matchesByTeam(data, teamId) : [];
  const squad = teamId ? playersByTeam(data, teamId) : [];
  const squadByPosition = groupByPosition(squad);

  return (
    <div>
      <p>
        <Link to={`/teams/${competitionId}`}>← Back to {competition?.name ?? "teams"}</Link>
      </p>
      <h1 style={{ display: "flex", alignItems: "center", gap: "0.7rem" }}>
        {team.crest && <img className="crest" src={team.crest} alt="" style={{ width: 32, height: 32 }} />}
        {team.name}
        {competitionId && <FavoriteStar teamId={team.id} competitionId={competitionId} className="fav-star-lg" />}
      </h1>

      {squad.length > 0 && (
        <>
          <h2>Squad</h2>
          {squadByPosition.map(([position, players]) => (
            <div key={position} style={{ marginBottom: "1.25rem" }}>
              <h3 style={{ fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--muted)", marginBottom: "0.5rem" }}>
                {position}
              </h3>
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "0.4rem" }}>
                {players.map((p) => (
                  <li key={p.id}>
                    <Link to={`/players/${competitionId}/${p.id}`} style={{ fontWeight: 700, textDecoration: "none" }}>
                      {p.name}
                    </Link>
                    <span style={{ color: "var(--muted)" }}> · {p.nationality}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </>
      )}

      <h2>Fixtures</h2>
      {fixtures.map((match) => {
        const isHome = match.homeTeamId === teamId;
        const opponentId = isHome ? match.awayTeamId : match.homeTeamId;
        const opponent = teamById(data, opponentId);
        const played = match.status === "finished";
        return (
          <Link className="match-row" to={`/matches/${competitionId}/${match.id}`} key={match.id}>
            <div className="match-team-row">
              <span style={{ color: "var(--muted)", fontWeight: 600 }}>{isHome ? "vs" : "@"}</span>
              {opponent?.crest && <img className="crest" src={opponent.crest} alt="" />}
              <span>{opponent?.name ?? opponentId}</span>
            </div>
            <span className="match-status">
              {played
                ? `${match.homeTeam.goals}–${match.awayTeam.goals}`
                : new Date(match.utcDate).toLocaleDateString()}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
