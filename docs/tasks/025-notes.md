# Task 025 - notes: one popover, one hover state, one tooltip

## Scope (written before the change)

### Anchored surfaces: where each is positioned today and where it moves

Every one moves to one primitive in `src/glass/` (`GlassPopover`, with
`GlassMenu` on top of it): inputs are the anchor element, a placement
(`below-start`, `below-end`, `above-start`, `above-center`, ...) and an
attachment (`joined` to the anchor's glass, or `float` with the module's
gap). The primitive sets the box (`position: fixed`, computed from the
anchor), flips or shifts it only to stay on screen, keeps a menu inside the
glass surface its anchor sits in when it fits, and caps its height to the
room on its side.

| # | Surface | File | Positioned today by | Moves to |
|---|---|---|---|---|
| 1 | Project menu | `studio/chrome.tsx` `ProjectMenu` | `absolute top-full left-0 mt-2 w-[300px]` under the title block | anchor: the house name; `below-start`, float |
| 2 | Toolbar panels (views, levels, sun) | `studio/tools.tsx` `PanelCard` | `absolute top-[72px] right-[18px] w-[330px] max-h-[calc(100%-72px-112px)]`, 6 px under the toolbar; the WebGL merge joins it in 3D, the CSS backend (plan) cannot, so it floats there | anchor: the toolbar; `below-end`, joined (touching, gap 0, same merge group) in both modes and both backends |
| 3 | Site panels (location, orientation) | `studio/tools.tsx` `PanelCard` | the same box as 2, top right, even when opened from the house menu (it then flies across the screen from the house name) | from the house menu: anchor the house name, `below-start`, float; from the sun panel: as 2 (joined to the toolbar) |
| 4 | Key menu | `chat/KeyPicker.tsx` `KeyPicker` | its own `getBoundingClientRect` arithmetic, portalled, `fixed`: beside the pinned column (`surface.right + 12`, the defect), else above the surface holding the button and any toolbar riding on it | anchor: the picker button; `above-start` in a field (pinned, phone sheet), `below-start` in the recent strip's header; float; stays inside the pinned column when it fits |
| 5 | Key sheet (add / edit / offer) | `chat/KeyPicker.tsx` `KeySheetHost` (desktop) | `absolute bottom-96 left-[calc(50%-190px)]`, morph from a fixed ghost of the opening control | anchor: the input capsule; `above-center`, float; morph origin stays the opening control |
| 6 | Sign-in popover | `chat/SignIn.tsx` `SignInHost` (desktop) | `top:74 left:24` (from the menu) or `bottom:96` centred; ghost as 5 | from the menu: anchor the house name, `below-start`; otherwise the input capsule, `above-center`; float |
| 7 | Walk map panel | `studio/WalkHUD.tsx` `WalkHUD` | `absolute top-[84px]`, `left: sidebar + 24` (the title block's geometry repeated) | planned: anchor the title block, `below-start`; **not done** (see "Not done": it would lie over the pinned column) |
| - | Walk pill, mode switch, toolbar, dock, pinned column, settings dialog, phone sheets | `WalkHUD`, `Studio.tsx`, `PhoneDock.tsx`, `ChatPanel.tsx` | screen edges / centre, not anchored to a control | unchanged (layout, not anchored surfaces) |
| - | `studio/PlanView.tsx` | | its `getBoundingClientRect` calls are the plan's pan, zoom and label fitting, not a surface | unchanged |

`Studio.tsx` also holds the one existing "what is under it" rule: while the
project menu (or the sign-in it opened) is open, the pinned conversation
fades out and is inert (`menuOpen` / `signInFromMenu` -> `PinnedColumn
aside`). The rule moves into the glass module: **a floating surface that
lies over the pinned conversation makes it step aside (fade, inert) while
it is open, except a pop-up menu opened from inside the conversation**
(Apple's menus float over their own window; the key menu stays at its
button). `PinnedColumn` asks the module (`stepAside`), nothing else
restyles what is under a surface.

### Hover and pressed styles outside `src/glass/`

| File:line | Control | Today | Moves to |
|---|---|---|---|
| `components/ui.tsx` `IconButton` | new conversation (pinned header) | `rounded-sm size-10`, `hover:bg-wash` (a rounded square) | deleted; `GlassIconButton` (circle plate, same height as the text buttons beside it) |
| `components/ui.tsx` `Segmented` | provider choice (settings sheet) | `hover:bg-wash`, `bg-ink` selected | deleted; `GlassChoice` |
| `components/ui.tsx` `LangToggle`, `routes/index.tsx` (2) | landing page | `hover:bg-wash`, `hover:bg-black` | stay: the landing page is paper with no glass (DESIGN.md); on the static check's allow-list with that reason |
| `chat/ChatPanel.tsx` `SmallButton` | undo / redo / show | `rounded-[6px] hover:bg-wash` (callers add `lg-plate`) | `lg-plate` |
| `chat/ChatPanel.tsx` `ChangeNote` | undo / show in the input | `rounded-full bg-wash hover:bg-hairline` | `lg-plate` filled |
| `chat/SettingsSheet.tsx` (2) | done, clear | `rounded-[6px]` / `rounded-sm` `hover:bg-wash` | `lg-plate` |
| `studio/tools.tsx` `CloseButton` | panel close | `rounded-[8px] hover:bg-wash` | `lg-plate` (circle) |
| `studio/tools.tsx` `ViewsPanel` (3) | view cells, eye level, reset | `rounded-[8px] hover:bg-wash`; `bg-wash hover:bg-hairline` | `lg-plate` (cells keep their tile radius; eye level and reset filled capsules) |
| `studio/tools.tsx` `RadioRows` | levels / cut rows | `rounded-[8px] hover:bg-wash`, selected `bg-wash` | `lg-plate` rows, selected `data-on` |
| `studio/tools.tsx` `SitePanelBody` | back to sun | `rounded-[7px] hover:bg-wash` | `lg-plate` |
| `studio/SitePanels.tsx` (5) | close, place rows, locate, skip, orientation chips | `hover:bg-wash`, `hover:bg-hairline` | `lg-plate` (rows, filled buttons, chips) |

One plate: `.lg-plate` in `glass.css` (the control's own shape, one hover
fill `--lg-row-hover`, one pressed / selected fill `--lg-row-active`, one
transition); `data-filled` for buttons that rest on a wash.

### Tooltips outside `src/glass/`

| Where | Today | Moves to |
|---|---|---|
| `components/ui.tsx` `Tip` (new conversation, pinned header) | `bg-ink text-white`: inside dark glass `--color-ink` is the glass's light ink, so white on white (defect 2) | deleted; `GlassTip` |
| native `title=`: view cells (`tools.tsx`), gallery download / previous / next (`SheetGallery.tsx`), hint dismiss (`chrome.tsx`) | the browser's own tooltip | `GlassTip` (one plate, one delay, one offset) |
| `.lg-tip` in `GlassGroupButton` | already in glass; plate `--lg-ink`, ink `--lg-tip-ink` | the same `GlassTip`; its plate and ink are their own variables (`--lg-tip-plate`, `--lg-tip-ink`), never remapped inside a panel, with a paper fallback |

### The "二层" label (pplan.png)

To check at 3x with the pointer away from it and on it (the frame has the
cursor over the label).

## What was built

- `src/glass/anchor.ts`: `place()` (the only placement code: side, alignment,
  flip and shift to stay on screen, inside the glass surface of the anchor
  when it fits; module gap `GLASS.anchorGap` 8 px, screen inset 12 px) and
  the step-aside rule (`coveredBy`). Unit tests: `scripts/anchor-test.ts`.
- `GlassPopover` (and `GlassMenu` on it): `anchor`, `placement`, `attach`
  (`joined` | `float`), `from` (what it grows out of when that is not the
  anchor), size-only `style`. It renders in the glass layer's portal host
  (`GlassLayer`), `position: fixed`, placed by `place()`. Glass opacity and
  content opacity follow the shape from the first frame; the CSS backend
  keeps the corners round while it scales. Floating surfaces are drawn on
  the lens layer (layer 1).
- Cause of defect 1: the pinned conversation and the project menu were two
  shapes on one layer; the shader takes each pixel's material from the
  deepest shape, so where the (fading) sidebar was deeper the menu took
  the sidebar's alpha: the menu showed only where it was "deeper" than the
  sidebar, i.e. its medial-axis region near its top edge (a trapezoid while
  wide, a triangle while tall). Fix: floating surfaces on layer 1, and the
  shader adds the tint of the glass under a layer-1 shape only as far as
  that glass is shown (`tb * alpha`, `packages/render/src/glass.ts`).
- Defect 2: `components/ui` `Tip` used `bg-ink text-white`; inside `.lg`,
  `--color-ink` is the glass's light ink. `GlassTip` uses `--lg-tip-plate` /
  `--lg-tip-ink` (never remapped), with a paper fallback. `GlassIconButton`
  gives the new-conversation button the module plate (a 32 px circle, the
  unpin capsule's height).
- Defect 3: the key menu's own arithmetic put it beside the pinned column;
  now `above-start` at its button, inside the column.
- Defect 4: both modes use one `PanelCard` box, but plan has no WebGL glass,
  so the 6 px gap that the WebGL merge bridged in 3D showed as a separate
  capsule in plan (CSS backend). Joined panels now touch the toolbar (gap
  0) in both modes and both backends; the empty mid-animation capsule was
  the content fading in only over the last 45 % of the spring.
- Toolbar tooltips are hidden while the toolbar's panel is open (they were
  drawn under the panel: the audit's `tip-contrast` found them).

## The audit rules (scripts/ui-audit.mjs, ui-audit-rules.mjs)

| Rule | What is measured | Tolerance |
|---|---|---|
| `tip-contrast` | hover pass (desktop, the states in `HOVER_STATES`): every visible control is hovered 650 ms; text that became visible is a tooltip; its plate is screenshotted at device scale without its rounded ends; plate = the commonest luminance, ink = 98th percentile away from it | 4.5:1 |
| `hover-plate` | the background a control shows on hover (only when it differs from its resting background), its radius and height; grouped by the nearest flex row holding at least two controls | one shape (round ends, or one corner radius) and one height (1 px) per row |
| `anchor-gap` | open floating surfaces: the module's (`data-anchored`, its anchor) or a menu found from an `aria-expanded` trigger; gap on the main axis, overlap on the cross axis | gap within `anchorGap` + 1.5 px, cross overlap > 0 |
| `anchor-joined` | a panel of a toolbar: DOM gap <= 1 px, else the middle rows of the gap must be glass (pixels darker than halfway from the panel's glass to white) | 80 % of the gap |
| `panel-attach` | across states of one configuration: how each panel of a toolbar attaches (joined / floats) per mode | one attachment |
| `motion-shape` | 12 frames of the open and 12 of the close (springs stepped 55 ms by hand through a test clock on `performance.now`; CSS transitions at 3 % speed through CDP; text hidden); the frame's shape box (the WebGL backend reports it: `window.__glass.shapeOf`; else the element's transformed box, minus a clip-path inset); mask = pixels darker than halfway from the settled glass to white inside that box (2 px margin; none for joined panels); IoU against the best rounded rectangle of the mask's bounding box | IoU >= 0.9 and mask covers >= 60 % of the box, judged on frames where the glass is >= 75 % opaque and >= 12 px in both directions |
| `motion-empty` | the same frames: glass opacity, the surface's size, the most visible text inside it | not (glass >= 90 %, size >= 25 % of settled, content < 15 %) |

Frames are written to `artifacts/audit/motion/<config>/`. Options:
`--no-hover`, `--no-motion`.

### Self-test (the owner's recording)

On the pre-fix code (`9b390d5` sources, final rules, d1440-zh and its CSS
twin): all six task-025 entries found: 11 `motion-shape` (project menu
closing over the pinned column, WebGL, frame 1: 57 % outline match, 29 % of
its box is glass), 12a `tip-contrast` ("新对话" 1.08:1), 12b `hover-plate`
(new conversation: corner radius 7, 40 px vs unpin: round ends, 32 px),
13 `anchor-gap` (key menu 282 px from its button), 14a `panel-attach` +
`anchor-joined` (plan levels panel floats 6 px), 14b `motion-empty`
(views, levels, project and key menus at full opacity with 0-3 % content).
On the final tree (d1440-zh, d1440-en, p390-zh and the CSS twins of the
first and last, touched states): none of the seven rules reports anything.

### False positives found and how the rules were tuned

- `hover-plate` missed the pinned header at first: the old tooltip wrapper
  is an `inline-flex` around the icon button alone, so it was taken as the
  row. A row must now hold at least two controls. A resting fill (send) is
  not a hover plate: only a background that appears or changes on hover counts.
- `tip-contrast` on toolbar tooltips over an open panel (2.2-2.9:1): true
  positives (the tooltip lay under the panel), fixed in `glass.css`.
- `anchor-joined` in 3D (WebGL) read the merged neck as 50 % glass: its
  rows carry rim light. It now samples the middle rows of the gap and calls
  a pixel glass when it is nearer the panel's glass than white. In one
  pre-fix run the 3D neck still measured 0 %: the neck detection on
  SwiftShader frames is not reliable; `panel-attach` still reported the
  plan / 3D difference.
- `motion-shape` flagged a joined panel's merged neck (mask now stops at
  the panel's own box), a 6 px sliver in the last close frames (frames
  under 12 px skipped) and frames where the glass is fading (judged only at
  >= 75 % opacity).
- `anchor-gap`: the recent strip (a region the history button shows, not a
  menu) is no longer taken as an anchored surface; the pre-fix project menu
  at 26 px from its trigger was a false positive of trigger-based anchors
  (the menu stood under the house name's block, which is its anchor now).

## Not done, not verified

- Walk map panel (`WalkHUD`): left as it was. Anchoring it under the house
  name would put it over the pinned conversation while walking (which then
  steps aside); that is a design decision for the lead.
- The CSS backend has no smooth union: a joined panel touches its toolbar
  with a small notch at the joint where the WebGL backend draws a fillet.
- A floating menu over the pinned conversation (key menu) is drawn on top
  with the tints combined, so it reads darker than the column.
- With the sign-in or key sheet opened from inside the pinned column, the
  dialog now stands above the column's input and the column steps aside
  (before: centred over the drawing).
- No real GPU: WebGL was checked under SwiftShader only, plus the CSS
  backend. The recording's defect 1 reproduced under SwiftShader.
- `pinned-text` / `pinned-long-text` contrast findings (1.1-1.5:1 on the
  empty-state text) exist on the pre-fix tree too; not investigated here.
