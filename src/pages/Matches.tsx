import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { teamById } from "../data";
import { useCompetitionPage } from "../data/useCompetitionPage";
import { LeagueStatus } from "../components/LeagueStatus";
import { ProbabilityBar } from "../components/ProbabilityBar";
import { applyLive, useLiveData } from "../data/live";
import { computeRatings, expectedGoals, matchProbabilities } from "../data/ratings";
import { STAGE_LABELS } from "../data/knockout";
import { useSeo } from "../data/seo";
import type { Match } from "../data/types";

function groupByDay(list: Match[]): [string, Match[]][] {
  const groups = new Map<string, Match[]>();
  for (const match of list) {
    const day = match.utcDate.slice(0, 10);
    if (!groups.has(day)) groups.set(day, []);
    groups.get(day)!.push(match);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
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
  if (match.status === "in-play") return match.minute ? `${match.minute}'` : "Live";
  if (match.status === "postponed") return "Postponed";
  if (match.status === "cancelled") return "Cancelled";
  return new Date(match.utcDate).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function Matches() {
  const { competitionId } = useParams();
  const { competition, data, error, loading, isPriorSeason } = useCompetitionPage(competitionId);
  const live = useLiveData();

  useSeo({
    title: `${competition?.name ?? competitionId ?? "Matches"} Matches`,
    description: competition ? `Fixtures and results for ${competition.name}.` : undefined,
  });

  // Odds only depend on team pairing + the ratings model, never on live
  // status/score — computed once per data load here, keyed on `data` alone
  // (NOT on `live`, which changes every 60s via useLiveData's poll and would
  // otherwise force this same double-Poisson-sum work to rerun for every
  // scheduled match on every poll tick, whether or not anything live-related
  // actually changed).
  const oddsByMatchId = useMemo(() => {
    if (!data) return new Map<string, { home: number; draw: number; away: number }>();
    const model = computeRatings(data.ratingsStandings);
    const map = new Map<string, { home: number; draw: number; away: number }>();
    for (const match of data.matches) {
      if (match.status !== "scheduled") continue;
      const xg = expectedGoals(model, match.homeTeamId, match.awayTeamId);
      if (xg) map.set(match.id, matchProbabilities(xg.home, xg.away));
    }
    return map;
  }, [data]);

  const withLive = data ? applyLive(data.matches, live, competitionId) : [];
  const sorted = [...withLive].sort((a, b) => a.utcDate.localeCompare(b.utcDate));
  const groups = groupByDay(sorted);

  return (
    <div>
      <h1>{competition?.name ?? competitionId} matches</h1>

      <LeagueStatus error={error} loading={loading} />

      {isPriorSeason && (
        <p className="season-banner">
          Showing the {competition?.season}–{competition?.season ? Number(competition.season) + 1 : ""} season —
          the new league-phase fixture list hasn't been published yet.
        </p>
      )}

      {data && groups.length === 0 && <p>No match data yet — run `npm run ingest`.</p>}
      {groups.map(([day, dayMatches]) => (
        <div className="match-day" key={day}>
          <h3>{day}</h3>
          <div className="matches-grid">
            {dayMatches.map((match) => {
              const home = data && teamById(data, match.homeTeamId);
              const away = data && teamById(data, match.awayTeamId);
              const isLive = match.status === "in-play" || match.status === "paused";
              return (
                <div className={isLive ? "match-card match-card-live" : "match-card"} key={match.id}>
                  <Link
                    className="row-cover-link"
                    to={`/matches/${competitionId}/${match.id}`}
                    aria-label={`${home?.shortName ?? match.homeTeamId} vs ${away?.shortName ?? match.awayTeamId}`}
                  />
                  <div className="match-card-head">
                    <span>{stageLabel(match)}</span>
                    <span className="match-status">
                      {isLive && <span className="live-dot" aria-label="Live" />}
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
                  {match.status === "scheduled" &&
                    oddsByMatchId.has(match.id) &&
                    (() => {
                      const probs = oddsByMatchId.get(match.id)!;
                      return (
                        <div className="match-card-odds">
                          <ProbabilityBar
                            home={probs.home}
                            draw={probs.draw}
                            away={probs.away}
                            homeLabel={home?.shortName ?? match.homeTeamId}
                            awayLabel={away?.shortName ?? match.awayTeamId}
                          />
                        </div>
                      );
                    })()}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
