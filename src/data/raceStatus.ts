import type { Match, Standing } from "./types";
import { zonesFor } from "./zones";

// Table-race engine: for each team and each zone band (Champions League,
// Europa/Conference, relegation, ...), works out whether the team is
// mathematically CLINCHED into the band, mathematically ELIMINATED from it,
// or still ALIVE either way — using magic-number arithmetic (max/min possible
// points from games remaining), not brute-force enumeration of every
// remaining result. A 38-game league season makes the World Cup group-stage
// approach (enumerate every W/D/L combo) infeasible; magic numbers are the
// standard tool for this shape of problem and are simpler to get right.
//
// Deliberately points-only, same as the World Cup engine's clinch/eliminate
// layer: a team overtaking on equal points (a goal-difference swing) is never
// assumed either way, so a "clinched"/"eliminated" verdict here is always
// mathematically certain, never a projection.
export type ZoneStatus = "clinched" | "alive" | "eliminated";

export interface TeamRaceRow {
  teamId: string;
  position: number;
  points: number;
  played: number;
  gamesLeft: number;
  maxPoints: number;
  minPoints: number;
  statuses: Record<string, ZoneStatus>; // keyed by Zone.id
}

/**
 * Whether `id` is guaranteed to finish WORSE than position `k` (i.e. cannot
 * reach top-k by any combination of results) — true when at least `k` other
 * teams are already guaranteed more points than `id`'s ceiling.
 */
function eliminatedFromTopK(id: string, k: number, n: number, minPts: Map<string, number>, maxPts: Map<string, number>): boolean {
  if (k <= 0) return true;
  if (k >= n) return false;
  const ceiling = maxPts.get(id)!;
  let guaranteedAbove = 0;
  for (const [otherId, otherMin] of minPts) {
    if (otherId === id) continue;
    if (otherMin > ceiling) guaranteedAbove++;
  }
  return guaranteedAbove >= k;
}

/**
 * Whether `id` is guaranteed to finish at position `k` or better — true when
 * fewer than `k` other teams could possibly reach a HIGHER points total than
 * `id`'s current floor (a rival reaching the exact same total is a tie, not
 * an overtake, so it doesn't count against clinching).
 */
function clinchedTopK(id: string, k: number, n: number, minPts: Map<string, number>, maxPts: Map<string, number>): boolean {
  if (k >= n) return true;
  if (k <= 0) return false;
  const floor = minPts.get(id)!;
  let canOvertake = 0;
  for (const [otherId, otherMax] of maxPts) {
    if (otherId === id) continue;
    if (otherMax > floor) canOvertake++;
  }
  return canOvertake < k;
}

/** Games left for a team: its own not-yet-finished matches in this competition. */
function gamesLeftFor(teamId: string, matches: Match[]): number {
  return matches.filter(
    (m) => (m.homeTeamId === teamId || m.awayTeamId === teamId) && m.status !== "finished" && m.status !== "cancelled",
  ).length;
}

/** Per-team, per-zone clinch/alive/eliminated verdicts for one competition. */
export function raceStatus(competitionId: string, standings: Standing[], matches: Match[]): TeamRaceRow[] {
  const zones = zonesFor(competitionId);
  const n = standings.length;

  const gamesLeft = new Map(standings.map((s) => [s.id, gamesLeftFor(s.id, matches)]));
  const minPts = new Map(standings.map((s) => [s.id, s.points]));
  const maxPts = new Map(standings.map((s) => [s.id, s.points + 3 * gamesLeft.get(s.id)!]));

  return standings.map((s): TeamRaceRow => {
    const statuses: Record<string, ZoneStatus> = {};
    for (const zone of zones) {
      const inBand =
        eliminatedFromTopK(s.id, zone.from - 1, n, minPts, maxPts) && clinchedTopK(s.id, zone.to, n, minPts, maxPts);
      const outBand =
        clinchedTopK(s.id, zone.from - 1, n, minPts, maxPts) || eliminatedFromTopK(s.id, zone.to, n, minPts, maxPts);
      statuses[zone.id] = inBand ? "clinched" : outBand ? "eliminated" : "alive";
    }
    return {
      teamId: s.id,
      position: s.position,
      points: s.points,
      played: s.playedGames,
      gamesLeft: gamesLeft.get(s.id)!,
      maxPoints: maxPts.get(s.id)!,
      minPoints: s.points,
      statuses,
    };
  });
}
