import type { LeagueData } from "./index";
import type { MatchAdvancedStats } from "./types";

export interface TeamAdvancedAverages {
  teamId: string;
  matchesWithStats: number;
  avgPossession?: number;
  avgXg?: number;
  avgShots?: number;
}

function average(values: number[]): number | undefined {
  return values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : undefined;
}

// Season-average team stats derived client-side from each finished match's
// FotMob stats (Match.stats.{home,away}) — no separate ingest step needed,
// same "derive from already-loaded Match[] data" pattern as
// src/data/raceStatus.ts and src/data/knockout.ts.
export function teamAdvancedAverages(data: LeagueData): TeamAdvancedAverages[] {
  const byTeam = new Map<string, { possession: number[]; xg: number[]; shots: number[] }>();

  for (const match of data.matches) {
    if (match.status !== "finished" || !match.stats) continue;
    const sides: [string, MatchAdvancedStats][] = [
      [match.homeTeamId, match.stats.home],
      [match.awayTeamId, match.stats.away],
    ];
    for (const [teamId, stats] of sides) {
      if (!byTeam.has(teamId)) byTeam.set(teamId, { possession: [], xg: [], shots: [] });
      const bucket = byTeam.get(teamId)!;
      if (stats.possession !== undefined) bucket.possession.push(stats.possession);
      if (stats.xg !== undefined) bucket.xg.push(stats.xg);
      if (stats.shots !== undefined) bucket.shots.push(stats.shots);
    }
  }

  return [...byTeam.entries()].map(([teamId, bucket]) => ({
    teamId,
    matchesWithStats: Math.max(bucket.possession.length, bucket.xg.length, bucket.shots.length),
    avgPossession: average(bucket.possession),
    avgXg: average(bucket.xg),
    avgShots: average(bucket.shots),
  }));
}
