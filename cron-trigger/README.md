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

Note that the Worker is only half the story, and not the half that makes scores
fresh. A dispatch buys a single ingest pass, so on its own the 2-minute cadence
would be the floor. `update-live.yml`'s last step polls **in-job every 60 s**
while any match is in-play or paused (3 h cap), and that is what actually keeps
scores current. The Worker's job is narrower: get a run *started* promptly near
a kickoff, and restart one if a poll loop ended or died.

A consequence worth expecting: while a poll loop holds the `update-live`
concurrency slot, the Worker's 2-minute dispatches queue behind it, and GitHub
cancels the previous pending run each time a new one arrives. Those cancelled
runs are noise in the Actions list, not a fault — they run no steps and publish
nothing. Raising `LIVE_EVERY_MIN` would trade less of that noise for slower
kickoff detection.

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

## Troubleshooting

**`dispatch failed: 403 {"message":"Resource not accessible by personal access
token"}`** in `npm run tail`. The PAT can reach the repo but not Actions. Almost
always the **repository access** setting rather than the permission: a
fine-grained token scoped to "Public repositories" is **read-only**, even for a
public repo like this one, and `workflow_dispatch` is a write. Set repository
access to "Only select repositories" → `futbol` *and* Repository permissions →
**Actions: Read and write**. Editing the existing token is enough — the value
doesn't change, so no `wrangler secret put` and no redeploy.

Isolate the token from the Worker entirely (`204` = good, and it fires a real
run):

```bash
read -rs PAT && curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  -H "Authorization: Bearer $PAT" -H "Accept: application/vnd.github+json" \
  https://api.github.com/repos/mirghanbari/futbol/actions/workflows/update-live.yml/dispatches \
  -d '{"ref":"main"}'
```

**`not found` from the manual endpoint.** Expected whenever the key doesn't
match, and indistinguishable by design from a bad path — the endpoint fails
closed. Check `npm run tail`: a `TRIGGER_KEY is not set` line means the secret
is missing; silence means the key simply didn't match. Note that a GET never
dispatches no matter how right the key is — that needs POST.

**`schedule check failed: kickoffs fetch 404`.** `public/kickoffs.json` isn't on
`main`. It's committed by `update-live.yml`, so this is expected until that
workflow has run once. Note `raw.githubusercontent.com` caches negative
responses on branch refs for a few minutes after the file does land; a
commit-pinned URL bypasses that if you need to confirm sooner.

**Nothing in the logs at all, and no runs.** Check `npx wrangler versions view
<id>` reports `Handlers: scheduled, fetch`. A version showing only `fetch` has
no cron handler and will never fire; redeploy. Also note `wrangler tail`
buffers when its stdout isn't a terminal — piping it to a file can look
completely silent while the Worker is fine. `script -q /dev/null npx wrangler
tail` forces a pty.

## Cost

Cloudflare Workers' free tier covers this easily (1 request/min). GitHub Actions
is free on this public repo. At 8 idle dispatches a day plus ~30/hour during
matches, this is a small fraction of the free Actions allowance.
