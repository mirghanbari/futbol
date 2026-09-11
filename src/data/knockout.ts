import { competitionById } from "./index";
import type { Match, MatchStage } from "./types";

export const KNOCKOUT_STAGES: MatchStage[] = ["playoff", "round16", "quarter", "semi", "final"];

// Whether a competition's FORMAT has a knockout phase — not whether its
// bracket has been drawn yet. Verified against the ingested fixture lists:
// every match in all eight domestic leagues is stage "regular", so only the
// continental competitions ever produce a tie.
//
// Keyed on tier 0 (continental) rather than an id list here, because tier is
// set in scripts/competitions.mjs on the same line where a competition is
// added — so adding the Europa League gets the tab automatically, instead of
// silently missing it until someone remembers a second list in this file.
//
// Deliberately NOT derived from the ingested stages (`m.stage !== "regular"`),
// tempting as that looks: CL's fixture list is pure "league-phase" until the
// round-of-16 draw in January, so a data-derived flag would hide the tab for
// most of the season and pop it in unannounced mid-year. The /knockout route
// stays reachable for every competition either way — the page has its own
// "doesn't have a knockout stage" empty state, which is what CL correctly
// shows until the draw. This only decides whether the nav advertises it.
export function hasKnockoutStage(competitionId: string | undefined): boolean {
  if (competitionId === undefined) return false;
  return competitionById(competitionId)?.tier === 0;
}

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
