import { useEffect, useState } from "react";
import type { Match, MatchStatus } from "./types";

export interface LiveMatchPatch {
  status: MatchStatus;
  minute: string | null;
  homeGoals: number;
  awayGoals: number;
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
    return {
      ...match,
      status: patch.status,
      minute: patch.minute,
      homeTeam: { ...match.homeTeam, goals: patch.homeGoals },
      awayTeam: { ...match.awayTeam, goals: patch.awayGoals },
    };
  });
}
