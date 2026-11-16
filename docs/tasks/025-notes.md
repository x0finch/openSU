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
| 7 | Walk map panel | `studio/WalkHUD.tsx` `WalkHUD` | `absolute top-[84px]`, `left: sidebar + 24` (the title block's geometry repeated) | anchor: the title block; `below-start`, float; open while walking |
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
