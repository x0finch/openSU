// Furniture placements: plain data shared by the plan drawing and (later)
// the 3D interior. Millimetres, model axes (X east, Y north).
import type { Side } from '@opensu/model';
import type { Rect } from './geom';

export type FurnitureKind =
  | 'bed' | 'nightstand' | 'wardrobe' | 'rug' | 'rug-round'
  | 'sofa' | 'armchair' | 'coffee-table' | 'side-table' | 'tv-unit'
  | 'dining-table' | 'dining-table-round' | 'chair' | 'stool'
  | 'counter' | 'island' | 'sink' | 'hob' | 'fridge'
  | 'toilet' | 'vanity' | 'shower' | 'washer'
  | 'desk' | 'desk-chair' | 'bookshelf' | 'shelves'
  | 'outdoor-table' | 'bistro-table' | 'outdoor-chair' | 'lounger'
  | 'tree' | 'shrub' | 'pot-plant' | 'car' | 'parking-bay';

export interface Placement {
  /** Stable id: "<space>:<kind>:<n>". */
  id: string;
  space: string;
  kind: FurnitureKind;
  /** Centre of the footprint (mm). */
  x: number;
  y: number;
  /** Width along the piece's back and depth front-to-back (mm). */
  w: number;
  d: number;
  /** Direction the front of the piece faces (a bed faces its foot end). */
  facing: Side;
  /** Floor layer (rugs, parking bays) sits under everything else; "top"
   *  items (sink, hob) sit on a counter. */
  layer: 'floor' | 'furniture' | 'top' | 'plant';
  /** Higher survives longer when a label needs room (0 = first to go). */
  priority: number;
  /** Free-form variant hint for the symbol (e.g. seat count, bowl count). */
  variant?: string;
}

/** Axis-aligned footprint of a placement. */
export function footprint(p: Pick<Placement, 'x' | 'y' | 'w' | 'd' | 'facing'>): Rect {
  const alongX = p.facing === 'N' || p.facing === 'S';
  const hw = (alongX ? p.w : p.d) / 2;
  const hh = (alongX ? p.d : p.w) / 2;
  return { x0: p.x - hw, y0: p.y - hh, x1: p.x + hw, y1: p.y + hh };
}

/** Pieces that block other furniture and labels (not rugs or counter tops). */
export const isSolid = (p: Placement) => p.layer === 'furniture' || p.layer === 'plant';
