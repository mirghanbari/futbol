// Reports whether any match is currently being played, for update-live.yml's
// 60s poll loop (see its "Commit and poll live scores" step).
//
//   exit 0 — at least one match is in-play or paused; keep polling
//   exit 1 — nothing live; the loop can finish
//   exit 2 — couldn't tell (unreadable or malformed live.json)
//
// Exit 2 matters: mapping a failed read onto "nothing live" would end the poll
// loop mid-match and report a clean finish, so one transient bad read would
// silently drop the rest of a match back to the Worker's 2-minute cadence. The
// workflow treats 2 as a retryable warning and only gives up after several
// consecutive failures.
//
// Reads public/live.json rather than src/data/leagues/*/matches.json, because
// live.json was just regenerated from ESPN by `npm run ingest:live` and so
// carries the freshest status available in the job; matches.json is
// football-data.org-sourced and only refreshes on update-data.yml's slower,
// GitHub-throttled pass.
//
// Note what this deliberately does NOT do: it doesn't consider kickoff times,
// so before the first kickoff of the day it reports nothing live and the loop
// exits after a single pass. That's the intended division of labour — the
// Cloudflare Worker (cron-trigger/) detects an upcoming kickoff from the
// schedule window and dispatches a fresh run every 2 minutes, and this loop
// takes over for the 60s cadence once a match is actually under way. Deciding
// "in progress" here from a kickoff window instead would keep the job alive for
// the full 2h45m window even after every match had finished, burning Actions
// minutes to poll matches that are over.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const livePath = fileURLToPath(new URL("../public/live.json", import.meta.url));

// "paused" is half-time — still very much in progress, and the one status
// where polling matters most on resumption. Mirrors LIVE_STATUSES in
// cron-trigger/src/index.js.
const LIVE_STATUSES = new Set(["in-play", "paused"]);

// Assigning exitCode rather than calling process.exit() so Node flushes stdout
// before exiting. console.log is asynchronous when stdout is a pipe, which it
// is under Actions, and process.exit() on the next line can truncate the line
// below — the operator's only view of why the loop is still running.
try {
  const live = JSON.parse(await readFile(livePath, "utf8"));
  if (live === null || typeof live !== "object" || Array.isArray(live)) {
    throw new Error("live.json is not an object of competitions");
  }

  const inPlay = Object.entries(live).flatMap(([code, matches]) =>
    Object.entries(matches ?? {})
      .filter(([, patch]) => LIVE_STATUSES.has(patch?.status))
      .map(([id, patch]) => `${code} ${id} ${patch.status} ${patch.minute ?? ""}`.trim()),
  );

  if (inPlay.length > 0) {
    console.log(`${inPlay.length} live: ${inPlay.join(", ")}`);
    process.exitCode = 0;
  } else {
    console.log("no live matches");
    process.exitCode = 1;
  }
} catch (err) {
  console.error(`has-live-match: ${err.message}`);
  process.exitCode = 2;
}
