# @opensu/plan

Presentation floor plans as SVG strings, from a `ResolvedHouse`
(`@opensu/model`). Pure TypeScript, no DOM: runs in Node and the browser.

```ts
import { golden, resolve } from '@opensu/model';
import { renderPlan } from '@opensu/plan';
const svg = renderPlan(resolve(golden), 'L1');            // 一层平面图
```

## Run

```sh
pnpm --filter @opensu/plan typecheck
pnpm --filter @opensu/plan test      # includes the overlap check on all golden levels
pnpm --filter @opensu/plan shots     # artifacts/plans/<level>.svg + .png (~1600 px); --hires adds @2x PNGs
```

## API

- `renderPlan(house, levelId, options?) -> string`; `renderPlanDetailed` also
  returns the text boxes, drawn furniture, door swings and wall rectangles.
  Options: `scale` (px per mm), `furniture`, `title`, `subtitle`,
  `textScale` (text relative to the screen plan; labels, dimension figures
  and tiers, title and north arrow grow together, the white space around
  the drawing at half the rate; `@opensu/sheet` uses 1.7). The overlap
  rules hold at any text scale: labels fall back to smaller forms (the
  English line goes first), furniture yields, and only then do the screen
  plan's own sizes serve as a last resort.
- `checkPlan(report)` - overlap check: text/text, text/wall,
  text/furniture, text/door swing, furniture/wall, furniture/door swing,
  furniture/furniture. Empty means clean.
- `furnishLevel(analyseLevel(house, index))` - furniture placements as plain
  data (`Placement`: kind, centre, width, depth, facing, layer), re-exported
  from `@opensu/furnish`, which holds the level analysis and the placement
  rules so the 3D interior uses the very same furniture.
- `chainPositions(plan, side)` - the grid positions a dimension chain uses.
- `tokens` - all colours, stroke widths, font sizes and spacing
  (`src/tokens.ts`; no literals elsewhere).

## How it draws

Layers, bottom to top: page, plot ground, canopies of the level below,
outdoor fills (paving, lawn pattern, deck pattern), room floors, rugs and
parking bays, planting, furniture (one soft drop shadow per layer), stairs,
rails, wall poche (union of wall rectangles minus opening gaps, so joins are
clean by construction), windows and sliding doors, the heavy outer line
(building mass and plot fence, interrupted at openings), gates, doors with
swing arcs, labels, dimensions, north arrow, title.

- Door swings come from the model (`ResolvedOpening.swing`, authored or
  inferred by `resolve`); the plan infers one itself only for older models.
- Labels: Chinese name over tracked uppercase English, placed at the spot
  with the most clearance from furniture, door swings, stairs, walls and
  other text, preferring the room centre. Fallbacks: smaller size, then name
  only, then the lowest-priority furniture of that room yields (rugs, side
  tables, nightstands, ...). Stairs are labelled by their 上 / 下 arrows;
  narrow planters are not labelled.
- Dimension chains: tier 1 uses the grid lines of wall (or rail) runs whose
  outer end is visible from that side (a ray towards the side meets no other
  wall run); tier 2 is the overall. The ground floor adds the plot edges, and
  carport boundaries are dimensioned like walls (parking bay size).
- Furniture rules (`@opensu/furnish`) are per space type and size; pieces are
  tried against walls in a fixed order and the first collision-free spot
  wins. They keep out of door swings and the approach zone of each door,
  sliding-door and floor-window fronts, stairs and stairwells, a walking
  path along open boundaries to halls and stairs, gate swings, and each
  other's clearances (kitchen runs share one aisle).

## Fonts

The SVG names font stacks and embeds no fonts:
CJK `PingFang SC, Hiragino Sans GB, Noto Sans CJK SC, Source Han Sans SC,
Microsoft YaHei, WenQuanYi Zen Hei, sans-serif`; Latin `Inter, Helvetica
Neue, Helvetica, Arial, Liberation Sans, sans-serif`. Text boxes for the
overlap check use per-glyph widths that are the maximum over Inter,
Liberation Sans, DejaVu Sans and WenQuanYi Zen Hei, so they are not smaller
than what a browser draws. The reference PNGs in this repository's dev
container are rasterised with WenQuanYi Zen Hei (CJK) and Inter (Latin),
both installed system fonts.
