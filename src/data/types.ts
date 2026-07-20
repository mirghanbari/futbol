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
