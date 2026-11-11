// Placement engine: rooms, wall profiles and collision-checked groups.
import type { Side } from '@opensu/model';
import type { LevelPlan, SpaceInfo } from './analyse';
import { contains, intersection, overlaps, type Rect } from './geom';
import type { FurnitureKind, Placement } from './types';

/** What a stretch of a room side is made of. */
export type SpanKind = 'wall' | 'window-low' | 'window-tall' | 'door' | 'open' | 'rail';
export interface Span { lo: number; hi: number; kind: SpanKind }

/** Back requirement of a group: solid wall only; wall or a window with a
 *  sill high enough for low furniture; or anything that is not a door. */
export type BackNeed = 'solid' | 'low' | 'any';

export interface LocalItem {
  kind: FurnitureKind;
  /** Rect in the group frame: u along the wall, v away from it. */
  u: number; v: number; w: number; d: number;
  /** Which way the item faces relative to the group front. */
  /** 'u+' / 'u-': facing along the wall, towards growing / shrinking u. */
  turn?: 'front' | 'back' | 'left' | 'right' | 'u+' | 'u-';
  layer?: Placement['layer'];
  priority?: number;
  variant?: string;
}

export interface Group {
  items: LocalItem[];
  /** Extent along the wall and depth (the back segment that must be valid). */
  W: number;
  D: number;
  /** Clear depth needed in front of the group (inside the room). */
  clear: number;
  back: BackNeed;
  /** Pieces may stand in other groups' clearances (kitchen runs share one aisle). */
  shareClear?: boolean;
  /** Back requirement applies only to [backLo, backHi] of the group (default all). */
  backLo?: number;
  backHi?: number;
}

const SIDES: Side[] = ['N', 'E', 'S', 'W'];
const OPP: Record<Side, Side> = { N: 'S', S: 'N', E: 'W', W: 'E' };
const LEFT: Record<Side, Side> = { N: 'W', W: 'S', S: 'E', E: 'N' };
const RIGHT: Record<Side, Side> = { N: 'E', E: 'S', S: 'W', W: 'N' };
export const opposite = (s: Side) => OPP[s];

/** Direction a group placed against `side` faces (into the room). */
export const frontOf = (side: Side): Side => OPP[side];

export class Room {
  readonly R: Rect;
  readonly sp: SpaceInfo;
  readonly items: Placement[] = [];
  /** Furniture must keep these free (door swings, stairs, passages). */
  readonly blocked: Rect[];
  /** Placed solids and their clearances. */
  readonly solids: Rect[] = [];
  readonly clears: Rect[] = [];
  readonly profile: Record<Side, Span[]>;
  /** Door swings and gate zones: even planting keeps out of these. */
  readonly hard: Rect[];
  private n = 0;

  constructor(readonly plan: LevelPlan, sp: SpaceInfo, R: Rect, blocked: Rect[], hard: Rect[] = []) {
    this.sp = sp;
    this.R = R;
    this.blocked = blocked.filter((b) => intersection(b, R));
    this.hard = hard.filter((b) => intersection(b, R));
    this.profile = { N: this.sideProfile('N'), S: this.sideProfile('S'), E: this.sideProfile('E'), W: this.sideProfile('W') };
  }

  /** Length of the side and its along-axis range. */
  range(side: Side): [number, number] {
    return side === 'N' || side === 'S' ? [this.R.x0, this.R.x1] : [this.R.y0, this.R.y1];
  }

  private sideProfile(side: Side): Span[] {
    const { plan, sp } = this;
    const main = sp.main;
    const [lo, hi] = this.range(side);
    const orient = side === 'N' || side === 'S' ? 'EW' : 'NS';
    const pos = side === 'N' ? main.y1 : side === 'S' ? main.y0 : side === 'E' ? main.x1 : main.x0;
    const along = (p: [number, number]) => (orient === 'EW' ? p[0] : p[1]);
    const at = (p: [number, number]) => (orient === 'EW' ? p[1] : p[0]);
    const spans: Span[] = [{ lo, hi, kind: 'open' }];
    const paint = (a: number, b: number, kind: SpanKind) => {
      const s = Math.max(lo, Math.min(a, b)), e = Math.min(hi, Math.max(a, b));
      if (e - s < 1) return;
      const next: Span[] = [];
      for (const x of spans) {
        if (x.hi <= s || x.lo >= e) { next.push(x); continue; }
        if (x.lo < s) next.push({ lo: x.lo, hi: s, kind: x.kind });
        if (x.hi > e) next.push({ lo: e, hi: x.hi, kind: x.kind });
      }
      next.push({ lo: s, hi: e, kind });
      next.sort((p, q) => p.lo - q.lo);
      spans.splice(0, spans.length, ...next);
    };
    for (const w of plan.walls) if (w.orient === orient && Math.abs(at(w.a) - pos) < 1) paint(along(w.a), along(w.b), 'wall');
    for (const e of plan.level.edges) {
      if (e.orient === orient && Math.abs(at(e.a) - pos) < 1 && e.space === sp.id) paint(along(e.a), along(e.b), e.treatment === 'none' ? 'open' : 'rail');
    }
    for (const o of plan.openings) {
      const op = o.op;
      if (op.orient !== orient || Math.abs(at(op.a) - pos) > 1) continue;
      const kind: SpanKind = op.kind === 'window' ? (op.sill >= 750 ? 'window-low' : 'window-tall') : 'door';
      // Doors also need their jambs free: pad a little.
      const pad = kind === 'door' ? 80 : 0;
      paint(along(op.a) - pad, along(op.b) + pad, kind);
    }
    return spans;
  }

  /** Is [a, b] along `side` fully made of spans meeting `need`? */
  backOk(side: Side, a: number, b: number, need: BackNeed): boolean {
    const ok = (k: SpanKind) => need === 'solid' ? k === 'wall' : need === 'low' ? k === 'wall' || k === 'window-low' : k !== 'door';
    let covered = a;
    for (const s of this.profile[side]) {
      if (s.hi <= a || s.lo >= b) continue;
      if (!ok(s.kind)) return false;
      if (s.lo > covered + 1) return false;
      covered = Math.max(covered, s.hi);
    }
    return covered >= b - 1;
  }

  /** Total length of `side` meeting `need`, and whether it has doors / tall windows. */
  sideStats(side: Side, need: BackNeed) {
    const ok = (k: SpanKind) => need === 'solid' ? k === 'wall' : need === 'low' ? k === 'wall' || k === 'window-low' : k !== 'door';
    let longest = 0, total = 0;
    for (const [lo, hi] of this.intervals(side, need)) { longest = Math.max(longest, hi - lo); total += hi - lo; }
    void ok;
    const door = this.profile[side].some((s) => s.kind === 'door');
    const tall = this.profile[side].some((s) => s.kind === 'window-tall');
    const window = this.profile[side].some((s) => s.kind === 'window-low' || s.kind === 'window-tall');
    return { longest, total, door, tall, window };
  }

  /** Maximal intervals of `side` meeting `need`. */
  intervals(side: Side, need: BackNeed): [number, number][] {
    const ok = (k: SpanKind) => need === 'solid' ? k === 'wall' : need === 'low' ? k === 'wall' || k === 'window-low' : k !== 'door';
    const out: [number, number][] = [];
    for (const s of this.profile[side]) {
      if (!ok(s.kind)) continue;
      const last = out[out.length - 1];
      if (last && Math.abs(last[1] - s.lo) < 1) last[1] = s.hi; else out.push([s.lo, s.hi]);
    }
    return out;
  }

  /** Map a group-frame rect to world for a group against `side` at offset u0. */
  toWorld(side: Side, u0: number, u: number, v: number, w: number, d: number): Rect {
    const R = this.R;
    const a = u0 + u, b = u0 + u + w;
    switch (side) {
      case 'S': return { x0: a, x1: b, y0: R.y0 + v, y1: R.y0 + v + d };
      case 'N': return { x0: a, x1: b, y0: R.y1 - v - d, y1: R.y1 - v };
      case 'W': return { y0: a, y1: b, x0: R.x0 + v, x1: R.x0 + v + d };
      case 'E': return { y0: a, y1: b, x0: R.x1 - v - d, x1: R.x1 - v };
    }
  }

  free(r: Rect, opts: { ignoreClears?: boolean } = {}): boolean {
    if (!contains(this.R, r)) return false;
    if (this.blocked.some((b) => overlaps(b, r))) return false;
    if (this.solids.some((b) => overlaps(b, r))) return false;
    if (!opts.ignoreClears && this.clears.some((b) => overlaps(b, r))) return false;
    return true;
  }

  /** Try to place `g` against `side` at along-offset u0 (world coordinate). */
  tryGroup(g: Group, side: Side, u0: number, commit = true): boolean {
    const bl = u0 + (g.backLo ?? 0), bh = u0 + (g.backHi ?? g.W);
    if (!this.backOk(side, bl, bh, g.back)) return false;
    const solidRects: Rect[] = [];
    for (const it of g.items) {
      const r = this.toWorld(side, u0, it.u, it.v, it.w, it.d);
      const layer = it.layer ?? 'furniture';
      if (layer === 'top') continue;
      if (layer === 'floor') { if (!contains(this.R, r)) return false; continue; }
      if (!this.free(r, { ignoreClears: !!g.shareClear })) return false;
      if (solidRects.some((s) => overlaps(s, r))) return false;
      solidRects.push(r);
    }
    let clearRect: Rect | null = null;
    if (g.clear > 0) {
      const full = this.toWorld(side, u0, 0, g.D, g.W, g.clear);
      const clip = intersection(full, this.R);
      const depth = clip ? (side === 'N' || side === 'S' ? clip.y1 - clip.y0 : clip.x1 - clip.x0) : 0;
      if (depth < Math.min(g.clear, 450) - 1) return false;
      if (clip && this.solids.some((s) => overlaps(s, clip))) return false;
      clearRect = clip;
    }
    if (!commit) return true;
    for (const it of g.items) {
      const r = this.toWorld(side, u0, it.u, it.v, it.w, it.d);
      const t = it.turn ?? 'front';
      const ns = side === 'N' || side === 'S';
      const facing: Side = t === 'u+' ? (ns ? 'E' : 'N') : t === 'u-' ? (ns ? 'W' : 'S') : turnSide(frontOf(side), t);
      const alongX = facing === 'N' || facing === 'S';
      this.add({
        kind: it.kind, x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2,
        w: alongX ? r.x1 - r.x0 : r.y1 - r.y0, d: alongX ? r.y1 - r.y0 : r.x1 - r.x0,
        facing, layer: it.layer ?? 'furniture', priority: it.priority ?? 5,
        ...(it.variant ? { variant: it.variant } : {}),
      });
    }
    for (const r of solidRects) this.solids.push(r);
    if (clearRect) this.clears.push(clearRect);
    return true;
  }

  /** Candidate along-offsets for a group of width W on `side`. */
  offsets(side: Side, W: number, align: 'center' | 'start' | 'end' | 'any'): number[] {
    const [lo, hi] = this.range(side);
    if (hi - lo < W - 1) return [];
    const c = (lo + hi - W) / 2;
    const out: number[] = [];
    const push = (u: number) => { if (u >= lo - 0.5 && u + W <= hi + 0.5 && !out.some((x) => Math.abs(x - u) < 1)) out.push(u); };
    if (align === 'center' || align === 'any') {
      push(c);
      for (let k = 1; k * 100 <= hi - lo; k++) { push(c - k * 100); push(c + k * 100); }
      push(lo); push(hi - W);
    } else {
      const first = align === 'start' ? lo : hi - W;
      push(first);
      for (let k = 1; k * 100 <= hi - lo; k++) push(align === 'start' ? lo + k * 100 : hi - W - k * 100);
    }
    return out;
  }

  place(g: Group, sides: Side[], align: 'center' | 'start' | 'end' | 'any' | ('start' | 'end' | 'center')[] = 'center'): Side | null {
    for (const side of sides) {
      const aligns = Array.isArray(align) ? align : [align];
      for (const a of aligns) {
        for (const u0 of this.offsets(side, g.W, a)) if (this.tryGroup(g, side, u0)) return side;
      }
    }
    return null;
  }

  /** Free-standing group (items relative to its centre, world axes). */
  placeFree(items: { kind: FurnitureKind; dx: number; dy: number; w: number; d: number; facing: Side; layer?: Placement['layer']; priority?: number; variant?: string }[], clearance: number, prefer: [number, number], step = 100): boolean {
    const R = this.R;
    const cands: [number, number][] = [];
    for (let x = R.x0; x <= R.x1; x += step) for (let y = R.y0; y <= R.y1; y += step) cands.push([x, y]);
    cands.sort((p, q) => Math.hypot(p[0] - prefer[0], p[1] - prefer[1]) - Math.hypot(q[0] - prefer[0], q[1] - prefer[1]) || p[0] - q[0] || p[1] - q[1]);
    cands.unshift(prefer);
    const rectOf = (cx: number, cy: number, it: (typeof items)[number]) => {
      const alongX = it.facing === 'N' || it.facing === 'S';
      const hw = (alongX ? it.w : it.d) / 2, hh = (alongX ? it.d : it.w) / 2;
      return { x0: cx + it.dx - hw, x1: cx + it.dx + hw, y0: cy + it.dy - hh, y1: cy + it.dy + hh };
    };
    for (const [cx, cy] of cands) {
      const rs = items.filter((it) => (it.layer ?? 'furniture') !== 'floor').map((it) => rectOf(cx, cy, it));
      if (rs.length === 0) continue;
      let bx: Rect = rs[0]!;
      for (const r of rs) bx = { x0: Math.min(bx.x0, r.x0), y0: Math.min(bx.y0, r.y0), x1: Math.max(bx.x1, r.x1), y1: Math.max(bx.y1, r.y1) };
      const ring = { x0: bx.x0 - clearance, y0: bx.y0 - clearance, x1: bx.x1 + clearance, y1: bx.y1 + clearance };
      if (!rs.every((r) => this.free(r))) continue;
      // The clearance ring may leave the room only through open sides.
      const clip = intersection(ring, R);
      if (!clip || this.solids.some((s) => overlaps(s, clip))) continue;
      if (this.blocked.some((b) => overlaps(b, clip)) && clearance > 0) {
        // Door swings may brush the clearance ring but not the pieces.
      }
      if (!items.filter((it) => it.layer === 'floor').every((it) => contains(R, rectOf(cx, cy, it)))) continue;
      for (const it of items) {
        this.add({
          kind: it.kind, x: cx + it.dx, y: cy + it.dy, w: it.w, d: it.d, facing: it.facing,
          layer: it.layer ?? 'furniture', priority: it.priority ?? 5, ...(it.variant ? { variant: it.variant } : {}),
        });
      }
      for (const r of rs) this.solids.push(r);
      this.clears.push(clip);
      return true;
    }
    return false;
  }

  add(p: Omit<Placement, 'id' | 'space'>): void {
    this.items.push({ id: `${this.sp.id}:${p.kind}:${this.n++}`, space: this.sp.id, ...p });
  }
}

export function turnSide(front: Side, turn: 'front' | 'back' | 'left' | 'right'): Side {
  return turn === 'front' ? front : turn === 'back' ? OPP[front] : turn === 'left' ? LEFT[front] : RIGHT[front];
}

/** Sides ordered by a score (higher first); ties keep N, E, S, W order. */
export function rankSides(score: (s: Side) => number): Side[] {
  return [...SIDES].map((s, i) => ({ s, k: score(s), i })).sort((a, b) => b.k - a.k || a.i - b.i).map((x) => x.s);
}

export const sideLength = (R: Rect, s: Side) => (s === 'N' || s === 'S' ? R.x1 - R.x0 : R.y1 - R.y0);
export const depthFrom = (R: Rect, s: Side) => (s === 'N' || s === 'S' ? R.y1 - R.y0 : R.x1 - R.x0);
export const isPerp = (a: Side, b: Side) => (a === 'N' || a === 'S') !== (b === 'N' || b === 'S');
