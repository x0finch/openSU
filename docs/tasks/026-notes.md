# Task 026 - notes: a visible account entry; one canonical host

> Task 029 moved the account out of the studio's top right: it lives in the
> project menu only; the account button, its reserved place and the phone
> header variant (a) are gone. See `029-notes.md`.

## Scope (written before the change)

### Part 2 - one canonical host (its own commit)

- `src/server/config.ts`: `CANONICAL_REDIRECT` in `AccountEnv`, and a pure
  function `canonicalRedirect(url, env)` that returns the `SITE_URL` URL
  with the request's path and query when the host differs, else null. Not
  for `localhost` / `127.0.0.1` / `[::1]`, not when `SITE_URL` is unset or
  malformed, not when `CANONICAL_REDIRECT` is `false`. String comparison of
  hosts only.
- `src/server.ts`: the first thing the fetch handler does; answers 308.
- Test: `scripts/canonical-test.ts` (node:test, in `pnpm test`): another host
  redirects with path and query kept; the canonical host, localhost and the
  off switch do not.
- Deploy workflow: `CANONICAL_REDIRECT` in the variable list (header comment,
  env and the names array). README: the configuration table and why.

### Part 1 - the account entry

One implementation, `src/chat/AccountEntry.tsx`:

- `AccountButton`: desktop a 48 px glass control right of the toolbar, the
  module's gap (`GLASS.anchorGap`) between them. Signed out a capsule
  (person icon, "登录"); signed in a circle with the picture, or the first
  letter of the name (else of the email) on a plate. Phone: a round button
  (variants below). Hidden when the server offers no sign-in.
- `AccountMenu`: a `GlassMenu` anchored to whatever opened it: name and
  email (text, not a button); the free allowance as trailing text
  ("今天还剩 N 次", `quota.left`, as in the key menu); "我的密钥" (the key
  picker's list, `showKeyChoices`, or the browser key settings when keys are
  not saved with accounts); "退出登录". A marked slot for "我的项目"
  (task 027) between the identity and the allowance.
- `openAccount(anchor, origin)`: signed out opens the existing sign-in
  surface (`openSignIn`), signed in the account menu. The account button and
  the project menu's first row both call it. Placement: from the button
  `below-end` at the button; from the project menu `below-start` at the
  house name (as today, so nothing flies across the screen). Sign-in stays
  the bottom sheet on phones.
- After a successful sign-in: the sign-in surface closes (as today), the
  button becomes the avatar, and a `GlassToast` above the input reads
  "已登录 · <name>" for a few seconds.
- `/studio?signin=1`: opens the sign-in surface once at the account button
  (if signed out and sign-in is on), then removes the parameter
  (`history.replaceState`).
- Server: `GET /api/chat` `user` gains `name` and `image` (Better Auth's
  user fields; null when absent). `sessionUser` returns them.
- Desktop studio: the toolbar's right edge moves left by the button's width
  plus the gap; the button stays in the sheets view (where the toolbar is
  hidden) at the same place, and in walk mode next to the toolbar (the
  toolbar stays while walking). Panels still hang under the toolbar
  (`below-end`, joined).
- Landing: "登录" / "Sign in" at the top right, left of "打开示例项目",
  linking to `/studio?signin=1`; signed in, the CTA reads "打开工作台" and the
  sign-in link is gone. The landing learns this from `GET /api/chat` after
  load (no server render change).
- Phone, behind `?acct=a` / `?acct=b` (temporary; default a; the lead later chose a):
  (a) top row: house name block left, round account button right; the mode
  switch centred on a row of its own below. Landscape: one row (name, the
  switch centred, the button right), since the row has the width.
  (b) top row unchanged; a second line under it: the facts at the left, the
  account button at its right end (under the mode switch's right edge).
- account-e2e: the button signed out, opens sign-in, the avatar after the
  test sign-in, the menu with the allowance and sign-out, `?signin=1` once.
- Audit: the new control in the desktop states (hit target, row alignment
  with the toolbar, anchor gap of its menu, tooltip contrast, both languages,
  no wrapping at 1280).

### Out of scope

Cloud projects (027) and share links (028): only the menu slot.

## What was built

- Part 2: `canonicalRedirect` (`src/server/config.ts`), first in the Worker's
  fetch handler; `CANONICAL_REDIRECT` in the deploy workflow and README;
  `scripts/canonical-test.ts` (in `pnpm test`).
- Part 1: `src/chat/AccountEntry.tsx` (`AccountButton`, `AccountMenuHost`,
  `AccountToast`, `openAccount`, `useSignInParam`). The project menu's first
  row is the account (sign in, or the name / email) and calls `openAccount`.
  `GET /api/chat` `user` has `name` and `image`. Landing: "登录" left of the
  studio link; signed in that link reads "打开工作台" (the hero button keeps
  its text, lead's decision). With sign-in off the phone header is the one
  from before this task.
- Phone: the lead chose variant (a) (2026-11-18); (b) and the temporary
  `?acct=` flag are gone. Upright: the house name and a 36 px round account
  button (44 px to touch, its centre on the name's line) on the top row, the
  mode switch centred on a row of its own; the account menu stands under the
  whole top row (`data-account-row`), and the mode switch steps aside under
  any menu that opens over it (`GlassSegmented stepAside`, the module's rule).
  Sideways: one row (name, switch centred, button at the end).
- Header bottom, CSS px: 390 x 844 60 -> 112 (+52); 844 x 390 56 -> 56.
  The house stays still when sign-in or the account menu opens and after
  sign-in (framing insets unchanged, account-e2e).
- Tooltips (`src/glass/primitives.tsx` `installTipIntent`, `glass.css`): a
  tooltip shows on hover once the pointer has moved over its control, or on
  focus that came from Tab or an arrow key; never from focus the code moved
  there (a closing surface returning focus to its button) or for a control
  that appears under a resting pointer. Before, the avatar showed "账户" next
  to the "已登录" toast. account-e2e checks all three cases.
- The toolbar no longer shifts when the status arrives: the browser keeps
  what it last learned (`opensu.account.v1` in localStorage: sign-in offered,
  signed in) and, until `GET /api/chat` answers, an invisible, inert copy of
  the button holds its place. No extra request, nothing waits for it. A
  browser's first visit (nothing stored) still shifts once; so does a stale
  value (sign-in turned off, or signed in elsewhere).
- account-e2e `entry` section; ui-audit states `account-signin`,
  `account-signed-in`, `account-menu` (layout and glass sets, hover pass).

### Audit on the new control (d1440 / d1280 zh + en, p390-zh, p844x390-zh, CSS twins; states account-signin, account-signed-in, account-menu)

- No `tip-contrast`, `anchor-gap`, `wrap`, `inset-lr` or desktop `row-align`
  findings for the button or its surfaces. Fixed on the way: the signed-out
  capsule's insets (14 / 18 -> 16 / 16), phone (a) row alignment, the
  account menu touching the facts line in (a), a long email cut at 280 px
  (menu now 320 px).
- Open: `hit-target` on the account menu rows on phones (40 px,
  `GlassMenuItem`'s height, shared with every menu; left for a separate batch); `row-align` 3.1 px in
  the p844x390 header (name line vs the mode switch; not checked whether the
  header before this task had it too).

## Final checks (2026-11-18)

- `pnpm -r typecheck`: passes. `pnpm -r test` on the final tree (third run):
  passes. Packages 247 tests (model 108, agent 49, render 30, plan 24,
  kernel 23, sheet 10, furnish 3); web: node tests 47 + 5, glass check,
  shots, glass contrast, chat e2e, account e2e, `ui-audit --smoke` (5 known
  findings, nothing new), relay and auth checks.
- First run: one account-e2e check failed once ("sign-in: the email field is
  focused on arrival", phone section); three reruns of that section passed.
  Treated as a timing flake under load, not fixed.
- Second run: `shots.mjs` saw sign-in turned on because `ui-audit.mjs` (run
  by hand before) never deleted its `dist/server/.dev.vars`; it now does.

## Part 2 follow-up: the pages (live defect, 2026-11-18)

On the deployed Worker the old host got 308 for `/api/chat` and unknown paths
but 200 for `/` and `/studio`: the prerendered pages are static assets, and
Cloudflare serves an asset before the Worker's fetch handler runs.

Fix (no inline-script fallback needed): `wrangler.jsonc` `assets` gets
`binding: "ASSETS"` and `run_worker_first` for the page routes only (`/`,
`/index.html`, `/studio`, `/studio.html`, `/auth-done`, `/auth-done.html`).
The Worker answers the 308 for another host; on the canonical host (and
localhost, and with CANONICAL_REDIRECT=false) it returns `ASSETS.fetch` of
the same request, so the same file with the same headers. A 404 from ASSETS
falls through to Start (the prerender step fetches `/` and `/studio` before
the files exist). Scripts, styles and images are still served as assets
without a Worker request.

Test: account-e2e `canonical` (in `--smoke`): the built app in `vite preview`
(workerd with the same assets config, asset-first serving) with
`SITE_URL=https://opensu.example.com` and requests carrying another Host
header (`OPENSU_ANY_HOST=1` lets `vite preview` accept them). The local run
reproduces the defect: on the pre-fix build `/` and `/studio` answered 200 on
the other host and the test failed 4 checks; on the fix all pass. The page
body on the canonical host is byte-identical to `dist/client/index.html` /
`studio.html` with the same content type, ETag and cache headers; local
timing of `/studio` 6-7 ms vs 4-6 ms for an asset-only file (workerd, not
the edge).

Not verifiable before deploy: how Cloudflare's edge applies
`run_worker_first` (local workerd behaves the same, but the edge was not
tried), and the edge cost: each page view on the canonical host is now one
Worker request (free tier: 100,000 a day) with negligible CPU (a string
compare and an `ASSETS.fetch`).
