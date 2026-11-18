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

## Part 2 (owner, same day): one panel shell

Owner's review: the surfaces that open from buttons do not look like one
component. Measured on our own screenshots (1440 wide): the views, sun
and levels panels have a 14 px title and a close button, the share and
sign-in surfaces an 18 px title, the account menu no header; body insets
differ (about 22 px in toolbar panels, 16 to 20 px elsewhere); the
actions differ (full-width yellow "Continue" in sign-in, an inline grey
"Copy link" in share); the sun panel has no title at all. Task 025
unified where a surface is placed and how it opens; what is inside was
still laid out by hand per surface. Fix that.

1. One shell in `src/glass/` for every non-menu surface (views, levels,
   sun, site location and orientation, share, sign-in, key sheet, the
   sign-in invitation if it is a surface): one header (title style and
   size, close button position and size), one body inset, one gap
   between sections, one footer / action row, one radius, one width
   scale (name two or three widths, no ad-hoc numbers). Callers pass a
   title, content and actions; they do not set padding, title size or
   radius themselves. A surface without a visible title (the sun panel's
   clock) is an explicit variant of the shell, not a bypass.
2. One action style: the primary action of a surface is one component
   (decide between the full-width yellow button and the inline one by
   Apple's sheets and popovers; the lead's reading is: a single primary
   action is a full-width prominent button at the bottom, secondary
   actions are plain), used by sign-in, share ("Copy link"), key sheet.
3. Menus (project menu, account menu, card menus, key menu) stay
   `GlassMenu`, one row height, one inset; an identity header row
   (account menu) is a menu primitive, not custom markup.
4. Attachment has one rule, written in `docs/UI_STYLE.md`: a surface
   whose anchor is a control inside a glass bar is joined to that bar;
   a surface whose anchor stands alone (the share button by the name,
   the house name) floats at the module gap. After Part 1 no floating
   surface opens beside the toolbar.
5. Extend `glass-check.mjs`: outside `src/glass/`, a surface may not set
   its own padding, title font size or radius (fail on the patterns you
   remove), and the audit gets a rule comparing header title size, close
   button box and body inset across all open surfaces (one value each).
6. Also remove the dark smudge at the lower left corner of the share
   surface (visible in `artifacts/task028/d-zh-on.png`) or explain it.

Evidence: one comparison sheet per viewport (1440x900, 390x844) under
`artifacts/task029/` with every surface open, cropped to the same scale,
side by side, plus a table in the notes of title size, close box, inset,
radius and width per surface, before and after.

## Part 3 (owner, same day): one attachment, a shadcn-style base folder

The owner decided, overriding Part 2 item 4 and task 025's two modes:

1. Every surface floats. One attachment only: at the module gap from
   its anchor. Remove the "joined" mode entirely: the `attach` option,
   the neck drawn on the glass layer (`packages/render/src/glass.ts`),
   the CSS-fallback notch, the audit rules `anchor-joined` and
   `panel-attach` (replace with: every open surface is at the module gap
   from its anchor), and the still-house / layout checks that assert a
   joined panel. Toolbar panels (views, levels, sun; plan levels) open
   below their own button like any popover (aligned by `place()`, not
   stretched to the toolbar).
2. Base components follow shadcn/ui's organisation (structure and API
   shape; do not install shadcn or Radix, our glass is drawn on a
   canvas layer): one folder holding every base component, one file per
   component, small composable parts with variants as props, no feature
   knowledge inside. Suggested: `apps/web/src/ui/` with `button`,
   `icon-button`, `popover` (Popover, PopoverHeader, PopoverTitle,
   PopoverBody, PopoverFooter), `sheet` (the phone form of the same
   parts), `menu` (Menu, MenuItem, MenuLabel, MenuSeparator), `switch`,
   `segmented`, `field`, `tooltip`, `toast`, `separator`, plus the
   placement and glass-surface internals. Move `src/glass/` there (or
   keep the name `glass/` if a rename costs more than it gives; say
   which and why), and include the paper-page controls used on
   `/projects`, the landing page and the not-found pages (buttons,
   cards) so that those pages also only apply base components.
3. Everything outside that folder only applies components: no element
   there sets its own radius, padding of a surface, title size, hover,
   focus ring, shadow, or positions a floating element. A feature file
   may compose (`<Popover><PopoverHeader>...`) and lay out its own
   content inside the body; nothing more. Extend `glass-check.mjs`
   (rename it if the folder is renamed) to enforce this and list in the
   notes every exception with its reason. Add a short `README.md` in the
   folder: the components, their parts and variants, and the rule.
4. One responsive rule in the base, not in callers: a Popover becomes a
   Sheet on phones.

Order: Part 1, then Parts 2 and 3 together. The full test run once at
the end.

## Part 4 (owner, same day): a surface opens away from its anchor

Owner on the live site: a popover of the top bar appears from above the
bar (it starts over the bar and travels down across it) and leaves the
same way. It must come out from under the bar's lower edge and go back
there.

One rule in the base popover, for every placement: the open animation
starts at the edge of the anchor that faces the surface (for a surface
below its anchor: the anchor's lower edge plus the module gap) and
grows away from the anchor; the close is the exact reverse. On no frame
does the surface (its glass, shadow excluded, or its content) overlap
its anchor or the bar the anchor sits in, and it is never drawn over
them. Same for surfaces that open above their anchor (the key menu in
the prompt bar): they grow upward from the anchor's upper edge. Reduced
motion: a fade in place.

Audit: extend the motion rule (task 025 captures at least 6 frames each
way): on every frame the surface's box does not intersect the anchor's
bar, and its edge nearest the anchor stays within the module gap of its
final position (it grows away, it does not slide across). Self-test:
show the rule failing on the tree before this change and passing after.
Add frame strips of the views, levels, sun, share and project-menu
surfaces to `artifacts/task029/`.
