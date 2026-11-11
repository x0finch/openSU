# Task 007 - Shareable sheet export (`packages/sheet`)

## Goal
One call turns a house into the image people share: a portrait sheet with a
3D view on top and a coloured floor plan below, composed like the reference
sheets (`.reference/ref-1.jpg` .. `ref-3.jpg`: title and facts top-left,
hero view, hairline divider, plan, plan title). Produced entirely in the
browser (no server work).

## Deliverables
`packages/sheet` (`@opensu/sheet`):
- `renderSheet(house, options) -> Promise<Blob>` (PNG), options:
  `{ kind: 'level', levelId, view }` (hero view + that level's plan) or
  `{ kind: 'views', views: [a, b] }` (two 3D views stacked, like `ref-4`).
- `renderSheetSet(house) -> Promise<Blob[]>`: one sheet per level, each
  with a different hero view (NE, SW eye-level, SE axonometric ...), plus
  one views sheet.
- Format: 3:4 portrait, 1500 x 2000 px by default (option for 2x). White
  page, generous margins.
- Content: header with the house name (large), then fact lines derived from
  the model: plot size ("宅基地：12x15M"), total interior area ("总面积：
  243㎡", rounded), style label ("现代坡顶" from the style preset). Hero
  view rendered offscreen with `@opensu/render` in presentation lighting at
  sheet resolution, framed with white margin. Hairline divider. Plan from
  `@opensu/plan` (it already contains its own title and dimensions). Small
  discreet footer mark "openSU" bottom-right.
- Typography and spacing tokens in one file; reuse the plan/visual palette.
  Text must be crisp (draw at device resolution), CJK-capable font stack.
- Offscreen rendering must not disturb an on-screen viewer and must release
  its WebGL context afterwards.
- A demo page and `pnpm --filter @opensu/sheet shots` writing
  `artifacts/sheets/*.png` for the golden sample (all sheets of the set).

If `@opensu/render` needs a small API to render a view to a canvas at a
given size, add it there with minimal change and list it in the report. Do
not change style or plan tokens.

## Acceptance criteria
- Build, typecheck, tests, shots pass from a clean checkout.
- Each sheet, viewed next to the matching reference sheet, reads as the
  same kind of artefact: balanced composition, the hero view and the plan
  each use their area well (no tiny drawing in a sea of white, nothing
  cropped), aligned left edges, consistent margins.
- No overlap between header text and the hero view; plan fully visible.
- PNG size under 1.5 MB at 1500 x 2000.
- Time to produce one sheet is reported (software GL lower bound).

## Process
Iterate on the PNGs against the references, at least 5 rounds. Report what
matches, what does not, timings, and any API you added to other packages.
