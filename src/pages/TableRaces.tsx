import { Link, useParams } from "react-router-dom";
import { teamById } from "../data";
import { useCompetitionPage } from "../data/useCompetitionPage";
import { LeagueStatus } from "../components/LeagueStatus";
import { raceStatus, type TeamRaceRow, type ZoneStatus } from "../data/raceStatus";
import { zonesFor, type Zone } from "../data/zones";
import type { LeagueData } from "../data";

const STATUS_LABEL: Record<ZoneStatus, string> = {
  clinched: "Clinched",
  alive: "Alive",
  eliminated: "Out",
};

function ZoneCard({
  zone,
  rows,
  competitionId,
  data,
}: {
  zone: Zone;
  rows: TeamRaceRow[];
  competitionId: string;
  data: LeagueData;
}) {
  const relevant = rows
    .filter((r) => r.statuses[zone.id] !== "eliminated")
    .sort((a, b) => a.position - b.position);

  return (
    <div className={"team-card " + zone.className} style={{ marginBottom: "1rem" }}>
      <h3 style={{ marginTop: 0 }}>{zone.label}</h3>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Team</th>
            <th>Pts</th>
            <th>GP</th>
            <th>Left</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {relevant.map((row) => {
            const team = teamById(data, row.teamId);
            const status = row.statuses[zone.id];
            return (
              <tr key={row.teamId}>
                <td>{row.position}</td>
                <td>
                  <Link to={`/teams/${competitionId}/${row.teamId}`}>{team?.name ?? row.teamId}</Link>
                </td>
                <td>{row.points}</td>
                <td>{row.played}</td>
                <td>{row.gamesLeft}</td>
                <td className={"status-" + status}>{STATUS_LABEL[status]}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function TableRaces() {
  const { competitionId } = useParams();
  const { competition, data, error, loading } = useCompetitionPage(competitionId);
  const zones = competitionId ? zonesFor(competitionId) : [];

  const rows = data && competitionId ? raceStatus(competitionId, data.standings, data.matches) : [];

  return (
    <div>
      <h1>{competition?.name ?? competitionId} table races</h1>

      <LeagueStatus error={error} loading={loading} />

      {data && zones.length === 0 && (
        <p>{competition?.name ?? "This competition"} doesn't have table-race zones tracked.</p>
      )}

      {data && zones.length > 0 && data.standings.length === 0 && (
        <p>No standings data yet for this competition — run `npm run ingest`.</p>
      )}

      {data && zones.length > 0 && data.standings.length > 0 && (
        <>
          <p style={{ opacity: 0.7, fontSize: "0.85rem" }}>
            Clinched/Out are mathematically certain from points and games remaining alone (a magic-number
            calculation, not a projection). Zone boundaries are standard allocations and can shift by one spot
            with UEFA's coefficient-based rules or a cup winner's own league finish.
          </p>
          {competitionId &&
            zones.map((zone) => (
              <ZoneCard key={zone.id} zone={zone} rows={rows} competitionId={competitionId} data={data} />
            ))}
        </>
      )}
    </div>
  );
}
