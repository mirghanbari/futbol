// Triggers the "Update live scores" GitHub Actions workflow via
// workflow_dispatch. GitHub throttles its own `schedule:` cron heavily (this
// repo's */10 cron landed ~3.5h apart), so this Worker drives the cadence
// instead (workflow_dispatch is not throttled).
//
// Ported from the World Cup dashboard's cron-trigger (~/code/dashboards), with
// two changes for this repo: the schedule signal is a purpose-built manifest
// (see below), and tick arithmetic is epoch-based so IDLE_EVERY_MIN can exceed
// an hour.
//
// The Worker wakes every minute (free, well under the Workers limit) but only
// *dispatches a run* when warranted:
//   - while a match is in progress  -> every LIVE_EVERY_MIN minutes (default 2)
//   - otherwise (idle)              -> every IDLE_EVERY_MIN minutes (default 180)
// LIVE_EVERY_MIN is 2 (not 1) on purpose: an update-live run takes ~2 min
// (measured 0.3 min of ingest plus ~1 min of deploy), and a live match's run
// polls internally every 60s, so a 1/min external dispatch just piles up
// pending runs that get cancelled (concurrency is cancel-in-progress:false)
// and fires a deploy per cancellation. 2 min keeps the data just as fresh with
// far less cancelled-run churn.
// IDLE_EVERY_MIN is 3h because with nothing being played there is no live score
// to move: live.json can only change when a match is on. The idle tick exists
// purely as a heartbeat to roll the schedule manifest's 3-day window forward
// and to catch a fixture that was rescheduled into the near future.
//
// "In progress" is decided from public/kickoffs.json (built by
// scripts/build-kickoffs.mjs): any match whose kickoff is within
// [kickoff - PRE_KICKOFF, kickoff + MATCH_WINDOW], or which is still reporting
// a live status a bounded while after that. Schedule-based detection means we
// switch to the live cadence right at kickoff without waiting to notice a
// committed in-play status.
//
// Required secret:  GH_TOKEN     — fine-grained PAT, repo mirghanbari/futbol,
//                                  permission: Actions Read and write.
// Required secret:  TRIGGER_KEY  — gates the manual HTTP endpoint. Without it
//                                  the endpoint is off entirely; the cron is
//                                  unaffected. See the fetch handler.

const DEFAULTS = {
  OWNER: "mirghanbari",
  REPO: "futbol",
  WORKFLOW: "update-live.yml",
  REF: "main",
  KICKOFFS_URL:
    "https://raw.githubusercontent.com/mirghanbari/futbol/main/public/kickoffs.json",
  IDLE_EVERY_MIN: "180", // dispatch this often when no match is on
  LIVE_EVERY_MIN: "2", // dispatch this often while a match is in progress
  PRE_KICKOFF_MIN: "5", // start the live cadence this long before kickoff
  MATCH_WINDOW_MIN: "165", // treat as in-progress up to 2h45m after kickoff
  LIVE_STATUS_GRACE_MIN: "60", // how long past that a live status is still trusted
};

// Statuses that mean a match is actually being played right now. Mirrors
// MatchStatus in src/data/types.ts — "paused" is half-time, which is very much
// still in progress. "scheduled" is excluded deliberately: an unstarted match
// is handled by the kickoff-window check instead, so a fixture that never gets
// its status updated can't pin the Worker to the live cadence forever.
const LIVE_STATUSES = new Set(["in-play", "paused"]);

const cfg = (env, key) => env[key] ?? DEFAULTS[key];

// Cadence vars are operator-edited strings in wrangler.toml, and the README
// invites changing them. A typo ("2 min" -> NaN) or a zero would make
// `tick % every === 0` false on every tick forever, so the Worker would go
// completely silent with nothing in the logs to say why — leaving only
// GitHub's throttled */30 backup. Fall back to the default and say so loudly.
function num(env, key) {
  const raw = cfg(env, key);
  const n = Number(raw);
  if (Number.isFinite(n) && n > 0) return n;
  const fallback = Number(DEFAULTS[key]);
  console.error(`${key}="${raw}" is not a positive number; falling back to ${fallback}`);
  return fallback;
}

// Whole minutes since the epoch. Used instead of the wall-clock minute-of-hour
// so an interval longer than an hour still works: minute-of-hour % 180 is only
// ever 0 at :00, which would fire hourly rather than 3-hourly. Rounding rather
// than flooring absorbs cron jitter — a tick that fires at 59.8s or 60.2s past
// the minute still maps to the minute it was scheduled for, so an interval
// boundary is neither missed nor hit twice.
const epochMinute = (now) => Math.round(now / 60_000);

async function dispatch(env) {
  if (!env.GH_TOKEN) throw new Error("GH_TOKEN secret is not set");
  const owner = cfg(env, "OWNER");
  const repo = cfg(env, "REPO");
  const workflow = cfg(env, "WORKFLOW");
  const ref = cfg(env, "REF");

  const url = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflow}/dispatches`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.GH_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "futbol-data-trigger",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ref }),
  });
  if (res.status !== 204) {
    throw new Error(`dispatch failed: ${res.status} ${await res.text()}`);
  }
  return `dispatched ${workflow} on ${owner}/${repo}@${ref}`;
}

// True if any match across the 9 competitions is live now or within its
// kickoff window. `now` is ms epoch.
async function isGameOn(env, now) {
  const res = await fetch(cfg(env, "KICKOFFS_URL"), {
    headers: { "User-Agent": "futbol-data-trigger" },
    cf: { cacheTtl: 60 }, // kickoff times are static; a short cache is fine
  });
  if (!res.ok) throw new Error(`kickoffs fetch ${res.status}`);
  const { kickoffs } = await res.json();
  if (!Array.isArray(kickoffs)) throw new Error("kickoffs.json has no kickoffs array");

  const pre = num(env, "PRE_KICKOFF_MIN") * 60_000;
  const win = num(env, "MATCH_WINDOW_MIN") * 60_000;
  const grace = num(env, "LIVE_STATUS_GRACE_MIN") * 60_000;

  return kickoffs.some((m) => {
    const t = m.utcDate ? Date.parse(m.utcDate) : NaN;
    if (Number.isNaN(t)) return false;

    // A live status is trusted past the normal window — a Champions League tie
    // going to extra time and penalties, or a long VAR or weather delay, can
    // outlast MATCH_WINDOW_MIN — but only by `grace`, never open-endedly.
    // The manifest's status is NOT self-correcting: build-kickoffs overlays
    // ESPN's fresher view only for matches in live.json, and that file covers
    // today only, so after UTC midnight a match falls back to its
    // football-data.org status from matches.json — which update-data.yml
    // refreshes on the same ~3.5h-throttled cron this Worker exists to work
    // around. An unbounded check would therefore let one mid-match snapshot
    // pin the 2-min cadence for as long as the match stays in the manifest
    // window (~2 days), dispatching ~720 runs/day with nothing being played.
    if (LIVE_STATUSES.has(m.status)) return now <= t + win + grace;

    return now >= t - pre && now <= t + win;
  });
}

// Decide whether to dispatch this tick. Returns { gameOn, dispatch, reason }.
// `gameOn` is null when the schedule was not consulted (see needGameOn).
async function decide(env, now, { forceCheck = false } = {}) {
  const idleEvery = num(env, "IDLE_EVERY_MIN");
  const liveEvery = num(env, "LIVE_EVERY_MIN");
  const tick = epochMinute(now);
  const onLiveTick = tick % liveEvery === 0;
  const onIdleTick = tick % idleEvery === 0;

  // Only fetch the manifest when the answer can change the outcome. An idle
  // tick dispatches whatever the schedule says, and a tick that is neither a
  // live nor an idle tick can never dispatch — so on those, asking is a
  // pointless subrequest. At the default 2/180 that is over half the Worker's
  // 1,440 daily wake-ups. `forceCheck` overrides it for the HTTP endpoint,
  // where reporting gameOn is the whole point.
  const needGameOn = forceCheck || (onLiveTick && !onIdleTick);
  if (!needGameOn) {
    return {
      gameOn: null,
      dispatch: onIdleTick,
      reason: onIdleTick ? `idle heartbeat (tick=${tick})` : `off-cadence (tick=${tick})`,
    };
  }

  let gameOn = false;
  let reason;
  try {
    gameOn = await isGameOn(env, now);
  } catch (err) {
    // If we can't read the schedule, stay quiet (idle cadence) — GitHub's own
    // cron remains a backup — but log it.
    reason = `schedule check failed: ${err.message}`;
  }
  return {
    gameOn,
    // Even while a match is on we only fire every LIVE_EVERY_MIN minutes — see
    // the header note on why 1/min just churns cancelled runs. Idle ticks still
    // fire regardless so an off-window heartbeat always lands.
    dispatch: (gameOn && onLiveTick) || onIdleTick,
    reason:
      reason ?? (gameOn ? `match in progress (tick=${tick})` : `idle (tick=${tick})`),
  };
}

export default {
  // Per-minute cron heartbeat (see wrangler.toml).
  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      (async () => {
        const now = event.scheduledTime ?? Date.now();
        const d = await decide(env, now);
        if (!d.dispatch) {
          console.log(`skip — ${d.reason}`);
          return;
        }
        try {
          console.log(`${d.reason} → ${await dispatch(env)}`);
        } catch (err) {
          console.error(err.message);
        }
      })(),
    );
  },

  // Manual endpoint, for checking the decision and for forcing a run by hand.
  //
  // Fails closed, in two ways. Without TRIGGER_KEY set there is no way to tell
  // an operator from a crawler, so the endpoint is off rather than open: a
  // *.workers.dev URL gets hit by crawlers, link unfurlers and favicon
  // prefetches, and a dispatch is a real write (commit, push, Pages deploy),
  // so an open endpoint would let any of them fire a workflow run. And because
  // a link containing the key can itself be unfurled or prefetched — both GETs
  // — dispatching requires POST; GET only ever reports the decision.
  async fetch(request, env) {
    if (!env.TRIGGER_KEY) {
      console.error("TRIGGER_KEY is not set; manual endpoint is disabled");
      return new Response("not found\n", { status: 404 });
    }
    const key = new URL(request.url).searchParams.get("key");
    if (key !== env.TRIGGER_KEY) return new Response("not found\n", { status: 404 });

    const d = await decide(env, Date.now(), { forceCheck: true });
    if (request.method !== "POST") {
      return new Response(
        `gameOn=${d.gameOn} wouldDispatch=${d.dispatch} (${d.reason})\n` +
          `POST to this URL to force a dispatch.\n`,
      );
    }
    try {
      return new Response(`${await dispatch(env)} [${d.reason}]\n`, { status: 200 });
    } catch (err) {
      return new Response(`${err.message}\n`, { status: 502 });
    }
  },
};
