// Output data of the kernel: plain arrays, metres, model axes (X east,
// Y north, Z up). No three.js types; the render package converts.

/** Semantic material slot; the render package maps slots to style tokens. */
export type MaterialSlot =
  | 'wall'
  | 'roofTile'
  | 'fascia'
  | 'wood'
  | 'deck'
  | 'frame'
  | 'glass'
  | 'glassBacking'
  | 'balustrade'
  | 'slab'
  | 'metal'
  | 'paving'
  | 'gravel'
  | 'soil'
  /** Interior floor finish. */
  | 'floor'
  /** Cut face of a level cutaway (section through walls). */
  | 'cut'
  /** Furniture: white body, warm wood (tables), light textiles (sofas,
   *  beds, rugs), light grey fixtures (worktops, basins), dark details
   *  (screens, hobs, frames). */
  | 'furniture'
  | 'furnitureWood'
  | 'textile'
  | 'fixture'
  | 'furnitureDark';

export type PartRole =
  | 'wall'
  | 'slab'
  | 'roof'
  | 'frame'
  | 'glass'
  | 'insert'
  | 'rail'
  | 'stair'
  | 'fence'
  | 'gate'
  | 'ground'
  | 'canopy'
  | 'deck'
  | 'planter'
  | 'skylight'
  | 'floor'
  /** Section caps at the level's cut height; shown only in a cutaway. */
  | 'cut'
  /** Furniture (from `@opensu/furnish`); never clipped, hidden with its level. */
  | 'furniture';

export interface Part {
  /** Stable id derived from model ids, e.g. "L2:wall", "roof-n:tile". */
  id: string;
  /** Level id the part belongs to (absent for site parts). */
  level?: string;
  role: PartRole;
  material: MaterialSlot;
  /** Vertex positions (x, y, z), metres. Faces are flat: vertices are never
   *  shared between faces with different normals. */
  positions: Float32Array;
  /** Triangles, counter-clockwise seen from the front. */
  indices: Uint32Array;
  /** Feature edges to draw: segment pairs (x, y, z, x, y, z), metres. */
  edges: Float32Array;
  /** Per edge segment, the normals of the two faces that meet there
   *  (n1, n2; equal for a free edge). Lets the renderer find outer profiles. */
  edgeNormals: Float32Array;
  /** False for transparent or busy parts whose faces do not take part in
   *  feature-edge extraction (glass, bars). */
  castsEdges: boolean;
}

export type EntourageKind =
  | 'ginkgo'
  | 'maple-red'
  | 'maple-green'
  | 'bamboo'
  | 'grass'
  | 'person-walk'
  | 'person-run'
  | 'car';

export interface EntouragePlacement {
  kind: EntourageKind;
  /** Base point, metres, model axes. */
  position: [number, number, number];
  /** Rotation about Z (radians, counter-clockwise seen from above). */
  rotation: number;
  /** Plants and people: height in metres. Car: 1. */
  scale: number;
  /** Seed for the deterministic generator. */
  seed: number;
  /** Foliage below `below` (metres) must stay inside this plan box, so no
   *  stray leaves show through fence or wall faces; higher foliage may
   *  overhang. */
  clip?: { min: [number, number]; max: [number, number]; below: number };
}

/** Site data the renderer needs for the sun study. */
export interface SiteInfo {
  latitude: number;
  longitude: number;
  /** True north, degrees clockwise from model +Y. */
  northDeg: number;
  /** Local clock offset from UTC, hours (default 8). */
  utcOffsetHours: number;
}

/** One storey, metres. */
export interface LevelSpan {
  id: string;
  elevation: number;
  top: number;
  /** Height of the cutaway section plane (parts with role `cut` lie on it). */
  cutZ: number;
}

/** A built piece of furniture (for tests, picking and collision). */
export interface FurnitureBox {
  id: string;
  level: string;
  kind: string;
  /** Axis-aligned bounds, metres, model axes. */
  min: [number, number, number];
  max: [number, number, number];
}

/** Plan rectangle [x0, y0, x1, y1], metres. */
export type PlanRect = [number, number, number, number];

/**
 * A walkable surface: a plan rectangle at a height, flat or (stair flights)
 * rising linearly along one axis.
 */
export interface WalkSurface {
  level: string;
  rect: PlanRect;
  /** Height of a flat surface (metres). */
  z: number;
  /** Stair flight: height `z0` at `from` rising to `z1` at `to` along `axis`. */
  ramp?: { axis: 'x' | 'y'; from: number; to: number; z0: number; z1: number };
}

/** Something that stops a walker whose body overlaps its height range. */
export interface WalkBlocker {
  rect: PlanRect;
  z0: number;
  z1: number;
  kind: 'wall' | 'window' | 'rail' | 'fence' | 'furniture' | 'car';
}

/** Collision and ground data for walking through the house (metres). */
export interface WalkData {
  surfaces: WalkSurface[];
  blockers: WalkBlocker[];
  /** Inside the main entrance, looking into the house. `headingDeg` is a
   *  bearing in model axes (0 = +Y, 90 = +X). */
  start: { level: string; position: [number, number]; headingDeg: number };
  /** Per level: a good arrival point (stair top or start) for level jumps. */
  arrivals: { level: string; position: [number, number]; headingDeg: number }[];
}

export interface HouseGeometry {
  parts: Part[];
  site: SiteInfo;
  /** Storeys, bottom to top. Parts carry their level id. */
  levels: LevelSpan[];
  /** Floor-level marker lines on facades (segment pairs), metres. */
  floorLines: Float32Array;
  entourage: EntouragePlacement[];
  /** Furniture pieces (their meshes are parts with role `furniture`). */
  furniture: FurnitureBox[];
  /** Collision and ground data for walk mode. */
  walk: WalkData;
  /**
   * Interior volumes (plan rect on wall centre lines, z range), metres: the
   * renderer keeps foliage out of them so no leaf grows through a wall.
   */
  interiors: { rect: PlanRect; z0: number; z1: number }[];
  /** Metres, Z up. Architecture only (entourage and furniture excluded). */
  bounds: { min: [number, number, number]; max: [number, number, number] };
  stats: { triangles: number; edges: number };
}
