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

const POLL_MS = 60_000;

// Polls the slim live.json overlay (today's matches only, from ESPN) rather
// than the full per-competition data — cheap enough to poll every 60s
// without a full data reload. A fetch failure keeps the last-known data
// rather than clearing it, so a transient network hiccup doesn't blank out
// an in-progress score.
export function useLiveData(): LiveData | null {
  const [data, setData] = useState<LiveData | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}live.json?t=${Date.now()}`);
        if (!res.ok) return;
        const json = (await res.json()) as LiveData;
        if (!cancelled) setData(json);
      } catch {
        // transient network hiccup — keep the last-known data, retry next tick
      }
    }

    poll();
    const id = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return data;
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
): Match[] {
  if (!live || !competitionId) return matches;
  const patches = live[competitionId];
  if (!patches) return matches;

  return matches.map((match) => {
    const patch = patches[match.id];
    if (!patch) return match;

    // FotMob's stats win whenever the match already has them. They're a
    // superset (xG, passes, duels, box touches, offsides, saves) and they're
    // final, so once ingest-fotmob.mjs has filled a finished match in there
    // is no reason to overwrite it with the thinner live snapshot — which
    // stays in live.json until the calendar day rolls over, and so outlives
    // the match itself by hours.
    const useLiveStats = !match.stats && patch.stats;

    return {
      ...match,
      status: patch.status,
      minute: patch.minute,
      homeTeam: { ...match.homeTeam, goals: patch.homeGoals },
      awayTeam: { ...match.awayTeam, goals: patch.awayGoals },
      ...(useLiveStats ? { stats: patch.stats, statsSource: "espn" as const } : {}),
      ...(patch.events ? { events: patch.events } : {}),
    };
  });
}
