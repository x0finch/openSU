# Task 030 notes: tests on pull requests

## What changed

- Root `package.json`: `playwright@1.63.0` as a dev dependency (pinned in
  `pnpm-lock.yaml`). Before, no package depended on Playwright: every suite
  fell back to the copy preinstalled in the dev container
  (`/opt/node-tools/node_modules` or `NODE_PATH`), which does not exist on
  a runner. 1.63.0 is the container's version, so it uses the same
  Chromium build (`chromium-1243` in `/opt/pw-browsers`). The scripts'
  `require('playwright')` now finds it; the fallback paths stay and are
  harmless. No suite sets an `executablePath`.
- Root scripts: `test:fast`, `test:packages`. `test` is unchanged
  (`pnpm -r test`).
- `apps/web` scripts: `test` is now `test:fast && test:browser`, with
  `test:unit`, `test:static`, `test:shots`, `test:glass`, `test:chat`,
  `test:account`, `test:audit`. The same commands with the same flags as
  before; only the order moved (`relay-check` and `auth-check` now run
  before the browser suites). Nothing removed or weakened.
- `.github/workflows/ci.yml` (new); `deploy.yml` untouched.
- Docs: `CLAUDE.md` (test habit), `apps/web/README.md` ("Tests"),
  `docs/STATUS.md`.

## The fast loop

`pnpm test:fast` = package `tsc -p tsconfig.build.json` (topological) ->
`pnpm -r typecheck` -> every package's vitest -> `apps/web` `test:unit`
and `test:static` (`ui-check`, i.e. the base-component rule, `relay-check`,
`auth-check`; none needs a browser or a build: `auth-check` uses
`dist/client/studio.html` when present and a stand-in page otherwise).

The package build is there because a fresh checkout has no `dist/`, and
the packages' `typecheck` (and the kernel/model/render vitest runs, which
have no source aliases) resolve `@opensu/*` through `dist/`. Checked in a
clean worktree: without it `pnpm -r typecheck` fails with TS2307.

Measured in a clean worktree in the dev container (4 cores):
**71 s** total. Typecheck 30 s, package vitest 19 s (agent 10 s, plan 5 s),
package build 9 s, `auth-check`+`relay-check`+`ui-check` 7 s, web unit
tests 3 s.

## Browser suites

Every suite needs `pnpm --filter @opensu/web build` first and never builds
itself (each checks for `dist/client/studio.html`), so one build per CI job
already is the "reuse one build" rule; no flag was needed. The app build
took 6 s here, so each web job builds for itself rather than passing
`dist/` between jobs.

`account-e2e --smoke` measured locally (clean worktree, one run, all
passed): **926 s**. Per section: desktop 32, projects 202, share 146,
canonical 12, entry 260, limits 27, google 20, phone 31, turns 59,
keys 129 (s). On a runner the same steps take about 1.6 to 3 times as
long (run 1 below), so CI shards the long suites by section with
`--only` (see "Shards").

`apps/web/scripts/ci-shards-check.mjs` (part of `test:static`, so of `pnpm test:fast` and the `fast` job) fails when
a section of a sharded suite (shots, chat, account) is named in no shard,
so a new section cannot silently drop out of CI.

## Secrets and network

None used. Confirmed by reading the suites: the chat goes to the local
scripted stub (`chat-stub.mjs`), D1 is a fresh local database per preview
(`wrangler d1 migrations apply --local --persist-to <tmp>`), sign-in
codes come from `AUTH_TEST_HOOK`, Google uses fake client ids and is
checked up to the redirect, the key tests use `KEYS_TEST_UPSTREAM` on
localhost. The workflow has `permissions: contents: read` and references
no `secrets.*`.

## CI run 1 (PR #3, run 44426332776, head 216ce0c)

Job wall times (start to end; suite step in brackets):

| job | result | time |
|---|---|---|
| fast | ok | 2:20 (`test:fast` 1:52) |
| packages | ok | 3:37 (shots 2:42) |
| web (glass) | ok | 10:16 (Chromium + apt 8:34, suite 1:09) |
| web (audit) | ok | 6:39 (suite 5:42, "334 s") |
| web (shots) | ok | 14:50 (suite 13:22) |
| web (chat) | cancelled at the 15 min timeout | apt 9:14, suite cut after 4:40 |
| web (account-1: desktop, projects) | crashed | 4:28 (suite 3:36) |
| web (account-2: share, canonical, google, limits) | crashed | 3:58 (suite 3:04) |
| web (account-3: entry) | ok | 8:13 (suite 7:10) |
| web (account-4: phone, turns, keys) | crashed | 4:43 (suite 3:55) |

### Failures and causes

1. **account-1**, `account-e2e.mjs:538`: `waitForFunction` 20 s for the
   new project's address after a template card (`?new=t2` -> `?p=`).
   **account-2**, `:854`: `page.waitForURL` 30 s, `waitUntil: "load"`,
   for "replace with my copy". **account-4**, `:1743`:
   `page.reload({ waitUntil: "networkidle" })` 30 s (Playwright's default)
   in the keys section. Cause: the runner is slower at the studio's WebGL
   work. Rendering alone is ~1.7x slower (renderer shots: a frame 1171 ms
   on the runner vs 675 ms here), whole steps 1.6 to 3x (share: "the
   viewer's own copy is untouched" 50 s vs 16 s). The project thumbnail is
   the outlier: `{"ms":18674}` on the runner vs `{"ms":303}` here, i.e. its
   asynchronous read-back (a WebGL fence polled by three.js) waited ~18 s.
   While a thumbnail is pending, leaving or reloading the page waits for it
   (the suite already says so for `networkidle`), and the project sync's
   queue waits too. Why the fence is 60x slower there and not 1.7x is not
   established (runner CPU/GPU-process scheduling under SwiftShader is my
   guess, not a finding).
   Fix (`account-e2e.mjs`): every context gets a 120 s navigation timeout
   (`newContext()`); the two copy steps wait for the URL with
   `waitUntil: "commit"` and then on `ready3d` (180 s, as before); the
   new-project address and `waitOpen` (project open, sync not busy) get
   120 s; the keys reloads wait for `commit` and then for the picker's own
   `ready` (120 s). No check changed; only how long a step may take to
   reach the state the check then looks at.
2. **chat** (cancelled) and the 8.5 min "Chromium" step of **glass**:
   `playwright install --with-deps chromium` ran apt, and the Ubuntu
   mirror served 32 MB at 58 kB/s (9 min 14 s). The runner image already
   has every library Chromium needs (apt said "already the newest" for all
   of them); the new packages were only fonts. Fix: a composite action
   (`.github/actions/browser`) installs the browser only (cached by
   Playwright version), the same font packages from cached `.deb` files
   (downloaded once), and falls back to `playwright install-deps` only if
   Chromium does not start.
3. **Too long, not failed**: shots 13:22 and account `entry` 7:10 of
   suite time, audit 5:42. Shots is split in three; `entry` is split into
   `entry-views` and `entry-rules` (a change in `account-e2e.mjs`: the
   block's two halves are now `if (wanted('entry-views'))` and
   `if (wanted('entry-rules'))`; `--only entry` still runs both). Audit
   is not split: its smoke run compares the whole set of findings with
   `ui-audit-allow.json`, which a subset of states would not match.

### Shards (from run 1 times; to be checked on run 2)

| job | sections | run 1 suite time (est.) |
|---|---|---|
| shots-still | check-still | ~5:00 |
| shots-views | landing, studio-3d, studio-plan, check-controls, check-walk, check-sun | ~4:30 |
| shots-site | check-site, check-eye, studio-sheets | ~4:00 |
| chat-desktop | chat-desktop ... chat-new (one block) | ~4:00 |
| chat-more | chat-reload, chat-steps, chat-phone, chat-nokey | not measured (cut off) |
| account-projects | projects | ~5:30 (202 s here x 1.6) |
| account-share | share, canonical | ~4:30 |
| account-entry-views | entry-views | 3:25 |
| account-entry-rules | entry-rules | 3:40 |
| account-keys | keys, desktop | ~4:30 |
| account-turns | turns, phone, limits, google | ~4:00 |
| glass | whole | 1:09 |
| audit | whole | 5:42 |

Set-up per job was about 50 s (install, cached Chromium, build) when apt
was fast. `web` jobs now have a 20 min timeout. Expect the longest jobs
(audit, account-projects, shots-still) at 6 to 7 minutes.

## Risks on the runner (not verified)

- Fonts: the container has Inter installed as a system font and
  WenQuanYi Zen Hei for Chinese; CI installs `fonts-wqy-zenhei` too (and
  the other fonts `playwright install-deps` adds), but not a system Inter
  (the app bundles Inter Variable, so the UI should match). Anything that
  measures text in a fallback font (`ui-audit` against its allow list,
  layout checks in account-e2e `entry`) could differ.
- Speed: see run 1; the thumbnail read-back is the outlier and its cause
  is not known.
- SwiftShader: same flags as in the container. `shots.mjs --smoke` does
  not run the app-vs-renderer pixel comparison (that is `compare`, outside
  smoke); the first version of this workflow rendered reference shots for
  it, which did nothing, and is removed.

## Owner, by hand

- Branch protection on `main` (Settings -> Branches, or a ruleset):
  require a pull request, require the status check `ci-ok`, and require
  branches to be up to date. The check name appears in the picker only
  after the workflow has run once.
- Optional: Settings -> Actions -> General, allow GitHub Actions to run
  for pull requests (the default for the owner's own branches).

## Flaky

Nothing flaky seen yet: the run 1 failures were step timeouts on a slower
machine, each at a navigation or a wait with Playwright's default or a short
fixed timeout. Run 2 will tell whether the new limits hold.
