# Task 001 - Style spike

## Goal
Prove we can hit the look in `docs/VISUAL_SPEC.md` in the browser with
three.js / WebGL2, and lock the style layer. Nothing else matters in this
task: no model schema, no AI, no UI beyond a canvas.

Reference images are in `.reference/` (not committed, never commit them):
`ref-1.jpg` ground floor + NE axonometric, `ref-2.jpg` level 2 + eye-level
view, `ref-3.jpg` attic + SE axonometric, `ref-4.jpg` SW axonometric + south
elevation, `ref-5.jpg` elevation + perspective. `ref-6.jpg` is an example of
output we consider bad. Look at them before writing code.

## Deliverables
1. pnpm workspace at the repo root (TypeScript, strict), AGPL-3.0 `LICENSE`,
   `.gitignore` (must ignore `.reference/`, `artifacts/`, `node_modules`,
   build output).
2. `packages/render` - framework-free library on three.js:
   - `src/style/tokens.ts` - all colours, line widths, light and shadow
     values. Single source of truth.
   - style layer (permanent code): materials, feature-edge line generation,
     sun + shadow setup fitted to scene bounds, ground shadow catcher, camera
     presets (axonometric, eye-level two-point, elevation), entourage
     generators (ginkgo, maple, bamboo, silhouette person, simple car),
     render-on-demand loop, resize/DPR handling (cap DPR at 2).
   - `demo/` (throwaway code): a hard-coded scene approximating the reference
     house massing, described below, built from small helpers (box wall with
     openings, mono-pitch roof with overhang, slab, window, glass balustrade,
     fence wall with coping).
3. A Vite demo page with orbit controls and a view switcher.
4. `pnpm shots` - Playwright script that renders the fixed views to
   `artifacts/shots/*.png` at 1600x1200, DPR 1:
   - `axo-se.png`    parallel projection from the south-east, like the top
     of `ref-3.jpg`
   - `axo-ne.png`    parallel projection from the north-east, like the top
     of `ref-1.jpg`
   - `eye-sw.png`    eye-level perspective, like the top of `ref-2.jpg`
   - `elev-south.png` orthographic south elevation, like the bottom of
     `ref-4.jpg`
5. `packages/render/README.md` - short: how to run, how the style layer is
   organised.

## Demo scene (model mm; origin = SW corner of the plot; X east, Y north)
Approximate, use the reference images to fill in detail. Storey height 3300.
- Plot 15000 x 12000, perimeter fence wall ~1300 high, 200 thick, dark
  coping, a few small square openings, vehicle gate (dark vertical bars) and
  a timber slat gate. Taller pier (~3000) near the entrance.
- Block N: x 0..9100, y 6900..10500, three storeys.
- Block S: x 3100..9100, y 1800..6900, three storeys.
- Block E: x 9100..13800, y 1800..6900, two storeys; its roof is a terrace
  with timber decking and a 1100 glass balustrade.
- Ground-floor kitchen bump: x 5500..9100, y 10500..12000, one storey, with a
  level-2 balcony on top.
- Level-2 south balcony: x 9100..13800, y 300..1800, glass balustrade, thin
  dark canopy above it; a similar thin dark canopy over the ground-floor
  entrance.
- Roofs: two offset mono-pitch roofs, ~20 deg, 600 overhang, dark tile top,
  wood fascia and soffit. Block N's roof falls to the north with its high
  edge over the middle; Block S's roof falls to the south, its high edge
  lower than Block N's so a clerestory wall strip shows between them. A small
  three-pane skylight on the south roof.
- Openings: tall narrow floor-to-floor window strips with timber insert
  panels on the south face of Block S, a wide horizontal strip window on
  level 3, a corner window on Block N, large sliding glazing behind the
  balconies, a few small square windows. Dark thin frames.
- Entourage: one large ginkgo in the SW court, a red maple and bamboo clump
  along the south/east fence, a small tree on the roof terrace, one
  silhouette person on the terrace, a white car under a dark flat carport in
  the NE corner.

## Acceptance criteria
The lead judges the four screenshots against the references. Self-check:
- Reads as the same family of image as the references at a glance: white,
  crisp, calm, with saturated plant accents.
- Three distinct wall tones (sunlit / turned away / cast shadow); sunlit
  walls are true white; background is pure white.
- All feature edges drawn, constant width, no z-fighting, no missing or
  doubled lines, no lines across flat wall faces except floor lines.
- Shadows crisp, artifact-free, including dappled tree shadows on walls and
  ground.
- Glass is flat grey-translucent; frames thin and dark.
- Trees look deliberate and stylised, not like blobs or cones.
- Parallel projection for axonometrics; verticals vertical in the eye-level
  view.
- No helpers, no default-material grey, no aliasing at DPR 1.
- Whole scene < 150k triangles and < 150 draw calls (print both in the demo
  console and in the shots script output).
- `pnpm install && pnpm build && pnpm shots` work from a clean checkout;
  `pnpm typecheck` passes.
- No colour, width or light value outside `tokens.ts`.

## Process
Iterate: render, open the PNGs, compare with the references, fix, repeat.
Expect many rounds; the look is the deliverable. Commit locally when done
(do not push). In your final report list: what matches, what does not yet,
triangle and draw-call counts, and any spec value you had to change and why.
