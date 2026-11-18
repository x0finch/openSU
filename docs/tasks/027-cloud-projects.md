# Task 027 - Cloud projects and "My projects"

P0 item 2 of the platform list. Today there is exactly one house, kept in
this browser's localStorage (`apps/web/src/lib/autosave.ts`). A signed-in
user must be able to keep several projects with the account and open them
on another device. Signed-out use stays exactly as it is.

## Behaviour

Signed out: unchanged (one local project, autosave in the browser).

Signed in:

- The current house is a project stored with the account. It saves by
  itself a few seconds after a change and when the page is hidden. The
  browser copy remains as the cache and the offline fallback.
- First sign-in on a browser that holds a local house: that house becomes
  the user's project (it is not thrown away and the user is not asked). If
  the account already has projects, the local house is added to them and
  stays open.
- Opening the studio signed in opens the project that was open last on
  this browser, else the most recently changed one, else a new project
  from the default template.
- Sign-out leaves the open house on screen as the local project.
- A project has a name the user can change. Today the title is derived
  from the style (`projectTitle` in `studio/chrome.tsx`); keep that as the
  default until the user renames. Decide where the name lives after
  reading the model; do not break saved houses.

"My projects" (one surface, built from glass primitives, used from both
entry points):

- Entry points: a row in the project menu (click the house name) and the
  reserved slot in the account menu (`chat/AccountEntry.tsx`). Signed out,
  the row is still shown and leads to sign-in with one line saying that
  projects are kept with the account.
- Content: "New project" first, then the projects, most recent first. A
  row shows the name, the facts line (plot, area, levels) and when it was
  last changed; the open one carries a check mark. No thumbnails in this
  task.
- Per row: rename (inline), duplicate, delete. Delete asks once in place
  (the row turns into "Delete? / Cancel"), no modal dialog; the open
  project can be deleted and the next most recent opens.
- "New project" offers the templates that the project menu's template
  list offers today. When signed in, picking a template there creates a
  new project instead of replacing the open one; the old "replace the
  current house with a template" row then goes away for signed-in users
  (say what you did).
- Desktop: a popover at its anchor. Phone: a sheet. Follow
  `docs/UI_STYLE.md` and Apple's list conventions (44 px rows on phones,
  no card inside a card, swipe is not required).
- Switching projects swaps house, conversation and undo history together,
  after the open project's pending save has been sent.

Failure and conflict, kept simple:

- No status indicator while saving works. When a save fails, one quiet
  line in the project menu ("Not synced, will retry") and retry with
  back-off; nothing is lost locally.
- Every save carries the revision it was based on. If the server holds a
  newer one (edited on another device): with no unsaved local edits, load
  the server's; with local edits, keep both by saving the local one as a
  copy and tell the user in one toast. Never overwrite silently.
- Limits: 20 projects per account and 512 KB per project (name them as
  constants, configurable by env like the quota). At the limit, "New
  project" explains in one line; copy does not shout numbers.

## Server (must stay trivial: Workers free tier, 10 ms CPU)

- Migration `0005_projects.sql`: one table, one row per project (id that
  cannot be guessed, user id with cascade delete, name, revision,
  created/updated, the house JSON and the conversation JSON as text). The
  list query must not read the JSON columns; keep what the list shows
  (name, facts, updated) in their own columns.
- Routes under `/api/projects` (list, create, read, save, rename, delete),
  session required, every query scoped by user id. The server checks size,
  ownership and revision only; it does not parse or validate the house
  (validation runs in the browser, as now). Undo history is not uploaded;
  the conversation is, bounded.
- Task 028 (share links) comes next and will read a project without a
  session through a separate token. Do not build it; do not block it.
- When sign-in is off or D1 is absent everything behaves as today.

## Constraints and checks

- `CLAUDE.md`, `docs/DECISIONS.md`, `docs/UI_STYLE.md`, `DESIGN.md`;
  tokens unchanged; glass primitives only (`glass-check.mjs` passes); one
  implementation of the list, one of the sync logic.
- Tests: unit tests for the sync logic (debounce, revision conflict,
  first sign-in adoption, sign-out); an e2e section using the email test
  hook that creates, renames, duplicates, switches, deletes, reloads, and
  signs in from a second browser context to see the same projects; a
  conflict case with two contexts. Add the new surface to the UI audit
  states and run `ui-audit --smoke`.
- Screenshots under `artifacts/task027/` at 1440x900 and 390x844, zh and
  en: the list (empty, a few, at the limit), rename, delete confirm, new
  project, the not-synced line, signed out.
- `pnpm -r typecheck` and the full `pnpm -r test` pass once on the final
  tree.

## How to work

Scope note first in `docs/tasks/027-notes.md`: what you read, the data
shape, where the name lives, the open questions and how you answered
them. Small local commits; do not push (a push to `main` deploys; the
lead pushes after review). Report honestly what was skipped or not
verified.
