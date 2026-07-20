export type MatchStatus =
  | "scheduled"
  | "in-play"
  | "paused"
  | "finished"
  | "postponed"
  | "cancelled";

// Phase 1 only needs regular domestic-league matchdays. The wider UCL stage
// enum ("league-phase" | "playoff" | "round16" | ... ) is added in the
// Champions League phase, once that engineering lands.
export type MatchStage = "regular";

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
  events?: MatchEvent[];
}

export interface Player {
  id: string;
  name: string;
  position: Position | null;
  nationality: string;
  dateOfBirth: string | null;
  teamId: string;
}
