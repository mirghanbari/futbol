// Venue + broadcast enrichment for a whole season, from the same ESPN
// scoreboard API ingest-espn-live.mjs uses for live scores — see
// espn-shared.mjs for the shared slug/alias/matching plumbing and why venue/
// broadcast can't come from football-data.org (its own `venue` field is
// always null on this plan; confirmed via a live API check against a
// finished match).
//
// One ranged request per competition (fromDate-toDate derived from the
// season's own match dates, limit=1000) returns the whole season in a
// single keyless call — confirmed against real data: 380/380 Premier
// League, 189/189 Champions League matches came back in one request each.
//
// Same read-patch-write shape as ingest-fotmob.mjs's `stats` enrichment:
// runs after ingest-football-data.mjs has already written the season's
// matches.json, patches venue/broadcasts onto matched entries in place, and
// leaves both keys absent on anything the ESPN join couldn't resolve (the
// UI's `match.venue &&` / `match.broadcasts?.length` checks already handle
// that gracefully).
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { COMPETITIONS } from "./competitions.mjs";
import {
  ESPN_SLUGS,
  extractBroadcasts,
  extractVenue,
  fetchEspnRange,
  findEspnEvent,
} from "./espn-shared.mjs";

const DATA_DIR = fileURLToPath(new URL("../src/data/", import.meta.url));

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return fallback;
  }
}

function yyyymmdd(date) {
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}

// Padded by 2 days on each side: football-data.org and ESPN sometimes
// disagree by a day on placeholder dates for fixtures whose real kickoff
// time isn't confirmed yet (confirmed on real data — a Ligue 1 opener dated
// one day apart between the two providers, right at the season's first
// matchday, which sat exactly on this range's unpadded boundary and got
// silently excluded from the fetch entirely, not just failed the join).
function dateRange(matches) {
  const days = matches.map((m) => new Date(m.utcDate).getTime());
  const from = new Date(Math.min(...days) - 2 * 86400000);
  const to = new Date(Math.max(...days) + 2 * 86400000);
  return { from: yyyymmdd(from), to: yyyymmdd(to) };
}

async function enrichCompetition(code) {
  const dir = `${DATA_DIR}leagues/${code}/`;
  const matches = await readJson(`${dir}matches.json`, []);
  if (matches.length === 0) return;

  const slug = ESPN_SLUGS[code];
  const { from, to } = dateRange(matches);

  let events;
  try {
    events = await fetchEspnRange(slug, from, to);
  } catch (err) {
    console.warn(`[${code}] ESPN schedule fetch failed: ${err.message}`);
    return;
  }

  const teams = await readJson(`${dir}teams.json`, []);
  const teamById = new Map(teams.map((t) => [t.id, t]));

  let venueCount = 0;
  let broadcastCount = 0;
  let unmatched = 0;

  for (const match of matches) {
    const home = teamById.get(match.homeTeamId);
    const away = teamById.get(match.awayTeamId);
    if (!home || !away) {
      unmatched++;
      continue;
    }

    const event = findEspnEvent(events, home.name, away.name, match.utcDate.slice(0, 10));
    if (!event) {
      unmatched++;
      continue;
    }

    const venue = extractVenue(event);
    if (venue) {
      match.venue = venue;
      venueCount++;
    }
    const broadcasts = extractBroadcasts(event);
    if (broadcasts.length > 0) {
      match.broadcasts = broadcasts;
      broadcastCount++;
    }
  }

  await writeFile(`${dir}matches.json`, JSON.stringify(matches, null, 2) + "\n");
  console.log(
    `[${code}] matched ${matches.length - unmatched}/${matches.length} — ${venueCount} venues, ${broadcastCount} broadcasts`,
  );
}

async function main() {
  for (const { code } of COMPETITIONS) {
    await enrichCompetition(code);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
