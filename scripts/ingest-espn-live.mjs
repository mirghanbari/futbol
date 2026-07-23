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

    const comps = event.competitions[0].competitors;
    const eHome = comps.find((c) => c.homeAway === "home");
    const eAway = comps.find((c) => c.homeAway === "away");
    live[match.id] = {
      status: toStatus(event.status.type),
      minute: event.status.type.state === "in" ? (event.status.displayClock ?? null) : null,
      homeGoals: Number(eHome.score ?? 0),
      awayGoals: Number(eAway.score ?? 0),
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
