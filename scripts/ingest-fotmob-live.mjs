// Advanced team stats for matches being played RIGHT NOW, written to
// public/live-stats.json as an overlay on top of the ESPN one.
//
// Why this exists: ESPN's live layer (ingest-espn-live.mjs) covers only
// possession, shots, shots on target, corners and fouls. The stat that
// actually reframes a live scoreline — xG — is FotMob-only, and
// ingest-fotmob.mjs fetches FINISHED matches exclusively, so it never
// arrives until after the whistle.
//
// Why it is a SEPARATE script and a separate file, rather than relaxing
// ingest-fotmob.mjs's finished-only filter:
//
//   1. That script is incremental by design — one matchDetails call per
//      match, once, ever. Live coverage means re-fetching the same match
//      every few minutes, which is the opposite property. Folding the two
//      together would put a season's worth of xG, player stats and season
//      totals behind a request pattern ~30x heavier against an unofficial,
//      keyless API. FotMob getting rate-limited or IP-blocked from a CI
//      runner would then cost the app its richest dataset, not just its
//      live extras (see that script's own note on FBref and Cloudflare for
//      why this is not hypothetical).
//   2. This script never writes src/data. It only ever creates
//      public/live-stats.json, so its total blast radius is "live matches
//      lose xG for a while" — the same failure mode as the ESPN layer.
//
// Scope is deliberately team stats only. FotMob's per-player live data
// (ratings, individual xG/xA) is a bigger feature and a bigger request
// budget; it should wait until this has survived a few matchdays unblocked.
//
// Cadence: called from update-live.yml's poll loop, but at a fraction of the
// ESPN pass's rate (see FOTMOB_LIVE_EVERY there). xG does not move fast
// enough to justify 60s, and the slower tick is most of what keeps the call
// volume defensible.
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { COMPETITIONS } from "./competitions.mjs";
import {
  FOTMOB,
  FOTMOB_LEAGUE_IDS,
  PAUSE_MS,
  extractMatchEvents,
  extractTeamStats,
  findFixture,
  getJson,
  readJson,
  sleep,
} from "./fotmob-shared.mjs";

const DATA_DIR = fileURLToPath(new URL("../src/data/", import.meta.url));
const PUBLIC_DIR = fileURLToPath(new URL("../public/", import.meta.url));

// Statuses worth a fetch. Excludes "scheduled" (nothing to report) and
// handles "finished" separately — see needsFetch.
const IN_PLAY = new Set(["in-play", "paused"]);

// Stop STARTING new matches after this long. The pass runs inline in
// update-live.yml's 60s score-poll loop, and nothing else in that loop can
// run while it does — so an unbounded pass trades the thing this script is a
// nice-to-have for (xG) against the thing the loop exists for (scores).
//
// The arithmetic is not hypothetical: getJson retries 3x with a 15s timeout
// and backoff, so one unhealthy match can cost ~47s, and ~20 in-play matches
// on a Saturday slate would freeze scores for a quarter of an hour. Even
// healthy, 20-25 matches at PAUSE_MS apiece plus a leagues call per
// competition runs past a single tick.
//
// Matches left unfetched are not lost: the next pass picks them up, and a
// finished one still has its post-whistle read pending (needsFetch).
const PASS_BUDGET_MS = 45_000;

// extractTeamStats returns undefined only when FotMob's stats blob is missing
// entirely. When the blob is present but yields nothing — empty in the opening
// minutes, or a key rename upstream (the existing "BallPossesion" typo key is
// a standing reminder that these drift) — it returns an object whose eleven
// fields are all undefined, which is truthy and JSON.stringifies to `{}`.
//
// Writing that would be worse than writing nothing: fotmob-live outranks the
// ESPN overlay in applyLive, so an empty object would replace five working
// stats with none. The ESPN-side twin (toStats) already guards this; so does
// this one.
function hasAnyStat(stats) {
  return stats != null && Object.values(stats).some((value) => value !== undefined);
}

// A live match is re-fetched on every pass; a finished one is fetched at most
// once more, to replace its last in-play snapshot with true full-time
// numbers, and then left alone (`final`). Without that one extra pass a
// match's xG would freeze at whatever it was up to ~5 minutes before the
// whistle and sit there until the next ingest-fotmob.mjs run, which can be
// hours away.
function needsFetch(status, existing) {
  if (IN_PLAY.has(status)) return true;
  return status === "finished" && existing != null && !existing.final;
}

async function ingestLiveStatsFor(code, liveForCode, previousForCode, deadline) {
  const leagueId = FOTMOB_LEAGUE_IDS[code];
  const matches = await readJson(`${DATA_DIR}leagues/${code}/matches.json`);
  const teams = await readJson(`${DATA_DIR}leagues/${code}/teams.json`);
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const matchById = new Map(matches.map((m) => [m.id, m]));

  // Carried forward rather than rebuilt from scratch: a match that has
  // finished and been marked final keeps the numbers it was last given, so a
  // finished match doesn't lose its xG the moment it stops being live.
  //
  // Pruned against TODAY'S fixtures rather than against live.json, which is
  // what makes the carry-forward both complete and bounded:
  //   - live.json is missing a whole competition whenever ingest-espn-live's
  //     scoreboard fetch fails for it (warn-only, returns {}). Keying off it
  //     meant one bad tick discarded every stored entry for that competition
  //     — and any match that reached "finished" before the next pass could
  //     never be re-fetched, since needsFetch only finalises a match it
  //     already has an entry for.
  //   - Keying off "the competition has anything on today" never aged out
  //     individual matches, so a Tuesday CL card stayed in the file all
  //     Wednesday and a weekend's fixtures accumulated across all of it.
  const today = new Date().toISOString().slice(0, 10);
  const playingToday = new Set(
    matches.filter((m) => m.utcDate.slice(0, 10) === today).map((m) => m.id),
  );
  const out = {};
  for (const [matchId, entry] of Object.entries(previousForCode)) {
    if (playingToday.has(matchId)) out[matchId] = entry;
  }

  const toFetch = Object.entries(liveForCode).filter(([matchId, patch]) =>
    needsFetch(patch.status, previousForCode[matchId]),
  );
  if (toFetch.length === 0) return out;

  // One fixture-list call per competition, reused to resolve every match's
  // FotMob id — same pattern as ingest-fotmob.mjs, and the reason a busy
  // matchday costs one call plus one per live match rather than two per.
  const league = await getJson(`${FOTMOB}/leagues?id=${leagueId}`);
  await sleep(PAUSE_MS);
  const fixtures = league.fixtures?.allMatches ?? [];

  let skipped = 0;
  for (const [matchId, patch] of toFetch) {
    if (Date.now() > deadline) {
      skipped += 1;
      continue;
    }
    const match = matchById.get(matchId);
    if (!match) continue;
    const home = teamById.get(match.homeTeamId);
    const away = teamById.get(match.awayTeamId);
    if (!home || !away) continue;

    const dateStr = match.utcDate.slice(0, 10);
    const fixture = findFixture(fixtures, home.name, away.name, dateStr);
    if (!fixture) {
      console.warn(`[${code}] no FotMob match for ${home.name} vs ${away.name} on ${dateStr}`);
      continue;
    }

    try {
      const details = await getJson(`${FOTMOB}/matchDetails?matchId=${fixture.id}`);
      const homeStats = extractTeamStats(details, "home");
      const awayStats = extractTeamStats(details, "away");
      // Same response, so the timeline is free. It supersedes the ESPN one on
      // the client because it names the assist and how the goal was scored,
      // neither of which ESPN's scoreboard carries at all.
      const events = extractMatchEvents(details, match.homeTeamId, match.awayTeamId);
      if (hasAnyStat(homeStats) && hasAnyStat(awayStats)) {
        // A pass that reads stats but extracts no events (an early read, or a
        // shape change upstream) must not wipe a timeline an earlier pass
        // already built: this assignment replaces the entry wholesale, and if
        // that pass is the post-whistle one it also sets `final`, so the match
        // is never re-fetched and the loss lasts the rest of the day.
        const keptEvents = events.length > 0 ? events : previousForCode[matchId]?.events;

        out[matchId] = {
          home: homeStats,
          away: awayStats,
          // Omitted when there is nothing on either side (a 0-0 with no
          // cards) so the client falls through to ESPN's rather than
          // rendering a confidently empty timeline.
          ...(keptEvents?.length ? { events: keptEvents } : {}),
          // Only ever set on the post-whistle pass, and only then does it
          // stop this match being fetched again.
          ...(patch.status === "finished" ? { final: true } : {}),
        };
      }
    } catch (err) {
      // Non-fatal per match: the next pass retries, and a match that never
      // resolves simply keeps ESPN's five stats.
      console.warn(`[${code}] FotMob live fetch failed for match ${matchId}: ${err.message}`);
    }
    await sleep(PAUSE_MS);
  }

  if (skipped > 0) {
    console.warn(`[${code}] budget reached; ${skipped} match(es) left for the next pass.`);
  }
  return out;
}

async function main() {
  // live.json is the input: ingest-espn-live.mjs has just rewritten it with
  // today's statuses, so it already answers "what is being played right now"
  // without a second scoreboard call. It is not the only input though — see
  // the pruning note in ingestLiveStatsFor for why a competition absent from
  // it is still processed.
  const live = await readJson(`${PUBLIC_DIR}live.json`, {});
  const previous = await readJson(`${PUBLIC_DIR}live-stats.json`, {});

  // One budget for the whole pass, not per competition — the loop tick it
  // runs inside is shared, so nine competitions each taking their own slice
  // would be nine times the freeze.
  const deadline = Date.now() + PASS_BUDGET_MS;

  const out = {};
  for (const { code } of COMPETITIONS) {
    const liveForCode = live[code] ?? {};
    const previousForCode = previous[code] ?? {};
    // No `continue` for a competition missing from live.json: it still needs
    // its stored entries carried forward and pruned against today's
    // fixtures. See the note in ingestLiveStatsFor — skipping here is how a
    // single failed ESPN scoreboard fetch used to wipe a competition's xG
    // for the rest of the day.
    if (Object.keys(liveForCode).length === 0 && Object.keys(previousForCode).length === 0) {
      continue;
    }

    try {
      const stats = await ingestLiveStatsFor(code, liveForCode, previousForCode, deadline);
      if (Object.keys(stats).length > 0) out[code] = stats;
    } catch (err) {
      // Keep whatever this competition already had rather than dropping it:
      // a failed league call shouldn't blank out stats already on the page.
      console.error(`[${code}] FotMob live ingest failed (non-fatal): ${err.message}`);
      if (Object.keys(previousForCode).length > 0) out[code] = previousForCode;
    }
  }

  await writeFile(`${PUBLIC_DIR}live-stats.json`, `${JSON.stringify(out, null, 2)}\n`);
  const count = Object.values(out).reduce((n, byMatch) => n + Object.keys(byMatch).length, 0);
  console.log(`Wrote public/live-stats.json (${count} match(es) with FotMob live stats).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
