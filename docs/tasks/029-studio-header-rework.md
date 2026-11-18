# Task 029 - Studio header: the toolbar is for view tools only

Owner's review of tasks 026 and 028 on the live site: the top right is
the toolbar; sign-in and share do not belong beside it. This reverses
the placement decisions of 026 (account button) and 028 (share button).
The features stay; only where they live changes.

## What changes

1. Top right, desktop and phone: the toolbar only (views, levels, sun,
   walk). Remove the account button / avatar and the share button from
   there, with the reserved-place logic (`opensu.account.v1` placeholder)
   that existed for them. The toolbar no longer shifts on load.
2. Share moves to the left, with the document: a share button directly
   right of the house name block (same row as the name; precedent: the
   document title area owns document actions, as Apple's document title
   menu and Notion's title row do). It opens the same share surface,
   anchored there. Phone: the top row is name left, mode switch right,
   as before task 026 (header back to 60 px upright, 56 px sideways); if
   an icon button fits right after the name without truncating a normal
   name or touching the switch, put it there, otherwise "Share" is the
   first row of the project menu. Decide by measuring at 390 and 360 px
   wide with a long name, say which, and keep one share surface.
3. Account in the studio lives in the project menu only: its first row
   (signed out "Sign in"; signed in the name, opening the same account
   menu: allowance left, my keys, sign out). No avatar in the studio.
   The avatar and account menu stay on `/projects`; the sign-in link
   stays on the landing page.
4. A sign-in invitation for new, signed-out visitors, shown once the
   visitor has something worth keeping: after their first successful
   change to the house through the assistant (not on arrival, not while
   a reply is streaming). Form: one non-blocking glass notice above the
   prompt (not a modal dialog; Apple's guidance is not to interrupt with
   alerts for marketing): a short line saying that signing in keeps
   the project with the account, opens it on other devices and lets it
   be shared, a "Sign in" action and a close button. Rules: at most
   once per browser until dismissed or signed in; after a dismissal not
   again for 14 days; never when sign-in is off, in view-only mode,
   while walking, or when another surface is open. It never moves the
   house (still-house rule). The existing quota-reached sign-in prompt
   stays as it is; the two never show together.
5. Signed out, pressing Share still explains and offers sign-in (as
   built in 028).

## Constraints and checks

- `CLAUDE.md`, `docs/UI_STYLE.md`, `DESIGN.md`, tasks 025 to 028 notes;
  tokens unchanged; glass primitives only; delete what is no longer
  used (no dead variants, flags or audit states).
- Update e2e and audit states that assumed the old placement; add
  checks: toolbar is the right-most element and does not shift on load;
  the share button's gap and centre line with the name; the invitation's
  rules above (shown once after the first change, respects dismissal,
  absent when signed in).
- Screenshots under `artifacts/task029/` at 1440x900, 1280x720, 390x844,
  360x800 and 844x390, zh and en: signed out, signed in, share open,
  account menu from the project menu, the invitation, view-only.
- `pnpm -r typecheck` and the full `pnpm -r test` pass once on the final
  tree.

Small local commits; do not push. Report honestly.
