# Task 015 - Studio layout chosen by the owner

The owner chose this layout from interactive mockups. The prototype is the
design reference: copy it into the repo first (see "Reference") and keep
the implementation faithful to it. Where the prototype and this text
disagree, this text wins; where both are silent, follow the prototype's
look.

## Principles
- The house is never covered or squeezed by controls, except by the
  translucent history strip, which the user opens on purpose.
- The conversation is one input at the bottom centre. Tools are one
  toolbar. Panels appear only when a tool needs them.
- No backdrop-filter anywhere. Translucency is plain alpha (80% white).

## Desktop
1. Toolbar, top-right: four icon buttons, 视角 / 楼层 / 日照 / 走进去.
   Default: icons only. On hover, on keyboard focus, and when a tool is
   active, the button expands horizontally to show its label beside the
   icon. The group is anchored at its right edge and grows to the left
   with a short width transition (~0.18 s); only one hovered label at a
   time. Active means: its panel is open, the sun is on (label shows the
   time), a level cut is set (label shows the level), or walking
   (label "走进去 ×", which exits; Escape also exits).
2. Operation panel: a floating card (~300 px wide) hanging under the
   toolbar, height fitted to its content. The canvas size and the input do
   not move; the house re-frames into the free area (framing insets).
   Only one panel at a time; Escape, clicking the active tool, or clicking
   the drawing closes it. Contents: 视角 (nine presets + reset), 楼层
   (全部 + levels), 日照 (play, time slider, time, sun angle, date
   choices, and a "位置与朝向" section with the location and orientation
   controls; solar noon; explicit off). Closing the sun panel keeps the
   sun on. 走进去 has no panel.
3. Conversation: an input at the bottom centre, nothing else by default.
   - Working: a soft light travels around the input's border (gradient in
     our palette: white, ginkgo yellow, warm white, a touch of maple red)
     with a gentle breathing shadow, and the placeholder is replaced by a
     status phrase that follows the real phase ("正在思考…", "正在修改房
     子…", "正在回复…"). Only transform/opacity on small layers animate;
     honours reduced-motion (then: static highlight + phrase).
   - A history button on the input opens the "recent" strip directly above
     it: the last exchange and its changes card with undo, 80% white, no
     blur, at most ~35% of the viewport height, with a "查看全部 · 固定到
     左侧" link. It closes with the same button, Escape, or a click on the
     drawing.
   - Pinned: a 360 px column on the left holding the full history and the
     input; the canvas resizes and the house re-centres. Unpin returns to
     the single input. The pin choice persists in the browser.
4. Top-left: house name with its menu (language, reset to template, other
   templates, location and orientation, key settings, about). Top centre:
   3D / 平面 / 图册. Plans and sheets keep the same toolbar rules where a
   tool applies (楼层 in plan mode); tools that do not apply are hidden.

## Phone
1. Bottom of the screen, from the bottom up: toolbar, input, house. The
   toolbar shows icon + label for all four tools when the row has room
   (it does at 390, 360 and 320 px); below ~300 px it falls back to icons
   with a label only on the active tool.
2. Operating a tool opens a bottom sheet that slides up from the bottom
   edge. The toolbar rides up with it, attached to the sheet's top edge,
   outside the sheet, so tools can be switched while it is open: tapping
   another tool swaps the content, tapping the active tool or dragging
   the sheet down closes it. Sheet height fits its content, capped at
   ~45% of the screen. While a sheet is open the input is HIDDEN and
   returns when the sheet closes (owner's decision). The house re-frames
   into the space above, following the sheet's height as it animates.
3. History: the same translucent recent strip above the input. Pinned on
   phone: a half-height bottom sheet with the full history and the input
   inside it; the toolbar rides above it; opening a tool swaps the sheet
   to that tool and closing it brings the conversation back.
4. Top row: house name (menu) and 3D / 平面 / 图册 on one row; at 320 px
   tighten the mode buttons and drop the secondary facts so it still fits.
5. Walking: the toolbar shows "走进去 ×"; the walk HUD (joystick,
   mini-map) is arranged so nothing overlaps; landscape keeps working.

## Also
- First-visit hints: keep the three hint chips, placed just above the
  input, and dismiss them after the first meaningful interaction of any
  kind. They must not sit on top of a control with the same name.
- Remove the previous layout's pieces that this replaces (bottom-centre
  button row, strips, the old conversation panel behaviour).
- Keep everything else working: URL state, autosave incl. undo history,
  templates, location/orientation, sheets, walk, the chat e2e, framing
  insets at all viewports, keyboard access and labels, focus management
  for panels and sheets, 44 px touch targets on phone.
- Update the visible-control check to the new default state (desktop and
  phone) and state the new limits in the test.

## Reference
Copy the prototype (one HTML file and its images) from
`/tmp/claude-0/-home-user-openSU/f1de07ab-a8ee-5b54-b716-9130516e7d12/scratchpad/mockups/round2/prototype/`
into `docs/design/studio-layout-prototype/` and commit it (it is our own
work and shows our own T1 house). The state images the owner approved are
in `/home/user/openSU/artifacts/mockups/round3/` (boards and `states/`);
do not commit those.

## Acceptance
- Clean checkout: install, build, typecheck, test, all shots scripts and
  the chat e2e pass; size budgets hold; Worker unchanged in kind; golden
  render shots unchanged within noise.
- For every state in the approved boards (desktop: idle, hover, working,
  recent strip, pinned, sun, view, level, walk; phone 390: idle, working,
  recent strip, pinned, level, view, sun with input hidden, walk; plus 360
  and 320 idle and sun), a screenshot of the real app next to the
  approved mockup state, at 1440x900 / 390x844 (and 360, 320, 1024x700,
  820x1180, 844x390 for the default and sun states). Differences are
  listed and justified.
- Measured in the real app: house width and free-canvas share per state,
  compared with the mockup's numbers.
- Playwright checks: hover/focus expands a label and the group's right
  edge does not move; panel open does not move the input or resize the
  canvas; phone sheet opens, toolbar rides on it, tool switching swaps
  content, drag-down closes, input hidden while open and back afterwards;
  pin persists across reload; working phrase follows the phases; reduced
  motion disables the travelling light; nothing overlaps the house except
  the recent strip.
- No backdrop-filter in the built CSS.
