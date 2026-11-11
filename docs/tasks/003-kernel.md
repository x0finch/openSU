# Task 003 - Geometry kernel and golden sample in 3D

## Goal
Turn a `ResolvedHouse` (from `@opensu/model`) into geometry and show the
golden sample house through the accepted style layer, replacing the
hard-coded demo scene. After this task the four fixed screenshots come from
model data, not hand-placed boxes.

## Part A - schema changes (do these first, as one small commit)
Apply to `packages/model` (schema, resolver, validation, tests, README):
- Adopt `Gate { id, side, at, width, kind? }` and
  `Entourage { kind, at, rotationDeg? }` as defined by Task 002.
- Doors: optional `swing?: { into: spaceId; hinge: 'start' | 'end' }`. When
  absent the engine infers it (swing into the room, hinge on the side nearer
  a wall corner). The AI should rarely need to set it.
- Canopies: `Roof.kind` gains `'canopy'` (flat thin slab) with `cells`,
  `onLevel`, optional `height` above that level's floor, and `overhang`.
  Remove reliance on `Space.cover` for partial canopies; keep `cover` as a
  shorthand for "canopy over the whole space".
- Golden sample: where the dimensioned plans and the 3D reference views
  disagree about facade openings, follow the 3D views (they are what we are
  compared against). In particular the south face of the middle bay has two
  tall slot windows spanning ground floor and level 2 with timber insert
  bands, and level 3 has a wide strip window. Use canopies for the carport
  (gate end only), entrance porch and the level-2 balcony cover.
Not adopted now: edge overrides between outdoor spaces, stair flight detail
(the kernel infers flights from the stairwell).

## Part B - `packages/kernel` (`@opensu/kernel`)
Pure TypeScript, no three.js, no DOM. Input `ResolvedHouse`, output plain
data:

```ts
HouseGeometry {
  parts: Part[]              // grouped so the viewer can hide/show
  bounds: { min, max }       // metres, Z up
  stats: { triangles: number }
}
Part {
  id: string                 // stable, derived from model ids
  level?: string             // level id, for cutaway views later
  role: 'wall' | 'slab' | 'roof' | 'frame' | 'glass' | 'insert' | 'rail'
      | 'stair' | 'fence' | 'gate' | 'ground' | 'canopy' | ...
  material: MaterialSlot     // semantic slot name, mapped to tokens by render
  positions: Float32Array; indices: Uint32Array   // flat-shaded faces
  edges: Float32Array        // feature-edge segments to draw as lines
}
```

Generate, in metres (convert from mm once here):
- Walls per level with real thickness, cut by openings, mitred/joined at
  corners so there are no overlapping coplanar faces and no doubled edges.
  Exterior walls continuous across levels (one floor line per level).
- Floor slabs (with stairwell holes), exposed slab edges on balconies.
- Windows / doors: thin dark frames, mullions for wide units, glass pane
  with flat backing, timber insert bands, multi-level tall windows.
- Roofs: flat, mono, gable, hip, canopy. Mono/gable roofs get tile top,
  constant-depth barge board following the slope, soffit, real side
  overhangs (default 300 at verges, eaves as authored), wall infill up to the
  underside of the roof (gable/clerestory triangles). Skylights.
  Move the roof helper from `packages/render` here and generalise it.
- Balcony / terrace edges: glass balustrade, metal railing, parapet. Decking
  surface for balcony/terrace, paving/lawn surfaces for outdoor ground types.
- Stairs: simple straight / U / L flights inferred from the stairwell and
  level height (riser ~165-175). Good enough to walk later.
- Site: fence wall with coping and small openings, gates, entrance pier.
- Entourage placement rules (deterministic, seeded from the house): a large
  tree in the biggest courtyard/garden, shrubs/bamboo along fences in garden
  strips, a small tree on a terrace, one or two people (terrace, entrance), a
  car in the carport. Explicit `entourage` entries override the rules. The
  kernel outputs placements `{ kind, position, rotation, scale, seed }`; the
  render package instantiates them with its existing generators. Entourage
  must not hide the main facade features in the four fixed views.

Deterministic: same model -> byte-identical output.

## Part C - render integration
- `packages/render`: `createHouseObject(geometry)` builds three.js objects
  from `HouseGeometry` using the existing materials, edge lines and
  entourage generators. Map material slots to tokens in one table. Do not
  change token values.
- The demo page and `pnpm shots` load the golden sample through
  model -> kernel -> render. Delete the hard-coded demo scene helpers that
  are no longer used. Camera framing is computed from `bounds`.
- Keep the four shot names; add `axo-sw.png` (like the top of `ref-4.jpg`).

## Acceptance criteria
- `pnpm install && pnpm build && pnpm typecheck && pnpm test && pnpm shots`
  pass from a clean checkout.
- Kernel unit tests: determinism (hash of output), every opening cuts its
  wall, no part with zero triangles, bounds match the model, roof helper for
  all four fall directions, stair riser count.
- The five screenshots are compared with `.reference/` by the verifier and
  the lead: same massing, roofs, balconies, terrace, canopies, carport,
  fence and gates; windows in the right places; style unchanged from the
  accepted spike (three wall tones, crisp lines, no line artifacts).
- No overlapping coplanar faces (no z-fighting anywhere when orbiting), no
  doubled or stray edge lines, no gaps at wall corners or under roofs.
- < 150k triangles, < 150 draw calls, printed by `pnpm shots`.
- `packages/kernel` has no dependency on three.js or the DOM.

## Process
Iterate with screenshots against the references, many rounds. Commit locally
in logical commits (do not push). Report: what matches, what does not, counts,
and any model/schema limitation that blocked fidelity (propose, do not
silently widen the schema beyond Part A).
