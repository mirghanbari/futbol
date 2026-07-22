import type { Match, Standing } from "./types";
import { zonesFor } from "./zones";
import { computeRatings, expectedGoals, samplePoisson } from "./ratings";

// Season-long title/zone probabilities via genuine Monte Carlo simulation —
// unlike raceStatus.ts's magic-number clinch/eliminate math, "probability of
// finishing in zone X" is correlated across every team's remaining fixtures
// at once (through shared points/GD comparisons), which has no cheap closed
// form for a 20-team, 38-game season. Same "simulate" tool the reference
// dashboard itself uses (20,000 tournament sims), scaled down for a league's
// much larger remaining-fixture count (see TRIALS below).
export interface TeamOutcome {
  teamId: string;
  titleProb: number; // frequency of finishing position 1
  zoneProbabilities: Record<string, number>; // keyed by Zone.id
  avgPoints: number;
}

const TRIALS = 3000;

interface TeamAccum {
  points: number;
  goalDifference: number;
  goalsFor: number;
}

/**
 * `currentStandings` (real, possibly empty pre-season) supplies each team's
 * starting points/GD/GF — never `ratingsStandings`, which may be last
 * season's FINAL table when used as the fallback strength-model basis; using
 * it for the baseline too would start every team on last season's points
 * total instead of zero. `ratingsStandings` feeds ONLY the attack/defense
 * model. The team roster itself comes from `matches` (this season's actual
 * fixture list, always present pre-season), not either standings table —
 * promotion/relegation means last season's participants and this season's
 * aren't the same set.
 */
export function simulateSeason(
  competitionId: string,
  currentStandings: Standing[],
  ratingsStandings: Standing[],
  matches: Match[],
): TeamOutcome[] {
  const zones = zonesFor(competitionId);
  const model = computeRatings(ratingsStandings);
  if (model.ratings.size === 0) return [];

  const teamIds = [...new Set(matches.flatMap((m) => [m.homeTeamId, m.awayTeamId]))];
  const n = teamIds.length;
  if (n === 0) return [];

  const remaining = matches.filter((m) => m.status !== "finished" && m.status !== "cancelled");
  // Expected goals depend only on the (fixed) ratings model, not the trial —
  // computed once per match here rather than recomputed identically on every
  // one of the TRIALS runs below (only the random goal SAMPLE needs to vary
  // per trial).
  const xgByMatch = new Map(
    remaining.map((m) => [m.id, expectedGoals(model, m.homeTeamId, m.awayTeamId)] as const),
  );
  const currentById = new Map(currentStandings.map((s) => [s.id, s]));
  const baseline = new Map<string, TeamAccum>(
    teamIds.map((id) => {
      const s = currentById.get(id);
      return [id, { points: s?.points ?? 0, goalDifference: s?.goalDifference ?? 0, goalsFor: s?.goalsFor ?? 0 }];
    }),
  );

  const positionCounts = new Map<string, Int32Array>(teamIds.map((id) => [id, new Int32Array(n)]));
  const zoneCounts = new Map<string, Map<string, number>>(teamIds.map((id) => [id, new Map(zones.map((z) => [z.id, 0]))]));
  const pointsSum = new Map<string, number>(teamIds.map((id) => [id, 0]));

  for (let trial = 0; trial < TRIALS; trial++) {
    const accum = new Map<string, TeamAccum>();
    for (const [id, base] of baseline) accum.set(id, { ...base });

    for (const match of remaining) {
      const home = accum.get(match.homeTeamId);
      const away = accum.get(match.awayTeamId);
      if (!home || !away) continue; // shouldn't happen — roster is derived from this same matches list
      const xg = xgByMatch.get(match.id);
      if (!xg) continue;
      const homeGoals = samplePoisson(xg.home);
      const awayGoals = samplePoisson(xg.away);

      home.goalsFor += homeGoals;
      away.goalsFor += awayGoals;
      home.goalDifference += homeGoals - awayGoals;
      away.goalDifference += awayGoals - homeGoals;
      if (homeGoals > awayGoals) home.points += 3;
      else if (homeGoals < awayGoals) away.points += 3;
      else {
        home.points += 1;
        away.points += 1;
      }
    }

    const ranked = [...accum.entries()].sort(
      ([, a], [, b]) => b.points - a.points || b.goalDifference - a.goalDifference || b.goalsFor - a.goalsFor,
    );

    ranked.forEach(([id, team], idx) => {
      positionCounts.get(id)![idx]++;
      pointsSum.set(id, pointsSum.get(id)! + team.points);
      const zone = zones.find((z) => idx + 1 >= z.from && idx + 1 <= z.to);
      if (zone) {
        const zc = zoneCounts.get(id)!;
        zc.set(zone.id, zc.get(zone.id)! + 1);
      }
    });
  }

  return teamIds.map((id): TeamOutcome => {
    const positions = positionCounts.get(id)!;
    const zc = zoneCounts.get(id)!;
    const zoneProbabilities: Record<string, number> = {};
    for (const zone of zones) zoneProbabilities[zone.id] = (zc.get(zone.id) ?? 0) / TRIALS;
    return {
      teamId: id,
      titleProb: (positions[0] ?? 0) / TRIALS,
      zoneProbabilities,
      avgPoints: pointsSum.get(id)! / TRIALS,
    };
  });
}
