# @opensu/sheet

Shareable sheets: one portrait PNG per level (house name and facts, a hero
3D view, a hairline divider, the coloured floor plan) plus a sheet with two
stacked 3D views. Composed entirely in the browser.

```ts
import { renderSheet, renderSheetSet } from '@opensu/sheet';
const blobs = await renderSheetSet(house, { title: '自建房' });          // L1, L2, L3, views
const one = await renderSheet(house, { kind: 'level', levelId: 'L1', view: 'axo-se' });
const two = await renderSheet(house, { kind: 'views', views: ['axo-sw', 'elev-south'] });
```

`house` is a `House` or a `ResolvedHouse`. Options: `title` (default the
house name), `facts` (worded like the studio: "宅基地：12 × 14 m" width x depth,
"建筑面积：159.5 m²", style label; default on for `renderSheet`, first
sheet only in a set), `scale` (1 = 1500 x 2000 px,
2 = 3000 x 4000 px). Views are ids of `SHEET_VIEWS` or any `ViewPreset`.

## Run

```sh
pnpm --filter @opensu/sheet test
pnpm --filter @opensu/sheet typecheck
pnpm --filter @opensu/sheet dev      # demo: live viewer + export buttons
pnpm --filter @opensu/sheet shots    # artifacts/sheets/<n>-<level>.png, <n>-views.png; --2x adds @2x
node scripts/shots.mjs --sheet '{"kind":"level","levelId":"L2","view":"axo-sw"}'   # one ad-hoc sheet
```

The shots script drives the demo in headless Chromium (SwiftShader WebGL),
prints timings and file sizes, and checks that the on-screen viewer of the
demo is still alive after the offscreen exports.

The level sheets cycle through `LEVEL_HERO_VIEWS` (south-east axonometric,
south-west eye level, north-east axonometric); `levelHeroViews(house)`
turns the eye-level hero to the south-east when a tree of the site planting
would hide the facade's centre from the south-west (`treeHidesFacade`).

## How a sheet is composed

- `src/tokens.ts` holds every size and position (1x page px); colours and
  font stacks come from the plan tokens.
- Hero view: rendered once small (a probe) to find its ink (any non-white
  pixel, shadows and trees included). `placeDrawing` then picks the largest
  scale at which the ink fits its area, centred on the page when it can,
  pushed right just enough to keep out of the header otherwise. The header
  is a staircase of one block per text line, so a drawing may pass under a
  short fact line. The final render is that exact window of the probe's
  frame at sheet resolution (`OffscreenView` in `@opensu/render`), so lines
  stay crisp at any size.
- Plan: `@opensu/plan` SVG (with its own title, dimensions and north
  arrow) at `layout.planTextScale` (1.7: plan title ~40 px on the 1500 px
  page, like the reference sheets), rasterised at device resolution and
  cropped to its ink. All plans of a set share one drawing scale, chosen so the
  widest level spans 78% of the page width where the page allows: the
  divider of the level sheets moves up from 46% to as high as 37% of the
  page for it; deep plots stay height-limited. Smaller levels keep the
  scale (they are not shrunk further).
- Elevation views get a thin ground line along their base, running a
  little past the drawing.
- Images are multiplied onto the white page, text is drawn last on top, at
  device resolution.
- One offscreen WebGL context per call (shared across a set), released at
  the end.
