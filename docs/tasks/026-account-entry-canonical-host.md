# Task 026 - A visible account entry; one canonical host

Owner's finding (2026-11-18): sign-in went live and he could not find it.
It sits only in the project menu (a decision of task 019, wrong: the
account is the door to saving, sharing and other devices, not a quota
tool). This is P0 item 1 of the platform list, with item 4 (one host) as
a second, separate commit. Cloud projects and share links follow in
tasks 027 and 028; leave room for them, do not build them.

## Part 1 - The account entry

Apple reference: the account avatar at the top right of App Store and
Maps: always visible, one tap, opens a small account surface.

- Desktop studio: a round glass button to the right of the toolbar, same
  height as the toolbar, the module's gap between them. Signed out it is
  a capsule reading "登录" / "Sign in" with the person icon (a bare icon
  is not discoverable enough for a first visit); signed in it is a circle
  with the Google picture, or the first letter of the name on a quiet
  plate when there is none.
- Signed out, a tap opens the existing sign-in surface, anchored to the
  button (the task 025 popover primitive; nothing positions itself).
  Signed in, it opens an account menu: name and email (not a button),
  today's allowance ("今天还剩 N 次" as trailing text, same wording as
  the key menu), "我的密钥" (opens the key picker's list), "退出登录".
  Leave one obvious place where "我的项目" will go.
- Phone: the top row is full (house name left, mode switch right). Do
  not guess: build two variants behind a temporary query flag and
  screenshot both at 390x844 and 844x390, then stop and report so the
  lead picks one:
  (a) a round account button at the right end of the top row, the mode
  switch centred on its own row below the house name;
  (b) the top row unchanged, the account button at the right end of the
  facts line under the house name.
  Check both against the still-house rules of task 021 (the house must
  not move when a panel opens) and say what each costs in height.
- The project menu keeps its first row ("登录" or the account's name);
  it opens the same surface as the button. One implementation.
- Landing page: a "登录" / "Sign in" link at the top right, left of
  "打开示例项目"; it goes to `/studio?signin=1`, which opens the sign-in
  surface once and removes the parameter. Signed in, the link reads
  "打开工作台" and the sign-in link is gone.
- When sign-in is off on the server (`auth.email` and `auth.google` both
  false) none of this is shown, as today.
- After a successful sign-in: the surface closes, the button turns into
  the avatar, and one short confirmation appears ("已登录" with the
  name), using the existing toast; no second dialog.
- Walk mode: the account button follows whatever the toolbar does there.

## Part 2 - One canonical host

Signing in on the `workers.dev` address lands the session cookie on the
custom domain, so the old address looks signed out.

- When `SITE_URL` is set and a request's host is not its host, answer
  308 to the same path and query on `SITE_URL`, before anything else
  runs. Not for localhost / 127.0.0.1. A variable `CANONICAL_REDIRECT`
  set to `false` turns it off (escape hatch if the custom domain breaks);
  add it to the deploy workflow's variable list and the README.
- The check is a string comparison in the Worker's fetch handler: no
  measurable CPU. Unit or script test: other host redirects with path
  and query kept; the canonical host, localhost and the off switch do
  not.

## Constraints and checks

- `CLAUDE.md`, `docs/UI_STYLE.md`, `DESIGN.md`; glass primitives only;
  the static glass check and `ui-audit --smoke` pass; tokens unchanged.
- The UI audit's rules for the new control: hit target, row alignment
  with the toolbar (one centre line, equal heights), anchor gap of its
  menu, tooltip contrast, both languages, no wrapping at 1280.
- Extend account-e2e: the button is visible signed out, opens sign-in,
  turns into the avatar after the test sign-in, the menu shows the
  allowance and signs out; `?signin=1` opens the surface once.
- Screenshots under `artifacts/task026/` at 1440x900, 1280x720 and
  390x844, zh and en: signed out, sign-in open, signed in, account menu
  open, landing signed out and signed in, walk mode.
- `pnpm -r typecheck` and `pnpm -r test` pass once on the final tree.

## How to work

Scope note first. Part 1 desktop and landing, then the two phone
variants, then stop and report for the lead's choice; Part 2 as its own
commit. Small local commits; do not push (a push to `main` deploys; the
lead pushes after review). Report honestly what was skipped or not
verified; a real Google sign-in cannot be done here, say so.
