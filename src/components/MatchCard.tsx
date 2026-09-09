import { Link } from "react-router-dom";
import { ProbabilityBar } from "./ProbabilityBar";
import { STAGE_LABELS } from "../data/knockout";
import { formatMinute } from "../data/live";
import type { Match, Team } from "../data/types";

export interface MatchOdds {
  home: number;
  draw: number;
  away: number;
}

// In-play and paused (half time) are the two "happening right now" statuses —
// everything that pins a match to the top of a list or paints it red keys off
// this, so it lives next to the card that renders it.
export function isLiveMatch(match: Match): boolean {
  return match.status === "in-play" || match.status === "paused";
}

// "–" rather than "0" for a match that hasn't kicked off yet — a 0-0
// scoreline reads as a real result, not "nothing's happened".
function goalsLabel(goals: number, match: Match): string {
  return match.status === "scheduled" || match.status === "postponed" || match.status === "cancelled"
    ? "–"
    : String(goals);
}

// "Matchday 3" for a regular-season/league-phase fixture. CL's two-legged
// knockout stages (playoff/round16/quarter/semi) also carry a non-null
// `matchday` — but it means "leg 1" or "leg 2" of a tie, NOT a round-robin
// matchday, so those get the actual stage name plus the leg number instead
// (confirmed against real data: only stage/league-phase and Final actually
// mean what their matchday field would naively suggest — see
// src/data/knockout.ts's own note on this).
function stageLabel(match: Match): string {
  if (match.stage === "regular" || match.stage === "league-phase") {
    return match.matchday !== null ? `Matchday ${match.matchday}` : STAGE_LABELS[match.stage];
  }
  return match.matchday !== null ? `${STAGE_LABELS[match.stage]} · Leg ${match.matchday}` : STAGE_LABELS[match.stage];
}

function statusLabel(match: Match): string {
  if (match.status === "finished") return "FT";
  if (match.status === "paused") return "HT";
  if (match.status === "in-play") return (match.minute ? formatMinute(match.minute) : "") || "Live";
  if (match.status === "postponed") return "Postponed";
  if (match.status === "cancelled") return "Cancelled";
  return new Date(match.utcDate).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

interface MatchCardProps {
  match: Match;
  competitionId: string | undefined;
  home: Team | null | undefined;
  away: Team | null | undefined;
  // Win/draw/loss probabilities, scheduled fixtures only — a live or finished
  // match has a real scoreline, so the pre-match model is no longer the story.
  odds?: MatchOdds | null;
  // Live cards outside the Matches page's day groups (the "Live now" strips)
  // repeat the kickoff day, which their own group heading would otherwise
  // have carried.
  showDate?: boolean;
}

export function MatchCard({ match, competitionId, home, away, odds, showDate = false }: MatchCardProps) {
  const isLive = isLiveMatch(match);
  return (
    <div className={isLive ? "match-card match-card-live" : "match-card"}>
      <Link
        className="row-cover-link"
        to={`/matches/${competitionId}/${match.id}`}
        aria-label={`${home?.shortName ?? match.homeTeamId} vs ${away?.shortName ?? match.awayTeamId}`}
      />
      <div className="match-card-head">
        <span>
          {/* Same UTC day key the Matches page's day headings use — a local
              date here would disagree with the heading of the very group this
              card was lifted out of, for exactly the late-kickoff fixtures
              showDate exists for. */}
          {showDate ? `${match.utcDate.slice(0, 10)} · ` : ""}
          {stageLabel(match)}
        </span>
        <span className="match-status">
          {isLive && <span className="live-dot" role="img" aria-label="Live" />}
          {statusLabel(match)}
        </span>
      </div>
      <div className="match-teams">
        <div className="match-team-row">
          <Link className="row-team-link" to={`/teams/${competitionId}/${match.homeTeamId}`}>
            {home?.crest && <img className="crest" src={home.crest} alt="" />}
            <span>{home?.shortName ?? match.homeTeamId}</span>
          </Link>
          <span style={{ marginLeft: "auto" }}>{goalsLabel(match.homeTeam.goals, match)}</span>
        </div>
        <div className="match-team-row">
          <Link className="row-team-link" to={`/teams/${competitionId}/${match.awayTeamId}`}>
            {away?.crest && <img className="crest" src={away.crest} alt="" />}
            <span>{away?.shortName ?? match.awayTeamId}</span>
          </Link>
          <span style={{ marginLeft: "auto" }}>{goalsLabel(match.awayTeam.goals, match)}</span>
        </div>
      </div>
      {match.venue && <p className="match-card-venue">{match.venue}</p>}
      {match.status === "scheduled" && odds && (
        <div className="match-card-odds">
          <ProbabilityBar
            home={odds.home}
            draw={odds.draw}
            away={odds.away}
            homeLabel={home?.shortName ?? match.homeTeamId}
            awayLabel={away?.shortName ?? match.awayTeamId}
          />
        </div>
      )}
    </div>
  );
}
