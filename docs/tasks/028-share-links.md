# Task 028 - Share links

P0 item 3. The landing page already promises sharing. A signed-in owner
can give anyone a link that opens the project read-only, without sign-in.

## How established products do it (follow these, do not invent)

- Figma, Google Docs, Canva: a "Share" button at the top right, next to
  the account avatar. It opens a small dialog: a switch or selector for
  "anyone with the link can view", the link with a "Copy link" button
  (which confirms with "Link copied"), and a way to turn sharing off.
- The shared address is stable while sharing is on; turning it off makes
  the address stop working at once; turning it on again gives a new one
  (Google Docs keeps the address; we do not, so a leaked link can be
  killed).
- A viewer sees the real document in a view-only mode: all viewing tools
  work, editing tools are absent (not disabled-looking), a quiet banner or
  chip says "view only", and one clear action lets the viewer make their
  own copy ("Duplicate to your drafts" in Figma, "Make a copy" in Docs).
- The viewer always sees the owner's current version (a link is to the
  file, not to a snapshot).
- A link preview (title, description, image) when pasted into a chat.

## What to build

Owner side (signed in, own cloud project open):

- A "分享 / Share" button right of the toolbar, left of the avatar, same
  height and plate rules as the account button (task 026). Phone: decide
  from the precedents where it goes without growing the header again
  (candidate: a row in the project menu plus the account row of buttons);
  show the lead a screenshot of your choice and one alternative.
- It opens one surface (glass popover on desktop, sheet on phone): a
  switch "anyone with the link can view", the link, "Copy link" (toast
  "Link copied"; use the Web Share sheet on phones when available), and
  one line saying viewers cannot change the project. Off by default.
- Signed out, or a local project: the button is still there; it explains
  in one line that sharing needs the project to be kept with the account
  and offers sign-in (after which the local house is adopted, task 027,
  and the share surface opens).
- `/projects` cards show a small "shared" mark; the card menu gets
  "Share" (opens the same surface) so sharing can be turned off from
  the browser page.

Viewer side:

- Address: `/studio?s=<token>` (the page is prerendered; same shape as
  `?p=`). No session needed. The token is random (at least 128 bits),
  not the project id, and is the only thing that grants access.
- The studio opens in view-only mode: 3D, plan, sheets, views, levels,
  sun study, walk all work; the prompt bar is replaced by one quiet bar:
  "<name> · view only" and a button "Make my own copy" (signed in: makes
  a project and opens it; signed out: opens it as the local project,
  after asking once if a local house with edits would be replaced). No
  conversation is sent to viewers, no undo history, no owner identity
  beyond the project name.
- The viewer's own local autosave must not be overwritten or polluted by
  viewing a shared project.
- Off or unknown token: the existing "not found" page with wording that
  fits a link ("this link is no longer shared").
- Link preview: the document's title and description for a shared
  address. The pages are static, so do the smallest thing that works on
  the Worker for this route only (HTMLRewriter on the prerendered page
  to set title / og tags from one indexed read, plus og:image from the
  project's thumbnail through a public thumbnail route keyed by the
  token). Measure CPU; if it does not fit the free tier comfortably,
  drop the preview image first and say so.

Server (must stay trivial):

- Migration `0006_share.sql`: share token on the project row (nullable,
  unique index) and when it was turned on.
- Owner routes (session, scoped by user): turn on (creates a token),
  turn off (clears it). Public routes: read a shared project by token
  (house only, name, updated time; cache briefly), thumbnail by token.
  Rate-limit public reads per IP with the existing counter table.
- When projects are disabled, sharing is absent everywhere.

## Also fix (found while accepting task 027 on the live site)

Signed out, the `/projects` card of the local project reads
"现代坡顶自建房" while the studio title of the same house reads
"白墙坡顶小院". One naming rule, one function, used by both.

## Constraints and checks

- `CLAUDE.md`, `docs/DECISIONS.md`, `docs/UI_STYLE.md`, `DESIGN.md`;
  tokens unchanged; glass primitives only; one share surface, one
  view-only switch in the studio (a single flag that tools read; do not
  scatter conditionals).
- Tests: server tests (token grants only that project, off kills it, new
  token on re-enable, no conversation in the public payload, other
  users cannot toggle); e2e with the email test hook: owner shares,
  a signed-out context opens the link and uses every mode, cannot edit,
  makes a copy; owner turns it off and the link dies; viewer's local
  save is intact. Audit states for the share surface and the view-only
  studio; `ui-audit --smoke`.
- Screenshots under `artifacts/task028/` at 1440x900 and 390x844, zh and
  en, every state above.
- `pnpm -r typecheck` and the full `pnpm -r test` pass once on the final
  tree (12 to 15 minutes, background).

## How to work

Scope note first (`docs/tasks/028-notes.md`) naming the precedent for
each UI decision. Small local commits; do not push. Report honestly what
was skipped or not verified.
