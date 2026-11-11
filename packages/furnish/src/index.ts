// Public API of @opensu/furnish: rule-based furniture placement shared by
// the floor plans (`@opensu/plan`) and the 3D interior (`@opensu/kernel`).
// Pure TypeScript, deterministic, millimetres, model axes (X east, Y north).
import type { ResolvedHouse } from '@opensu/model';
import { analyseLevel, levelIndexOf } from './analyse';
import { furnishLevel } from './furnish';
import type { FurnitureKind, Placement } from './types';

export {
  analyseLevel, harmoniseWalls, insetByWalls, levelIndexOf, openingCanopy,
  type GateInfo, type LevelPlan, type OpeningInfo, type SpaceInfo, type StairInfo, type SwingInfo,
} from './analyse';
export * from './geom';
export { furnishLevel, keepClearZones } from './furnish';
export { isEntryHall } from './rules';
export { footprint, isSolid, type FurnitureKind, type Placement } from './types';
export { planDims } from './dims';
export { plantSite, crownRadius, plantFootprint, houseSeed, type Plant, type PlantKind } from './planting';

/**
 * Overall height (mm) of each kind as built in 3D. Pieces the plan draws but
 * the 3D scene shows otherwise (trees and shrubs are entourage, the car is
 * entourage, parking bays are paving) have no height and are not returned
 * by `furnishHouseLevel`.
 */
export const FURNITURE_HEIGHT: Partial<Record<FurnitureKind, number>> = {
  bed: 900,
  nightstand: 520,
  wardrobe: 2200,
  rug: 12,
  'rug-round': 12,
  sofa: 780,
  armchair: 760,
  'coffee-table': 380,
  'side-table': 500,
  'tv-unit': 1150,
  'dining-table': 750,
  'dining-table-round': 750,
  chair: 860,
  stool: 650,
  counter: 900,
  island: 900,
  sink: 900,
  hob: 900,
  fridge: 1850,
  toilet: 760,
  vanity: 850,
  shower: 2000,
  washer: 850,
  desk: 750,
  'desk-chair': 900,
  bookshelf: 2000,
  shelves: 2000,
  'outdoor-table': 740,
  'bistro-table': 720,
  'outdoor-chair': 820,
  lounger: 650,
  'pot-plant': 450,
};

/** One piece of furniture for the 3D scene (mm, model axes). */
export interface FurniturePiece {
  /** Stable id of the placement ("<space>:<kind>:<n>"). */
  id: string;
  space: string;
  kind: FurnitureKind;
  /** Centre of the footprint. */
  x: number;
  y: number;
  /**
   * Rotation about Z (radians, counter-clockwise seen from above) of the
   * piece's local frame: local X runs along the width, the front faces
   * local -Y (rotation 0 = facing south).
   */
  rotation: number;
  /** Width along the back, depth front to back, overall height. */
  w: number;
  d: number;
  h: number;
  /** Placement layer: `top` pieces (sink, hob) sit on a counter. */
  layer: Placement['layer'];
  variant?: string;
}

const FACING_ROT: Record<Placement['facing'], number> = { S: 0, E: Math.PI / 2, N: Math.PI, W: -Math.PI / 2 };

/** A plan placement as a 3D piece (null for kinds the 3D scene shows otherwise). */
export function toPiece(p: Placement): FurniturePiece | null {
  const h = FURNITURE_HEIGHT[p.kind];
  if (h === undefined) return null;
  // Free-standing chairs around a round table carry their plan rotation
  // (SVG degrees, clockwise on screen = clockwise in the model).
  const rot = p.variant?.startsWith('rot:') ? -(Number(p.variant.slice(4)) * Math.PI) / 180 : FACING_ROT[p.facing];
  const piece: FurniturePiece = { id: p.id, space: p.space, kind: p.kind, x: p.x, y: p.y, rotation: rot, w: p.w, d: p.d, h, layer: p.layer };
  if (p.variant && !p.variant.startsWith('rot:')) piece.variant = p.variant;
  return piece;
}

/** Furniture of one level for the 3D scene: the plan's placements with heights. */
export function furnishHouseLevel(house: ResolvedHouse, levelId: string): FurniturePiece[] {
  const placements = furnishLevel(analyseLevel(house, levelIndexOf(house, levelId)));
  const out: FurniturePiece[] = [];
  for (const p of placements) {
    const piece = toPiece(p);
    if (piece) out.push(piece);
  }
  return out;
}
