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

- `plantSite(house) -> Plant[]` - the site planting (trees, bamboo, grass,
  a planter on the largest terrace), one placement for the whole house that
  the plan draws as symbols and the kernel builds as entourage (task 012,
  B4). `crownRadius`, `plantFootprint`. Plants appear in `furnishLevel` as
  placements of layer `plant` (`tree` with the species as variant,
  `bamboo`, `grass`, `planter`), priority 9 (labels never remove them).
- `isEntryHall(plan, id)` - a ground-floor hall with a front door.

## Planting rules

A large ginkgo in the most open courtyard or garden, at its sunny corner
away from the fence (ties: farther from the middle of the house, then the
east corner, so it frames the facade); a green maple in a garden beside the
porch (in a large garden at the end nearest the porch); bamboo along fences
in strips up to 2 m deep, kept off the house wall in narrow strips, except
on the sunny side, where grass keeps the facade free; a red maple in a
garden strip in front of large glazing; a small ginkgo in a planter on the
largest terrace (corner away from the door; ties: away from the middle of
the house). Explicit model `entourage` (tree / shrub / bamboo) replaces
the rules.

## Rules

Per space type and size; pieces are tried against walls in a fixed order and
the first collision-free spot wins. They keep out of door swings and the
approach zone of each door, sliding-door and floor-window fronts, stairs and
stairwells, a walking path along open boundaries to halls and stairs, gate
swings, and each other's clearances (kitchen runs share one aisle). The plan
may drop low-priority pieces (rugs, side tables, nightstands) where a room
label needs the space; the 3D interior keeps every piece. Furniture keeps
clear of plant trunks and planters. Living and family rooms without a TV
wall that fits get a free-standing sofa group (sofa, coffee table,
armchairs, rug) facing the glazing; entry halls get a shoe cabinet on a
wall beside the front door (never across its path) and a plant; other
halls at least 2.2 m wide a console.
