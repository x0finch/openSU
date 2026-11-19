# Task 030: tests run on pull requests, in parallel

## Why

The full suite (`pnpm -r typecheck && pnpm -r test`) takes 12 to 15 minutes
and runs serially inside the working container. Every agent waits for it,
several times per task. The owner asked for pull requests plus GitHub
Actions instead.

## Outcome

1. A fast local loop: one command, under 2 minutes, no browser.
2. Everything slow runs on GitHub Actions for each pull request to `main`,
   split into parallel jobs. Target: results within about 6 minutes of a push.
3. `main` only receives merged pull requests whose checks passed. A merge
   deploys (the existing `deploy.yml`, unchanged in behaviour).

## Work

### Scripts

- Root `pnpm test:fast`: typecheck of every package, every node unit test
  (packages and `apps/web/scripts/*-test.ts`), and the static checks that
  need no browser and no built app (`ui-check`, the base-component check,
  `relay-check`, `auth-check` if it needs no browser). Measure it; if it is
  over 2 minutes say what takes the time.
- Split `apps/web`'s `test` script into named scripts, one per browser
  suite (`test:shots`, `test:glass`, `test:chat`, `test:account`,
  `test:audit`), so CI and people call the same names. `pnpm test` keeps
  meaning "everything", built from those names. No suite is removed,
  skipped or weakened.
- If suites each build the app or start their own server, let them reuse one
  build (an environment variable or a flag that says "the build is already
  there"), so a CI job does not build more than once.

### `.github/workflows/ci.yml`

- Triggers: `pull_request` to `main`, and `workflow_dispatch`.
- `concurrency` per pull request with `cancel-in-progress: true`.
- `permissions: contents: read`. No secrets are used; the suites already run
  with local stubs and the email test hook. Confirm that and say so.
- Jobs, all parallel:
  - `fast`: `pnpm test:fast`.
  - `packages`: browser tests of the packages (`packages/render` shots and
    whatever else needs Chromium), if any.
  - `web`: a matrix over the browser suites above, `fail-fast: false`.
  - If one suite alone is over about 5 minutes, shard it (by its existing
    sections, e.g. `account-e2e --only`), do not trim it.
- pnpm store cache; Playwright browsers cached by the installed Playwright
  version; install Chromium only (`playwright install --with-deps chromium`
  is right on a runner; the "do not run playwright install" rule is about
  our container). Headless WebGL flags as in `CLAUDE.md`.
- On failure, upload the suite's screenshots and logs as a workflow artifact
  (retention 7 days). Nothing under `artifacts/` is ever committed.
- A final job `ci-ok` that needs all the others and fails if any failed, so
  one check name can be made required.
- `timeout-minutes` on every job.

### Docs

- `CLAUDE.md`: replace the local "run everything" habit with: run
  `pnpm test:fast` locally plus the one browser suite your change touches;
  the full matrix runs on the pull request. Agents still do not push or open
  pull requests; the lead does.
- `apps/web/README.md` or `docs/`: a short "Tests" section listing the
  script names and what each covers.
- `docs/tasks/030-notes.md`: measured times (local fast loop; each CI job),
  anything flaky that showed up, and what the owner must set by hand (branch
  protection requiring `ci-ok`; it cannot be set from here).

## Out of scope

- Changing what any test asserts. If a suite fails on the runner but passes
  locally, find the cause (fonts, timing, GPU), do not loosen the assertion
  without saying so in the notes.
- Running tests again in `deploy.yml`.

## How this is accepted

The lead pushes the branch and opens the pull request. Accepted when `ci-ok`
is green on it, the per-job times are in the notes, and `pnpm test:fast`
is under 2 minutes locally. Expect a few rounds: the lead sends back the
failing job logs.
