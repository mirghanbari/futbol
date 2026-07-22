import { Link, useParams } from "react-router-dom";
import { useCompetitionPage } from "../data/useCompetitionPage";
import { LeagueStatus } from "../components/LeagueStatus";
import { useSeo } from "../data/seo";
import { clZoneAtPosition, zoneAtPosition } from "../data/zones";

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
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Team</th>
                <th className="num">P</th>
                <th className="num">W</th>
                <th className="num">D</th>
                <th className="num">L</th>
                <th className="num">GD</th>
                <th className="num">Pts</th>
              </tr>
            </thead>
            <tbody>
              {data.standings.map((row) => {
                const zone = isLeaguePhase
                  ? clZoneAtPosition(row.position)
                  : competitionId
                    ? zoneAtPosition(competitionId, row.position)
                    : undefined;
                return (
                  <tr key={row.id} className={isLeaguePhase ? zone?.className : undefined}>
                    <td>{row.position}</td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.55rem" }}>
                        <Link
                          to={`/teams/${competitionId}/${row.id}`}
                          style={{ display: "flex", alignItems: "center", gap: "0.55rem", color: "inherit", textDecoration: "none" }}
                        >
                          {row.crest && <img className="crest" src={row.crest} alt="" />}
                          {row.name}
                        </Link>
                        {!isLeaguePhase && zone && (
                          <span className={"zone-chip " + zone.className}>{zone.shortLabel}</span>
                        )}
                      </div>
                    </td>
                    <td className="num">{row.playedGames}</td>
                    <td className="num">{row.won}</td>
                    <td className="num">{row.draw}</td>
                    <td className="num">{row.lost}</td>
                    <td className="num">{row.goalDifference}</td>
                    <td className="num">
                      <strong>{row.points}</strong>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {data && data.standings.length === 0 && (
        <p>No standings data yet for this competition — run `npm run ingest`.</p>
      )}
    </div>
  );
}
