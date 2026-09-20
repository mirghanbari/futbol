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

async function ingestLiveStatsFor(code, liveForCode, previousForCode) {
  const leagueId = FOTMOB_LEAGUE_IDS[code];
  const matches = await readJson(`${DATA_DIR}leagues/${code}/matches.json`);
  const teams = await readJson(`${DATA_DIR}leagues/${code}/teams.json`);
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const matchById = new Map(matches.map((m) => [m.id, m]));

  // Carried forward rather than rebuilt from scratch: a match that has
  // finished and been marked final keeps the numbers it was last given, so a
  // finished match doesn't lose its xG the moment it stops being live.
  const out = { ...previousForCode };

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

  for (const [matchId, patch] of toFetch) {
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
      if (hasAnyStat(homeStats) && hasAnyStat(awayStats)) {
        out[matchId] = {
          home: homeStats,
          away: awayStats,
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

  return out;
}

async function main() {
  // live.json is the input: ingest-espn-live.mjs has just rewritten it with
  // today's statuses, so it already answers "what is being played right now"
  // without a second scoreboard call. If it's missing there is nothing live
  // to enrich and nothing to do.
  const live = await readJson(`${PUBLIC_DIR}live.json`, {});
  const previous = await readJson(`${PUBLIC_DIR}live-stats.json`, {});

  const out = {};
  for (const { code } of COMPETITIONS) {
    const liveForCode = live[code] ?? {};
    const previousForCode = previous[code] ?? {};
    // Dropped entirely when the competition has nothing in today's live.json
    // — that's how yesterday's matches leave the file on the next calendar
    // day, mirroring live.json's own today-only scope.
    if (Object.keys(liveForCode).length === 0) continue;

    try {
      const stats = await ingestLiveStatsFor(code, liveForCode, previousForCode);
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
