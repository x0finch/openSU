// Furniture in 3D: the plan's placements (`@opensu/furnish`) built as simple
// white-model volumes. Each kind has a massing recipe in its local frame
// (millimetres): x along the width (-w/2..w/2), y front to back (the front
// at -d/2), z up from the floor. Pieces are rotated and moved onto the floor
// of their space. Bottom faces on the floor are left out (never seen).
import { type FurniturePiece, furnishHouseLevel } from '@opensu/furnish';
import { CUT_HEIGHT, DECK, FLOOR_SLAB, GROUND_DECK, PAVING } from './constants';
import type { Ctx } from './context';
import type { PartBuilder, PartSpec, V3 } from './mesh';
import type { FurnitureBox, MaterialSlot } from './types';

type Slot = Extract<MaterialSlot, 'furniture' | 'furnitureWood' | 'textile' | 'fixture' | 'furnitureDark' | 'glass' | 'slab'>;

/** Footprints shrink by this much on every side: no face is coplanar with a wall. */
const GAP = 5;
const ROUND = 20;

interface Kit {
  /** Axis-aligned box in the local frame. */
  box(slot: Slot, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void;
  /** Vertical prism over a regular polygon (round tables, pots). */
  cyl(slot: Slot, cx: number, cy: number, r: number, z0: number, z1: number, n?: number): void;
  /** Prism of a convex side profile (y, z) extruded along x. */
  prismX(slot: Slot, x0: number, x1: number, profile: [number, number][]): void;
  w: number;
  d: number;
  h: number;
  /** Height of the ceiling above the piece's floor (mm). */
  ceiling: number;
  variant: string | undefined;
}

/** Built pieces of one level, collected per material. */
export interface FurnitureBuild {
  boxes: FurnitureBox[];
  /** Plant positions on pots (for grass tufts), mm. */
  pots: { x: number; y: number; z: number; size: number }[];
}

const MM = 0.001;

/** Furniture pieces of every level (index = level index). */
export function planFurniture(ctx: Ctx): FurniturePiece[][] {
  return ctx.levels.map((lv) => {
    try {
      return furnishHouseLevel(ctx.house, lv.level.id);
    } catch {
      // A model the plan cannot furnish still builds (just empty rooms).
      return [];
    }
  });
}

/** True when a disc of radius r (mm) at a plan point meets a solid piece. */
export function inFurniture(pieces: readonly FurniturePiece[], x: number, y: number, r: number): boolean {
  return pieces.some((p) => {
    if (p.h < 50 || p.layer === 'top') return false;
    const ex = Math.abs(Math.cos(p.rotation)) * p.w / 2 + Math.abs(Math.sin(p.rotation)) * p.d / 2;
    const ey = Math.abs(Math.sin(p.rotation)) * p.w / 2 + Math.abs(Math.cos(p.rotation)) * p.d / 2;
    return Math.abs(x - p.x) < ex + r && Math.abs(y - p.y) < ey + r;
  });
}

export function buildFurniture(ctx: Ctx, all: FurniturePiece[][]): FurnitureBuild {
  const out: FurnitureBuild = { boxes: [], pots: [] };
  for (const lv of ctx.levels) {
    const id = lv.level.id;
    const parts = new Map<Slot, PartBuilder>();
    const part = (slot: Slot) => {
      let p = parts.get(slot);
      if (!p) {
        const spec: PartSpec = { id: `${id}:furniture${slot === 'furniture' ? '' : `-${slot}`}`, level: id, role: 'furniture', material: slot };
        if (slot === 'glass') spec.castsEdges = false;
        parts.set(slot, (p = ctx.parts.get(spec)));
      }
      return p;
    };
    // Section caps where a piece passes through the level's cut plane (tall
    // pieces read as cut solids in a cutaway, like the walls).
    const zCut = lv.elev + CUT_HEIGHT;
    const caps = new Map<Slot, PartBuilder>();
    const cap = (slot: Slot, pts: V3[]) => {
      if (slot === 'glass') return;
      let p = caps.get(slot);
      if (!p) caps.set(slot, (p = ctx.parts.get({ id: `${id}:furniture-cut${slot === 'furniture' ? '' : `-${slot}`}`, level: id, role: 'cut', material: slot })));
      p.polygon(pts);
    };
    for (const piece of all[lv.index] ?? []) {
      const base = floorZ(ctx, lv.index, piece.x, piece.y);
      const c = Math.cos(piece.rotation), s = Math.sin(piece.rotation);
      const w = Math.max(10, piece.w - 2 * GAP), d = Math.max(10, piece.d - 2 * GAP);
      const min: V3 = [Infinity, Infinity, Infinity], max: V3 = [-Infinity, -Infinity, -Infinity];
      const P = (x: number, y: number, z: number): V3 => {
        const p: V3 = [piece.x + c * x - s * y, piece.y + s * x + c * y, base + z];
        for (let k = 0; k < 3; k++) {
          min[k] = Math.min(min[k]!, p[k]!);
          max[k] = Math.max(max[k]!, p[k]!);
        }
        return p;
      };
      const ceiling = (ctx.levels[lv.index + 1]?.elev ?? lv.top) - FLOOR_SLAB - base;
      const kit: Kit = {
        w, d, h: piece.h, variant: piece.variant, ceiling,
        box(slot, x0, y0, z0, x1, y1, z1) {
          if (x1 - x0 < 1 || y1 - y0 < 1 || z1 - z0 < 1) return;
          if (base + z0 < zCut && base + z1 > zCut) {
            const zc = zCut - base;
            cap(slot, [P(x0, y0, zc), P(x1, y0, zc), P(x1, y1, zc), P(x0, y1, zc)]);
          }
          const pb = part(slot);
          const q = (x: number, y: number, z: number) => P(x ? x1 : x0, y ? y1 : y0, z ? z1 : z0);
          pb.polygon([q(0, 0, 1), q(1, 0, 1), q(1, 1, 1), q(0, 1, 1)]);
          if (z0 > 0.5) pb.polygon([q(0, 0, 0), q(0, 1, 0), q(1, 1, 0), q(1, 0, 0)]);
          pb.polygon([q(0, 0, 0), q(1, 0, 0), q(1, 0, 1), q(0, 0, 1)]);
          pb.polygon([q(1, 0, 0), q(1, 1, 0), q(1, 1, 1), q(1, 0, 1)]);
          pb.polygon([q(1, 1, 0), q(0, 1, 0), q(0, 1, 1), q(1, 1, 1)]);
          pb.polygon([q(0, 1, 0), q(0, 0, 0), q(0, 0, 1), q(0, 1, 1)]);
        },
        cyl(slot, cx, cy, r, z0, z1, n = 16) {
          const pb = part(slot);
          const ring = (z: number) => Array.from({ length: n }, (_, k) => {
            const a = ((k + 0.5) / n) * Math.PI * 2;
            return P(cx + r * Math.cos(a), cy + r * Math.sin(a), z);
          });
          if (base + z0 < zCut && base + z1 > zCut) cap(slot, ring(zCut - base));
          const top = ring(z1), bot = ring(z0);
          pb.polygon(top);
          if (z0 > 0.5) pb.polygon([...bot].reverse());
          for (let k = 0; k < n; k++) {
            const k1 = (k + 1) % n;
            pb.polygon([bot[k]!, bot[k1]!, top[k1]!, top[k]!]);
          }
        },
        prismX(slot, x0, x1, profile0) {
          // Convex profile in (y, z); made counter-clockwise (seen from +x).
          const area = profile0.reduce((a, [y, z], k) => {
            const [y1, z1] = profile0[(k + 1) % profile0.length]!;
            return a + y * z1 - y1 * z;
          }, 0);
          const profile = area < 0 ? [...profile0].reverse() : profile0;
          const pb = part(slot);
          const right = profile.map(([y, z]) => P(x1, y, z));
          const left = profile.map(([y, z]) => P(x0, y, z)).reverse();
          pb.polygon(right);
          pb.polygon(left);
          for (let k = 0; k < profile.length; k++) {
            const [ya, za] = profile[k]!, [yb, zb] = profile[(k + 1) % profile.length]!;
            if (za < 0.5 && zb < 0.5) continue;
            pb.polygon([P(x0, ya, za), P(x0, yb, zb), P(x1, yb, zb), P(x1, ya, za)]);
          }
        },
      };
      RECIPES[piece.kind]?.(kit);
      if (piece.kind === 'pot-plant') out.pots.push({ x: piece.x, y: piece.y, z: base + Math.min(piece.h, kit.w * 0.6), size: Math.min(w, d) });
      if (min[0] === Infinity) continue;
      out.boxes.push({
        id: piece.id, level: id, kind: piece.kind,
        min: [min[0]! * MM, min[1]! * MM, min[2]! * MM],
        max: [max[0]! * MM, max[1]! * MM, max[2]! * MM],
      });
    }
  }
  return out;
}

/** Floor height under a plan point of a level: interior floor, deck or paving. */
export function floorZ(ctx: Ctx, li: number, x: number, y: number): number {
  const lv = ctx.levels[li]!;
  const s = ctx.spaceAt(li, x, y);
  if (!s || !s.outdoor) return lv.elev;
  if (li > 0) return lv.elev + DECK;
  const surface = s.surface ?? (s.type === 'garden' ? 'gravel' : 'paving');
  return lv.elev + (surface === 'deck' ? GROUND_DECK : PAVING);
}

// ---------------------------------------------------------------------------
// Recipes. Front at y = -d/2, back at y = +d/2.

type Recipe = (k: Kit) => void;

/** Four square legs under a top. */
function legs(k: Kit, slot: Slot, x0: number, y0: number, x1: number, y1: number, size: number, z1: number, inset = 0): void {
  const a = x0 + inset, b = x1 - inset - size, c = y0 + inset, e = y1 - inset - size;
  for (const [x, y] of [[a, c], [b, c], [a, e], [b, e]] as const) k.box(slot, x, y, 0, x + size, y + size, z1);
}

/** Upholstered seat: base, cushions, back and arms (sofas, armchairs). */
function seat(k: Kit, cushions: number): void {
  const { w, d } = k;
  const hw = w / 2, hd = d / 2;
  const arm = Math.min(170, w * 0.14), back = 190;
  const seatTop = 420;
  // Plinth set back a little, so the seat floats.
  k.box('furnitureDark', -hw + 40, -hd + 40, 0, hw - 40, hd - 40, 70);
  k.box('textile', -hw + arm, -hd, 70, hw - arm, hd - back, seatTop - 110);
  const cw = (w - 2 * arm) / cushions;
  for (let i = 0; i < cushions; i++) {
    const x0 = -hw + arm + i * cw;
    k.box('textile', x0 + ROUND / 2, -hd + 10, seatTop - 110, x0 + cw - ROUND / 2, hd - back, seatTop);
    // Back cushions leaning on the frame.
    k.box('textile', x0 + ROUND / 2, hd - back - 150, seatTop, x0 + cw - ROUND / 2, hd - back, 720);
  }
  k.box('textile', -hw + arm, hd - back, 70, hw - arm, hd, k.h);
  k.box('textile', -hw, -hd, 70, -hw + arm, hd, 600);
  k.box('textile', hw - arm, -hd, 70, hw, hd, 600);
}

/** A pendant lamp hanging from the ceiling over a table (indoors only). */
function pendant(k: Kit, x: number, y: number): void {
  const bottom = Math.max(k.h + 700, 1450);
  if (k.ceiling < bottom + 400 || k.ceiling > 4500) return;
  k.cyl('furnitureDark', x, y, 5, bottom + 160, k.ceiling, 6);
  k.cyl('furnitureDark', x, y, 40, k.ceiling - 20, k.ceiling, 10);
  // Shade: a shallow drum, white inside the white model.
  k.cyl('furniture', x, y, 210, bottom, bottom + 160, 20);
}

/** Simple chair: legs, seat, back. */
function chair(k: Kit, slot: Slot, legSlot: Slot): void {
  const hw = k.w / 2 - 20, hd = k.d / 2 - 20;
  legs(k, legSlot, -hw, -hd, hw, hd, 32, 430);
  k.box(slot, -hw, -hd, 430, hw, hd, 465);
  k.box(slot, -hw, hd - 35, 465, hw, hd, k.h);
}

/** Open shelving: sides, top, bottom, shelves, back. */
function shelving(k: Kit, rows: number): void {
  const hw = k.w / 2, hd = k.d / 2, t = 22;
  k.box('furniture', -hw, -hd, 0, -hw + t, hd, k.h);
  k.box('furniture', hw - t, -hd, 0, hw, hd, k.h);
  k.box('furniture', -hw + t, hd - 12, 0, hw - t, hd, k.h);
  const bays = Math.max(1, Math.round(k.w / 800));
  for (let i = 1; i < bays; i++) {
    const x = -hw + (i * k.w) / bays;
    k.box('furniture', x - t / 2, -hd, 0, x + t / 2, hd - 12, k.h);
  }
  k.box('furniture', -hw + t, -hd, 0, hw - t, hd - 12, 80);
  for (let r = 1; r <= rows; r++) {
    const z = 80 + ((k.h - 80) * r) / (rows + 1);
    k.box('furniture', -hw + t, -hd, z - t / 2, hw - t, hd - 12, r === rows ? k.h : z + t / 2);
  }
  // A few books / boxes in warm wood and textile tones.
  for (let r = 0; r < rows; r++) {
    const z = 80 + ((k.h - 80) * r) / (rows + 1) + (r === 0 ? 0 : 11);
    const span = (k.h - 80) / (rows + 1) - 40;
    for (let i = 0; i < bays; i++) {
      if ((i + r) % 2) continue;
      const x0 = -hw + (i * k.w) / bays + 60, len = Math.min(320, k.w / bays - 140);
      k.box((i + r) % 4 ? 'textile' : 'furnitureWood', x0, -hd + 40, z, x0 + len, hd - 20, z + span * 0.7);
    }
  }
}

const RECIPES: Partial<Record<FurniturePiece['kind'], Recipe>> = {
  bed(k) {
    const hw = k.w / 2, hd = k.d / 2;
    k.box('furniture', -hw, -hd, 0, hw, hd - 60, 300);
    k.box('furnitureWood', -hw, hd - 60, 0, hw, hd, 950);
    k.box('furniture', -hw + 15, -hd + 15, 300, hw - 15, hd - 60, 520);
    // Throw over the foot end.
    k.box('textile', -hw + 5, -hd + 5, 400, hw - 5, -hd + k.d * 0.32, 535);
    const pillows = k.variant === 'double' ? 2 : 1;
    const pw = (k.w - 140 - (pillows - 1) * 60) / pillows;
    for (let i = 0; i < pillows; i++) {
      const x0 = -hw + 70 + i * (pw + 60);
      k.box('furniture', x0, hd - 60 - 380, 520, x0 + pw, hd - 80, 640);
    }
  },
  nightstand(k) {
    const hw = k.w / 2, hd = k.d / 2;
    k.box('furniture', -hw, -hd, 0, hw, hd, 480);
    k.box('furnitureWood', -hw, -hd, 480, hw, hd, 510);
    // Lamp: a small shade on a stem.
    k.cyl('furnitureDark', 0, 40, 12, 510, 760, 6);
    k.cyl('textile', 0, 40, 100, 760, 900, 12);
  },
  wardrobe(k) {
    const hw = k.w / 2, hd = k.d / 2;
    k.box('furniture', -hw, -hd + 18, 0, hw, hd, k.h);
    const n = Math.max(2, Math.round(k.w / 550));
    const dw = k.w / n;
    for (let i = 0; i < n; i++) {
      const x0 = -hw + i * dw;
      k.box('furniture', x0 + 3, -hd, 70, x0 + dw - 3, -hd + 18, k.h - 3);
      // Slim pull.
      const px = i % 2 ? x0 + 60 : x0 + dw - 75;
      k.box('furnitureDark', px, -hd - 12, 900, px + 15, -hd, 1300);
    }
  },
  rug(k) {
    k.box('textile', -k.w / 2, -k.d / 2, 0, k.w / 2, k.d / 2, k.h);
  },
  'rug-round'(k) {
    k.cyl('textile', 0, 0, Math.min(k.w, k.d) / 2, 0, k.h, 24);
  },
  sofa(k) {
    seat(k, k.variant === '3' ? 3 : 2);
  },
  armchair(k) {
    seat(k, 1);
  },
  'coffee-table'(k) {
    const hw = k.w / 2, hd = k.d / 2;
    k.box('furniture', -hw + 70, -hd + 70, 0, hw - 70, hd - 70, 330);
    k.box('furnitureWood', -hw, -hd, 330, hw, hd, k.h);
  },
  'side-table'(k) {
    const r = Math.min(k.w, k.d) / 2;
    k.cyl('furnitureDark', 0, 0, 25, 0, k.h - 30, 8);
    k.cyl('furnitureWood', 0, 0, r, k.h - 30, k.h);
  },
  'tv-unit'(k) {
    const hw = k.w / 2, hd = k.d / 2;
    k.box('furniture', -hw, -hd, 120, hw, hd, 480);
    k.box('furnitureDark', -hw + 60, -hd + 60, 0, hw - 60, hd - 40, 120);
    // Wall-hung screen.
    const sw = Math.min(1450, k.w - 300);
    k.box('furnitureDark', -sw / 2, hd - 40, 900, sw / 2, hd, 900 + sw * 0.5625);
  },
  'dining-table'(k) {
    const hw = k.w / 2, hd = k.d / 2;
    legs(k, 'furnitureWood', -hw, -hd, hw, hd, 70, 715, 60);
    k.box('furnitureWood', -hw, -hd, 715, hw, hd, k.h);
    // Two pendants along the table.
    for (const x of k.w >= 1500 ? [-k.w / 4, k.w / 4] : [0]) pendant(k, x, 0);
  },
  'dining-table-round'(k) {
    const r = Math.min(k.w, k.d) / 2;
    k.cyl('furnitureWood', 0, 0, r * 0.35, 0, 40, 16);
    k.cyl('furnitureWood', 0, 0, 70, 40, 715, 12);
    k.cyl('furnitureWood', 0, 0, r, 715, k.h, 32);
    pendant(k, 0, 0);
  },
  chair(k) {
    chair(k, 'furniture', 'furnitureWood');
  },
  stool(k) {
    const hw = k.w / 2 - 20, hd = k.d / 2 - 20;
    legs(k, 'furnitureWood', -hw, -hd, hw, hd, 30, k.h - 40);
    k.box('furniture', -hw, -hd, k.h - 40, hw, hd, k.h);
  },
  counter(k) {
    const hw = k.w / 2, hd = k.d / 2;
    k.box('furnitureDark', -hw, -hd + 60, 0, hw, hd, 100);
    k.box('furniture', -hw, -hd, 100, hw, hd, 870);
    k.box('fixture', -hw, -hd - 15, 870, hw, hd, k.h);
    // Door joints: shallow fronts.
    const n = Math.max(1, Math.round(k.w / 600));
    for (let i = 0; i < n; i++) {
      const x0 = -hw + (i * k.w) / n;
      k.box('furniture', x0 + 3, -hd - 10, 110, x0 + k.w / n - 3, -hd, 860);
    }
  },
  island(k) {
    const hw = k.w / 2, hd = k.d / 2;
    k.box('furnitureDark', -hw + 60, -hd + 60, 0, hw - 60, hd - 60, 100);
    k.box('furniture', -hw + 20, -hd + 20, 100, hw - 20, hd - 20, 870);
    k.box('fixture', -hw, -hd, 870, hw, hd, k.h);
  },
  sink(k) {
    const hw = k.w / 2 - 20, hd = k.d / 2 - 30;
    k.box('furnitureDark', -hw, -hd, 900, hw, hd, 904);
    if (k.variant === 'double') k.box('fixture', -6, -hd, 904, 6, hd, 906);
    // Tap at the back.
    k.cyl('furnitureDark', 0, hd + 20, 16, 900, 1150, 8);
    k.box('furnitureDark', -12, hd - 140, 1130, 12, hd + 20, 1150);
  },
  hob(k) {
    const hw = k.w / 2 - 20, hd = k.d / 2 - 20;
    k.box('furnitureDark', -hw, -hd, 900, hw, hd, 906);
  },
  fridge(k) {
    const hw = k.w / 2, hd = k.d / 2;
    k.box('furniture', -hw, -hd + 20, 0, hw, hd, k.h);
    k.box('furniture', -hw + 3, -hd, 20, hw - 3, -hd + 20, 1150);
    k.box('furniture', -hw + 3, -hd, 1156, hw - 3, -hd + 20, k.h - 3);
    k.box('furnitureDark', hw - 70, -hd - 25, 900, hw - 55, -hd, 1100);
    k.box('furnitureDark', hw - 70, -hd - 25, 1220, hw - 55, -hd, 1420);
  },
  toilet(k) {
    const hw = k.w / 2, hd = k.d / 2;
    k.box('furniture', -hw + 30, hd - 190, 0, hw - 30, hd, k.h);
    k.box('furniture', -hw + 80, -hd + 140, 0, hw - 80, hd - 190, 300);
    k.cyl('furniture', 0, -hd + 230, Math.min(hw - 10, 190), 300, 400, 16);
    k.box('furniture', -hw + 40, -hd + 200, 300, hw - 40, hd - 190, 400);
  },
  vanity(k) {
    const hw = k.w / 2, hd = k.d / 2;
    k.box('furniture', -hw, -hd + 10, 250, hw, hd, 800);
    k.box('fixture', -hw, -hd, 800, hw, hd, 830);
    k.box('furniture', -Math.min(hw - 60, 230), -hd + 50, 830, Math.min(hw - 60, 230), hd - 70, 960);
    k.cyl('furnitureDark', 0, hd - 40, 14, 830, 1060, 8);
    // Mirror on the wall above.
    k.box('glass', -hw + 40, hd - 8, 1150, hw - 40, hd, 1850);
  },
  shower(k) {
    const hw = k.w / 2, hd = k.d / 2;
    k.box('fixture', -hw, -hd, 0, hw, hd, 40);
    // Glass screen along the front with a slim dark top rail.
    k.box('glass', -hw, -hd, 40, hw, -hd + 10, 1960);
    k.box('furnitureDark', -hw, -hd, 1960, hw, -hd + 20, 2000);
    k.cyl('furnitureDark', 0, hd - 110, 90, 1900, 1920, 12);
  },
  washer(k) {
    const hw = k.w / 2, hd = k.d / 2;
    k.box('furniture', -hw, -hd, 0, hw, hd, k.h);
    // Door: a dark porthole proud of the front.
    const r = Math.min(hw - 80, 200);
    k.prismX('furnitureDark', -r, r, [[-hd - 15, 400 - r], [-hd, 400 - r], [-hd, 400 + r], [-hd - 15, 400 + r]]);
  },
  desk(k) {
    const hw = k.w / 2, hd = k.d / 2;
    k.box('furniture', -hw, -hd + 40, 0, -hw + 30, hd, 720);
    k.box('furniture', hw - 30, -hd + 40, 0, hw, hd, 720);
    k.box('furniture', -hw + 30, hd - 20, 400, hw - 30, hd, 720);
    k.box('furnitureWood', -hw, -hd, 720, hw, hd, k.h);
    // Laptop and a lamp.
    k.box('furnitureDark', -180, -60, k.h, 160, 180, k.h + 15);
    k.cyl('furnitureDark', hw - 160, hd - 120, 12, k.h, k.h + 380, 6);
    k.cyl('textile', hw - 160, hd - 120, 90, k.h + 380, k.h + 500, 12);
  },
  'desk-chair'(k) {
    const r = Math.min(k.w, k.d) / 2;
    k.cyl('furnitureDark', 0, 0, r * 0.8, 0, 50, 5);
    k.cyl('furnitureDark', 0, 0, 25, 50, 420, 8);
    k.box('textile', -r + 30, -r + 30, 420, r - 30, r - 50, 490);
    k.box('textile', -r + 50, r - 80, 520, r - 50, r - 20, k.h);
  },
  bookshelf(k) {
    shelving(k, 4);
  },
  shelves(k) {
    shelving(k, 4);
  },
  'outdoor-table'(k) {
    const hw = k.w / 2, hd = k.d / 2;
    legs(k, 'furnitureDark', -hw, -hd, hw, hd, 50, k.h - 35, 80);
    k.box('furnitureWood', -hw, -hd, k.h - 35, hw, hd, k.h);
  },
  'bistro-table'(k) {
    const r = Math.min(k.w, k.d) / 2;
    k.cyl('furnitureDark', 0, 0, r * 0.45, 0, 20, 12);
    k.cyl('furnitureDark', 0, 0, 22, 20, k.h - 25, 8);
    k.cyl('furniture', 0, 0, r, k.h - 25, k.h, 24);
  },
  'outdoor-chair'(k) {
    chair(k, 'furnitureWood', 'furnitureDark');
  },
  lounger(k) {
    const hw = k.w / 2, hd = k.d / 2;
    // Frame, mattress, raised back at the back end.
    legs(k, 'furnitureDark', -hw, -hd, hw, hd, 40, 260, 40);
    k.box('furnitureWood', -hw, -hd, 260, hw, hd, 300);
    k.box('textile', -hw + 20, -hd + 20, 300, hw - 20, hd - 650, 370);
    k.prismX('textile', -hw + 20, hw - 20, [[hd - 650, 300], [hd - 20, 300], [hd - 20, 360], [hd - 240, k.h], [hd - 330, k.h - 40], [hd - 650, 370]]);
  },
  'pot-plant'(k) {
    const r = Math.min(k.w, k.d) / 2 * 0.6;
    k.cyl('slab', 0, 0, r, 0, Math.min(k.h, r * 1.2 + 120), 12);
  },
};
