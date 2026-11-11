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
  z.strictObject({ from: z.enum(['start', 'end']), offset: NonNegative }),
]);
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
  x0: Id, x1: Id, y0: Id, y1: Id,
});
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
});
export type Space = z.infer<typeof Space>;

export const OpeningHost = z.union([
  z.strictObject({ space: Id, side: Side }),
  z.strictObject({ between: z.tuple([Id, Id]) }),
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
  overhang: NonNegative,
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
