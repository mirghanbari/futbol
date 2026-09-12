// Writes public/kickoffs.json — the slim schedule manifest the Cloudflare
// Worker (cron-trigger/) reads once a minute to decide whether a match is on,
// and therefore how often to dispatch update-live.yml.
//
// Why a manifest at all: the Worker's whole job is to be cheap enough to run
// every minute. The 9 per-competition matches.json files total ~1.4 MB (they
// carry full per-match stats for the whole season), so fetching and parsing
// them on every tick would burn far more Worker CPU than the decision is
// worth. This strips them to the two fields the decision actually needs —
// kickoff time and status — for a 3-day window, which is a couple of KB.
//
// Purely local: reads what's already on disk and writes one file, no network.
// Cheap enough to re-run on every update-live.yml pass, which is what keeps
// the window rolling forward as days pass.
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { COMPETITIONS } from "./competitions.mjs";

const DATA_DIR = fileURLToPath(new URL("../src/data/", import.meta.url));
const PUBLIC_DIR = fileURLToPath(new URL("../public/", import.meta.url));

// Yesterday through tomorrow (UTC). Yesterday because a match that kicked off
// at 22:00 UTC is still in its window after midnight; tomorrow so the Worker
// sees an early kickoff before the manifest's next rebuild.
const WINDOW_DAYS_BACK = 1;
const WINDOW_DAYS_FORWARD = 1;

// Statuses meaning the match will not be played at its listed kickoff time, so
// the Worker must not treat that time as a live window. A postponed fixture
// keeps its original utcDate in matches.json, so without this a postponement
// would still drive the 2-minute cadence for the whole ~170-minute window with
// nothing to poll. "finished" deliberately stays in: the window is bounded
// anyway, and keeping it is a cheap hedge against a feed briefly reporting a
// match as over mid-game (ESPN's `post` state at half-time does turn up).
const NOT_PLAYING = new Set(["postponed", "cancelled"]);

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return null;
  }
}

function dateKeysInWindow(now) {
  const keys = new Set();
  for (let offset = -WINDOW_DAYS_BACK; offset <= WINDOW_DAYS_FORWARD; offset += 1) {
    const d = new Date(now.getTime() + offset * 86_400_000);
    keys.add(d.toISOString().slice(0, 10));
  }
  return keys;
}

async function main() {
  const now = new Date();
  const days = dateKeysInWindow(now);

  // live.json holds ESPN's fresher view of today's matches. matches.json is
  // football-data.org-sourced and only refreshes on update-data.yml's slower
  // pass, so its status can lag mid-match; overlay live where we have it so
  // the Worker doesn't miss a match that's still running past its window.
  const live = (await readJson(`${PUBLIC_DIR}live.json`)) ?? {};

  const kickoffs = [];
  for (const { code } of COMPETITIONS) {
    const matches = await readJson(`${DATA_DIR}leagues/${code}/matches.json`);
    if (!matches) {
      console.warn(`[${code}] no matches.json; skipping`);
      continue;
    }
    for (const match of matches) {
      // Guard rather than dereference: a record with a missing utcDate would
      // throw a TypeError here and take down the whole manifest build.
      if (typeof match.utcDate !== "string") {
        console.warn(`[${code}] match ${match.id} has no utcDate; skipping`);
        continue;
      }
      if (!days.has(match.utcDate.slice(0, 10))) continue;

      const status = live[code]?.[match.id]?.status ?? match.status;
      if (NOT_PLAYING.has(status)) continue;

      kickoffs.push({ competitionId: code, utcDate: match.utcDate, status });
    }
  }

  kickoffs.sort((a, b) => a.utcDate.localeCompare(b.utcDate));

  // Deliberately no generatedAt/timestamp field: the manifest is committed by
  // update-live.yml, which only commits when a tracked file actually changed.
  // A timestamp would make every run a "change", churning a commit and a Pages
  // deploy every idle tick with nothing playing. Content-only means an idle run
  // is a true no-op, and staleness can still be read off the commit date.
  await writeFile(
    `${PUBLIC_DIR}kickoffs.json`,
    JSON.stringify({ kickoffs }),
  );
  console.log(`Wrote public/kickoffs.json (${kickoffs.length} matches in window).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
