# @opensu/furnish

Rule-based furniture placement, shared by the floor plans (`@opensu/plan`)
and the 3D interior (`@opensu/kernel`). Pure TypeScript, deterministic,
millimetres, model axes (X east, Y north). No DOM, no three.js.

```ts
import { golden, resolve } from '@opensu/model';
import { furnishHouseLevel } from '@opensu/furnish';
const pieces = furnishHouseLevel(resolve(golden), 'L1');
// [{ id, space, kind, x, y, rotation, w, d, h, layer, variant? }, ...]
```

## Run

```sh
pnpm --filter @opensu/furnish test
pnpm --filter @opensu/furnish typecheck
```

## API

- `analyseLevel(house, index) -> LevelPlan` - spaces (main and clear
  rectangles, open neighbours), openings with door swings and keep-clear
  zones, stairs, plot and gates. The plan draws from the same analysis.
- `furnishLevel(plan) -> Placement[]` - the plan placements (`kind`, centre,
  `w`, `d`, `facing`, `layer`, `priority`, `variant`).
- `furnishHouseLevel(house, levelId) -> FurniturePiece[]` - the same
  placements for 3D: `rotation` (radians about Z, counter-clockwise; local X
  along the width, the front faces local -Y, so 0 = facing south) and the
  height `h` from `FURNITURE_HEIGHT`. Kinds the 3D scene shows otherwise
  (trees, shrubs and the car are entourage, parking bays are paving) are
  left out.
- Geometry helpers (`Rect`, `overlaps`, `intersection`, `rectUnionRings`, ...)
  and `planDims` (fence and rail sizes the plan draws with).

## Rules

Per space type and size; pieces are tried against walls in a fixed order and
the first collision-free spot wins. They keep out of door swings and the
approach zone of each door, sliding-door and floor-window fronts, stairs and
stairwells, a walking path along open boundaries to halls and stairs, gate
swings, and each other's clearances (kitchen runs share one aisle). The plan
may drop low-priority pieces (rugs, side tables, nightstands) where a room
label needs the space; the 3D interior keeps every piece.
