export type MatchStatus =
  | "scheduled"
  | "in-play"
  | "paused"
  | "finished"
  | "postponed"
  | "cancelled";

// "league-phase" covers the Champions League's Swiss-format round-robin
// (matchdays 1-8). The rest of UCL's stage enum ("playoff" | "round16" | ...)
// plus two-legged tie handling lands in the Champions League phase (Phase 6).
export type MatchStage = "regular" | "league-phase";

export type Position = "Goalkeeper" | "Defender" | "Midfielder" | "Forward";

export interface Competition {
  id: string; // football-data.org code, e.g. "PL"
  name: string;
  country: string;
  tier: number;
  season: string; // e.g. "2025"
  currentMatchday: number | null;
  espnSlug?: string;
  fotmobLeagueId?: number;
  logo?: string;
  // Whether `season` has any finished matches yet. Drives the player-stats
  // fallback: when false, Players/Stats show last season's numbers
  // (fallback-players.json / fallback-player-stats.json) instead of an
  // all-empty current season — and switch over automatically the moment
  // this flips true, no "wait for a meaningful sample" threshold.
  hasFinishedMatches: boolean;
}

export interface Team {
  id: string;
  name: string;
  shortName: string;
  tla: string;
  crest?: string;
  competitionId: string;
}

export interface Standing extends Team {
  position: number;
  playedGames: number;
  won: number;
  draw: number;
  lost: number;
  points: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
}

export interface MatchTeamStats {
  goals: number;
}

// FotMob-sourced advanced team stats for one side of a finished match
// (scripts/ingest-fotmob.mjs). All optional — only present once FotMob's
// been successfully joined to the match; football-data.org has none of this.
export interface MatchAdvancedStats {
  possession?: number; // %
  xg?: number;
  shots?: number;
  shotsOnTarget?: number;
  accuratePasses?: number;
  duelsWon?: number;
  boxTouches?: number; // touches in the opposition box — field-tilt proxy
  fouls?: number;
  corners?: number;
  offsides?: number;
  saves?: number;
}

export interface MatchEvent {
  minute: number;
  type: "goal" | "yellow-card" | "red-card" | "substitution";
  teamId: string;
  playerName: string;
}

export interface Match {
  id: string;
  competitionId: string;
  season: string;
  matchday: number;
  stage: MatchStage;
  utcDate: string; // ISO 8601
  status: MatchStatus;
  homeTeamId: string;
  awayTeamId: string;
  homeTeam: MatchTeamStats;
  awayTeam: MatchTeamStats;
  // ESPN's live display clock (e.g. "23", "45+2"), overlaid client-side by
  // src/data/live.ts. Absent from the football-data.org-sourced build data;
  // only ever present after a live.json patch is applied.
  minute?: string | null;
  events?: MatchEvent[];
  // FotMob advanced stats, set once for a finished match by
  // scripts/ingest-fotmob.mjs and preserved across football-data.org
  // rebuilds (see ingest-football-data.mjs).
  stats?: { home: MatchAdvancedStats; away: MatchAdvancedStats };
}

export interface Player {
  id: string;
  name: string;
  position: Position | null;
  nationality: string;
  dateOfBirth: string | null;
  teamId: string;
  competitionId: string;
}

// Per-match FotMob player stats — the source of truth, stored keyed by match
// id (scripts/ingest-fotmob.mjs writes player-match-stats.json). Season
// totals (PlayerSeasonStats) are always a fresh sum over these, never an
// incrementally-updated running total — see PROGRESS.md for why that matters
// across a season rollover (CL's data source will eventually flip from
// 2025-26 to 2026-27; a running total would silently mix the two seasons,
// a recomputed sum just naturally starts over with the new match set).
export interface PlayerMatchStats {
  minutes?: number;
  goals?: number;
  assists?: number;
  xg?: number;
  xa?: number;
  shots?: number;
  shotsOnTarget?: number;
  tackles?: number;
  interceptions?: number;
  clearances?: number;
  duelsWon?: number;
  rating?: number;
}

// A season aggregate, summed from PlayerMatchStats (rating is averaged, not
// summed). Written to player-stats.json (current season) or
// fallback-player-stats.json (last season, domestic leagues only — see
// Competition.hasFinishedMatches).
export interface PlayerSeasonStats {
  playerId: string;
  season: string;
  matchesPlayed: number;
  minutes: number;
  goals: number;
  assists: number;
  xg: number;
  xa: number;
  shots: number;
  shotsOnTarget: number;
  tackles: number;
  interceptions: number;
  clearances: number;
  duelsWon: number;
  avgRating: number | null;
}
