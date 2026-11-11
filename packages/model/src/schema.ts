// Authored house model: what the AI (or a person) writes. All lengths are
// millimetres; X = east, Y = north, origin = south-west plot corner.
// Walls are never authored: they are derived from the spaces by `resolve`.
import { z } from 'zod';

export const SIDES = ['N', 'S', 'E', 'W'] as const;
export const Side = z.enum(SIDES);
export type Side = z.infer<typeof Side>;

const Id = z.string().min(1);
const Length = z.number().finite().positive();
const NonNegative = z.number().finite().nonnegative();

export const GridLine = z.strictObject({
  id: Id,
  pos: z.number().finite(),
});
export type GridLine = z.infer<typeof GridLine>;

/** Where an element sits along an edge: centred, or offset from the start
 *  (west or south end) or the end (east or north end) of the host. */
export const At = z.union([
  z.literal('center'),
  z.strictObject({
    from: z.enum(['start', 'end']).describe('"start" = measured from the west or south end, "end" = from the east or north end.'),
    offset: NonNegative.describe('Distance in mm from that end to the near edge of the element.'),
  }),
]).describe('Position along the edge: "center", or {from, offset}.');
export type At = z.infer<typeof At>;

/** Gate in the plot fence (adopted in task 003). `at` is measured along the
 *  fence side from its west or south end. */
export const Gate = z.strictObject({
  id: Id,
  side: Side,
  at: At,
  width: Length,
  kind: z.enum(['swing', 'sliding']).optional(),
});
export type Gate = z.infer<typeof Gate>;

export const Site = z.strictObject({
  width: Length,
  depth: Length,
  northDeg: z.number().finite(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  /** Local clock offset from UTC in hours (sun study); default 8 (China). */
  utcOffsetHours: z.number().min(-12).max(14).optional(),
  fence: z.strictObject({ height: Length, gates: z.array(Gate) }).optional(),
});
export type Site = z.infer<typeof Site>;

export const INTERIOR_TYPES = [
  'living', 'dining', 'kitchen', 'bedroom', 'bathroom', 'study', 'storage',
  'stair', 'hall', 'family', 'laundry',
] as const;
export const OUTDOOR_TYPES = [
  'balcony', 'terrace', 'courtyard', 'garden', 'carport', 'porch',
] as const;
export const SpaceType = z.enum([...INTERIOR_TYPES, ...OUTDOOR_TYPES]);
export type SpaceType = z.infer<typeof SpaceType>;

const outdoorSet: ReadonlySet<string> = new Set(OUTDOOR_TYPES);
export function isOutdoorType(t: SpaceType): boolean {
  return outdoorSet.has(t);
}

/** Rectangle between two X grid lines and two Y grid lines (ids). */
export const CellRect = z.strictObject({
  x0: Id.describe('X grid line id of the west edge.'),
  x1: Id.describe('X grid line id of the east edge.'),
  y0: Id.describe('Y grid line id of the south edge.'),
  y1: Id.describe('Y grid line id of the north edge.'),
}).describe('Rectangle between two X grid lines (west x0, east x1) and two Y grid lines (south y0, north y1), by id.');
export type CellRect = z.infer<typeof CellRect>;

export const Space = z.strictObject({
  id: Id,
  name: z.string().min(1),
  nameEn: z.string().min(1).optional(),
  type: SpaceType,
  cells: z.array(CellRect).min(1),
  openTo: z.array(Id).optional(),
  edge: z.enum(['glass-rail', 'metal-rail', 'parapet', 'none']).optional(),
  /** Shorthand for a canopy roof over the whole space (see `Roof`). */
  cover: z.enum(['none', 'canopy']).optional(),
  /** Outdoor only: ground / floor finish (default by type: gardens gravel,
   *  courtyards / porches / carports paving, balconies / terraces deck). */
  surface: z.enum(['deck', 'paving', 'gravel', 'lawn']).optional(),
});
export type Space = z.infer<typeof Space>;

/** A stretch of a boundary between two grid lines that cross it (X lines
 *  for a boundary running east-west, Y lines for one running north-south).
 *  Order does not matter: the start is always the west or south end. */
export const Span = z.strictObject({
  from: Id.describe('Grid line id at one end of the stretch.'),
  to: Id.describe('Grid line id at the other end.'),
}).describe('The stretch of the wall between two grid lines that cross it: X line ids for an N or S wall, Y line ids for an E or W wall. Offsets in `at` are measured from its west or south end. Required when the space has more than one edge on that side (or the two spaces share more than one boundary).');
export type Span = z.infer<typeof Span>;

/**
 * Where an opening sits. `{ space, side, span? }`: on the `side`-facing
 * boundary of `space`; `span` names the stretch between two grid lines and
 * may be omitted only when the space has exactly one edge on that side.
 * `{ between: [a, b], span? }`: on the boundary shared by two spaces, same
 * rule. Offsets in `at` are measured from the start (west or south end) of
 * the span, so editing a space's cells does not move its openings.
 */
export const OpeningHost = z.union([
  z.strictObject({
    space: Id.describe('Space id whose wall holds the opening.'),
    side: Side.describe('Which side of that space: N, S, E or W (the direction the wall faces, seen from inside the space).'),
    span: Span.optional(),
  }),
  z.strictObject({
    between: z.tuple([Id, Id]).describe('The two space ids on either side of the wall (an interior wall, or an open boundary for a void).'),
    span: Span.optional(),
  }),
]);
export type OpeningHost = z.infer<typeof OpeningHost>;

/** Door swing: the space the leaf opens into and the end of the opening
 *  (start = west or south end) that carries the hinge. Optional; when absent
 *  `resolve` infers it. */
export const DoorSwing = z.strictObject({
  into: Id,
  hinge: z.enum(['start', 'end']),
});
export type DoorSwing = z.infer<typeof DoorSwing>;

export const Opening = z.strictObject({
  id: Id,
  kind: z.enum(['door', 'sliding-door', 'window', 'void']),
  host: OpeningHost,
  at: At,
  width: Length,
  height: Length,
  sill: NonNegative,
  spanLevels: z.number().int().min(1).optional(),
  insert: z.literal('wood-panel').optional(),
  /** Doors only. */
  swing: DoorSwing.optional(),
  /** Doors / sliding doors: a thin canopy slab over this opening, `depth`
   *  out from the wall, 300 wider than the opening on each side, `above`
   *  (default 150) above the head. */
  canopy: z.strictObject({ depth: Length, above: NonNegative.optional() }).optional(),
  /** A timber side panel (about a quarter of the width) at the start
   *  (west / south) or end (east / north) of the opening. */
  panel: z.enum(['start', 'end']).optional(),
});
export type Opening = z.infer<typeof Opening>;

export const Stair = z.strictObject({
  id: Id,
  space: Id,
  kind: z.enum(['straight', 'u', 'l']),
  up: Side,
});
export type Stair = z.infer<typeof Stair>;

export const Level = z.strictObject({
  id: Id,
  name: z.string().min(1),
  height: Length,
  spaces: z.array(Space),
  openings: z.array(Opening),
  stairs: z.array(Stair),
});
export type Level = z.infer<typeof Level>;

export const Skylight = z.strictObject({
  /** Plan position of the skylight centre, [x, y] in mm. */
  at: z.tuple([z.number().finite(), z.number().finite()]),
  /** Size along X. */
  width: Length,
  /** Size along Y. */
  length: Length,
});
export type Skylight = z.infer<typeof Skylight>;

/**
 * Roof over the cells, sitting on top of `onLevel`. Kind `canopy` is a flat
 * thin slab (porch, carport, balcony cover) whose top is `height` above the
 * floor of `onLevel` (default: that level's height minus 300).
 */
export const Roof = z.strictObject({
  id: Id,
  kind: z.enum(['flat', 'mono', 'gable', 'hip', 'canopy']),
  cells: z.array(CellRect).min(1),
  onLevel: Id,
  pitchDeg: z.number().min(0).max(75).optional(),
  fall: Side.optional(),
  ridge: z.enum(['EW', 'NS']).optional(),
  eaveOffset: NonNegative.optional(),
  /** Eaves (and canopy edges): overhang past the wall line. */
  overhang: NonNegative,
  /** Mono / gable: side overhang at the verges (default: 300 when the roof
   *  has an overhang, else 0). */
  vergeOverhang: NonNegative.optional(),
  /** Canopy only: top of the slab above the floor of `onLevel`. */
  height: Length.optional(),
  skylights: z.array(Skylight).optional(),
});
export type Roof = z.infer<typeof Roof>;

/** Explicit entourage placement (adopted in task 003). The engine places
 *  entourage itself; explicit entries replace its rules. `at` is a plan
 *  position in mm. */
export const Entourage = z.strictObject({
  kind: z.enum(['tree', 'shrub', 'bamboo', 'car', 'person']),
  at: z.tuple([z.number().finite(), z.number().finite()]),
  rotationDeg: z.number().finite().optional(),
});
export type Entourage = z.infer<typeof Entourage>;

export const House = z.strictObject({
  version: z.literal(1),
  name: z.string().min(1),
  site: Site,
  grid: z.strictObject({ x: z.array(GridLine).min(2), y: z.array(GridLine).min(2) }),
  levels: z.array(Level).min(1),
  roofs: z.array(Roof),
  entourage: z.array(Entourage).optional(),
  style: z.string().min(1),
});
export type House = z.infer<typeof House>;
