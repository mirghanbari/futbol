import { useEffect, useState } from "react";
import type { Match, MatchAdvancedStats, MatchEvent, MatchStatus } from "./types";

export interface LiveMatchPatch {
  status: MatchStatus;
  minute: string | null;
  homeGoals: number;
  awayGoals: number;
  // Present only once a match has kicked off, and narrower than FotMob's set
  // — ESPN publishes possession/shots/shots on target/corners/fouls live and
  // nothing else. Both omitted entirely rather than sent empty, so `stats`
  // and `events` being undefined is the normal case, not an error.
  stats?: { home: MatchAdvancedStats; away: MatchAdvancedStats };
  // Goals and cards, already sorted by elapsed time by the ingest.
  events?: MatchEvent[];
}

// competitionId -> matchId -> patch. Mirrors public/live.json, written by
// scripts/ingest-espn-live.mjs.
export type LiveData = Record<string, Record<string, LiveMatchPatch>>;

// competitionId -> matchId -> FotMob's full MatchAdvancedStats pair for a
// match being played right now. Mirrors public/live-stats.json, written by
// scripts/ingest-fotmob-live.mjs. Strictly richer than LiveMatchPatch.stats
// (xG above all), and strictly rarer: it only covers matches that resolved
// against FotMob's fixture list on a pass that actually ran.
export type LiveStats = Record<
  string,
  Record<
    string,
    {
      home: MatchAdvancedStats;
      away: MatchAdvancedStats;
      // Set once the ingest has re-read the match after the final whistle, so
      // these are full-time numbers rather than a snapshot from partway
      // through. The distinction is the difference between badging them
      // "FotMob" and "FotMob · live" — a match's own status can't stand in
      // for it, since a finished match keeps whatever its last in-play pass
      // captured until that post-whistle pass runs.
      final?: boolean;
    }
  >
>;

const POLL_MS = 60_000;
// live-stats.json is only rewritten every few minutes (see
// FOTMOB_LIVE_EVERY in update-live.yml), so polling it at the scoreline's
// rate would be four wasted requests out of five.
const STATS_POLL_MS = 180_000;

// Shared polling for the two overlay files. Both are small, static JSON
// re-read on an interval, and both would rather serve stale data than none:
// a failed fetch keeps the last-known value instead of clearing it, so a
// transient hiccup can't blank out an in-progress score.
//
// Cache-busted on every request because these files change far more often
// than the immutable, content-hashed build assets around them, and are
// served by GitHub Pages with its own caching.
function usePolledJson<T>(file: string, intervalMs: number): T | null {
  const [data, setData] = useState<T | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}${file}?t=${Date.now()}`);
        if (!res.ok) return;
        const json = (await res.json()) as T;
        if (!cancelled) setData(json);
      } catch {
        // transient network hiccup — keep the last-known data, retry next tick
      }
    }

    poll();
    const id = setInterval(poll, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [file, intervalMs]);

  return data;
}

// Today's statuses, scores, ESPN stats and timeline — the overlay every page
// applies. Cheap enough to poll every 60s without a full data reload.
export function useLiveData(): LiveData | null {
  return usePolledJson<LiveData>("live.json", POLL_MS);
}

// FotMob's advanced stats for in-play matches. Separate from useLiveData
// because only the match page renders stats: making every page that shows a
// scoreline pay for this request would be most of the app for none of the
// benefit.
export function useLiveStats(): LiveStats | null {
  return usePolledJson<LiveStats>("live-stats.json", STATS_POLL_MS);
}

// ESPN's displayClock already carries the apostrophe it wants to be shown
// with ("41'", "45+2'"), so appending one unconditionally renders 41''. Add it
// only when it's missing, since a bare "41" does turn up in the feed too.
// Returns "" for a blank clock (a whitespace-only displayClock does turn up),
// so callers can fall back with `formatMinute(x) || "Live"` rather than
// rendering a lone apostrophe.
export function formatMinute(minute: string): string {
  const trimmed = minute.trim();
  if (trimmed === "") return "";
  return trimmed.endsWith("'") ? trimmed : `${trimmed}'`;
}

export function applyLive(
  matches: Match[],
  live: LiveData | null,
  competitionId: string | undefined,
  // Optional because only the match page has a use for it — see useLiveStats.
  liveStats?: LiveStats | null,
): Match[] {
  if (!live || !competitionId) return matches;
  const patches = live[competitionId];
  if (!patches) return matches;
  const statsPatches = liveStats?.[competitionId];

  return matches.map((match) => {
    const patch = patches[match.id];
    if (!patch) return match;

    // Three possible sources, best first:
    //
    //   1. match.stats — FotMob, on disk, written for a FINISHED match by
    //      ingest-fotmob.mjs. Complete and final; never overwritten. The
    //      thinner overlays outlive the match by hours (both files keep
    //      today's entries until the calendar day rolls over), so without
    //      this precedence a finished match would degrade after full time.
    //   2. live-stats.json — FotMob again, same eleven stats. Reported as
    //      "fotmob" once its `final` flag is set (a post-whistle read, so
    //      just as final as 1, only sooner) and "fotmob-live" before that,
    //      when the numbers are still a mid-match snapshot.
    //   3. live.json — ESPN's five. Always available once a match kicks off,
    //      which the other two are not.
    const statsPatch = statsPatches?.[match.id];
    const overlaidStats: Pick<Match, "stats" | "statsSource"> | null = match.stats
      ? null
      : statsPatch
        ? {
            stats: { home: statsPatch.home, away: statsPatch.away },
            statsSource: statsPatch.final ? "fotmob" : "fotmob-live",
          }
        : patch.stats
          ? { stats: patch.stats, statsSource: "espn" }
          : null;

    return {
      ...match,
      status: patch.status,
      minute: patch.minute,
      homeTeam: { ...match.homeTeam, goals: patch.homeGoals },
      awayTeam: { ...match.awayTeam, goals: patch.awayGoals },
      ...(overlaidStats ?? {}),
      ...(patch.events ? { events: patch.events } : {}),
    };
  });
}
