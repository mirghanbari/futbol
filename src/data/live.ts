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
      // Goals and cards, already chronological. Supersedes the ESPN timeline
      // when present: same events, plus the assist and the goal method.
      // Absent for a match with nothing to show yet, so that a 0-0 falls
      // through to ESPN's rather than blanking a timeline ESPN did have.
      events?: MatchEvent[];
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

// Goals accounted for by a timeline. An own goal is credited to the team that
// benefits, so this is directly comparable to the scoreline.
function goalCount(events: MatchEvent[]): number {
  return events.reduce((n, event) => n + (event.type === "goal" ? 1 : 0), 0);
}

// FotMob's timeline is richer — it carries the assist and the goal method,
// neither of which ESPN's scoreboard has at all — so it wins by default.
// ESPN's is the fallback rather than the base because the two describe the
// same events: merging them would mean matching event to event across feeds
// that agree on neither ids nor exact minutes.
//
// The catch is that the timeline and the SCORELINE come from different files,
// and a match page showing a 2-1 header above three goals is worse than
// showing a slightly older list. The two can drift apart in BOTH directions,
// which is why the test below is symmetric rather than a staleness guess:
//
//   FotMob behind — it is rebuilt every ~5 minutes and polled every 3, against
//   60s on both counts for live.json, so it can sit ~8 minutes back.
//   FotMob ahead — each workflow tick runs ingest:live and THEN
//   ingest:fotmob:live, and that second pass takes tens of seconds to minutes
//   on a busy matchday (a leagues call per competition, a matchDetails per
//   live match, PAUSE_MS between each). A goal scored inside that window is in
//   the FotMob events while the scores beside them predate it.
//
// So the rule is agreement with the scoreline, not recency: take whichever
// list accounts for exactly the goals on the header. If neither does, keep
// FotMob's — both are wrong about the count, and only one of them has the
// assists.
function pickEvents(
  patch: LiveMatchPatch,
  statsPatch: { events?: MatchEvent[] } | undefined,
): Pick<Match, "events" | "eventsSource"> {
  // `?.length` rather than a truthiness test: an empty array is truthy, and
  // returning it would blank a timeline ESPN had entries for (a goalless
  // match with two bookings, say).
  const fotmob = statsPatch?.events?.length ? statsPatch.events : undefined;
  const espn = patch.events?.length ? patch.events : undefined;
  const scored = patch.homeGoals + patch.awayGoals;

  if (fotmob && goalCount(fotmob) === scored) {
    return { events: fotmob, eventsSource: "fotmob-live" };
  }
  if (espn && goalCount(espn) === scored) {
    return { events: espn, eventsSource: "espn" };
  }
  if (fotmob) return { events: fotmob, eventsSource: "fotmob-live" };
  return espn ? { events: espn, eventsSource: "espn" } : {};
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
      ...pickEvents(patch, statsPatch),
    };
  });
}
