# Task 004 - SVG floor plans (`packages/plan`)

## Goal
Render presentation-quality coloured floor plans as SVG from a
`ResolvedHouse`, matching the plan half of the reference sheets
(`.reference/ref-1.jpg` ground floor, `ref-2.jpg` level 2, `ref-3.jpg`
attic). `.reference/ref-6.jpg` is the kind of plan we must never produce
(overlapping text, uniform line weights, no fills).

Read `docs/VISUAL_SPEC.md` ("Floor plans" and "What ugly means").

## Deliverables
`packages/plan` (`@opensu/plan`), pure TypeScript producing an SVG string
(no DOM required; must run in Node and the browser):

- `renderPlan(resolved, levelId, options) -> string`
- Plan tokens in `src/tokens.ts` (colours, stroke widths, font sizes). No
  literals elsewhere. Reuse the palette intent from the visual spec.
- Layers, bottom to top: page, outdoor ground fills (paving, deck, lawn),
  room floor fills, furniture, walls (poche fill + outline, clean joins,
  cut at openings), windows, doors with swing arcs, stairs (treads, arrow,
  "上/下", break line), railings / balustrades, labels, dimensions, north
  arrow, title.
- Furniture: `src/furnish/` - deterministic rule-based placement by space
  type and size, drawn as simple refined symbols (white fill, thin grey
  lines, soft shadow): beds with pillows and bedside tables, wardrobes,
  sofa set + coffee table, round and rectangular dining tables with chairs,
  kitchen counters with sink and hob, toilet, basin, shower, desk + chair,
  outdoor table set, planters/trees as plan symbols, car outline. Furniture
  never overlaps walls, door swings or other furniture, and keeps clear
  passages. Keep this module independent of SVG drawing (it returns
  placements) because the 3D interior will reuse it later.
- Labels: Chinese name + small uppercase English, centred on the largest
  free rectangle of the room, with collision avoidance against furniture,
  walls and other text (furniture yields or the label moves; tiny rooms get
  a smaller font or name only).
- Dimension chains on all four sides, two tiers (segments from the grid
  lines that bound walls on that side, then overall), oblique ticks, mm
  numbers, no overlapping numbers (narrow segments stagger or shrink).
- North arrow from `site.northDeg`, title centred below ("一层平面图" etc.).
- Fonts: use a font stack that degrades gracefully; rasterised checks must
  use a CJK-capable font available in the environment (document which).
- `pnpm --filter @opensu/plan shots` writes `artifacts/plans/<level>.svg`
  and `.png` (about 1600 px wide) for the golden sample.

Do not modify `packages/model` (another agent is changing it in parallel:
door `swing` may appear as an optional field; infer swings when absent).
Do not touch `packages/render`.

## Acceptance criteria
- `pnpm typecheck`, `pnpm test`, and the shots script pass.
- Side by side with the references, each level reads as the same family of
  drawing: grey poche walls with dark outline, warm light floor fill, soft
  outdoor tints, white furniture, clear hierarchy of line weights.
- Zero overlaps: text/text, text/wall, furniture/wall, furniture/door swing.
  Add an automated check for label and dimension-text bounding-box overlaps
  and a test that runs it on all golden levels.
- Every room has a readable label; every door has a swing arc; every window
  is drawn in its wall; stairs show direction.
- Dimension numbers equal the model's grid distances.
- SVG per level under 400 KB; no embedded raster images.

## Process
Iterate: render PNG, open it next to the reference, fix, repeat - at least 5
rounds. Commit locally, staging only your own files (do not push). Report:
what matches, what does not, the overlap-check result, and where furniture
rules needed special cases.
