# Task 026 - notes: a visible account entry; one canonical host

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
- Phone, behind `?acct=a` / `?acct=b` (temporary; default a):
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
