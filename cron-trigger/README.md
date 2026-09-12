# futbol-data-trigger

A tiny Cloudflare Worker that fires the **Update live scores** GitHub Actions
workflow via `workflow_dispatch` — every 2 minutes while a match is on, and
every 3 hours otherwise.

Ported from the World Cup dashboard's `cron-trigger` (`~/code/dashboards`).

## Why

GitHub throttles its own `schedule:` cron. This repo asked for `*/10` on
`update-live.yml` and `*/30` on `update-data.yml`; both landed roughly **every
3.5 hours** instead (measured mean 211 min over 20 runs, min 113, max 316 —
~7 runs/day against the 144 requested). Every run succeeded; they simply were
not granted. So live scores showed up hours late.

`workflow_dispatch` through the REST API is **not** throttled, so this Worker
drives the cadence instead. `update-live.yml` keeps a `*/30` schedule as a
backup for when the Worker is down.

## How it decides

The Worker wakes every minute (free, far under the Workers limit) but only
*dispatches* when warranted:

| State | Cadence | Why |
|---|---|---|
| A match is in progress | every 2 min (`LIVE_EVERY_MIN`) | a run takes ~2 min end to end, so 1/min just queues runs that get cancelled — and fires a deploy per cancellation |
| Nothing scheduled | every 3 h (`IDLE_EVERY_MIN`) | with nothing being played, `live.json` cannot change; the idle tick is only a heartbeat to roll the manifest window forward and catch rescheduled fixtures |

"In progress" is read from [`public/kickoffs.json`](../public/kickoffs.json), the
slim manifest `scripts/build-kickoffs.mjs` writes on every `update-live.yml`
pass: a match counts if its kickoff is within `[kickoff - 5 min, kickoff +
165 min]`, **or** it still reports `in-play`/`paused` within a further
`LIVE_STATUS_GRACE_MIN` (60 min) of that. The window check is what lets the
Worker switch to the live cadence exactly at kickoff rather than waiting to
notice a committed in-play status.

That grace period is bounded deliberately, and the bound matters. The manifest's
status is **not** self-correcting: `build-kickoffs` overlays ESPN's fresher view
only for matches present in `live.json`, and that file covers *today* only — so
after UTC midnight a match falls back to its football-data.org status from
`matches.json`, which `update-data.yml` refreshes on the same ~3.5 h-throttled
cron this Worker exists to route around. This is not hypothetical: at the time
of writing, `matches.json` holds five `in-play` and one `paused` for the
previous day's fixtures. An unbounded "is it live?" check would let one such
snapshot hold the 2-minute cadence for as long as the match stays in the
manifest's 3-day window — roughly 720 pointless runs a day.

Fixtures marked `postponed` or `cancelled` are dropped at build time, since they
keep their original kickoff time and would otherwise drive the live cadence
through a window in which nothing is played.

The manifest exists because futbol's schedule lives in 9 per-competition
`matches.json` files totalling ~1.4 MB — far too much to fetch and parse every
minute. Stripped to kickoff time and status over a 3-day window it is ~5 KB.

## One-time setup

1. **Create a GitHub token** (fine-grained PAT):
   - GitHub → Settings → Developer settings → **Fine-grained tokens** → Generate
   - **Repository access:** Only select repositories → `futbol`
   - **Permissions:** Repository → **Actions: Read and write**
   - Set an expiration and a calendar reminder — when it lapses the Worker goes
     silent and you are back to GitHub's throttled `*/30` backup.

2. **Install deps & log in:**
   ```bash
   cd cron-trigger
   npm install
   npx wrangler login
   ```

3. **Store the token as an encrypted Worker secret** (never committed):
   ```bash
   npx wrangler secret put GH_TOKEN
   # paste the PAT when prompted
   ```
   Then set the key that gates the manual HTTP endpoint:
   ```bash
   npx wrangler secret put TRIGGER_KEY
   ```
   This one is **not** optional. The endpoint fails closed: with no
   `TRIGGER_KEY` set it returns 404 for everything, because a `*.workers.dev`
   URL gets hit by crawlers, link unfurlers and favicon prefetches, and a
   dispatch is a real write (commit, push, Pages deploy) — an open endpoint
   would let any of them fire a workflow run. The cron path is unaffected by
   this secret.

4. **Deploy:**
   ```bash
   npm run deploy
   ```

## Verify

- **Decision without firing** — any GET, since dispatching requires POST (a
  link containing the key can itself be unfurled or prefetched, and those are
  GETs):
  ```bash
  curl "<worker-url>/?key=$TRIGGER_KEY"
  # gameOn=false wouldDispatch=false (idle (tick=...))
  ```
- **Manual fire:**
  ```bash
  curl -X POST "<worker-url>/?key=$TRIGGER_KEY"
  # dispatched update-live.yml on mirghanbari/futbol@main
  ```
- **Confirm a run started:**
  ```bash
  gh run list --workflow "Update live scores" --event workflow_dispatch --limit 3
  ```
- **Watch cron logs:** `npm run tail` (or Cloudflare dashboard → Workers → this
  Worker → Logs / Triggers).

## Config

Non-secret settings live in `wrangler.toml` under `[vars]` (`OWNER`, `REPO`,
`WORKFLOW`, `REF`, `KICKOFFS_URL`, and the five cadence knobs). The Worker's
own `DEFAULTS` mirror them, so a missing var falls back rather than crashing.
A cadence var that isn't a positive number (`0`, or a typo like `"2 min"`)
would otherwise make every modulo test fail and leave the Worker silently
inert, so those fall back to the default and log to `wrangler tail`.

Cadence intervals are counted in whole minutes since the epoch, not minute-of-
hour, so any value works — including ones above 60 like the 3 h idle. (The
World Cup original used `minute % every`, which silently caps at 60.) Values
that divide 1440 stay aligned to UTC midnight: 180 fires at 00:00, 03:00, …
21:00 UTC.

Change the wake-up frequency via the `crons` array in `wrangler.toml`
(`* * * * *` = every minute; Cloudflare's minimum interval is 1 minute).

## Cost

Cloudflare Workers' free tier covers this easily (1 request/min). GitHub Actions
is free on this public repo. At 8 idle dispatches a day plus ~30/hour during
matches, this is a small fraction of the free Actions allowance.
