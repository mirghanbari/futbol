import { Link, useParams } from "react-router-dom";
import { ageFrom, matchesByTeam, playersByTeam, statsForPlayer, teamById } from "../data";
import { useCompetitionPage } from "../data/useCompetitionPage";
import { LeagueStatus } from "../components/LeagueStatus";
import type { Player, Position } from "../data/types";
import { FavoriteStar } from "../components/FavoriteStar";
import { useSeo } from "../data/seo";
import { clZoneAtPosition, zoneAtPosition } from "../data/zones";
import type { LeagueData } from "../data";

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

function SquadTable({ players, data, competitionId }: { players: Player[]; data: LeagueData; competitionId?: string }) {
  return (
    <table>
      <thead>
        <tr>
          <th>Player</th>
          <th>Nationality</th>
          <th className="num">Age</th>
          <th className="num">Apps</th>
          <th className="num">G</th>
          <th className="num">A</th>
        </tr>
      </thead>
      <tbody>
        {players.map((p) => {
          const stats = statsForPlayer(data, p.id);
          const age = ageFrom(p.dateOfBirth);
          return (
            <tr key={p.id}>
              <td>
                <Link to={`/players/${competitionId}/${p.id}`} style={{ fontWeight: 700, textDecoration: "none" }}>
                  {p.name}
                </Link>
              </td>
              <td style={{ color: "var(--muted)" }}>{p.nationality}</td>
              <td className="num">{age ?? "—"}</td>
              <td className="num">{stats?.matchesPlayed ?? "—"}</td>
              <td className="num">{stats?.goals ?? "—"}</td>
              <td className="num">{stats?.assists ?? "—"}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
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

  const standing = teamId ? data.standings.find((s) => s.id === teamId) : undefined;
  const isLeaguePhase = competitionId === "CL";
  const zone = standing
    ? isLeaguePhase
      ? clZoneAtPosition(standing.position)
      : competitionId
        ? zoneAtPosition(competitionId, standing.position)
        : undefined
    : undefined;

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

      {standing && (
        <div className="stat-tiles">
          <div className="stat-tile">
            <div className="stat-tile-value">
              {standing.position}
              {zone && <span className={"zone-chip " + zone.className}>{zone.shortLabel}</span>}
            </div>
            <div className="stat-tile-label">{isLeaguePhase ? "League-phase position" : "Position"}</div>
          </div>
          <div className="stat-tile">
            <div className="stat-tile-value">{standing.points}</div>
            <div className="stat-tile-label">
              Points · {standing.won}W {standing.draw}D {standing.lost}L
            </div>
          </div>
          <div className="stat-tile">
            <div className="stat-tile-value">
              {standing.goalsFor}:{standing.goalsAgainst}
            </div>
            <div className="stat-tile-label">Goals for : against</div>
          </div>
          <div className="stat-tile">
            <div className="stat-tile-value">{standing.playedGames}</div>
            <div className="stat-tile-label">Games played</div>
          </div>
        </div>
      )}

      {squad.length > 0 && (
        <>
          <h2>Squad</h2>
          {squadByPosition.map(([position, players]) => (
            <div key={position} className="card" style={{ marginBottom: "1.25rem" }}>
              <h3 style={{ fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--muted)", margin: "0.6rem 0 0 0.6rem" }}>
                {position}
              </h3>
              <SquadTable players={players} data={data} competitionId={competitionId} />
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
          <div className="match-row" key={match.id}>
            <Link
              className="row-cover-link"
              to={`/matches/${competitionId}/${match.id}`}
              aria-label={`${isHome ? "vs" : "@"} ${opponent?.name ?? opponentId}`}
            />
            <div className="match-team-row">
              <span style={{ color: "var(--muted)", fontWeight: 600 }}>{isHome ? "vs" : "@"}</span>
              <Link className="row-team-link" to={`/teams/${competitionId}/${opponentId}`}>
                {opponent?.crest && <img className="crest" src={opponent.crest} alt="" />}
                <span>{opponent?.name ?? opponentId}</span>
              </Link>
            </div>
            <span className="match-status">
              {played
                ? `${match.homeTeam.goals}–${match.awayTeam.goals}`
                : new Date(match.utcDate).toLocaleDateString()}
            </span>
          </div>
        );
      })}
    </div>
  );
}
