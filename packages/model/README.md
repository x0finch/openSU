# @opensu/model

The semantic house model: schema (zod), resolver and validation. Pure
TypeScript, no DOM, no three.js; runs in Node and the browser.

The authored model is an axis grid plus spaces that occupy grid cells.
Walls are never authored; `resolve` derives them. Lengths are millimetres,
X = east, Y = north, origin = south-west plot corner.

## Run

From the repository root:

```sh
pnpm install
pnpm typecheck
pnpm test
pnpm --filter @opensu/model debug   # artifacts/model/*.svg + *.png, areas, issues
```

`debug` resolves and validates the golden sample, prints per-space and
per-level areas, and writes one SVG and PNG per level (spaces filled by
type, walls as thick lines, doors red with a swing marker, windows blue,
sliding doors orange, outdoor rails green, the walls of the level below as
a dashed ghost, roofs as dashed outlines). PNGs are rendered with the
preinstalled Playwright Chromium; without it only SVGs are written.

## API (`src/index.ts`)

- Schema and types: `House`, `Site`, `Gate`, `Level`, `Space`, `SpaceType`,
  `CellRect`, `Opening`, `OpeningHost`, `At`, `Stair`, `Roof`, `Skylight`,
  `Entourage`, `GridLine`, `isOutdoorType`. Each is a zod schema and a type
  of the same name. Objects are strict: unknown keys are schema errors.
- `validate(input: unknown): Issue[]` - schema, references, geometry and
  building rules. `Issue = { code, severity, message, where }`; messages say
  what to change. `hasErrors(issues)`.
- `resolve(house: House): ResolvedHouse` - per level: space polygons (CCW,
  mm) and areas (mm²), wall segments (centre line, thickness, exterior flag,
  the spaces on the west/south and east/north side), outdoor edges with
  their rail treatment, openings on concrete walls with absolute ends,
  elevations, slab outlines, stair openings in the slab above; plus roofs
  and total interior area. Output order and ids are deterministic. It
  assumes a schema-valid house; openings that cannot be placed are left out
  (`validate` explains why).
- `debugSvg(resolved, levelIndex)` - the checking view as an SVG string.
- Constants: wall thicknesses (exterior 240, interior 120), minimum sizes.
- `golden` - the reference house (`src/samples/golden.ts`).

## Semantics worth knowing

- A space is the union of its cell rects. Each grid cell on a level belongs
  to at most one space. Space, opening, stair and roof ids are unique across
  the whole house.
- Walls: interior | interior = interior wall (none if either lists the other
  in `openTo`); interior | outdoor or nothing = exterior wall; outdoor |
  nothing = an edge with the space's `edge` treatment; outdoor | outdoor =
  nothing. Walls are merged along a grid line while the spaces on both sides
  stay the same.
- Openings hosted on `{ space, side }`: `at.offset` is measured from the
  space's overall extent (west or south end for `start`). For an L-shaped
  space the opening lands on the side edge that contains it (the outermost
  one if several do); `center` centres on the outermost, longest edge.
  `{ between: [a, b] }` uses the shared boundary, measured from its west or
  south end. An opening must fit on one wall segment.
- `spanLevels: n` makes a window continue through the same wall on the next
  n - 1 levels (checked for a wall there and for overlaps).
- Stairs connect their level to the next. A stair's footprint is the
  stairwell above it: the stair-type spaces on the next level that overlap
  its space. That footprint is the slab opening and the base of the flight
  width check; the stair space itself is where you step on (so a U stair
  can rise over a storeroom).
- Reachability starts outside: ground-floor outdoor spaces count as outside;
  doors, sliding doors, voids, `openTo`, adjacent outdoor spaces and stairs
  connect spaces.
- Roof coverage: an interior cell with no space above it needs a roof whose
  `onLevel` is that level.

## Validation rules

Errors: `schema`, `duplicate-id`, `unknown-grid-line`, `unknown-space`,
`unknown-level`, `empty-rect`, `outside-plot`, `space-overlap`,
`space-disconnected`, `unreachable`, `no-exterior-window` (bedroom, living,
kitchen), `opening-off-edge`, `opening-not-adjacent`, `opening-too-wide`,
`opening-no-wall`, `opening-overlap`, `span-no-wall`, `stair-misaligned`,
`stair-space-type`, `min-size` (bedroom short side 2700, bathroom 1500,
stair flight 900, door 700), `roof-params`, `gate-off-fence`.

Warnings: `unsupported`, `roof-gap`, `open-to-not-adjacent`,
`opening-too-tall`, `outdoor-only`, `unreachable` for upper outdoor spaces.

## Golden sample

`src/samples/golden.ts` transcribes the reference house: grid from the
dimension chains of all three plans (plus a few scaled, undimensioned
lines, listed in the file header), 3 levels, 2 offset mono-pitch roofs.
Total interior floor area 243.4 m² (ground 92.7, level 2 87.3, attic 63.4;
balconies, terrace, porch and carport excluded).

## Proposed schema changes (not applied)

The golden sample needed these, and they are not in the task-002 schema:

1. `Gate` was referenced but undefined. Defined minimally as
   `{ id, side, at, width, kind?: 'swing' | 'sliding' }`.
2. `Entourage` was referenced but undefined. Defined as a placeholder
   `{ kind, at, rotationDeg? }`; the golden sample does not use it.
3. Door swing: no way to say which side a door opens to or where its hinge
   is (the drawings show both). Proposal: `swing?: { into: spaceId; hinge:
   'start' | 'end' }` on doors.
4. Partial canopies: `cover: 'canopy'` covers a whole outdoor space. The
   reference has a canopy over only the gate end of the carport, a canopy
   over the entry porch that also spans the planter (with a void for the
   tree), and a shallow canopy over the west courtyard that is not on any
   grid line. Proposal: canopies as roof-like elements `{ cells, onLevel,
   voids? }` (e.g. `Roof.kind: 'canopy'`).
5. Balcony slabs projecting past the walls below and slab edge overhangs
   (dark bands in the 3D views) cannot be expressed; low priority.
6. Fences: only the plot boundary. The reference has interior garden walls
   and planter kerbs between outdoor spaces; outdoor | outdoor boundaries
   produce nothing. Proposal: optional `edges: { with: spaceId, treatment }`
   overrides between outdoor spaces.
7. Stair shape: `kind` and `up` give no flight split or landing position;
   the kernel will have to infer them from the stairwell.
