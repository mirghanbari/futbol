import { Link, useParams } from "react-router-dom";
import { useCompetitionPage } from "../data/useCompetitionPage";
import { LeagueStatus } from "../components/LeagueStatus";
import { FavoriteStar } from "../components/FavoriteStar";
import { useSeo } from "../data/seo";

export default function Teams() {
  const { competitionId } = useParams();
  const { competition, data, error, loading } = useCompetitionPage(competitionId);

  useSeo({
    title: `${competition?.name ?? competitionId ?? "Teams"} Teams`,
    description: competition ? `All teams competing in ${competition.name}.` : undefined,
  });

  return (
    <div>
      <h1>{competition?.name ?? competitionId} teams</h1>

      <LeagueStatus error={error} loading={loading} />

      {data && data.teams.length === 0 && (
        <p>No team data yet for this competition — run `npm run ingest`.</p>
      )}
      {data && (
        <div className="team-grid">
          {data.teams.map((team) => (
            <Link
              className="team-card team-card-link team-card-fav"
              to={`/teams/${competitionId}/${team.id}`}
              key={team.id}
            >
              {team.crest && <img className="crest" src={team.crest} alt="" />}
              {team.name}
              {competitionId && <FavoriteStar teamId={team.id} competitionId={competitionId} />}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
