import { useMemo } from "react";
import type { LeagueData } from "./index";
import type { Match } from "./types";
import { computeRatings, expectedGoals, matchProbabilities } from "./ratings";

export interface MatchOdds {
  home: number;
  draw: number;
  away: number;
}

// Whether the pre-match model is still worth showing for a match.
//
// Originally this was `status === "scheduled"`, which hid the odds the moment
// a match kicked off. That was backwards: the live overlay only carries
// status/minute/score (ingest-espn-live.mjs), and FotMob's box-score stats
// only land once a match is FINISHED (ingest-fotmob.mjs fetches
// `status === "finished"` only) — so between kickoff and full time a match
// had no stats to replace the forecast with, and ended up showing strictly
// less than it had an hour earlier. The forecast stays until there's
// something real to put in its place.
//
// Finished is where it genuinely stops earning its space (there's a result),
// and postponed/cancelled never get one.
export function hasPreMatchOdds(match: Match): boolean {
  return match.status === "scheduled" || match.status === "in-play" || match.status === "paused";
}

// matchId -> win/draw/loss probabilities, for EVERY match in the competition.
//
// Odds depend only on the team pairing + the ratings model, never on live
// status or score — so this memoises on `data` alone and NOT on useLiveData's
// 60s poll, which would otherwise redo every fixture's double-Poisson sum on
// every tick whether or not anything actually changed.
//
// Deliberately unfiltered, even though callers only draw the bar for matches
// hasPreMatchOdds accepts. Filtering here would key the map off each match's
// ON-DISK status while the render gate reads its LIVE-PATCHED one, and those
// two can disagree in both directions: live.json normally runs ahead of
// matches.json, but a stale overlay against a freshly-ingested matches.json
// reverses it (disk says finished, the overlay still says in-play). In that
// window a filtered map has no entry for a match the card still considers
// live, and the bar silently vanishes. Computing all of them is ~380 Poisson
// sums per data load — far cheaper than an invariant that has to hold across
// two independently-updated data sources.
export function useMatchOdds(data: LeagueData | null): Map<string, MatchOdds> {
  return useMemo(() => {
    const map = new Map<string, MatchOdds>();
    if (!data) return map;

    const model = computeRatings(data.ratingsStandings);
    for (const match of data.matches) {
      const xg = expectedGoals(model, match.homeTeamId, match.awayTeamId);
      if (xg) map.set(match.id, matchProbabilities(xg.home, xg.away));
    }
    return map;
  }, [data]);
}
