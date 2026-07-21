import { useParams } from "react-router-dom";
import { useCompetitionPage } from "../data/useCompetitionPage";
import { LeagueStatus } from "../components/LeagueStatus";
import { useSeo } from "../data/seo";
import { clZoneAtPosition } from "../data/zones";

export default function Standings() {
  const { competitionId } = useParams();
  const { competition, data, error, loading, isPriorSeason } = useCompetitionPage(competitionId);
  const isLeaguePhase = competitionId === "CL";

  useSeo({
    title: `${competition?.name ?? competitionId ?? "Standings"} Standings`,
    description: competition
      ? `${competition.name} table for the ${competition.season} season — points, goal difference and form.`
      : undefined,
    jsonLd: competition
      ? { "@context": "https://schema.org", "@type": "SportsLeague", name: competition.name, sport: "Football" }
      : undefined,
  });

  return (
    <div>
      <h1>{competition?.name ?? competitionId} standings</h1>

      <LeagueStatus error={error} loading={loading} />

      {isPriorSeason && (
        <p className="season-banner">
          Showing the {competition?.season}–{competition?.season ? Number(competition.season) + 1 : ""} season —
          the new league-phase fixture list hasn't been published yet.
        </p>
      )}

      {isLeaguePhase && data && data.standings.length > 0 && (
        <p style={{ opacity: 0.7, fontSize: "0.85rem" }}>
          Top 8 advance directly to the Round of 16; 9th–24th go to a knockout playoff; 25th–36th are eliminated.
        </p>
      )}

      {data && (
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Team</th>
              <th>P</th>
              <th>W</th>
              <th>D</th>
              <th>L</th>
              <th>GD</th>
              <th>Pts</th>
            </tr>
          </thead>
          <tbody>
            {data.standings.map((row) => {
              const zone = isLeaguePhase ? clZoneAtPosition(row.position) : undefined;
              return (
                <tr key={row.id} className={zone?.className}>
                  <td>{row.position}</td>
                  <td>{row.name}</td>
                  <td>{row.playedGames}</td>
                  <td>{row.won}</td>
                  <td>{row.draw}</td>
                  <td>{row.lost}</td>
                  <td>{row.goalDifference}</td>
                  <td>{row.points}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {data && data.standings.length === 0 && (
        <p>No standings data yet for this competition — run `npm run ingest`.</p>
      )}
    </div>
  );
}
