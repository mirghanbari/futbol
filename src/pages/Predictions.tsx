import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { teamById } from "../data";
import { useCompetitionPage } from "../data/useCompetitionPage";
import { LeagueStatus } from "../components/LeagueStatus";
import { computeRatings } from "../data/ratings";
import { simulateSeason, type TeamOutcome } from "../data/predictions";
import { zonesFor } from "../data/zones";
import { useSeo } from "../data/seo";
import type { LeagueData } from "../data";

function pct(p: number): string {
  return `${Math.round(p * 100)}%`;
}

function TitleRaceRow({ outcome, data, competitionId }: { outcome: TeamOutcome; data: LeagueData; competitionId: string }) {
  const team = teamById(data, outcome.teamId);
  return (
    <div className="rate-row">
      <Link className="rate-row-team" to={`/teams/${competitionId}/${outcome.teamId}`}>
        {team?.crest && <img className="crest" src={team.crest} alt="" />}
        {team?.shortName ?? outcome.teamId}
      </Link>
      <div className="rate-bar-track">
        <div className="rate-bar-fill" style={{ width: `${outcome.titleProb * 100}%` }} />
      </div>
      <span className="rate-pct">{pct(outcome.titleProb)}</span>
    </div>
  );
}

function StrengthCard({
  teamId,
  data,
  attack,
  defense,
  maxAttack,
  maxDefenseStrength,
}: {
  teamId: string;
  data: LeagueData;
  attack: number;
  defense: number;
  maxAttack: number;
  maxDefenseStrength: number;
}) {
  const team = teamById(data, teamId);
  const defenseStrength = defense > 0 ? 1 / defense : 0;
  return (
    <div className="team-card strength-card">
      <div className="rate-row-team" style={{ width: "auto" }}>
        {team?.crest && <img className="crest" src={team.crest} alt="" />}
        <strong>{team?.shortName ?? teamId}</strong>
      </div>
      <div className="strength-stat attack">
        ATT
        <div className="rate-bar-track">
          <div className="rate-bar-fill" style={{ width: `${maxAttack > 0 ? (attack / maxAttack) * 100 : 0}%` }} />
        </div>
      </div>
      <div className="strength-stat defense">
        DEF
        <div className="rate-bar-track">
          <div
            className="rate-bar-fill"
            style={{ width: `${maxDefenseStrength > 0 ? (defenseStrength / maxDefenseStrength) * 100 : 0}%` }}
          />
        </div>
      </div>
    </div>
  );
}

export default function Predictions() {
  const { competitionId } = useParams();
  const { competition, data, error, loading } = useCompetitionPage(competitionId);
  const zones = competitionId ? zonesFor(competitionId) : [];

  useSeo({
    title: `${competition?.name ?? competitionId ?? "Predictions"} Predictions`,
    description: competition
      ? `Title-race and European/relegation-zone probabilities for ${competition.name}, from a Monte Carlo season simulation.`
      : undefined,
  });

  const model = useMemo(() => (data ? computeRatings(data.ratingsStandings) : null), [data]);

  const outcomes = useMemo(() => {
    if (!data || !competitionId || zones.length === 0) return [];
    return simulateSeason(competitionId, data.standings, data.ratingsStandings, data.matches);
  }, [data, competitionId, zones.length]);

  const sortedOutcomes = [...outcomes].sort((a, b) => b.titleProb - a.titleProb);

  return (
    <div>
      <h1>{competition?.name ?? competitionId} predictions</h1>

      <LeagueStatus error={error} loading={loading} />

      {data && zones.length === 0 && (
        <p>{competition?.name ?? "This competition"} doesn't have a title-race model tracked — either it has no zone
          bands defined, or (for the Champions League specifically) its current season is already fully decided,
          leaving nothing left to simulate.</p>
      )}

      {data && zones.length > 0 && data.ratingsStandings.length === 0 && (
        <p>No standings data available yet to build a strength model from — run `npm run ingest`.</p>
      )}

      {data && zones.length > 0 && data.ratingsStandings.length > 0 && model && (
        <>
          <p style={{ opacity: 0.7, fontSize: "0.85rem" }}>
            A simplified Poisson attack/defense model (
            {data.isFallbackRatings ? "seeded from last season's final table" : "from this season's results so far"}
            ), simulated over 3,000 Monte Carlo trials of the remaining fixtures. Doesn't model head-to-head
            tiebreakers or a per-team home/away split — a deliberate simplification, not a claim of bookmaker-grade
            precision.
          </p>

          <h2>Title race</h2>
          {competitionId &&
            sortedOutcomes.map((o) => (
              <TitleRaceRow key={o.teamId} outcome={o} data={data} competitionId={competitionId} />
            ))}

          <h2 style={{ marginTop: "2rem" }}>Zone probabilities</h2>
          <table className="zone-prob-table">
            <thead>
              <tr>
                <th>Team</th>
                <th className="num">Avg pts</th>
                {zones.map((z) => (
                  <th className="num" key={z.id}>
                    {z.shortLabel}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {competitionId &&
                sortedOutcomes.map((o) => {
                  const team = teamById(data, o.teamId);
                  return (
                    <tr key={o.teamId}>
                      <td>
                        <Link
                          to={`/teams/${competitionId}/${o.teamId}`}
                          style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", color: "inherit", textDecoration: "none" }}
                        >
                          {team?.crest && <img className="crest" src={team.crest} alt="" style={{ width: 18, height: 18 }} />}
                          {team?.shortName ?? o.teamId}
                        </Link>
                      </td>
                      <td className="num">{o.avgPoints.toFixed(1)}</td>
                      {zones.map((z) => (
                        <td className="num" key={z.id}>
                          {pct(o.zoneProbabilities[z.id] ?? 0)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
            </tbody>
          </table>

          <h2 style={{ marginTop: "2rem" }}>Strength model</h2>
          <p style={{ opacity: 0.7, fontSize: "0.85rem" }}>Bars are relative to the strongest team in the league.</p>
          <div className="team-grid">
            {(() => {
              // model.ratings covers whatever ratingsStandings was built
              // from — pre-season, that's LAST season's full table, which
              // includes teams since relegated out of this competition
              // entirely. Restrict the display to this season's actual
              // roster (teamById(data, ...) only resolves current teams) so
              // a departed team doesn't show up as a bare numeric id.
              const allRatings = [...model.ratings.values()].filter((r) => teamById(data, r.teamId));
              const maxAttack = Math.max(...allRatings.map((x) => x.attack));
              const maxDefenseStrength = Math.max(...allRatings.map((x) => (x.defense > 0 ? 1 / x.defense : 0)));
              return allRatings
                .sort((a, b) => b.attack - a.attack)
                .map((r) => (
                  <StrengthCard
                    key={r.teamId}
                    teamId={r.teamId}
                    data={data}
                    attack={r.attack}
                    defense={r.defense}
                    maxAttack={maxAttack}
                    maxDefenseStrength={maxDefenseStrength}
                  />
                ));
            })()}
          </div>
        </>
      )}
    </div>
  );
}
