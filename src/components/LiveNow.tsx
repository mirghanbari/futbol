import { MatchCard, isLiveMatch } from "./MatchCard";
import type { LeagueData } from "../data";
import { teamById } from "../data";
import type { MatchOdds } from "../data/useMatchOdds";
import type { Match } from "../data/types";

interface LiveNowProps {
  // Already live-patched (see applyLive) — this filters for the in-play ones
  // itself so every caller gets the same definition of "active".
  matches: Match[];
  data: LeagueData;
  competitionId: string | undefined;
  // Matches spanning more than one local day (rare, but late kickoffs roll
  // past midnight in some timezones) read better with the date on the card.
  showDate?: boolean;
  // Pre-match odds by match id (useMatchOdds). A live card is the one with
  // the least on it — no box-score stats exist until full time — so the
  // forecast is worth keeping here rather than dropping it at kickoff.
  // Optional: a caller without a ratings model just gets cards without bars.
  odds?: Map<string, MatchOdds>;
}

// "Live now" strip pinned above the rest of a page's content. Renders nothing
// at all when no match is in play, so pages can mount it unconditionally.
export function LiveNow({ matches, data, competitionId, showDate = false, odds }: LiveNowProps) {
  const live = matches.filter(isLiveMatch).sort((a, b) => a.utcDate.localeCompare(b.utcDate));
  if (live.length === 0) return null;

  return (
    <section className="live-now" aria-label="Live matches">
      <h2 className="live-now-title">
        {/* Decorative here — the heading text and the section label already
            say "live"; a named dot would read as "Live Live now". */}
        <span className="live-dot" aria-hidden="true" />
        Live now
      </h2>
      <div className="matches-grid">
        {live.map((match) => (
          <MatchCard
            key={match.id}
            match={match}
            competitionId={competitionId}
            home={teamById(data, match.homeTeamId)}
            away={teamById(data, match.awayTeamId)}
            odds={odds?.get(match.id)}
            showDate={showDate}
          />
        ))}
      </div>
    </section>
  );
}
