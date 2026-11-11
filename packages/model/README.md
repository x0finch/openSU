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
  (authored, then canopies derived from `cover: 'canopy'`), explicit
  entourage and total interior area. Doors carry a `swing` (authored or
  inferred, see below). Output order and ids are deterministic. It
  assumes a schema-valid house; openings that cannot be placed are left out
  (`validate` explains why).
- `applyCommands(house, commands): { ok, house, issues, applied }` - atomic,
  validated edits (see Commands). `Command` (zod), `COMMAND_OPS`,
  `EditHouseInput`, `commandsJsonSchema()` and `editHouseTool()` (name,
  description and JSON Schema of the LLM tool `edit_house`).
- `History` - snapshot undo / redo with a bounded stack (`apply`, `push`,
  `undo`, `redo`).
- `describeHouse(house, issues?)` - compact plain-text description for LLM
  context (see Description format).
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
- Opening hosts name a concrete edge: `{ space, side, span? }` (the
  `side`-facing boundary of a space) or `{ between: [a, b], span? }` (the
  boundary two spaces share). `span: { from, to }` is the stretch between
  two grid lines that cross that boundary (X lines for N/S sides, Y lines
  for E/W); either order, any part of one edge. `at` offsets are measured
  from the span's west / south end (`start`) or east / north end (`end`);
  `center` centres on the span. `span` may be omitted only when there is
  exactly one such edge (else `ambiguous-host`, listing the spans). Because
  offsets hang on grid lines, editing a space's cells does not move its
  openings; if the span is no longer on that side, `opening-span` names the
  opening and the valid spans. An opening must fit inside its span and on
  one wall segment (walls split wherever the space on either side changes).
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
  `onLevel` is that level. Canopies do not count.
- Canopies: `Roof.kind: 'canopy'` is a flat thin slab over its cells; its
  top is `height` above the floor of `onLevel` (default: level height minus
  `CANOPY_DROP`), extended by `overhang` on every side. A space's
  `cover: 'canopy'` is shorthand for a canopy over the whole space (id
  `<space>:canopy`).
- Opening extras: `canopy: { depth, above? }` on doors / sliding doors is a
  thin slab over that opening (300 wider each side, `above` default 150 over
  the head); `panel: 'start' | 'end'` is a timber side panel of about a
  quarter of the width. Two windows of one space on adjacent faces that both
  run to the shared corner form a corner window (the kernel joins them).
- Outdoor `surface: 'deck' | 'paving' | 'gravel' | 'lawn'` overrides the
  default finish (gardens gravel, courtyards / porches / carports paving).
- Roofs: `overhang` is the eave overhang; `vergeOverhang` the side overhang
  of mono / gable roofs (default 300 when `overhang` > 0, else 0).
- Door swing: `swing: { into, hinge }` on doors (hinge `start` = west/south
  end of the opening). When absent, `resolve` infers it: into the interior
  side; between two interior spaces into the one that is not a hall/stair,
  else the smaller; hinge at the end of the opening nearer its wall
  segment's end. `swing.inferred` tells which.

## Validation rules

Errors: `schema`, `duplicate-id`, `unknown-grid-line` (also span ids on
the wrong axis), `unknown-space`, `unknown-level`, `empty-rect`,
`outside-plot`, `space-overlap`, `space-disconnected`, `unreachable`,
`no-exterior-window` (bedroom, living, kitchen), `ambiguous-host`,
`opening-span`, `opening-off-edge`, `opening-not-adjacent`, `opening-too-wide`,
`opening-no-wall`, `opening-overlap`, `span-no-wall`, `stair-misaligned`,
`stair-space-type`, `min-size` (bedroom short side 2700, bathroom 1500,
stair flight 900, door 700), `roof-params` (also canopies higher than their
level), `gate-off-fence`, `swing` (swing into a space not beside the door),
`opening-spacing` (less than 200 mm of wall between two openings on one wall
segment).

Warnings: `unsupported`, `roof-gap`, `open-to-not-adjacent`,
`opening-too-tall` (against the level height, or the underside of a pitched
roof on that level), `outdoor-only`, `unreachable` for upper outdoor spaces,
`roof-params` for ignored roof fields, `swing` on non-doors,
`unsupported-attribute` (canopy on a window, panel on a void),
`interior-window` (a window between two interior spaces).

Messages name ids, grid ranges (`cells 4-6/D-E`), numbers and the fix;
cross-level ones (stairs, `spanLevels`, overlaps of tall windows, support,
roof gaps) name both levels and what is on the other one.

No cascades: when spaces overlap, the overlap is reported and issues on
that level and the levels next to it (and all `unreachable`) are skipped
until it is fixed. While an opening cannot be placed, `unreachable` and the
`no-exterior-window` of the spaces an unplaced window would serve are
skipped.

## Commands

`applyCommands(house, commands)` parses each command (zod, discriminated on
`op`), applies them in order to a copy, then validates. If a command fails,
or the result has an error the original house did not already have, it
returns the original house (`ok: false`) with the issues and a final
`rolled-back` issue. Warnings never block. Pre-existing errors do not block,
so a broken imported house can be repaired step by step. `applied` says
what each command did (generated ids in `created`, cascaded removals in
`removed`); on rollback none of it was kept. Command errors carry
`where.command` (the index in the batch).

| op | fields (`?` optional, `null` clears) | notes |
| --- | --- | --- |
| `add_grid_line` | `axis`, `pos` or `relativeTo {line, offset}`, `id?` | id default: west/south neighbour + letter ("6a"); changes no space |
| `move_grid_line` | `line`, `by` or `to`, `axis?` | main way to resize; everything on the line follows on all levels; cannot cross a neighbour; reports band widths and resized spaces; skylights / entourage stretch with their cell |
| `remove_grid_line` | `line`, `axis?` | fails while any cells or span use it (lists them) |
| `add_level` | `name`, `height?`, `after?`, `copyFrom?`, `id?` | copy re-prefixes ids (`l2-bath` -> `l4-bath`) and remaps references; roofs not copied |
| `remove_level` / `update_level` | `level` / `level`, `name?`, `height?` | removing drops its roofs |
| `add_space` | `level`, `name`, `type`, `cells`, `nameEn? openTo? edge? cover? surface? id?` | id default `<level>-<type>` ("l2-bedroom") |
| `update_space` | `space`, any field | `cells` replaces all cells |
| `remove_space` | `space` | also removes its openings and stairs, drops it from `openTo`, resets swings into it |
| `add_opening` | `kind`, `host`, `width`, `at?` (center), `height? sill?` (by kind), extras, `id?` | level follows from the host; omitted span is filled in when unambiguous; id default `<space>-<d|w|sd|v>` |
| `update_opening` | `opening`, any field, or `move {dir, by}` | `move` slides along the wall (E/W on N/S walls, N/S on E/W walls) and stays in the span |
| `remove_opening` | `opening` | |
| `add_stair` / `remove_stair` | `space, kind, up, id?` / `stair` | id default `stair-<level>` |
| `add_roof` / `update_roof` / `remove_roof` | `kind, cells, onLevel, ...` / `roof, ...` / `roof` | overhang default: canopy 0, flat 300, pitched 500 |
| `update_site`, `set_style`, `rename_house` | site fields (`fence: null` removes) / `style` / `name` | |

Unknown ids fail with the nearest valid ids ("Unknown space "l2-bedrom".
Nearest space ids: l2-bed-n, l2-bed-w, ..."); unknown ops suggest the right
one. After all commands, openings the batch did not add or update must not
jump to another wall because a space's cells changed (`opening-moved`):
re-host or remove them in the same batch.

`commandsJsonSchema()` is the JSON Schema (draft 7, no `$ref`) of
`{ commands: Command[] }`, with field descriptions written for an LLM;
`editHouseTool()` wraps it with the tool name and description.

## Description format

`describeHouse(golden)` is about 8.9k characters. Lines:

```
HOUSE "<name>" style <preset>
<3 legend lines>
SITE <width> x <depth>, north <deg>, lat .. lon ..; fence h<height>, gates: <id> <side> <at> w<width> <kind>
GRID X 1=0 2=3100 ...          (id=position)
GRID Y A=0 B=300 ...

LEVEL <id> "<name>" height <mm>, floor +<elevation>, below <next level>|top
spaces:
- <id> <type> <cells x0-x1/y0-y1[+...]> <W>x<D> m <area> m² "<name>" [openTo ..; edge ..; cover ..; surface ..]
    | N@<line> <span>:<neighbour> ...; N@<other line> ... | E@... | S@... | W@...
openings:
- <id> <kind> <space>:<side>|<a>|<b> <span> <start+off|end+off|center> <width>[x<height> sill<sill>] [extras] => <from>-<to>
stair <id>: <kind>, in <space>, first flight up <side>, to <level>

ROOFS
- <id> <kind> on <level> <cells>, pitch .., fall .., overhang .., ...
Interior floor area ...
ISSUES none | <n> errors, <m> warnings + one line each
```

Walls are listed for interior spaces: per side, per grid line, each wall
segment with the space beyond (`out` = outside, `~id` = open, no wall); a
side with one segment prints just the neighbour (no span needed there).
Opening heights / sills are printed only when they differ from the kind's
default; `=>` is the absolute range along the wall.

## Golden sample

`src/samples/golden.ts` transcribes the reference house: grid from the
dimension chains of all three plans (plus a few scaled, undimensioned
lines, listed in the file header), 3 levels (level 3 is an attic, 1.8 m to
the eaves), 2 offset mono-pitch roofs, 3 canopies.
Total interior floor area 243.4 m² (ground 92.7, level 2 87.3, attic 63.4;
balconies, terrace, porch and carport excluded).

## Schema changes

Adopted in task 009: opening `host.span` with offsets from the span start
(the golden sample now names every span; `resolve(golden)` is unchanged,
see `test/golden-snapshot.test.ts`).

Adopted in task 003 (review round): opening `canopy` and `panel`, corner
windows, outdoor `surface`, roof `vergeOverhang`, `opening-spacing`.

Adopted in task 003: `Gate { id, side, at, width, kind? }`, `Entourage
{ kind, at, rotationDeg? }`, door `swing`, `Roof.kind: 'canopy'` with
`height`. The golden sample follows the 3D views for the middle bay's south
facade (two tall slot windows with timber bands, a level-3 strip window)
and uses canopy roofs for the carport's gate end, the entry porch and the
level-2 balcony cover.

Still proposed (not applied):

1. Canopy voids (the entry canopy has a hole for the tree).
2. Balcony slabs projecting past the walls below and slab edge overhangs
   (dark bands in the 3D views); low priority.
3. Fences: only the plot boundary. The reference has interior garden walls
   and planter kerbs between outdoor spaces; outdoor | outdoor boundaries
   produce nothing. Proposal: optional `edges: { with: spaceId, treatment }`
   overrides between outdoor spaces.
4. Stair shape: `kind` and `up` give no flight split or landing position;
   the kernel infers them from the stairwell.
