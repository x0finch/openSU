# @opensu/kernel

Model -> geometry. `buildHouse(resolved)` turns a `ResolvedHouse` from
`@opensu/model` into plain data for the renderer. Pure TypeScript: no
three.js, no DOM. Deterministic: the same model gives byte-identical output.

## Run

```sh
pnpm --filter @opensu/kernel test        # unit tests
pnpm shots                               # golden sample through the renderer
```

## Output (`src/types.ts`)

`HouseGeometry { parts, site, levels, floorLines, entourage, bounds, stats }`,
metres, model axes (X east, Y north, Z up; the renderer converts once).

- `Part { id, level?, role, material, positions, indices, edges,
  edgeNormals, castsEdges }`. Ids derive from model ids (`L2:wall`,
  `roof-n:tile`, `canopy:canopy-entry`, `site:fence`). `material` is a
  semantic slot (`wall`, `roofTile`, `fascia`, `wood`, `deck`, `frame`,
  `glass`, `glassBacking`, `balustrade`, `slab`, `metal`, `paving`,
  `gravel`, `soil`, `floor`, `cut`); the render package maps slots to style
  tokens. Parts of the house carry their `level`; site parts have none.
- `site { latitude, longitude, northDeg, utcOffsetHours }` for the sun
  study (`utcOffsetHours` defaults to 8).
- `levels [{ id, elevation, top, cutZ }]`, bottom to top; `cutZ` is the
  level's cutaway section plane (elevation + 1250 mm).
- `edges` are the feature lines to draw; `edgeNormals` carry the two face
  normals per segment so the renderer can widen outer profiles.
- `floorLines` mark each floor level on exterior walls.
- `entourage` placements `{ kind, position, rotation, scale, seed }`.

## How it works

- **Column CSG** (`massing.ts`). Walls, slabs, balcony slabs and kerbs,
  decks, rails, canopies and posts, flat roofs, steps, fences, the pier and
  ground surfaces are boxes in plan with a flat bottom and a planar top
  (sloped under pitched roofs). The plan is split at every boundary; each
  column holds disjoint z segments owned by the highest-priority solid;
  voids (openings, gates, fence holes) cut solids by tag. Faces are emitted
  between columns and at segment ends and merged into rectangles. Corners
  mitre themselves, nothing overlaps coplanar, no internal faces.
- **Walls** fill their storey with real thickness (exterior 240, interior
  120). Walls of the level a pitched roof sits on rise to its underside,
  with infill along the roof outline (gable / clerestory walls).
- **Roofs** (`roof.ts`). Mono, gable and hip roofs are slabs of constant
  vertical depth: fascia boards below, a tiled top, a soffit underneath.
  The underside at the eave wall line is the level top plus `eaveOffset`.
  Eaves overhang by `overhang`, verges by 300 (when the roof has
  overhangs); an edge against a higher roof or a taller storey is clipped
  to the wall face. Skylights sit on the tiles. Flat roofs and canopies are
  massing slabs; canopy edges along an exterior wall stop at its face,
  free-standing canopies get slim posts.
- **Openings** (`openings.ts`) cut the wall through its thickness. Exterior
  units get a 50 mm frame per glazing cell, glass over a flat dark backing,
  mullions above 1300 mm, timber bands where a tall unit crosses a floor
  (`insert` + `spanLevels`), a timber panel at the start of single-level
  units with an insert, a timber side panel (`panel`, a quarter of the
  width), and a timber leaf for a door onto a porch. Two windows of one
  space that run to a shared corner become a corner window: the void runs
  through the corner pier and the frames meet. A door `canopy` is a thin
  slab 300 wider each side, `above` (150) over the head.
- **Balconies / terraces**: dark slab projecting 180 mm past the edge line,
  kerb, decking, and the edge treatment (glass balustrade with top rail,
  metal bars, parapet).
- **Floor finishes**: every storey's interior floor is a `floor` part (the
  slab's top face; on the ground floor a finish slab below grade whose top
  is the floor, without edges of its own). Wall tops in a doorway at an
  upper floor are floor finish too. Nothing below grade is emitted.
- **Cutaway caps**: after the massing is emitted, each level gets a `cut`
  part (role `cut`): horizontal section caps at `cutZ` wherever a house
  solid other than a stair passes through the plane, with their own
  outlines. The renderer shows them only in a cutaway of that level.
- **Stairs** (`stairs.ts`): straight / U / L flights inferred from the
  stairwell (slab opening above) and the storey height, risers near 170 mm.
- **Site** (`site.ts`): plot fence with coping (skipped where the house
  stands on the boundary), gates (sliding bars or timber slats), a group of
  small openings on the longest stretch of each side except the one
  opposite the main gate, an entrance pier with a number plate, and ground
  finishes from `surface` (default paving for courtyards / porch / carport,
  gravel for gardens; a deck is a 120 mm timber platform; lawn reads as
  gravel since the style has no lawn colour).
- **Feature edges** (`edges.ts`): every polygon outline segment goes on its
  supporting line; coplanar continuations of the same material cancel;
  what remains (free edges, folds over 25 degrees, material changes) is
  drawn. Wall faces continuing across a floor level give the floor lines.
- **Entourage** (`entourage.ts`), seeded from the house: a large ginkgo in
  the most open courtyard / garden, at its sunny-side corner away from the
  fence; a green maple in a garden beside the porch; bamboo along fences in strips up to
  2 m deep (not on the sunny side, clear of gates, pier and doors), grass on
  the sunny side, a red maple in front of large glazing; a planter with a
  small tree and a runner on the largest terrace; a person at the main
  entrance, in the open; a car in each carport. People are placed where no
  tree crown is around or in front of them in the fixed presentation views.
  Plants carry a clip box: the renderer drops low foliage outside the fence
  (or terrace rails), so no stray leaves show on fence faces. Explicit model `entourage` replaces the
  rules.

Construction defaults (frame sizes, slab and roof depths, fence sizes) are
in `src/constants.ts`.
