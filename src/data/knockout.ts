import type { Match, MatchStage } from "./types";

export const KNOCKOUT_STAGES: MatchStage[] = ["playoff", "round16", "quarter", "semi", "final"];

export const STAGE_LABELS: Record<MatchStage, string> = {
  regular: "Regular season",
  "league-phase": "League phase",
  playoff: "Knockout playoff",
  round16: "Round of 16",
  quarter: "Quarterfinals",
  semi: "Semifinals",
  final: "Final",
};

export interface Tie {
  stage: MatchStage;
  teamAId: string;
  teamBId: string;
  // Chronological; 1 leg for "final", 2 for the two-legged rounds.
  legs: Match[];
  aggregateA: number;
  aggregateB: number;
  // Set once every leg is finished and the tie has a decided winner
  // (aggregate score, or the last leg's penalty shootout if level).
  winnerId: string | null;
}

// Pairs a stage's matches into ties by team identity — two matches between
// the same two teams (home/away swapped for the second leg) form one tie.
// Confirmed against real data: CL's playoff/round16/quarter/semi legs are
// ~1 week apart with sides swapped; "final" has only one match per "pair"
// (itself), which still works falling through this same grouping logic.
export function buildTies(matches: Match[], stage: MatchStage): Tie[] {
  const relevant = matches.filter((m) => m.stage === stage);
  const byPair = new Map<string, Match[]>();
  for (const match of relevant) {
    const key = [match.homeTeamId, match.awayTeamId].sort().join("-");
    if (!byPair.has(key)) byPair.set(key, []);
    byPair.get(key)!.push(match);
  }

  const ties: Tie[] = [];
  for (const legs of byPair.values()) {
    legs.sort((a, b) => a.utcDate.localeCompare(b.utcDate));
    const first = legs[0];
    if (!first) continue;
    const teamAId = first.homeTeamId;
    const teamBId = first.awayTeamId;

    let aggregateA = 0;
    let aggregateB = 0;
    for (const leg of legs) {
      const aIsHome = leg.homeTeamId === teamAId;
      aggregateA += aIsHome ? leg.homeTeam.goals : leg.awayTeam.goals;
      aggregateB += aIsHome ? leg.awayTeam.goals : leg.homeTeam.goals;
    }

    const allFinished = legs.every((leg) => leg.status === "finished");
    let winnerId: string | null = null;
    if (allFinished) {
      if (aggregateA !== aggregateB) {
        winnerId = aggregateA > aggregateB ? teamAId : teamBId;
      } else {
        // Level on aggregate — decided by the last leg's shootout, if any
        // (away-goals rule was dropped by UEFA in 2021, so aggregate-level
        // ties always go to extra time/penalties, not a tiebreaker count).
        const last = legs[legs.length - 1];
        if (last?.shootout) {
          const aIsHome = last.homeTeamId === teamAId;
          const shootoutA = aIsHome ? last.shootout.home : last.shootout.away;
          const shootoutB = aIsHome ? last.shootout.away : last.shootout.home;
          winnerId = shootoutA > shootoutB ? teamAId : teamBId;
        }
      }
    }

    ties.push({ stage, teamAId, teamBId, legs, aggregateA, aggregateB, winnerId });
  }

  return ties;
}
