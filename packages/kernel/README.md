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
- `furniture` built pieces `{ id, level, kind, min, max }` (their meshes are
  parts with role `furniture`, materials `furniture`, `furnitureWood`,
  `textile`, `fixture`, `furnitureDark`, plus `glass` for shower screens
  and mirrors; section caps in role `cut`).
- `walk` collision data for walk mode: `surfaces` (floor rectangles of every
  space minus stair holes, stair flights as linear ramps, landings),
  `blockers` (wall pieces minus doorways, windows closed, rails, the plot
  fence, furniture, cars; each with a height range), `start` (inside the
  main entrance, looking in) and `arrivals` (one per level, the top of its
  stair).
- `interiors` interior volumes (plan rect on wall centre lines, z range):
  the renderer drops foliage inside them.

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
- **Entourage** (`entourage.ts`): plants come from the shared site
  planting of `@opensu/furnish` (`plantSite`), so the floor plan shows the
  same trees, bamboo and grass; the kernel sets their height above the
  ground finish, deck or terrace planter (whose box it builds) and their
  clip boxes. It adds a person at the main entrance, in the open, a person
  on the largest terrace and a car in each carport. People are placed where
  no tree crown is around or in front of them in the fixed presentation
  views. Plants carry a clip box: the renderer drops low foliage outside
  the fence (or terrace rails), so no stray leaves show on fence faces.
  Explicit model `entourage` replaces the rules.

- **Furniture** (`furniture.ts`): the placements of `@opensu/furnish` (the
  plan's furniture) built from simple recipes per kind in a local frame
  (front at -y): beds with mattress, throw, pillows and headboard, sofas
  and armchairs with cushions, tables on legs, kitchen runs with worktop,
  sink and hob, sanitary ware, shelving with a few books, outdoor sets,
  loungers, pots (with a grass tuft), pendant lamps over dining tables.
  Footprints shrink by 5 mm so no face is coplanar with a wall; nothing is
  taller than a stair flight above it; pieces crossing the cut plane get
  section caps. Edges are extracted on their own, so the house's lines
  never change. Entourage people keep out of furniture; pots yield to the
  entourage's planters. `buildHouse(house, { furniture: false })` leaves
  the rooms empty.
- **Walk** (`walk.ts`): walls inside a stairwell only stop someone on the
  floor below (the flights pass over them); a thin rail separates the two
  flights of a U stair. Terrace and balcony slabs over rooms are those
  rooms' ceilings (white, not the slab colour).

Construction defaults (frame sizes, slab and roof depths, fence sizes) are
in `src/constants.ts`.
