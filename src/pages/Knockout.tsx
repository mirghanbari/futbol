import { Link, useParams } from "react-router-dom";
import { teamById } from "../data";
import { useCompetitionPage } from "../data/useCompetitionPage";
import { LeagueStatus } from "../components/LeagueStatus";
import { buildTies, KNOCKOUT_STAGES, STAGE_LABELS } from "../data/knockout";
import { useSeo } from "../data/seo";
import type { LeagueData } from "../data";
import type { Tie } from "../data/knockout";

function TieCard({ tie, competitionId, data }: { tie: Tie; competitionId: string; data: LeagueData }) {
  const teamA = teamById(data, tie.teamAId);
  const teamB = teamById(data, tie.teamBId);
  const aWon = tie.winnerId === tie.teamAId;
  const bWon = tie.winnerId === tie.teamBId;

  return (
    <div className="team-card">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontWeight: aWon ? 800 : 500 }}>
        <span style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          {teamA?.crest && <img className="crest" src={teamA.crest} alt="" />}
          {teamA?.name ?? tie.teamAId}
        </span>
        <span className="num">{tie.aggregateA}</span>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontWeight: bWon ? 800 : 500,
          marginTop: "0.4rem",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          {teamB?.crest && <img className="crest" src={teamB.crest} alt="" />}
          {teamB?.name ?? tie.teamBId}
        </span>
        <span className="num">{tie.aggregateB}</span>
      </div>
      <div style={{ color: "var(--muted)", fontSize: "0.8rem", marginTop: "0.6rem" }}>
        {tie.legs.map((leg) => {
          const aIsHome = leg.homeTeamId === tie.teamAId;
          const scoreA = aIsHome ? leg.homeTeam.goals : leg.awayTeam.goals;
          const scoreB = aIsHome ? leg.awayTeam.goals : leg.homeTeam.goals;
          // Shootout score is stored home/away; reorder to teamA/teamB like
          // scoreA/scoreB just above, so both numbers on the line agree on
          // which team is which.
          const shootoutA = leg.shootout && (aIsHome ? leg.shootout.home : leg.shootout.away);
          const shootoutB = leg.shootout && (aIsHome ? leg.shootout.away : leg.shootout.home);
          return (
            <div key={leg.id}>
              <Link to={`/matches/${competitionId}/${leg.id}`}>
                {new Date(leg.utcDate).toLocaleDateString()}: {scoreA}–{scoreB}
                {leg.shootout ? ` (pens ${shootoutA}-${shootoutB})` : ""}
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function Knockout() {
  const { competitionId } = useParams();
  const { competition, data, error, loading, isPriorSeason } = useCompetitionPage(competitionId);

  useSeo({
    title: `${competition?.name ?? competitionId ?? "Knockout"} Knockout Stage`,
    description: competition ? `Two-legged ties and bracket for ${competition.name}'s knockout stage.` : undefined,
  });

  const stagesWithTies = data
    ? KNOCKOUT_STAGES.map((stage) => ({ stage, ties: buildTies(data.matches, stage) })).filter(
        (s) => s.ties.length > 0,
      )
    : [];

  return (
    <div>
      <h1>{competition?.name ?? competitionId} knockout stage</h1>

      <LeagueStatus error={error} loading={loading} />

      {isPriorSeason && (
        <p className="season-banner">
          Showing the {competition?.season}–{competition?.season ? Number(competition.season) + 1 : ""} season —
          the new bracket hasn't been drawn yet.
        </p>
      )}

      {data && stagesWithTies.length === 0 && (
        <p>{competition?.name ?? "This competition"} doesn't have a knockout stage.</p>
      )}

      {data &&
        competitionId &&
        stagesWithTies.map(({ stage, ties }) => (
          <div key={stage} style={{ marginBottom: "1.5rem" }}>
            <h2>{STAGE_LABELS[stage]}</h2>
            <div className="stats-grid">
              {ties.map((tie) => (
                <TieCard key={`${tie.teamAId}-${tie.teamBId}`} tie={tie} competitionId={competitionId} data={data} />
              ))}
            </div>
          </div>
        ))}
    </div>
  );
}
