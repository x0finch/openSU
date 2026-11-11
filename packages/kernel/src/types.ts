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
  | 'soil';

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
  | 'skylight';

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
}

export interface HouseGeometry {
  parts: Part[];
  /** Floor-level marker lines on facades (segment pairs), metres. */
  floorLines: Float32Array;
  entourage: EntouragePlacement[];
  /** Metres, Z up. Architecture only (entourage excluded). */
  bounds: { min: [number, number, number]; max: [number, number, number] };
  stats: { triangles: number; edges: number };
}
