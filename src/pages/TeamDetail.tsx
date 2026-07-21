import { Link, useParams } from "react-router-dom";
import { matchesByTeam, playersByTeam, teamById } from "../data";
import { useCompetitionPage } from "../data/useCompetitionPage";
import { LeagueStatus } from "../components/LeagueStatus";
import type { Player, Position } from "../data/types";
import { FavoriteStar } from "../components/FavoriteStar";

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

  if (error || loading) return <LeagueStatus error={error} loading={loading} />;
  if (!data) return null;

  const team = teamId ? teamById(data, teamId) : undefined;
  if (!team) return <p>Team not found.</p>;

  const fixtures = teamId ? matchesByTeam(data, teamId) : [];
  const squad = teamId ? playersByTeam(data, teamId) : [];
  const squadByPosition = groupByPosition(squad);

  return (
    <div>
      <p>
        <Link to={`/teams/${competitionId}`}>← Back to {competition?.name ?? "teams"}</Link>
      </p>
      <h1>
        {team.name}
        {competitionId && <FavoriteStar teamId={team.id} competitionId={competitionId} className="fav-star-lg" />}
      </h1>

      {squad.length > 0 && (
        <>
          <h2>Squad</h2>
          {squadByPosition.map(([position, players]) => (
            <div key={position} style={{ marginBottom: "1rem" }}>
              <h3>{position}</h3>
              <ul>
                {players.map((p) => (
                  <li key={p.id}>
                    <Link to={`/players/${competitionId}/${p.id}`}>{p.name}</Link>
                    {" · "}
                    {p.nationality}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </>
      )}

      <h2>Fixtures</h2>
      <ul>
        {fixtures.map((match) => (
          <li key={match.id}>
            <Link to={`/matches/${competitionId}/${match.id}`}>
              {new Date(match.utcDate).toLocaleDateString()}
              {match.matchday !== null && ` — matchday ${match.matchday}`}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
