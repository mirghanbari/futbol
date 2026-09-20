// Fast, keyless live-score layer: cross-references each competition's ESPN
// scoreboard (today, UTC) against the football-data.org-sourced matches.json
// already on disk, and writes a slim public/live.json — {competitionId:
// {matchId: {status, minute, homeGoals, awayGoals}}} — for today's matches
// only. Client-side polling (src/data/live.ts) overlays this onto the static
// match data so scores update without a full data rebuild.
//
// ESPN and football-data.org don't share match IDs, so matches are joined by
// normalized team name (folding diacritics, stripping club-suffix words like
// FC/AFC/CF so "AFC Bournemouth" vs "Bournemouth" still match) — see
// espn-shared.mjs's ALIASES for the ~50 genuine naming mismatches
// normalization alone can't fix, and its findEspnEvent for the join itself
// (shared with ingest-espn-schedule.mjs). Effectively also scoped to today
// here, since fetchScoreboard is only ever called for today's date.
//
// Deliberately NOT the full ESPN ingest world-cup uses (teams/rosters/full
// fixture list) — football-data.org already owns that here. This script only
// ever adds live status on top.
//
// Beyond status/score, each patch carries what the scoreboard exposes while a
// match is actually being played: five team stats and a goal/card timeline.
// This exists because nothing else covers the in-play window — FotMob's
// box scores (ingest-fotmob.mjs) are fetched for FINISHED matches only, so
// until this was added a match in play had no stats of any kind and rendered
// as little more than a scoreline. ESPN's live set is narrower than FotMob's
// (no xG, passes, duels, box touches, offsides or saves — see STAT_FIELDS),
// so it's a floor for the live window, not a replacement: applyLive only
// falls back to it when the match has no FotMob stats of its own.
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { COMPETITIONS } from "./competitions.mjs";
import { ALIASES, ESPN_SLUGS, fetchScoreboard, findEspnEvent, normalizeName } from "./espn-shared.mjs";

const DATA_DIR = fileURLToPath(new URL("../src/data/", import.meta.url));
const PUBLIC_DIR = fileURLToPath(new URL("../public/", import.meta.url));

function todayUTC() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, "");
}

function toStatus(type) {
  if (type.name === "STATUS_HALFTIME") return "paused";
  if (type.name === "STATUS_POSTPONED") return "postponed";
  if (type.name === "STATUS_CANCELED" || type.name === "STATUS_ABANDONED") return "cancelled";
  if (type.state === "in") return "in-play";
  if (type.state === "post") return "finished";
  return "scheduled";
}

// ESPN competitor `statistics` name -> our MatchAdvancedStats field. Only
// the five that ESPN actually publishes live; the rest of MatchAdvancedStats
// (xg, accuratePasses, duelsWon, boxTouches, offsides, saves) stays FotMob-
// only and simply doesn't appear until full time. ESPN also reports
// appearances/goalAssists/shotAssists/totalGoals, which are either already
// covered by the scoreline or have no field here.
const STAT_FIELDS = {
  possessionPct: "possession",
  totalShots: "shots",
  shotsOnTarget: "shotsOnTarget",
  wonCorners: "corners",
  foulsCommitted: "fouls",
};

// ESPN sends every statistic as a display STRING ("55.1", "7"). Anything
// non-numeric ("-" turns up for a stat a match hasn't produced yet) is
// dropped rather than written as NaN, which would serialise to null and
// render as a blank row.
//
// Callers MUST check hasPlayed first. A match that hasn't kicked off still
// publishes the full statistics array, every value "0" (confirmed on a live
// feed: a STATUS_SCHEDULED La Liga fixture four hours out reported nine
// zeroed stats) — and every one of those parses as a finite number, so
// there's nothing in the payload itself to filter on. Writing them would put
// a "Match stats: 0% possession, 0 shots" card on every upcoming fixture.
function toStats(competitor) {
  const out = {};
  for (const stat of competitor.statistics ?? []) {
    const field = STAT_FIELDS[stat.name];
    if (!field) continue;
    const value = Number(stat.displayValue);
    if (Number.isFinite(value)) out[field] = value;
  }
  return Object.keys(out).length > 0 ? out : null;
}

// Goals and cards from the scoreboard's play-by-play. Substitutions are in
// there too (MatchEvent has a "substitution" type) but are deliberately
// skipped: they treble the timeline's length for the one page that shows it,
// and ESPN gives only the player coming on, which reads as a bare name with
// no indication of who it replaced.
//
// Classified off the booleans rather than `type.text`, which is free-form and
// carries the method rather than the kind ("Goal - Free-kick", "Goal -
// Header", "Penalty - Scored"). Order matters: a red card is also flagged
// yellowCard when it's a second booking.
// [clampedSeconds, stoppageMinutes] — see the comment at the call site for
// why it takes two numbers. A detail with no usable clock sorts to the very
// end rather than to minute zero.
function sortKey(detail) {
  const seconds = Number(detail.clock?.value);
  if (!Number.isFinite(seconds)) return [Number.MAX_SAFE_INTEGER, 0];
  const stoppage = /\+\s*(\d+)/.exec(detail.clock?.displayValue ?? "");
  return [seconds, stoppage ? Number(stoppage[1]) : 0];
}

// Statuses a match can only reach by actually being played, so the only ones
// whose statistics array means anything.
//
// Tested against the NORMALIZED status, not ESPN's raw `state`: ESPN files
// STATUS_POSTPONED and STATUS_CANCELED under state "post" (with
// completed: false), so `state !== "pre"` would wave through exactly the
// fixtures this is meant to exclude — and a postponed match carries the same
// all-zero statistics array as a scheduled one. toStatus already handles both
// by name, ahead of any state check, which is why it's the thing to ask.
//
// "finished" is included deliberately: ESPN's five stats are final at full
// time, and they're the only stats a finished match has until
// ingest-fotmob.mjs next runs, which can be hours.
const PLAYED_STATUSES = new Set(["in-play", "paused", "finished"]);

function toEvent(detail, teamIdByEspnId) {
  const teamId = teamIdByEspnId.get(String(detail.team?.id));
  if (!teamId) return null;

  let type;
  if (detail.scoringPlay) type = "goal";
  else if (detail.redCard) type = "red-card";
  else if (detail.yellowCard) type = "yellow-card";
  else return null;

  // Shootout penalties are listed as scoring plays but don't change the
  // scoreline this app shows (Match.shootout is tracked separately), so a
  // timeline including them would contradict the score beside it.
  if (detail.shootout) return null;

  const athlete = detail.athletesInvolved?.[0];
  return {
    // "" when the feed omits a clock. Rendered as a dash rather than dropped
    // — a goal with no timestamp is still a goal — and sortKey puts it at the
    // end rather than letting a missing clock read as minute zero.
    minute: detail.clock?.displayValue ?? "",
    type,
    teamId,
    playerName: athlete?.displayName ?? "Unknown",
    // Only meaningful on goals, and only worth the bytes when true.
    ...(detail.ownGoal ? { ownGoal: true } : {}),
    ...(detail.penaltyKick ? { penalty: true } : {}),
  };
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return [];
  }
}

async function ingestLiveForCompetition(code) {
  const slug = ESPN_SLUGS[code];
  const matches = await readJson(`${DATA_DIR}leagues/${code}/matches.json`);
  const teams = await readJson(`${DATA_DIR}leagues/${code}/teams.json`);
  const teamById = new Map(teams.map((t) => [t.id, t]));

  const today = new Date().toISOString().slice(0, 10);
  const todaysMatches = matches.filter((m) => m.utcDate.slice(0, 10) === today);
  if (todaysMatches.length === 0) return {};

  let events;
  try {
    const sb = await fetchScoreboard(slug, todayUTC());
    events = sb.events ?? [];
  } catch (err) {
    console.warn(`[${code}] ESPN scoreboard fetch failed: ${err.message}`);
    return {};
  }

  const live = {};
  for (const match of todaysMatches) {
    const home = teamById.get(match.homeTeamId);
    const away = teamById.get(match.awayTeamId);
    if (!home || !away) continue;

    const event = findEspnEvent(events, home.name, away.name, today);

    if (!event) {
      console.warn(`[${code}] no ESPN match found for ${home.name} vs ${away.name} today`);
      continue;
    }

    const competition = event.competitions[0];
    const comps = competition.competitors;
    const eHome = comps.find((c) => c.homeAway === "home");
    const eAway = comps.find((c) => c.homeAway === "away");

    // ESPN team id -> OUR (football-data) team id, so the timeline's teamId
    // is in the same namespace as match.homeTeamId/awayTeamId and the client
    // never has to know ESPN's ids exist. Built from homeAway rather than by
    // name: the match-level join above has already established which side is
    // which, so re-deriving it per event would be a second chance to be wrong.
    const teamIdByEspnId = new Map([
      [String(eHome.id), match.homeTeamId],
      [String(eAway.id), match.awayTeamId],
    ]);

    const status = toStatus(event.status.type);
    const played = PLAYED_STATUSES.has(status);
    const homeStats = played ? toStats(eHome) : null;
    const awayStats = played ? toStats(eAway) : null;

    // Sorted here so the client can render in array order: "45'+1'" doesn't
    // sort lexically against "9'", and ESPN's own ordering isn't something to
    // rely on.
    //
    // Two keys, because clock.value alone isn't enough: ESPN CLAMPS it to the
    // period boundary, so every first-half stoppage event reports 2700 and
    // every second-half one 5400 (verified across fixtures — "90'+3'" and
    // "90'+6'" are both 5400). Ordering on it alone would leave exactly the
    // stoppage-time events unsorted. The `+N` parsed out of displayValue
    // breaks those ties, and it has to stay a SEPARATE key rather than be
    // folded into the seconds: 45'+15' would otherwise total 3600 and sort
    // after a 50' event, which is 900 seconds later but a quarter of an hour
    // earlier in the match.
    const timeline = (competition.details ?? [])
      .map((detail, i) => ({ detail, key: sortKey(detail), i }))
      // Index last so equal keys keep feed order — Array#sort is stable, but
      // saying so in the comparator survives anyone reaching for .toSorted().
      .sort((a, b) => a.key[0] - b.key[0] || a.key[1] - b.key[1] || a.i - b.i)
      .map(({ detail }) => toEvent(detail, teamIdByEspnId))
      .filter(Boolean);

    live[match.id] = {
      status,
      minute: event.status.type.state === "in" ? (event.status.displayClock ?? null) : null,
      homeGoals: Number(eHome.score ?? 0),
      awayGoals: Number(eAway.score ?? 0),
      // Both omitted rather than written empty: an un-kicked-off fixture has
      // neither (see PLAYED_STATUSES), and `stats: {home: null, away: null}` on
      // every one of them is pure noise in a file the client re-fetches every
      // 60 seconds.
      ...(homeStats && awayStats ? { stats: { home: homeStats, away: awayStats } } : {}),
      ...(timeline.length > 0 ? { events: timeline } : {}),
    };
  }

  return live;
}

// Maintenance mode: `node scripts/ingest-espn-live.mjs --check` verifies
// every team in every competition's teams.json resolves to an ESPN team via
// ALIASES + normalizeName, independent of whether anything's playing today.
// Re-run this each preseason (promotions/relegations rotate the team lists)
// or whenever a competition starts throwing "no ESPN match found" warnings.
async function checkAliases() {
  let unmatchedTotal = 0;
  for (const { code } of COMPETITIONS) {
    const slug = ESPN_SLUGS[code];
    const teams = await readJson(`${DATA_DIR}leagues/${code}/teams.json`);
    const res = await fetch(
      `https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/teams?limit=50`,
      { signal: AbortSignal.timeout(15000) },
    );
    const json = await res.json();
    const espnNames = (json.sports?.[0]?.leagues?.[0]?.teams ?? []).map(
      (t) => t.team.displayName,
    );
    const espnNorm = new Set(espnNames.map(normalizeName));
    const unmatched = teams.filter(
      (t) => !espnNorm.has(normalizeName(ALIASES[t.name] ?? t.name)),
    );
    unmatchedTotal += unmatched.length;
    console.log(`[${code}] ${unmatched.length}/${teams.length} unmatched`);
    for (const t of unmatched) console.log(`  ${t.name}`);
  }
  console.log(unmatchedTotal === 0 ? "All teams matched." : `${unmatchedTotal} unmatched total.`);
  if (unmatchedTotal > 0) process.exitCode = 1;
}

async function main() {
  if (process.argv.includes("--check")) return checkAliases();

  // ESPN's API is keyless with no rate limit to respect (unlike the
  // football-data.org ingest), and each competition's fetch is independent —
  // so run all 9 concurrently rather than serially. This is the layer that
  // exists specifically to be fast on update-live.yml's 10-minute cron.
  const results = await Promise.all(
    COMPETITIONS.map(async ({ code }) => [code, await ingestLiveForCompetition(code)]),
  );
  const live = Object.fromEntries(results);
  await writeFile(`${PUBLIC_DIR}live.json`, JSON.stringify(live));
  const total = Object.values(live).reduce((sum, m) => sum + Object.keys(m).length, 0);
  console.log(`Wrote public/live.json (${total} live-tracked matches today).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
