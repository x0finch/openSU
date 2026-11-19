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
keys 129 (s). CI shards it by section with `--only`:

| shard | sections | local time |
|---|---|---|
| account-1 | desktop, projects | ~235 s |
| account-2 | share, canonical, google, limits | ~205 s |
| account-3 | entry | ~260 s |
| account-4 | phone, turns, keys | ~220 s |

The `fast` job fails if a `wanted('...')` section of `account-e2e.mjs` is
named in no shard, so a new section cannot silently drop out of CI.

Not measured locally (the task allowed one browser suite): `test:shots`,
`test:glass`, `test:chat`, `test:audit` (task 024 notes: the audit smoke
took 82 s), and the package shots. If one of them is over about 5 minutes
on the runner, shard it with its own `--only` (shots, chat and ui-audit
all take one).

The `shots` job first renders the four renderer views
(`pnpm --filter @opensu/render shots axo-se,axo-ne,eye-sw,elev-south`) so
that `shots.mjs` runs its app-vs-renderer pixel comparison, which it does
on a dev machine whenever `artifacts/shots/` exists and skips otherwise.

## Secrets and network

None used. Confirmed by reading the suites: the chat goes to the local
scripted stub (`chat-stub.mjs`), D1 is a fresh local database per preview
(`wrangler d1 migrations apply --local --persist-to <tmp>`), sign-in
codes come from `AUTH_TEST_HOOK`, Google uses fake client ids and is
checked up to the redirect, the key tests use `KEYS_TEST_UPSTREAM` on
localhost. The workflow has `permissions: contents: read` and references
no `secrets.*`.

## CI times

Not yet measured: the lead runs the first pull request. Fill in per job:

| job | time |
|---|---|
| fast | |
| packages | |
| web (shots) | |
| web (glass) | |
| web (chat) | |
| web (audit) | |
| web (account-1..4) | |

## Risks on the runner (not verified)

- Fonts: the container has Inter installed as a system font and
  WenQuanYi Zen Hei for Chinese; `playwright install --with-deps` on
  `ubuntu-24.04` installs `fonts-wqy-zenhei` too, but not a system Inter
  (the app bundles Inter Variable, so the UI should match). Anything that
  measures text in a fallback font (`ui-audit` against its allow list,
  layout checks in account-e2e `entry`) could differ.
- Speed: runners may be slower than this container; shards are sized at
  about 4 minutes locally against a 15-minute job timeout.
- SwiftShader: same flags as in the container; WebGL output was not
  compared across machines (the renderer pixel comparison is within one
  runner).

## Owner, by hand

- Branch protection on `main` (Settings -> Branches, or a ruleset):
  require a pull request, require the status check `ci-ok`, and require
  branches to be up to date. The check name appears in the picker only
  after the workflow has run once.
- Optional: Settings -> Actions -> General, allow GitHub Actions to run
  for pull requests (the default for the owner's own branches).

## Flaky

Nothing seen so far (one local account run). To be filled in from the
CI runs.
