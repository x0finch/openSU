# Task 002 - House model (`packages/model`)

## Goal
Define the semantic house model that the AI will author, resolve it into
derived elements (room polygons, walls, openings on walls), validate it, and
encode the golden sample house in it. No three.js, no DOM. Pure TypeScript,
runs in Node and the browser.

The design principle: LLMs are bad at coordinates and good at "which room is
where". So the authored model is an axis grid plus rooms that occupy grid
cells; walls are *derived*, never authored.

## Authored model (all lengths mm; X east, Y north; origin SW plot corner)

```ts
House {
  version: 1
  name: string
  site: {
    width: number; depth: number          // plot, X by Y
    northDeg: number                      // true north, clockwise from +Y
    latitude: number; longitude: number
    fence?: { height: number; gates: Gate[] }
  }
  grid: { x: GridLine[]; y: GridLine[] }  // GridLine = { id: string; pos: number }
  levels: Level[]                         // bottom to top
  roofs: Roof[]
  entourage?: Entourage[]                 // optional explicit placement
  style: string                           // preset id, e.g. "modern-pitched"
}

Level {
  id: string; name: string
  height: number                          // floor-to-floor
  spaces: Space[]
  openings: Opening[]
  stairs: Stair[]
}

Space {
  id: string
  name: string                            // display name, e.g. "客厅"
  nameEn?: string
  type: SpaceType                         // living, dining, kitchen, bedroom,
                                          // bathroom, study, storage, stair,
                                          // hall, family, laundry | balcony,
                                          // terrace, courtyard, garden,
                                          // carport, porch
  cells: CellRect[]                       // union of rects -> rectilinear polygon
  openTo?: string[]                       // space ids with no wall between
  edge?: 'glass-rail' | 'metal-rail' | 'parapet' | 'none'   // outdoor only
  cover?: 'none' | 'canopy'               // outdoor only
}
CellRect { x0: string; x1: string; y0: string; y1: string }  // grid line ids

Opening {
  id: string
  kind: 'door' | 'sliding-door' | 'window' | 'void'
  host: { space: string; side: 'N'|'S'|'E'|'W' }
        | { between: [string, string] }
  at: 'center' | { from: 'start' | 'end'; offset: number }  // along the edge,
                                          // start = west or south end
  width: number; height: number; sill: number
  spanLevels?: number                     // tall window crossing floors
  insert?: 'wood-panel'                   // decorative infill band
}

Stair { id: string; space: string; kind: 'straight' | 'u' | 'l';
        up: 'N'|'S'|'E'|'W' }             // connects this level to the next

Roof {
  id: string
  kind: 'flat' | 'mono' | 'gable' | 'hip'
  cells: CellRect[]
  onLevel: string                         // sits on top of this level
  pitchDeg?: number
  fall?: 'N'|'S'|'E'|'W'                  // mono: direction of the low edge
  ridge?: 'EW' | 'NS'                     // gable / hip
  eaveOffset?: number                     // extra wall height under the low edge
  overhang: number
  skylights?: { at: [number, number]; width: number; length: number }[]
}
```

Grid lines are referenced by id, never by index, so inserting a line does
not shift anything. Interior space types get walls; outdoor types get the
`edge` treatment where they meet nothing, and an exterior wall where they
meet an interior space.

## Resolver (pure functions)
`resolve(house) -> ResolvedHouse` with, per level:
- space polygons (rectilinear, CCW, mm) and areas,
- wall segments on grid lines: centre line, thickness (exterior 240,
  interior 120 by default; constants in one place), the two spaces on either
  side, exterior flag, merged where collinear and continuous,
- openings placed on a concrete wall segment with absolute position,
- level elevations, slab outlines (union of interior + outdoor spaces),
- stair openings in the slab above.
Deterministic output order (stable ids) so snapshots are meaningful.

## Validation
`validate(house) -> Issue[]`, each `{ code, severity, message, where }`,
messages written so an LLM can act on them. At least:
- schema errors, unknown ids, zero/negative-size rects, cells outside the grid
- overlapping spaces on a level
- every interior space reachable from the entrance via doors / openTo
- bedrooms, living, kitchen have at least one exterior window
- opening wider than its wall segment, or overlapping another opening
- stair spaces aligned between consecutive levels
- upper-level interior space with nothing under it (unsupported) -> warning
- roof cells not covering the top interior spaces -> warning
- minimum sizes (bedroom short side >= 2700, bathroom >= 1500, stair
  width >= 900, door >= 700)

## Golden sample
`packages/model/src/samples/golden.ts`: transcribe the reference house from
`.reference/ref-1.jpg` (ground floor, plot 15000 x 12000), `ref-2.jpg`
(level 2) and `ref-3.jpg` (attic / level 3), using the dimension chains
printed on the drawings. The grid is the union of all dimension lines on all
levels. Use the 3D views in `ref-1..5` for storey count, roofs, balconies,
terrace, canopies, window types. Where the drawings are ambiguous, choose
the reading that matches the 3D views and note it in a comment.

Known facts to anchor on:
- Bottom chain (S side): 3100 | 2400 | 3600 | 4700 (| 1200 on ground floor).
- Top chain (N side): 3700 | 1800 | 3600 | 4700 (| 1200 on ground floor).
- Ground floor rows from north: 1500 | 3600 | 5100 | 1800 (total 12000).
- Level 2 rows from north: 1500 balcony | 3600 | 5100 (1600 + 3500) | 1500
  balcony.
- Level 3 is the "attic" plan; the east wing's roof is the terrace.
- Two offset mono-pitch roofs: the north one falls north, the south one
  falls south and is lower, leaving a clerestory strip.

## Debug view
`pnpm --filter @opensu/model debug` writes one plain SVG per level to
`artifacts/model/*.svg` and PNG renders of them (walls as thick lines,
spaces filled by type, names, openings marked). This is a checking tool, not
the pretty plan. Use it to compare your transcription with the references.

## Acceptance criteria
- `pnpm typecheck` and `pnpm test` pass; resolver and each validation rule
  have unit tests, including a deliberately broken house per rule.
- `validate(golden)` returns no errors.
- The debug PNG of each level matches the corresponding reference plan in
  room positions, sizes, door and window locations (verifier compares them
  side by side). Room areas are within 2% of grid-derived values.
- Total interior floor area of the golden sample is in the 240-280 m2 range
  (reference says 260 m2).
- No dependency on three.js or the DOM. Schema validated with zod.
- Public API exported from `packages/model/src/index.ts` and documented in a
  short README.

## Out of scope
Geometry, rendering, furniture, AI commands (a later task builds commands on
top of this schema).

## Process
Commit locally when done (do not push). Report: ambiguities you resolved and
how, anything in the schema you found insufficient to express the reference
house, and proposed schema changes (do not silently widen the schema beyond
what the golden sample needs; propose instead).
