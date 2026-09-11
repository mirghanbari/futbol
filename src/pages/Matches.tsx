import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { teamById } from "../data";
import { useCompetitionPage } from "../data/useCompetitionPage";
import { LeagueStatus } from "../components/LeagueStatus";
import { LiveNow } from "../components/LiveNow";
import { MatchCard, isLiveMatch, matchDayKey, todayKey } from "../components/MatchCard";
import { applyLive, useLiveData } from "../data/live";
import { computeRatings, expectedGoals, matchProbabilities } from "../data/ratings";
import { useSeo } from "../data/seo";
import type { Match } from "../data/types";

// Today's key, re-read when the local date actually rolls over. The whole
// Today / Upcoming / Previous split keys off this, so a tab left open
// overnight would otherwise keep filing today's fixtures under "Previous
// matchdays". It usually self-corrects on the next useLiveData tick — but
// that poll returns early when live.json is unreachable, so the rollover
// shouldn't depend on the feed being up.
function useTodayKey(): string {
  const [today, setToday] = useState(todayKey);
  useEffect(() => {
    const midnight = new Date();
    midnight.setHours(24, 0, 0, 0);
    // Re-runs on each change, so this re-arms itself every night.
    const timer = setTimeout(() => setToday(todayKey()), midnight.getTime() - Date.now() + 1000);
    return () => clearTimeout(timer);
  }, [today]);
  return today;
}

// Fixture days shown expanded under "Upcoming" before the rest fall into the
// collapsed "Later fixtures" list. Three covers the coming weekend plus any
// midweek stragglers for a domestic league.
const UPCOMING_DAYS_EXPANDED = 3;

function groupByDay(list: Match[]): [string, Match[]][] {
  const groups = new Map<string, Match[]>();
  for (const match of list) {
    const day = matchDayKey(match);
    if (!groups.has(day)) groups.set(day, []);
    groups.get(day)!.push(match);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
}

// One collapsed day of matches — used by both "Later fixtures" and "Previous
// matchdays".
//
// The body is always rendered, never gated behind the open state: a closed
// <details> keeps its children in the DOM, which is what lets Cmd-F find a
// team in a collapsed day (Chrome auto-expands the <details> on a match).
// Mounting on first open instead would have hidden most of a season from
// find-in-page and from crawlers. The cost that actually mattered — fetching
// two crests per card for hundreds of unseen matches — is handled by
// loading="lazy" in MatchCard, since a closed <details> is display:none and
// never triggers a lazy image; the 60s useLiveData re-render is handled by
// memoising the card.
function CollapsedDay({
  day,
  matches,
  defaultOpen = false,
  children,
}: {
  day: string;
  matches: Match[];
  defaultOpen?: boolean;
  children: () => JSX.Element;
}) {
  return (
    <details className="match-day-accordion" open={defaultOpen}>
      <summary>
        <span>{day}</span>{" "}
        <span className="match-day-accordion-count">
          {matches.length} {matches.length === 1 ? "match" : "matches"}
        </span>
      </summary>
      <div className="match-day-accordion-body">{children()}</div>
    </details>
  );
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
  // Live matches are lifted out of their day group into the "Live now" strip
  // rather than shown in both places — one card per match, always the one
  // that's easiest to find.
  const rest = sorted.filter((match) => !isLiveMatch(match));

  const today = useTodayKey();
  // Day keys are fixed-width, so a lexical compare is a chronological one.
  const todayMatches = rest.filter((match) => matchDayKey(match) === today);
  const upcomingDays = groupByDay(rest.filter((match) => matchDayKey(match) > today));
  // Only the next few fixture days stay open. A league's published schedule
  // runs to the end of the season — PL's was 47 days of cards — which put the
  // results you came for behind a page that scrolled for ~28,000px.
  const upcoming = upcomingDays.slice(0, UPCOMING_DAYS_EXPANDED);
  // Soonest first, unlike `previous` — the nearest fixture is the interesting
  // one in both directions.
  const later = upcomingDays.slice(UPCOMING_DAYS_EXPANDED);
  // Newest first: the day you'd most likely want to reopen is the one nearest
  // the top, right under the fixtures you arrived for.
  const previous = groupByDay(rest.filter((match) => matchDayKey(match) < today)).reverse();
  // A finished (or prior-) season has nothing live, today or ahead, so every
  // section above would be hidden and the page would open as nothing but a
  // stack of collapsed summaries. Show the most recent day's results instead.
  const nothingCurrent = todayMatches.length === 0 && upcoming.length === 0 && later.length === 0;

  const renderDay = (dayMatches: Match[]) => (
    <div className="matches-grid">
      {dayMatches.map((match) => (
        <MatchCard
          key={match.id}
          match={match}
          competitionId={competitionId}
          home={data && teamById(data, match.homeTeamId)}
          away={data && teamById(data, match.awayTeamId)}
          odds={oddsByMatchId.get(match.id)}
        />
      ))}
    </div>
  );

  return (
    <div>
      <h1>{competition?.name ?? competitionId} matches</h1>

      <LeagueStatus error={error} loading={loading} />

      {data && <LiveNow matches={sorted} data={data} competitionId={competitionId} showDate />}

      {isPriorSeason && (
        <p className="season-banner">
          Showing the {competition?.season}–{competition?.season ? Number(competition.season) + 1 : ""} season —
          the new league-phase fixture list hasn't been published yet.
        </p>
      )}

      {data && sorted.length === 0 && <p>No match data yet — run `npm run ingest`.</p>}

      {/* No "Today" heading on the (common) days with no fixtures — an empty
          section would sit at the top of the page most of the week. */}
      {todayMatches.length > 0 && (
        <section className="match-section" aria-label="Today's matches">
          <h2 className="match-section-title">Today · {today}</h2>
          {renderDay(todayMatches)}
        </section>
      )}

      {upcoming.length > 0 && (
        <section className="match-section" aria-label="Upcoming matches">
          <h2 className="match-section-title">Upcoming</h2>
          {upcoming.map(([day, dayMatches]) => (
            <div className="match-day" key={day}>
              <h3>{day}</h3>
              {renderDay(dayMatches)}
            </div>
          ))}
        </section>
      )}

      {later.length > 0 && (
        <section className="match-section" aria-label="Later fixtures">
          <h2 className="match-section-title">Later fixtures</h2>
          {later.map(([day, dayMatches]) => (
            <CollapsedDay key={day} day={day} matches={dayMatches}>
              {() => renderDay(dayMatches)}
            </CollapsedDay>
          ))}
        </section>
      )}

      {previous.length > 0 && (
        <section className="match-section" aria-label="Previous matchdays">
          <h2 className="match-section-title">Previous matchdays</h2>
          {/* Collapsed by default — a full season of results ahead of the
              fixtures you came for made the page enormous on arrival. */}
          {previous.map(([day, dayMatches], i) => (
            <CollapsedDay key={day} day={day} matches={dayMatches} defaultOpen={nothingCurrent && i === 0}>
              {() => renderDay(dayMatches)}
            </CollapsedDay>
          ))}
        </section>
      )}
    </div>
  );
}
