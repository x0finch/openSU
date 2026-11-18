# Task 029 - notes: the studio header, the toolbar alone at the top right

## What changed

The owner's review of 026 and 028: the top right is the toolbar, and sign-in
and share do not belong beside it. The features stay; their places move.

| Before (026 / 028) | Now |
|---|---|
| Desktop top right: toolbar, "分享" capsule, account button (avatar) | the toolbar only (views, levels, sun, walk) |
| An invisible copy of the share and account buttons held their place until `GET /api/chat` answered (`opensu.account.v1`) | nothing to reserve: the toolbar never waits for the status |
| Phone upright: name + share + account on the top row, the mode switch on a row of its own (header 112 px) | name left, mode switch right, as before 026 (header 60 px; sideways 56 px) |
| Phone sideways: name, switch, share and account on one row | name, switch |
| Account: the button, or the project menu's first row | the project menu's first row only (signed out "登录", signed in the name, opening the same account menu); no avatar in the studio |
| Share: the capsule at the top right (desktop), a round button in the top row (phone) | desktop: a 36 px "分享" capsule right of the house name, on the name's line; phones: "分享", the project menu's first row |
| Nothing invited sign-in except the quota note | the sign-in invitation after the first change (below) |

The avatar and the account menu stay on `/projects`; the landing keeps its
"登录" link (`/studio?signin=1` now opens sign-in under the house name).

### Where, in code

- `src/studio/Studio.tsx`: the desktop title row (`data-title-row`: the
  name block and `ShareButton`), the toolbar alone in `top-trailing`, the
  phone header back to one row. The walking paper fade measures the name
  block alone, so it stops short of the share capsule's glass.
- `src/studio/Share.tsx`: `ShareButton` (36 px capsule, or a round icon;
  no reserved copy); `ShareHost` places the surface under the title row
  (`below-start`, the module's gap), grown out of the share button; on
  `/projects` it stays under the card's button (`below-end`). Signed out,
  its "登录" opens sign-in under the house name (origin `menu`), and focus
  and the closing motion go back to the share button.
- `src/studio/chrome.tsx`: the project menu's phone row "分享"
  (`menu-share`) before the account row.
- `src/chat/AccountEntry.tsx`: `AccountButton` is the `/projects` button
  only; the account menu has no "我的项目" row any more (in the studio it
  opens from the project menu, which has "所有项目"; `/projects` never
  showed it). `StudioToast` holds the invitation in the studio.
- `src/chat/SignInInvite.tsx` (new): the invitation and its rules.
- `src/chat/SignIn.tsx`: origin `menu` returns into the control that opened
  it when that control is still there (the share button), else the name.
- `src/glass/anchor.ts`: `floatingOpen()` (some floating surface is open),
  exported with `subscribeFloating`, for the invitation's rule.

### Deleted

- The reserved place: `readCache` / `writeCache`, `opensu.account.v1`, the
  inert copies `account-button-reserve` and `share-button-reserve`, the
  studio's `accountShown` branch.
- The studio's `AccountButton` (desktop, phone upright 36 px, sideways
  44 px), `data-account-row` and the account menu's anchoring to it.
- `GlassSegmented stepAside` and `ModeSwitch stepAside` (only the upright
  phone header of 026 used them; `GlassTextSurface` is back to its own
  copy of the rule, as before 026).
- The account menu's "我的项目" row (`account-projects`).
- The 026 e2e checks of the button (its height and centre line with the
  toolbar, its gap, the reserved place, its tooltip) and the audit state
  `account-signin`. A browser that has the old `opensu.account.v1` key
  keeps it; nothing reads it (not worth code to remove).

## Phone: where "分享" goes (measured)

`scripts`: the studio at 390 x 844 and 360 x 800 (zh; the default house
name, "白墙坡顶小院"), the name's natural width against the room left of
the mode switch (switch 156 px zh, 175 px en; gap 10). A 36 px icon button
needs 8 + 36 = 44 px after the name.

| Width | Name | Name's width | Room before the switch | Left after a 44 px button |
|---|---|---|---|---|
| 390 zh | 白墙坡顶小院 (default) | 155 | 200 | 1 px |
| 390 zh | 外婆家的坡顶小院 | 189 | 200 | -33 (cut) |
| 390 en UI | 白墙坡顶小院 | 155 | 181 | -18 (cut) |
| 360 zh | 白墙坡顶小院 | 155 | 170 | -29 (cut) |
| 360 zh | 外婆家的坡顶小院 | 189 | 170 | -63 (cut) |
| 844 x 390 | any of the above | 155-277 | 635-654 | 314 or more |

Upright, the button would cut the default name at 360 and in the English
interface at 390, and touch the switch at 390 zh. So on phones "分享" is
the project menu's first row (Canva mobile keeps Share in its "..." menu;
the iOS document title menu also opens from the name). Sideways there would
be room, but the entry stays in the menu there too, so it does not move
when the phone turns. One share surface: the same `ShareHost` sheet.

## The sign-in invitation

Copy (`account.invite`):

- zh: 登录后，项目随账户保存，可在其他设备打开，也能分享。
- en: Sign in to keep this project, open it on other devices and share it.

Actions: "登录" / "Sign in" and a close button ("关闭" / "Close").

Form: a 48 px glass capsule in the toast's place above the input (one line
on desktop, up to two on phones; the view-only bar's measure). Precedent:
Apple's HIG on accounts (let people use the app before asking them to
sign in) and on alerts (do not interrupt for something that is not
urgent): a non-blocking notice, not a dialog.

Rules (`src/chat/SignInInvite.tsx`):

- Raised when a turn ends with a change by the assistant (not a manual
  edit, not an error, given up or stopped turn), signed out, sign-in on,
  not view-only. Never on arrival, never while a reply runs.
- Once raised, the browser records when (`opensu.invite.v1`); it stays in
  that page until closed or signed in. Closing records the time again.
  It is not raised again for 14 days after it was shown or closed, so a
  reload and another change do not bring it back (the spec's "at most once
  per browser until dismissed"; leaving it open and reloading counts as
  shown).
- A sign-in on this browser ends it for good (`done`), also after a later
  sign-out.
- Hidden for the moment (it comes back when they close) while: the
  assistant works, walking, a tool or site panel, the recent strip or the
  pinned conversation, settings, the sign-in surface, the account menu,
  the key sheet, the share surface, or any floating menu or popover is
  open; and while the latest reply is the quota note (the quota note has
  its own "登录"; the two never show together). Messages of the toast
  slot ("已复制链接", ...) take the place while they show.
- It lies over the drawing; the persistent framing is unchanged (e2e).

## Tests

- `scripts/account-e2e.mjs` `entry` (rewritten; in `--smoke` with 1440 zh
  and 390 zh; the full run covers 1440 x 900, 1280 x 720, 390 x 844,
  360 x 800 and 844 x 390 in zh and en, with screenshots). Per
  configuration: no account button; desktop: the toolbar is the right-most
  control (nothing that acts lies right of its left edge in its band) and
  18 px from the edge; "分享" 12 px right of the name, on its centre line,
  36 px, label not cut; the share surface under the name's row at the
  module's gap; phones: header 60 / 56 px, name left and switch right,
  nothing else, "分享" then the account as the menu's first rows; share
  signed out explains and offers sign-in; the invitation absent on
  arrival, present after the first change and never while the turn ran,
  the house still, 48 px above the prompt with its text whole; sign-in
  from the account row under the house name; signed in: no avatar, no
  invitation; the account menu (allowance, my keys, sign out, no projects
  row) under the house name, the house still; share signed in; view-only:
  no share button or row, no invitation, toolbar still last. Then: the
  toolbar and the name do not move when a delayed status arrives (first
  and second visit); the invitation's rules (hidden while walking, under a
  menu, under a tool panel; closed: not after a second change, not after a
  reload and a change; 15 days later back after a change but not on
  arrival; "登录" opens sign-in above the input; signed in it ends; signed
  out again it stays away); with the quota reached the quota note's
  "登录" stands alone; sign-in off: no account, no share, no invitation;
  the landing's link opens sign-in under the name once.
- The `projects` and `share` sections follow the new places (the studio's
  way to `/projects` is "所有项目"; phones open share from the menu).
- `scripts/ui-audit.mjs`: new state `account-invite` (in `--smoke`, hover
  pass); `account-menu`, the signing in and `account-share` go through the
  project menu (and "分享" by the name on desktop). The smoke run now
  reaches a state after a turn, so two findings that existed in the full
  run reach the allow list: the unseen-reply dot (`accent-use`, the yellow
  DESIGN.md allows for it) and the 2.3 px `row-align` of the change note in
  the input (task 027 notes list the same rule at 1.3 px).

# Parts 2, 3 and 4 (owner, same day): one shell, one base folder, one attachment, open away from the anchor

## What changed

### The base folder (part 3)

`apps/web/src/glass/` is now `apps/web/src/ui/` (renamed: from this task it
also holds the paper-page controls, so "glass" no longer names it; the
rename was a path change in 13 imports and three scripts). Organised like
shadcn/ui (structure and API shape only; no shadcn or Radix installed):
one file per component, composable parts, variants as props, no feature
knowledge inside. The old `primitives.tsx` (1 100 lines) is split into
`button`, `icon-button`, `toolbar`, `segmented`, `anchored` (internal),
`popover`, `menu`, `sheet`, `switch`, `slider`, `choice`, `row`, `tooltip`,
`toast`, `separator`, `text-surface`, `input-bar`; new: `field`, `notice`,
`bar`, `hud`, `card` (paper tiles and gallery sheets), `spinner`, `dot`,
`badge`, `skeleton`, `avatar`, `glyphs`, `use-phone`. Names follow shadcn
(`Button`, `Popover`, `MenuItem`, `Sheet`, `Switch`, `Tooltip`, ...);
`src/ui/README.md` lists every component, its parts and variants, and the
rule.

Everything outside the folder only applies components. Removed from
feature files on the way: three copies of the sign-in / key-sheet
`Primary` button and `Spinner`, two `Field`s, the share and sign-in and
key-sheet headers, the site panels' own header, the tool panels'
`CloseButton`, the projects page's tile class and paper buttons, the
landing's hand-built links, the settings sheet's own switch (now
`Switch`), the walk HUD's raw glass, the gallery's paper sheets, a box
inside the location panel (the current place sat on a wash box: now a
line), the dashed "N ↑" box in the views panel (now plain text).
`StudioToast` keeps its place; the invitation and the view-only bar are
one `Notice`.

`scripts/glass-check.mjs` is now `scripts/ui-check.mjs`: outside `src/ui/`
it fails on a radius, a hover or focus state, a focus ring, a shadow, a
backdrop, the base's own classes, a surface title size (h1-h3 at 15 px or
more), a tooltip, a portal, padding on a base surface (`Popover`, `Menu`,
`Sheet`, `Notice`, `Bar`, `HudPanel`, `Toast`, ...) and a positioned
`Popover` / `Menu`. Exceptions (each in the script with its reason):

| File | Rule | Why |
|---|---|---|
| `routes/index.tsx` | title size | the landing headline is the page's display type (DESIGN.md "Landing display") |
| `projects/ProjectsPage.tsx` | title size | the page title of `/projects` (paper page) |
| `routes/s/$id.tsx` | title size | the old share placeholder page, left as it is (task 028 notes) |
| `routes/__root.tsx` | title size | the 404 page title |
| `studio/ProjectMissing.tsx` | title size | the full-screen "not found" page of a project or link |
| `studio/SheetGallery.tsx` (the viewer) | focus ring | the full-screen sheet viewer takes focus itself to receive arrow keys; it is not a control |

Not in the check: `styles.css` (the tokens and global CSS) and the
`WalkHUD` / `Studio` layout positions (screen-edge layout, not anchored
surfaces; the old rule allowed them too).

### One panel shell (part 2)

`Popover` with `PopoverHeader`, `PopoverTitle`, `PopoverDescription`,
`PopoverBody`, `PopoverFooter`, `PopoverAction` (`src/ui/popover.tsx`,
`glass.css` `.lg-panel*`). Used by the views, levels and sun panels, the
location and orientation panels, share, sign-in (both steps) and the key
sheet (add, edit, offer). The sun panel is the explicit untitled variant
(`PopoverTitle hidden`: its clock is the heading). The invitation is a
`Notice` (a capsule in the toast's place), not a surface. The settings
sheet (the centred browser-key dialog) is not a popover and was converted
to base components but not to the shell (see "Not done").

Measured by `getComputedStyle` on the live build (scratch script, numbers
in CSS px; "before" is the tree at 6041140, task 029 part 1):

| Surface | Title before | Title after | Close before | Close after | Inset before | Inset after | Radius | Width |
|---|---|---|---|---|---|---|---|---|
| Views | 14 px / 500 | 17 px / 600 | 30 | 32 | 22 | 22 | 30 | 330 (tool) |
| Levels | 14 px / 500 | 17 px / 600 | 30 | 32 | 22 | 22 | 30 | 330 |
| Sun | none | none (untitled variant, named for screen readers) | none | none | 22 | 22 | 30 | 330 |
| Location | 15 px / 600 | 17 px / 600 | 36 | 32 | 16 / 14 | 22 | 30 | 330 |
| Orientation | 15 px / 600 | 17 px / 600 | 36 | 32 | 16 / 14 | 22 | 30 | 330 |
| Share | 19 px / 600 | 17 px / 600 | 32 (16 from the edge) | 32 (22) | 22 | 22 | 30 | 380 (dialog) |
| Sign-in | 19 px / 600 | 17 px / 600 | 32 (16) | 32 (22) | 22 | 22 | 30 | 380 |
| Key sheet | 19 px / 600 | 17 px / 600 | 32 (16) | 32 (22) | 22 | 22 | 30 | 380 |
| Phones (all) | as above | 17 px / 600 | 30-36 | 32 | 20 sides | 20 sides, 4 top, 24 bottom | 34 (sheet) | screen - 16 |

Section gap: 16 everywhere (the phone tool sheets had 12). Title size:
17 px semibold, Apple's navigation-bar and sheet title size. Close: a
32 px round plate at the header's end, flush with the inset.

Primary action: one component, `PopoverAction` (primary: full width,
48 px, ginkgo yellow, at the bottom; secondary: plain, full width).
Apple's reading, as the lead put it: a single primary action of a sheet
is a full-width prominent button at the bottom; other actions are plain.
Now: sign-in "继续", share "复制链接" (was an inline grey button beside the
link), share signed out "登录" (was a grey plate), key sheet "保存", the key
offer; secondary: "以后再说", "删除", "重新发送", the location panel's
"跳过". Small print goes under the actions (`PopoverFooter note`), so a
surface ends in text (the concentric rule of task 028).

Menus stay menus: `Menu`, one row height (40), one inset; the account
menu's identity and allowance rows are `MenuLabel` (a menu primitive),
not custom markup.

Evidence: `artifacts/task029/compare-surfaces-1440x900.png` and
`compare-surfaces-390x844.png` (every surface open, cropped at the same
scale, before on top, after below).

### One attachment (part 3, overriding part 2 item 4)

Every surface floats at the module gap. Removed: `attach` /
`joined` (`anchor.ts`, the popover, `data-attach`), merge groups
(`Glass group`, `newGroup`, the registry's group, `TOOLS_GROUP`), the
shader's smooth union and its `merge` parameter
(`packages/render/src/glass.ts`, `material.ts`), the audit rules
`anchor-joined` and `panel-attach`, the layout and shots checks that
asserted a joined panel. Toolbar panels open below their own tool
(`below-center`, shifted by `place()` to stay on screen). One base rule
for an anchor inside a glass bar: the gap is measured from the bar's
edge, the alignment from the control (otherwise a panel 8 px under a
40 px tool would overlap the 48 px toolbar). The CSS fallback had no
notch code of its own (the "notch" was the CSS backend drawing two
separate shapes); nothing to remove there. Written in
`docs/UI_STYLE.md` ("Attachment").

### Open away from the anchor (part 4)

`anchored.tsx` `morphRect`: the shape starts as a line on its own edge
that faces the anchor (below: the anchor's lower edge plus the gap), as
wide as the part of the opening control it faces, and grows away; the
close is the reverse (the same springs run back). Reduced motion: a fade
in place (unchanged). Same for surfaces above their anchor (the key menu
and key sheet above the input) and beside it.

Audit: `motion-anchor` in the motion pass (12 frames each way, the
spring stepped 55 ms): on every frame with glass the surface's box must
not intersect its anchor or the bar the anchor sits in, and its edge
nearest the anchor must stay within the gap of where it rests. The
motion pass now films all three desktop tool panels (it filmed views
only). Self-test, d1440-zh and its CSS twin, states panel-views,
panel-levels, panel-sun, project-menu, account-share:

- before (6041140, the new audit scripts on the old build): 10
  `motion-anchor` findings (every surface, open and close; e.g. the
  project menu's first open frame overlaps the house name block by 43 px:
  it started over its anchor and slid down), plus 3
  `anchor-gap` (the joined toolbar panels at 0 px);
  `artifacts/task029/selftest/before-findings.md`.
- after: 0 `motion-anchor`, 0 `anchor-gap`;
  `artifacts/task029/selftest/after-findings.md`.

Frame strips (6 of the 12 frames each way, text hidden as the motion
pass does): `artifacts/task029/motion/motion-{before,after}-{panel-views,panel-levels,panel-sun,project-menu,account-share}-{open,close}.png`.
The "before" share strips crop the top left, where the share button no
longer was in that tree: they show the drawing, not the surface.

`panel-shell` (new audit rule): every open surface that is not a menu
must be built on the Popover parts, and across one configuration's
states the title size, close box, inset and gap must have one value
each. The motion pass also hides the filled controls inside a surface
(the yellow action, fields, switches) like it hides text: they are
content, and the yellow made the glass mask read as holes (two false
`motion-shape` findings on the share surface).

### Item 6: the dark smudge in task 028's share screenshot

It is the house's roof behind the surface, bent by the rim: the rim
samples the drawing 1.1 rim widths inward, so at the lower left corner of
`artifacts/task028/d-zh-on.png` the dark roof edge just outside the
surface is pulled into the corner, frosted, with the red / blue
dispersion fringe. The glass shader does that by design (UI_STYLE:
"Let the rim bend the drawing"). The share surface now opens at the top
left over the paper, so at 1440 x 900 nothing dark lies behind it
(checked in the new screenshots); over a dark part of the drawing the
same bend would show. Damping the bend over dark areas is the "adaptive
density" open question in UI_STYLE, not changed here.
