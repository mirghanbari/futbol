import type { Standing } from "./types";

// Simplified Poisson attack/defense strength model — the standard, well-known
// approach for this shape of problem (see e.g. the Dixon-Coles family of
// models, without their low-score correlation adjustment — that refinement
// is out of scope for a v1, same simplicity level as this project's other
// documented shortcuts like zones.ts's static UEFA-split bands). Computed
// from season-AGGREGATE goals only (goalsFor/goalsAgainst/playedGames,
// already on every Standing) — no match-level data needed.
export interface TeamRating {
  teamId: string;
  attack: number; // relative to league average, 1.0 = average
  defense: number; // relative to league average, 1.0 = average (higher = leakier)
}

export interface RatingsModel {
  ratings: Map<string, TeamRating>;
  leagueAvgGoals: number;
}

// Documented simplification: a single fixed home-advantage multiplier rather
// than a per-team home/away split (Standing only carries aggregate goals, not
// a home/away breakdown) — same "one constant, not modeled per-team" call as
// raceStatus.ts's points-only tiebreaker.
export const HOME_ADVANTAGE = 1.35;

export function computeRatings(standings: Standing[]): RatingsModel {
  const withGames = standings.filter((s) => s.playedGames > 0);
  if (withGames.length === 0) {
    return { ratings: new Map(), leagueAvgGoals: 0 };
  }

  // Average-of-averages (not sum/sum) so this stays robust once a season is
  // mid-flight and playedGames differs team to team.
  const leagueAvgGoals =
    withGames.reduce((sum, s) => sum + s.goalsFor / s.playedGames, 0) / withGames.length;

  const ratings = new Map<string, TeamRating>();
  for (const s of withGames) {
    ratings.set(s.id, {
      teamId: s.id,
      attack: leagueAvgGoals > 0 ? s.goalsFor / s.playedGames / leagueAvgGoals : 1,
      defense: leagueAvgGoals > 0 ? s.goalsAgainst / s.playedGames / leagueAvgGoals : 1,
    });
  }
  return { ratings, leagueAvgGoals };
}

// A team new to this competition this season (promotion, e.g.) has no rating
// in the league it's joining yet — assumed league-average (1.0/1.0) rather
// than excluded, so its fixtures still produce odds/simulate normally instead
// of silently vanishing. A documented simplification, same spirit as this
// project's other "no real data, assume a neutral default" calls.
function ratingOrAverage(model: RatingsModel, teamId: string): TeamRating {
  return model.ratings.get(teamId) ?? { teamId, attack: 1, defense: 1 };
}

/** Expected goals for a fixture, or null only when there's no model at all (e.g. brand-new competition, no data anywhere). */
export function expectedGoals(
  model: RatingsModel,
  homeTeamId: string,
  awayTeamId: string,
): { home: number; away: number } | null {
  if (model.leagueAvgGoals <= 0) return null;
  const home = ratingOrAverage(model, homeTeamId);
  const away = ratingOrAverage(model, awayTeamId);
  return {
    home: model.leagueAvgGoals * home.attack * away.defense * HOME_ADVANTAGE,
    away: model.leagueAvgGoals * away.attack * home.defense,
  };
}

function poissonPmf(k: number, lambda: number): number {
  // lambda === 0 is a real, if rare, possibility (e.g. a team with zero
  // goals scored all season) — `k * Math.log(0)` is `0 * -Infinity = NaN`
  // for k === 0, which would otherwise silently poison every probability
  // downstream. P(0; 0) = 1, P(k>0; 0) = 0 by definition.
  if (lambda === 0) return k === 0 ? 1 : 0;
  // Direct-ish computation via logs to avoid overflow on k! for larger k;
  // fine for the small k range (0..9) this is called over.
  let logP = -lambda + k * Math.log(lambda);
  for (let i = 2; i <= k; i++) logP -= Math.log(i);
  return Math.exp(logP);
}

const MAX_GOALS = 9; // P(more than 9 goals) is negligible at football-scale lambdas

/** Analytic home/draw/away win probabilities from independent Poisson goal distributions. */
export function matchProbabilities(lambdaHome: number, lambdaAway: number): { home: number; draw: number; away: number } {
  let home = 0;
  let draw = 0;
  let away = 0;
  for (let h = 0; h <= MAX_GOALS; h++) {
    const ph = poissonPmf(h, lambdaHome);
    for (let a = 0; a <= MAX_GOALS; a++) {
      const p = ph * poissonPmf(a, lambdaAway);
      if (h > a) home += p;
      else if (h === a) draw += p;
      else away += p;
    }
  }
  const total = home + draw + away;
  // Renormalize away the negligible truncated tail so the three sum to 1.
  return total > 0 ? { home: home / total, draw: draw / total, away: away / total } : { home: 0, draw: 0, away: 0 };
}

/** Fast-enough Poisson sampler (Knuth's algorithm) for football-scale lambdas. */
export function samplePoisson(lambda: number): number {
  if (lambda <= 0) return 0;
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= Math.random();
  } while (p > L);
  return k - 1;
}
