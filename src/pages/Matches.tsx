import { Link, useParams } from "react-router-dom";
import { teamById } from "../data";
import { useCompetitionPage } from "../data/useCompetitionPage";
import { LeagueStatus } from "../components/LeagueStatus";
import { applyLive, useLiveData } from "../data/live";
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
          {dayMatches.map((match) => {
            const home = data && teamById(data, match.homeTeamId);
            const away = data && teamById(data, match.awayTeamId);
            const isLive = match.status === "in-play" || match.status === "paused";
            return (
              <div className={isLive ? "match-row match-row-live" : "match-row"} key={match.id}>
                <Link
                  className="row-cover-link"
                  to={`/matches/${competitionId}/${match.id}`}
                  aria-label={`${home?.shortName ?? match.homeTeamId} vs ${away?.shortName ?? match.awayTeamId}`}
                />
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
                <span className="match-status">
                  {isLive && <span className="live-dot" aria-label="Live" />}
                  {statusLabel(match)}
                </span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
