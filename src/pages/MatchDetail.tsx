import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { matchById, teamById } from "../data";
import { useCompetitionPage } from "../data/useCompetitionPage";
import { LeagueStatus } from "../components/LeagueStatus";
import { ProbabilityBar } from "../components/ProbabilityBar";
import { applyLive, formatMinute, useLiveData, useLiveStats } from "../data/live";
import { computeRatings, expectedGoals, matchProbabilities } from "../data/ratings";
import { hasPreMatchOdds } from "../data/useMatchOdds";
import { useSeo } from "../data/seo";
import type { Match, MatchAdvancedStats, MatchEvent } from "../data/types";

// schema.org's EventStatusType has no "finished"/"live" value — only
// postponed/cancelled are worth flagging explicitly, everything else is left
// as the default EventScheduled.
function eventStatus(status: Match["status"]): string | undefined {
  if (status === "postponed") return "https://schema.org/EventPostponed";
  if (status === "cancelled") return "https://schema.org/EventCancelled";
  return undefined;
}

interface StatRowDef {
  key: keyof MatchAdvancedStats;
  label: string;
  suffix?: string;
}

const STAT_ROWS: StatRowDef[] = [
  { key: "possession", label: "Possession", suffix: "%" },
  { key: "xg", label: "Expected goals (xG)" },
  { key: "shots", label: "Shots" },
  { key: "shotsOnTarget", label: "Shots on target" },
  { key: "accuratePasses", label: "Accurate passes" },
  { key: "duelsWon", label: "Duels won" },
  { key: "boxTouches", label: "Touches in opposition box" },
  { key: "corners", label: "Corners" },
  { key: "fouls", label: "Fouls" },
  { key: "offsides", label: "Offsides" },
  { key: "saves", label: "Saves" },
];

// STAT_ROWS is filtered against what's actually present, so the same table
// renders both sources: ESPN's live five (possession/shots/shots on target/
// corners/fouls) collapse to five rows, FotMob's full set to eleven. The
// badge is what tells them apart — the row count alone would just look like
// missing data.
// Owns its own card so that the early return below takes the whole thing
// with it. With the card outside, a stats object that happens to carry no
// recognised key — which `{}` from a degenerate feed response is — left an
// empty card on the page with nothing in it but the provisional caveat.
function StatsTable({
  home,
  away,
  badge,
  note,
}: {
  home: MatchAdvancedStats;
  away: MatchAdvancedStats;
  badge: string;
  note?: string;
}) {
  const rows = STAT_ROWS.filter((row) => home[row.key] !== undefined || away[row.key] !== undefined);
  if (rows.length === 0) return null;

  return (
    <div className="card">
      <h2>Match stats</h2>
      <span className="source-badge">{badge}</span>
      <table style={{ marginTop: "0.75rem" }}>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <td style={{ textAlign: "right" }}>
                {home[row.key] ?? "—"}
                {row.suffix ?? ""}
              </td>
              <td style={{ textAlign: "center", opacity: 0.7 }}>{row.label}</td>
              <td>
                {away[row.key] ?? "—"}
                {row.suffix ?? ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {note && <p className="stats-note">{note}</p>}
    </div>
  );
}

// Labelled rather than aria-hidden: the icon is the ONLY thing separating a
// goal from a booking (the row is otherwise just a minute and a name), so
// hiding it would leave a screen reader hearing the same "9' Enzo Fern\u00e1ndez"
// for both. Same role="img" + aria-label pattern as .live-dot elsewhere.
const EVENT_KINDS: Record<MatchEvent["type"], { icon: string; label: string }> = {
  goal: { icon: "\u26bd", label: "Goal" },
  "yellow-card": { icon: "\u{1f7e8}", label: "Yellow card" },
  "red-card": { icon: "\u{1f7e5}", label: "Red card" },
  substitution: { icon: "\u21c4", label: "Substitution" },
};

function eventLabel(event: MatchEvent): string {
  if (event.type !== "goal") return event.playerName;
  if (event.ownGoal) return `${event.playerName} (o.g.)`;
  if (event.penalty) return `${event.playerName} (pen.)`;
  return event.playerName;
}

// Goals and cards, home on the left and away on the right so the column an
// entry sits in reads as "which team" without a crest or a label. Already in
// chronological order when it arrives (the ingest sorts it) — no sort here,
// because "45'+1'" doesn't order lexically against "9'".
function Timeline({
  events,
  homeTeamId,
  homeName,
  awayName,
  badge,
}: {
  events: MatchEvent[];
  homeTeamId: string;
  homeName: string;
  awayName: string;
  badge: string;
}) {
  return (
    <div>
      <h2>Timeline</h2>
      <span className="source-badge">{badge}</span>
      <ul className="timeline">
        {events.map((event, i) => (
          // No stable id in the feed, and the same player can score twice in
          // the same displayed minute, so the index is the only honest key.
          // Safe here: the list is append-only within a match and never
          // reordered or filtered.
          <li
            key={i}
            className={event.teamId === homeTeamId ? "timeline-row" : "timeline-row timeline-away"}
          >
            {/* Dash rather than an empty cell: the feed occasionally omits a
                clock, and those events are sorted to the end rather than
                being presented as minute zero. */}
            <span className="timeline-minute">{event.minute || "\u2014"}</span>
            <span className="timeline-icon" role="img" aria-label={EVENT_KINDS[event.type].label}>
              {EVENT_KINDS[event.type].icon}
            </span>
            {/* Which team an entry belongs to is otherwise carried ONLY by
                which side of the centre line the row sits on — invisible to a
                screen reader, and flattened away below 520px where rows go
                full width. */}
            <span className="visually-hidden">
              {event.teamId === homeTeamId ? homeName : awayName}
            </span>
            <span className="timeline-player">{eventLabel(event)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function MatchDetail() {
  const { competitionId, matchId } = useParams();
  const { competition, data, error, loading } = useCompetitionPage(competitionId);
  const live = useLiveData();
  // Only this page renders match stats, so it's the only one that fetches the
  // FotMob live overlay — see useLiveStats.
  const liveStats = useLiveStats();

  const rawMatch = data && matchId ? matchById(data, matchId) : undefined;
  const match = rawMatch ? applyLive([rawMatch], live, competitionId, liveStats)[0] : undefined;
  const home = data && match ? teamById(data, match.homeTeamId) : undefined;
  const away = data && match ? teamById(data, match.awayTeamId) : undefined;
  const status = match ? eventStatus(match.status) : undefined;

  useSeo({
    title: match && home && away ? `${home.name} vs ${away.name}` : "Match",
    description:
      match && home && away
        ? `${home.name} vs ${away.name} — ${competition?.name ?? "match"} on ${new Date(match.utcDate).toLocaleDateString()}.`
        : undefined,
    jsonLd:
      match && home && away
        ? {
            "@context": "https://schema.org",
            "@type": "SportsEvent",
            name: `${home.name} vs ${away.name}`,
            startDate: match.utcDate,
            ...(status ? { eventStatus: status } : {}),
            homeTeam: { "@type": "SportsTeam", name: home.name },
            awayTeam: { "@type": "SportsTeam", name: away.name },
          }
        : undefined,
  });

  const ratingsModel = useMemo(() => (data ? computeRatings(data.ratingsStandings) : null), [data]);

  if (error || loading) return <LeagueStatus error={error} loading={loading} />;
  if (!data) return null;
  if (!rawMatch || !match) return <p>Match not found.</p>;

  const isLive = match.status === "in-play" || match.status === "paused";
  // Both overlays outlive the match they describe — each keeps today's
  // entries until the calendar day rolls over — so "live" can't be baked into
  // a source name.
  //
  // What makes a number provisional differs by source, so neither can be
  // decided by match.status alone:
  //   fotmob-live — a mid-match snapshot. Stays provisional AFTER full time,
  //     until the post-whistle pass sets `final` (which flips the source to
  //     "fotmob"). Keying this on isLive was wrong: it dropped the warning at
  //     exactly the moment the numbers were most likely to be stale.
  //   espn — final the moment the match is, because ESPN keeps publishing the
  //     same five through full time. So isLive IS the right test here.
  //   fotmob — from disk, always final.
  const provisional = match.statsSource === "fotmob-live";
  const sourceBadge =
    match.statsSource === "espn"
      ? `ESPN${isLive ? " · live" : ""}`
      : `FotMob${provisional ? " · live" : ""}`;
  const isHalfTime = match.status === "paused";
  const clock = isHalfTime ? "HT" : match.minute ? formatMinute(match.minute) : "";

  // Kept up while the match is in play, not just before kickoff: the live
  // overlay carries only status/minute/score, and FotMob's box-score stats
  // don't land until full time, so dropping the forecast at kickoff left an
  // in-play match showing less than it had an hour earlier. See
  // hasPreMatchOdds.
  const odds =
    hasPreMatchOdds(match) && ratingsModel
      ? (() => {
          const xg = expectedGoals(ratingsModel, match.homeTeamId, match.awayTeamId);
          return xg ? matchProbabilities(xg.home, xg.away) : null;
        })()
      : null;

  return (
    <div className="match-detail">
      <p>
        <Link to={`/matches/${competitionId}`}>← Back to {competition?.name ?? "matches"}</Link>
      </p>

      <div className="card">
        <div className="match-head">
          <Link className="match-head-team" to={`/teams/${competitionId}/${match.homeTeamId}`}>
            {home?.crest && <img className="crest" src={home.crest} alt="" />}
            {home?.name ?? match.homeTeamId}
          </Link>
          <div className="score-big">
            {match.homeTeam.goals} – {match.awayTeam.goals}
          </div>
          <Link className="match-head-team" to={`/teams/${competitionId}/${match.awayTeamId}`}>
            {away?.crest && <img className="crest" src={away.crest} alt="" />}
            {away?.name ?? match.awayTeamId}
          </Link>
        </div>
        <div className="match-head-meta">
          <p className="match-meta">
            {match.matchday !== null && `Matchday ${match.matchday} · `}
            {new Date(match.utcDate).toLocaleString()} ·{" "}
            {isLive && <span className="live-dot" role="img" aria-label="Live" />}
            {isLive && clock ? clock : match.status}
          </p>
          {match.venue && <p className="match-meta">{match.venue}</p>}
          {match.broadcasts && match.broadcasts.length > 0 && (
            <p className="broadcasts">
              {match.broadcasts.map((b) => (
                <span className="broadcast-badge" key={`${b.kind}-${b.name}`}>
                  {b.kind === "streaming" ? "▶" : "📺"} {b.name}
                </span>
              ))}
            </p>
          )}
        </div>
      </div>

      {odds && (
        <div className="card">
          {/* Explicitly "pre-match": the model never reads the live score, so
              on a live page an unqualified "Odds" would be taken for an
              in-play recalculation. (It is not frozen at kickoff either —
              computeRatings reads whatever standings the loaded data file
              has, so a refresh mid-match can nudge the numbers. It stays a
              pre-match-shaped forecast regardless, which is what the label
              is claiming.) */}
          <h2 style={{ marginTop: 0 }}>Pre-match odds</h2>
          <ProbabilityBar
            home={odds.home}
            draw={odds.draw}
            away={odds.away}
            homeLabel={home?.shortName ?? match.homeTeamId}
            awayLabel={away?.shortName ?? match.awayTeamId}
            size="md"
          />
        </div>
      )}

      {match.events && match.events.length > 0 && (
        <div className="card">
          <Timeline
            events={match.events}
            homeTeamId={match.homeTeamId}
            homeName={home?.shortName ?? match.homeTeamId}
            awayName={away?.shortName ?? match.awayTeamId}
            // Always ESPN — the timeline has no other source — but still
            // "live" only while it can still gain entries.
            badge={isLive ? "ESPN · live" : "ESPN"}
          />
        </div>
      )}

      {match.stats && (
        <StatsTable
          home={match.stats.home}
          away={match.stats.away}
          badge={sourceBadge}
          // Worth saying plainly: unlike every other number on this page, xG
          // is RE-RATED as a match goes on and can go DOWN between refreshes.
          // Without this, a value that drops reads as a bug.
          note={provisional ? "Provisional — xG is revised as the match is re-rated." : undefined}
        />
      )}
    </div>
  );
}
