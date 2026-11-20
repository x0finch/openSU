// Level analysis for the plan: everything the furniture rules and the SVG
// drawing need, in model millimetres (X east, Y north). No SVG here.
import type {
  ResolvedHouse, ResolvedLevel, ResolvedOpening, ResolvedSpace, ResolvedWall, Side, SpaceType,
} from '@opensu/model';
import {
  bboxOfPoints, cellRectsIn, largestRectIn, rect, type Pt, type Rect,
} from './geom';
import { planDims as mm } from './dims';

export interface SpaceInfo {
  id: string;
  name: string;
  nameEn?: string;
  type: SpaceType;
  outdoor: boolean;
  rings: Pt[][];
  area: number;
  bbox: Rect;
  /** Largest rectangle of the space on grid centre lines. */
  main: Rect;
  /** `main` minus half the wall thickness (or rail) on each side. */
  clear: Rect;
  /** Cell rectangles of the whole space, each inset like `clear`. */
  parts: Rect[];
  edge?: ResolvedSpace['edge'];
  /** Outdoor finish when the model gives one (deck / paving / gravel / lawn). */
  surface?: string;
  /** Space ids this one is open to (shared boundary without a wall). */
  openTo: string[];
}

export interface SwingInfo {
  into: string | null;
  hinge: 'start' | 'end';
  /** Hinge point on the wall face of the `into` side. */
  hingePt: Pt;
  /** Far jamb on the same face. */
  jambPt: Pt;
  /** Leaf tip when fully open (perpendicular to the wall). */
  tipPt: Pt;
  /** Box swept by the leaf. */
  box: Rect;
  /** +1 / -1 along the wall normal (Y for EW walls, X for NS walls). */
  sign: 1 | -1;
}

export interface OpeningInfo {
  op: ResolvedOpening;
  /** Thickness of the host wall (0 for a void across an open boundary). */
  thickness: number;
  /** The gap cut in the wall (full thickness). */
  gap: Rect;
  swing?: SwingInfo;
  /** Clear zones in front of the opening that furniture must keep free. */
  keepClear: Rect[];
}

export interface StairInfo {
  /** Stair-type space on this level drawn as a stair. */
  space: string;
  /** Drawing clip: the clear rect of that space on this level. */
  clip: Rect;
  /** Clear rect of the stairwell the flights are laid out in. */
  well: Rect;
  kind: 'straight' | 'u' | 'l';
  /** Climbing direction of the first flight. */
  dir: Side;
  /** Which half of the well (across `dir`) carries the first flight: -1 = west/south, +1 = east/north. */
  firstHalf: -1 | 1;
  /** Entered from the side: the first flight starts with winders (ResolvedStair.sideEntry). */
  sideEntry: boolean;
  /** A flight starts on this level (draw "上" and a break line). */
  up: boolean;
  /** A flight arrives from the level below (draw "下"). */
  down: boolean;
  /** Storey height the flights climb (for the tread count). */
  rise: number;
}

export interface GateInfo { id: string; side: Side; kind: 'swing' | 'sliding'; gap: Rect; zone: Rect }

export interface LevelPlan {
  house: ResolvedHouse;
  level: ResolvedLevel;
  index: number;
  spaces: SpaceInfo[];
  byId: Map<string, SpaceInfo>;
  walls: ResolvedWall[];
  openings: OpeningInfo[];
  stairs: StairInfo[];
  /** Ground floor only: the plot rectangle (fence line). */
  plot: Rect | null;
  /** Gates in the plot fence: the gap and the zone the gate needs inside. */
  gates: GateInfo[];
  /** Extent of everything drawn on the level (mm). */
  extent: Rect;
}

const wallsOnLine = (walls: readonly ResolvedWall[], orient: 'NS' | 'EW', pos: number) =>
  walls.filter((w) => w.orient === orient && Math.abs((orient === 'NS' ? w.a[0] : w.a[1]) - pos) < 0.5);

/** Half of the thickest wall lying on a rect side within [lo, hi]. */
function sideInset(walls: readonly ResolvedWall[], orient: 'NS' | 'EW', pos: number, lo: number, hi: number): number {
  let t = 0;
  for (const w of wallsOnLine(walls, orient, pos)) {
    const [a, b] = orient === 'NS' ? [w.a[1], w.b[1]] : [w.a[0], w.b[0]];
    if (Math.min(a, b) < hi - 1 && Math.max(a, b) > lo + 1) t = Math.max(t, w.thickness / 2);
  }
  return t;
}

export function insetByWalls(r: Rect, walls: readonly ResolvedWall[], edgeInset: (side: Side, r: Rect) => number = () => 0): Rect {
  const w = sideInset(walls, 'NS', r.x0, r.y0, r.y1) || edgeInset('W', r);
  const e = sideInset(walls, 'NS', r.x1, r.y0, r.y1) || edgeInset('E', r);
  const s = sideInset(walls, 'EW', r.y0, r.x0, r.x1) || edgeInset('S', r);
  const n = sideInset(walls, 'EW', r.y1, r.x0, r.x1) || edgeInset('N', r);
  return { x0: r.x0 + w, x1: r.x1 - e, y0: r.y0 + s, y1: r.y1 - n };
}

/** Open (wall-free) neighbours: spaces sharing a boundary with no wall on it. */
function openNeighbours(sp: SpaceInfo, all: readonly SpaceInfo[], walls: readonly ResolvedWall[]): string[] {
  const out: string[] = [];
  for (const o of all) {
    if (o.id === sp.id) continue;
    // Shared boundary: walls list both sides; an open boundary has no wall.
    const hasWall = walls.some((w) => (w.sides[0] === sp.id && w.sides[1] === o.id) || (w.sides[1] === sp.id && w.sides[0] === o.id));
    if (hasWall) continue;
    if (sharesEdge(sp.rings, o.rings)) out.push(o.id);
  }
  return out;
}

function sharesEdge(a: readonly Pt[][], b: readonly Pt[][]): boolean {
  const segs = (rs: readonly Pt[][]) => rs.flatMap((r) => r.map((p, i) => [p, r[(i + 1) % r.length]!] as [Pt, Pt]));
  const sb = segs(b);
  for (const [p, q] of segs(a)) {
    for (const [u, v] of sb) {
      if (p[0] === q[0] && u[0] === v[0] && p[0] === u[0]) {
        const lo = Math.max(Math.min(p[1], q[1]), Math.min(u[1], v[1]));
        const hi = Math.min(Math.max(p[1], q[1]), Math.max(u[1], v[1]));
        if (hi - lo > 1) return true;
      } else if (p[1] === q[1] && u[1] === v[1] && p[1] === u[1]) {
        const lo = Math.max(Math.min(p[0], q[0]), Math.min(u[0], v[0]));
        const hi = Math.min(Math.max(p[0], q[0]), Math.max(u[0], v[0]));
        if (hi - lo > 1) return true;
      }
    }
  }
  return false;
}

const CIRCULATION = new Set<SpaceType>(['hall', 'stair']);

function swingOf(op: ResolvedOpening, t: number, byId: Map<string, SpaceInfo>): SwingInfo {
  // Prefer the model's swing (authored or inferred by `resolve`); infer here
  // only when an older model does not provide one.
  const given = (op as { swing?: { into?: string; hinge?: string } }).swing;
  let into: string | null = given?.into ?? null;
  let hinge: 'start' | 'end' = given?.hinge === 'end' ? 'end' : 'start';
  if (!given) {
    const cand = op.sides.filter((s): s is string => !!s && !byId.get(s)?.outdoor);
    into = cand[0] ?? op.sides[0] ?? op.sides[1] ?? null;
    if (cand.length === 2) {
      const [a, b] = cand.map((s) => byId.get(s)!);
      const ca = CIRCULATION.has(a!.type), cb = CIRCULATION.has(b!.type);
      into = ca !== cb ? (ca ? b!.id : a!.id) : (a!.area <= b!.area ? a!.id : b!.id);
    }
  }
  let sign: 1 | -1 = into !== null && into === op.sides[1] ? 1 : -1;
  if (into !== null && into !== op.sides[0] && into !== op.sides[1]) sign = op.sides[1] && !byId.get(op.sides[1])?.outdoor ? 1 : -1;
  const w = op.width;
  if (op.orient === 'EW') {
    const y = op.a[1] + (sign * t) / 2;
    const xh = hinge === 'start' ? op.a[0] : op.b[0];
    const xj = hinge === 'start' ? op.b[0] : op.a[0];
    return {
      into, hinge, sign, hingePt: [xh, y], jambPt: [xj, y], tipPt: [xh, y + sign * w],
      box: rect(op.a[0], y, op.b[0], y + sign * w),
    };
  }
  const x = op.a[0] + (sign * t) / 2;
  const yh = hinge === 'start' ? op.a[1] : op.b[1];
  const yj = hinge === 'start' ? op.b[1] : op.a[1];
  return {
    into, hinge, sign, hingePt: [x, yh], jambPt: [x, yj], tipPt: [x + sign * w, yh],
    box: rect(x, op.a[1], x + sign * w, op.b[1]),
  };
}

/** Rect in front of an opening on one side (sign along the wall normal). */
function frontZone(op: ResolvedOpening, t: number, sign: 1 | -1, depth: number): Rect {
  if (op.orient === 'EW') {
    const y = op.a[1] + (sign * t) / 2;
    return rect(op.a[0], y, op.b[0], y + sign * depth);
  }
  const x = op.a[0] + (sign * t) / 2;
  return rect(x, op.a[1], x + sign * depth, op.b[1]);
}

function stairsOf(house: ResolvedHouse, index: number, spaces: SpaceInfo[], walls: readonly ResolvedWall[]): StairInfo[] {
  const level = house.levels[index]!;
  const prev = index > 0 ? house.levels[index - 1]! : null;
  const out: StairInfo[] = [];
  const wellOf = (stairId: string, onLevel: number): Rect | null => {
    const lvl = house.levels[onLevel];
    const so = lvl?.slabOpenings.find((s) => s.stair === stairId);
    if (!so || !lvl) return null;
    const box = bboxOfPoints(so.rings.flat());
    return insetByWalls(box, lvl.walls);
  };

  for (const sp of spaces) {
    if (sp.type !== 'stair') continue;
    const up = level.stairs.find((st) => st.space === sp.id);
    const down = prev?.stairs.find((st) => st.toLevel === level.id && level.slabOpenings.some((so) => so.stair === st.id && bboxContains(bboxOfPoints(so.rings.flat()), sp.bbox)));
    if (!up && !down) continue;
    const st = up ?? down!;
    const well = up ? (wellOf(up.id, index + 1) ?? sp.clear) : sp.clear;
    // First flight half: the model's (the side the stair is entered from, task 037).
    const half: -1 | 1 = st.firstHalf;
    out.push({
      space: sp.id, clip: sp.clear, well, kind: st.kind, dir: st.up,
      firstHalf: half, sideEntry: st.sideEntry, up: !!up, down: !!down,
      rise: up ? level.height : prev!.height,
    });
  }
  void walls;
  return out;
}

const bboxContains = (o: Rect, i: Rect) => i.x0 >= o.x0 - 1 && i.y0 >= o.y0 - 1 && i.x1 <= o.x1 + 1 && i.y1 <= o.y1 + 1;

export function analyseLevel(house: ResolvedHouse, index: number): LevelPlan {
  const level = house.levels[index];
  if (!level) throw new Error(`No level at index ${index}`);
  const walls = harmoniseWalls(level.walls);
  const fenced = index === 0 && !!house.site.fence;
  const spaces: SpaceInfo[] = level.spaces.filter((s) => s.polygon.length >= 3).map((s) => {
    const rings = s.rings.length ? s.rings : [s.polygon];
    const bbox = bboxOfPoints(s.polygon);
    const main = largestRectIn(rings) ?? bbox;
    const railInset = (side: Side, r: Rect) => {
      if (!s.outdoor) return 0;
      // The plot fence stands on the boundary of the ground floor.
      if (fenced) {
        const pos = side === 'N' ? r.y1 : side === 'S' ? r.y0 : side === 'E' ? r.x1 : r.x0;
        const edge = side === 'N' ? house.site.depth : side === 'S' ? 0 : side === 'E' ? house.site.width : 0;
        if (Math.abs(pos - edge) < 1) return mm.fence / 2 + 40;
      }
      // Rails sit inside outdoor spaces along their free edges.
      if (!s.edge || s.edge === 'none') return 0;
      const has = level.edges.some((e) => e.space === s.id && onSide(e, r, side));
      return has ? mm.railInset + (s.edge === 'parapet' ? mm.parapet : mm.glassRail) + 40 : 0;
    };
    const clear = insetByWalls(main, walls, railInset);
    const parts = cellRectsIn(rings).map((r) => insetByWalls(r, walls, railInset));
    const info: SpaceInfo = {
      id: s.id, name: s.name, type: s.type, outdoor: s.outdoor, rings, area: s.area, bbox, main, clear, parts, openTo: [],
    };
    if (s.nameEn) info.nameEn = s.nameEn;
    if (s.edge) info.edge = s.edge;
    const surface = (s as { surface?: string }).surface;
    if (surface) info.surface = surface;
    return info;
  });
  const byId = new Map(spaces.map((s) => [s.id, s]));
  for (const s of spaces) s.openTo = openNeighbours(s, spaces, walls);

  const wallById = new Map(walls.map((w) => [w.id, w]));
  const openings: OpeningInfo[] = level.openings.map((op0) => {
    const t = op0.wall ? (wallById.get(op0.wall)?.thickness ?? 0) : 0;
    const raw = op0.orient === 'EW'
      ? rect(op0.a[0], op0.a[1] - t / 2, op0.b[0], op0.a[1] + t / 2)
      : rect(op0.a[0] - t / 2, op0.a[1], op0.a[0] + t / 2, op0.b[1]);
    const gap = t > 0 ? trimJambs({ op: op0, gap: raw, thickness: t }, walls) : raw;
    // Drawn extents follow the trimmed gap (a door leaf hinges at the wall face).
    const ew = op0.orient === 'EW';
    const lo = ew ? gap.x0 : gap.y0, hi = ew ? gap.x1 : gap.y1;
    const op: ResolvedOpening = (lo === (ew ? raw.x0 : raw.y0) && hi === (ew ? raw.x1 : raw.y1)) ? op0 : {
      ...op0,
      a: ew ? [lo, op0.a[1]] : [op0.a[0], lo],
      b: ew ? [hi, op0.b[1]] : [op0.b[0], hi],
      center: ew ? [(lo + hi) / 2, op0.a[1]] : [op0.a[0], (lo + hi) / 2],
      width: hi - lo,
    };
    const info: OpeningInfo = { op, thickness: t, gap, keepClear: [] };
    if (op.kind === 'door') {
      info.swing = swingOf(op, t, byId);
      info.keepClear.push(info.swing.box, frontZone(op, t, (-info.swing.sign) as 1 | -1, 700));
    } else if (op.kind === 'sliding-door' || op.kind === 'void') {
      info.keepClear.push(frontZone(op, t, 1, 800), frontZone(op, t, -1, 800));
    } else if (op.kind === 'window' && op.sill < 300) {
      info.keepClear.push(frontZone(op, t, 1, 450), frontZone(op, t, -1, 450));
    }
    return info;
  });

  const stairs = stairsOf(house, index, spaces, walls);

  let plot: Rect | null = null;
  if (index === 0) plot = { x0: 0, y0: 0, x1: house.site.width, y1: house.site.depth };
  const pts: Pt[] = spaces.flatMap((s) => s.rings.flat());
  for (const w of walls) pts.push(w.a, w.b);
  let extent = bboxOfPoints(pts.length ? pts : [[0, 0], [house.site.width, house.site.depth]]);
  if (plot) extent = { x0: Math.min(extent.x0, plot.x0), y0: Math.min(extent.y0, plot.y0), x1: Math.max(extent.x1, plot.x1), y1: Math.max(extent.y1, plot.y1) };
  const gates: GateInfo[] = [];
  if (plot && house.site.fence) {
    const t = mm.fence / 2;
    const { x0, y0, x1, y1 } = plot;
    for (const g of house.site.fence.gates) {
      const len = g.side === 'N' || g.side === 'S' ? x1 - x0 : y1 - y0;
      const st = g.at === 'center' ? (len - g.width) / 2 : g.at.from === 'start' ? g.at.offset : len - g.at.offset - g.width;
      const kind = g.kind ?? 'swing';
      const depth = kind === 'swing' ? g.width : 900;
      const [gap, zone] = g.side === 'S' ? [rect(x0 + st, y0 - t, x0 + st + g.width, y0 + t), rect(x0 + st, y0 + t, x0 + st + g.width, y0 + t + depth)]
        : g.side === 'N' ? [rect(x0 + st, y1 - t, x0 + st + g.width, y1 + t), rect(x0 + st, y1 - t - depth, x0 + st + g.width, y1 - t)]
          : g.side === 'W' ? [rect(x0 - t, y0 + st, x0 + t, y0 + st + g.width), rect(x0 + t, y0 + st, x0 + t + depth, y0 + st + g.width)]
            : [rect(x1 - t, y0 + st, x1 + t, y0 + st + g.width), rect(x1 - t - depth, y0 + st, x1 - t, y0 + st + g.width)];
      gates.push({ id: g.id, side: g.side, kind, gap, zone });
    }
  }
  return { house, level, index, spaces, byId, walls, openings, stairs, plot, gates, extent };
}

function onSide(e: { a: Pt; b: Pt; orient: string }, r: Rect, side: Side): boolean {
  const lo = (p: number, q: number) => Math.min(p, q), hi = (p: number, q: number) => Math.max(p, q);
  if (side === 'N' || side === 'S') {
    if (e.orient !== 'EW') return false;
    const y = side === 'N' ? r.y1 : r.y0;
    return Math.abs(e.a[1] - y) < 1 && hi(e.a[0], e.b[0]) > r.x0 + 1 && lo(e.a[0], e.b[0]) < r.x1 - 1;
  }
  if (e.orient !== 'NS') return false;
  const x = side === 'E' ? r.x1 : r.x0;
  return Math.abs(e.a[0] - x) < 1 && hi(e.a[1], e.b[1]) > r.y0 + 1 && lo(e.a[1], e.b[1]) < r.y1 - 1;
}

/**
 * Short wall pieces continuing a thicker wall on the same line take its
 * thickness, so a 600 mm partition stub between an exterior wall and a door
 * does not read as a thin nib (drawing only; the model is unchanged).
 */
export function harmoniseWalls(walls: readonly ResolvedWall[]): ResolvedWall[] {
  const SHORT = 900;
  const same = (p: [number, number], q: [number, number]) => Math.abs(p[0] - q[0]) < 1 && Math.abs(p[1] - q[1]) < 1;
  return walls.map((w) => {
    if (w.length > SHORT) return w;
    let t = w.thickness;
    for (const o of walls) {
      if (o === w || o.orient !== w.orient || o.thickness <= t) continue;
      if (same(o.a, w.b) || same(o.b, w.a)) t = o.thickness;
    }
    return t === w.thickness ? w : { ...w, thickness: t };
  });
}

/** Wall left between an opening and a crossing wall shorter than this is dropped. */
const MIN_JAMB = 150;

/**
 * The opening gap, widened to the face of a crossing wall when the wall left
 * between them would be a sliver: wall ends at openings stay square and
 * substantial.
 */
function trimJambs(o: { op: ResolvedOpening; gap: Rect; thickness: number }, walls: readonly ResolvedWall[]): Rect {
  const g = { ...o.gap };
  const ew = o.op.orient === 'EW';
  const c = ew ? o.op.a[1] : o.op.a[0];
  for (const w of walls) {
    if (w.orient === o.op.orient) continue;
    const pos = ew ? w.a[0] : w.a[1];
    const lo = Math.min(ew ? w.a[1] : w.a[0], ew ? w.b[1] : w.b[0]) - 1;
    const hi = Math.max(ew ? w.a[1] : w.a[0], ew ? w.b[1] : w.b[0]) + 1;
    // The crossing wall must reach the opening's wall line (a corner or T).
    if (c < lo - o.thickness / 2 || c > hi + o.thickness / 2) continue;
    const f0 = pos - w.thickness / 2, f1 = pos + w.thickness / 2;
    if (ew) {
      if (f1 <= g.x0 + 0.5 && g.x0 - f1 < MIN_JAMB) g.x0 = f1;
      if (f0 >= g.x1 - 0.5 && f0 - g.x1 < MIN_JAMB) g.x1 = f0;
    } else {
      if (f1 <= g.y0 + 0.5 && g.y0 - f1 < MIN_JAMB) g.y0 = f1;
      if (f0 >= g.y1 - 0.5 && f0 - g.y1 < MIN_JAMB) g.y1 = f0;
    }
  }
  return g;
}

/** Plan rectangle of a canopy over an opening (`Opening.canopy`): `depth`
 *  out from the wall face, 300 wider than the opening on each side. */
export function openingCanopy(op: ResolvedOpening, thickness: number): Rect | null {
  const c = (op as { canopy?: { depth?: number } }).canopy;
  const facing = op.facing;
  if (!c || !c.depth || !facing) return null;
  const t = thickness / 2;
  const ew = op.orient === 'EW';
  const lo = (ew ? Math.min(op.a[0], op.b[0]) : Math.min(op.a[1], op.b[1])) - 300;
  const hi = (ew ? Math.max(op.a[0], op.b[0]) : Math.max(op.a[1], op.b[1])) + 300;
  const at = ew ? op.a[1] : op.a[0];
  const sgn = facing === 'N' || facing === 'E' ? 1 : -1;
  const a = at + sgn * t, b = at + sgn * (t + c.depth);
  return ew ? rect(lo, a, hi, b) : rect(a, lo, b, hi);
}

export function levelIndexOf(house: ResolvedHouse, levelId: string): number {
  const i = house.levels.findIndex((l) => l.id === levelId);
  if (i < 0) throw new Error(`Unknown level "${levelId}"`);
  return i;
}
