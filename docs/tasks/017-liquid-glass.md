# Task 017 - Liquid glass chrome and an Apple-style layout

The owner chose Liquid Glass as the material for all studio chrome and
asked for two things: the glass is built once, as components, and never
re-implemented per screen; and the whole studio follows Apple's layout
conventions (iOS 26 / iPadOS 26 / macOS 26).

Read first, in this order:
1. `docs/UI_STYLE.md` - the rules and every number. It wins over this
   file on looks; this file wins on scope and structure.
2. `docs/prototypes/liquid-glass.html` - the prototype the owner approved
   (its `__IMG__` placeholder was a render of a template house; any image
   works for local testing). Its fragment shader is the reference for the
   look: refraction, dispersion, tint, rim light, shadow, smooth-union
   merge and the capsule-to-panel spring.
3. glasswork (MIT), a local clone for reading:
   `/tmp/claude-0/-home-user-openSU/f1de07ab-a8ee-5b54-b716-9130516e7d12/scratchpad/glasswork/src/`
   - `glass.css` (material, rim light), `lens.js` (rim curve),
   `refract.js` (the WebGL backdrop; closest to what we build). Its
   `media/` wallpapers are NOT MIT (see its NOTICE); never copy them.
4. `docs/tasks/015-studio-layout.md` - the current layout and the
   owner's earlier decisions. Keep every behaviour from 015 that this
   task does not change (the phone order of toolbar and input, input
   hidden while a phone sheet is open, the recent strip, pinning, the
   working glow and phrases, walk mode, first-visit hints).

The project rules in `CLAUDE.md` apply (English everywhere, commit
locally and do not push, no `.reference/` or `artifacts/` in git, verify
by screenshots, report honestly).

## 1. One glass module

All glass lives in one module, `apps/web/src/glass/`, plus one rendering
pass in `packages/render`. No other file sets a chrome surface's
background, border, shadow, blur or backdrop-filter. Add a test that
fails if a file under `apps/web/src/studio/` does (search for
`backdrop-filter`, `backdrop-blur`, `shadow-`, `bg-white`, `bg-[` and the
old surface tokens; keep an explicit allow-list if something legitimate
remains, e.g. the white paper sheets in the gallery).

Pieces (names are suggestions, the split is not):
- `material.ts`: the numbers from `UI_STYLE.md` (light and dark), the
  only place they exist. They feed both the shader uniforms and the CSS
  custom properties of the CSS backend.
- A registry/provider: each glass surface registers its element and its
  shape (radius, role `control` or `text`, morph group). It measures
  rects (ResizeObserver, plus every frame while something animates) and
  hands the list to the active backend.
- `<Glass>`: the base component. Everything else is built on it.
- Primitives on top of `<Glass>`, used by the whole studio:
  button group (one capsule holding several icon buttons), standalone
  circular button, segmented control (the selected segment is a slightly
  denser lens that slides), panel/popover that flows out of the button
  that opened it, phone sheet, input bar, menu, toast. A screen composes
  these; it does not style glass itself.
- A spring utility shared by every morph (critically damped, stiffness
  about 170, as in the prototype), with `prefers-reduced-motion` falling
  back to a fade.
- `prefers-reduced-transparency`: an opaque surface in the tint colour.

Two backends behind the same components:
- WebGL (over the 3D view, including walk mode): in `packages/render`,
  render the scene into a multisampled render target only when the scene
  changes, then a full-screen composite pass draws the scene and the
  glass shapes to the screen, as the prototype's shader does. A glass
  change (a panel opening, a capsule growing) re-runs only the composite
  pass, not the scene. Expose a small API on the viewer (for example
  `setGlass(shapes, material)`); the web app's registry calls it. No
  second WebGL context and no canvas-to-texture copies.
- CSS (over the plan view, the sheet gallery and the landing page if you
  touch it): glasswork's CSS material (tint, `blur(2px) saturate()
  brightness()`, its box-shadow rim light and bevel). No refraction.
  `backdrop-filter` is allowed only here, never over the WebGL canvas.
- If WebGL2 is unavailable, the CSS backend is used everywhere.

If you port code from glasswork (not just numbers), add
`THIRD_PARTY_NOTICES.md` at the repo root with its MIT notice and say
which files it covers.

## 2. Apple layout

Follow Apple's 26-generation conventions: controls float on the content
in glass, grouped by function; the content runs edge to edge under them;
icons over words in toolbars (labels appear where Apple shows them: tab
bars, the active tool's value); popovers and sheets grow out of the
control that opened them.

Desktop and tablet (landscape):
- Top leading: the house name and area as plain ink on the drawing (like
  a navigation title), with a chevron; it opens the project menu as a
  glass menu that flows out of it.
- Top centre: 3D / 平面 / 图册 as a glass segmented control.
- Top trailing: one glass button group for 视角, 楼层, 日照 (icon-only,
  tooltip on hover; an active tool shows its value next to its icon, e.g.
  the sun time), and 走进去 as its own capsule beside the group (a
  distinct action, Apple separates those). Walking turns it into "走进去
  ×".
- Panels open as glass popovers that flow out of their button (the
  prototype's morph), hanging under the toolbar. One at a time; Escape,
  the button again, or a click on the drawing closes them.
- Bottom centre: the input as a glass capsule like Apple's compose field:
  history button at the leading end, field, yellow send button at the
  trailing end. The working glow stays on its edge.
- The latest exchange appears above the input as a text surface (role
  `text`, higher tint). Pinned history is a floating, inset glass
  sidebar on the left (like macOS 26 sidebars), not an edge-to-edge
  column.
- The house re-frames into the free area exactly as today.

Phone (portrait):
- Keep the owner's order from 015, styled as iOS 26: at the bottom, the
  tools as a tab-bar-style glass capsule (icon over label, selected tool
  as a lens), and the input capsule directly above it, like the Music
  app's mini player above its tab bar.
- A tool opens an inset glass sheet (rounded about 34, a small gap from
  the screen edges) that grows from the bottom; the tool bar rides on top
  of it; the input hides while it is open and comes back when it closes;
  drag down or tap the active tool to close.
- Top row: name (leading, plain ink) and the segmented control.
- Landscape and walk mode keep working; the walk HUD uses the same
  primitives.

## 3. Out of scope

- Adaptive tint density and automatic dark glass by background
  brightness, and ink blending (open questions in `UI_STYLE.md`).
- The landing page beyond keeping it working.
- Any change to the drawing style, the model, the AI or the server.

## 4. Checkpoint, then finish

Phase A, then STOP and report with screenshots:
- The glass module, both backends, the viewer composite pass.
- Desktop 3D view: name, segmented control, tool group, 走进去 capsule,
  the sun popover morphing out of its button (one screenshot mid-morph),
  the input, the latest-exchange surface.
- Screenshots at 1440x900 and 390x844 (phone may still be partial).
The lead shows these to the owner before Phase B.

Phase B (after the lead says go):
- Phone layout and sheets, plan view and gallery on the CSS backend,
  menus, toasts, pinned sidebar, walk HUD, landscape.
- Remove the old surfaces and tokens this replaces (`--color-surface`,
  `--shadow-float`, the opaque-white rule in `styles.css`) and any dead
  components.
- Update existing e2e tests and screenshots scripts to the new
  structure; all tests pass.

## 5. Checks

- Every chrome surface is a glass primitive; the static test above
  passes.
- No frame does a scene render just because glass moved (count scene
  renders in a test or a debug counter while a panel animates).
- Text contrast on text surfaces is at least 4.5:1 over the line
  drawing; check with sampled pixels in a screenshot test.
- Keyboard focus is visible on every glass control; targets are at
  least 44 px on phone.
- Screenshots (deviceScaleFactor 1 for your own checks): desktop idle,
  sun popover open, mid-morph, chat with one exchange, plan view, gallery,
  walk; phone 390x844 and 360x780 idle, sheet open, walk; light and dark
  glass. Put them under `artifacts/` (not committed) and list the paths.
- Report what is missing, what looks different from the prototype, and
  frame times you measured (software GL numbers are only relative).
