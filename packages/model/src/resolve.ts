// Resolver: authored model -> derived elements (space polygons, walls,
// openings on concrete walls, slabs, stair openings). Pure and deterministic.
import { CANOPY_DROP, EXTERIOR_WALL_THICKNESS, INTERIOR_WALL_THICKNESS } from './constants';
import {
  bboxOf, buildGrid, cellKey, cellsOf, rings, setArea, signedArea,
  type Grid, type Point,
} from './grid';
import type { Issue } from './issues';
import {
  isOutdoorType, type DoorSwing, type Entourage, type House, type Level,
  type Opening, type OpeningHost, type Roof, type Side, type Space, type SpaceType, type Stair,
} from './schema';

export type Orient = 'NS' | 'EW';

export interface ResolvedSpace {
  id: string;
  name: string;
  nameEn?: string;
  type: SpaceType;
  outdoor: boolean;
  /** Outer boundary, counter-clockwise, mm. For a space made of several
   *  disconnected parts (invalid) this is the largest part. */
  polygon: Point[];
  /** All boundary rings: outer rings CCW, holes CW. */
  rings: Point[][];
  /** Floor area in mm² (grid centre lines). */
  area: number;
  edge?: Space['edge'];
  cover?: Space['cover'];
  surface?: Space['surface'];
}

export interface ResolvedWall {
  /** Stable id: "<level>:<line id>:<from id>-<to id>". */
  id: string;
  /** NS walls lie on an X grid line, EW walls on a Y grid line. */
  orient: Orient;
  /** Grid line id the centre line lies on. */
  line: string;
  /** Centre line, a = west/south end. */
  a: Point;
  b: Point;
  length: number;
  thickness: number;
  exterior: boolean;
  /** Space ids on the [west|south, east|north] side; null = nothing. */
  sides: [string | null, string | null];
}

/** Boundary of an outdoor space where it meets nothing (rail / parapet). */
export interface ResolvedEdge {
  id: string;
  orient: Orient;
  line: string;
  a: Point;
  b: Point;
  space: string;
  treatment: NonNullable<Space['edge']>;
}

export interface ResolvedOpening {
  id: string;
  kind: Opening['kind'];
  /** Wall the opening is cut into; null for a void across an open boundary. */
  wall: string | null;
  orient: Orient;
  /** Ends on the wall centre line, a = west/south end. */
  a: Point;
  b: Point;
  center: Point;
  width: number;
  height: number;
  sill: number;
  spanLevels: number;
  insert?: Opening['insert'];
  canopy?: Opening['canopy'];
  panel?: Opening['panel'];
  /** Space ids on the [west|south, east|north] side. */
  sides: [string | null, string | null];
  /** Outward direction when hosted on a space side. */
  facing?: Side;
  /** Doors: authored swing, or inferred (into the room, hinge on the side
   *  nearer a wall corner). `inferred` tells which. */
  swing?: DoorSwing & { inferred: boolean };
}

export interface ResolvedStair {
  id: string;
  space: string;
  kind: Stair['kind'];
  up: Side;
  /** Level the stair arrives at, or null when there is none (invalid). */
  toLevel: string | null;
  /**
   * A stair of two flights (U, L): the half of the well, across the climbing
   * direction, that holds the first flight (-1 = the west or south half, 1 =
   * the east or north one). It is the half the stair is entered from (task
   * 037): the open boundaries and doors of the stair space on its long
   * sides; else the half the stair space sits in.
   */
  firstHalf: -1 | 1;
}

export interface SlabOpening {
  stair: string;
  rings: Point[][];
}

export interface ResolvedLevel {
  id: string;
  name: string;
  index: number;
  /** Floor elevation above the ground floor, mm. */
  elevation: number;
  height: number;
  spaces: ResolvedSpace[];
  walls: ResolvedWall[];
  edges: ResolvedEdge[];
  openings: ResolvedOpening[];
  stairs: ResolvedStair[];
  /** Floor slab outline: union of interior and outdoor spaces. */
  slab: Point[][];
  /** Holes in this level's slab for stairs coming up from the level below. */
  slabOpenings: SlabOpening[];
  /** Interior floor area of the level, mm². */
  interiorArea: number;
}

export interface ResolvedRoof {
  id: string;
  kind: Roof['kind'];
  onLevel: string;
  /** Space id when this canopy was derived from a space's `cover: 'canopy'`. */
  fromSpace?: string;
  /** Canopy: top of the slab above the floor of `onLevel` (mm). */
  height?: number;
  rings: Point[][];
  bbox: { x0: number; x1: number; y0: number; y1: number } | null;
  pitchDeg?: number;
  fall?: Side;
  ridge?: Roof['ridge'];
  eaveOffset: number;
  overhang: number;
  vergeOverhang?: number;
  skylights: NonNullable<Roof['skylights']>;
}

export interface ResolvedHouse {
  name: string;
  site: House['site'];
  grid: { x: { id: string; pos: number }[]; y: { id: string; pos: number }[] };
  levels: ResolvedLevel[];
  /** Authored roofs, then canopies derived from `cover: 'canopy'`. */
  roofs: ResolvedRoof[];
  /** Explicit entourage placements (empty: the engine places its own). */
  entourage: Entourage[];
  /** Total interior floor area, mm². */
  interiorArea: number;
  style: string;
}

// ---------------------------------------------------------------------------
// Internal analysis shared with `validate`.

export type PieceKind = 'wall' | 'edge' | 'open';

/** A maximal run of unit grid edges with the same classification. */
export interface Piece {
  orient: Orient;
  /** Line index (into xs for NS, ys for EW). */
  line: number;
  /** Index range along the line (into ys for NS, xs for EW). */
  from: number;
  to: number;
  /** Space indexes on the [west|south, east|north] side, -1 = nothing. */
  sides: [number, number];
  kind: PieceKind;
  exterior: boolean;
  wallId: string | null;
}

export interface PlacedOpening {
  opening: Opening;
  levelIndex: number;
  orient: Orient;
  line: number;
  lo: number;
  hi: number;
  piece: Piece;
  /** The edge and span the host resolved to. */
  span: HostSpan;
  resolved: ResolvedOpening;
}

export interface LevelCtx {
  index: number;
  level: Level;
  /** cell key -> index into level.spaces of the first space covering it. */
  owner: Int32Array;
  spaceCells: Set<number>[];
  spaceIndex: Map<string, number>;
  pieces: Piece[];
  placed: PlacedOpening[];
}

export interface Analysis {
  grid: Grid;
  ctxs: LevelCtx[];
  resolved: ResolvedHouse;
  /** Problems found while resolving (openings that cannot be placed,
   *  misaligned stairs). `validate` reports them. */
  problems: Issue[];
}

/**
 * The half of a stairwell that holds the first flight (ResolvedStair.firstHalf):
 * the side the stair space is entered from. Its long sides (parallel to the
 * flights) are weighed: open boundaries to the spaces it is open to and
 * doors in its walls, by length, at their position across the well. With no
 * entry on a long side (or one on each, balanced), the half the stair space
 * sits in, as before.
 */
function stairFirstHalf(grid: Grid, ctx: LevelCtx, st: Stair, cells: Set<number>, wellCells: Set<number>, openings: readonly ResolvedOpening[]): -1 | 1 {
  const ns = st.up === 'N' || st.up === 'S';
  const box = (set: Set<number>) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const k of set) {
      const i = k % grid.nx, j = Math.floor(k / grid.nx);
      x0 = Math.min(x0, grid.xs[i]!); x1 = Math.max(x1, grid.xs[i + 1]!);
      y0 = Math.min(y0, grid.ys[j]!); y1 = Math.max(y1, grid.ys[j + 1]!);
    }
    return [x0, y0, x1, y1] as const;
  };
  const w = box(wellCells);
  const mid = ns ? (w[0] + w[2]) / 2 : (w[1] + w[3]) / 2;
  const si = ctx.spaceIndex.get(st.space);
  const open = openToPairs(ctx.level);
  let weight = 0, sum = 0;
  // Open boundaries: a stair cell next to a cell of a space it is open to, across the flights.
  for (const k of cells) {
    const i = k % grid.nx, j = Math.floor(k / grid.nx);
    const steps: [number, number][] = ns ? [[-1, 0], [1, 0]] : [[0, -1], [0, 1]];
    for (const [di, dj] of steps) {
      const ni = i + di, nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= grid.nx || nj >= grid.ny) continue;
      const o = ctx.owner[cellKey(grid, ni, nj)]!;
      if (o < 0 || o === si) continue;
      const other = ctx.level.spaces[o]!;
      if (!open.has(pairKey(st.space, other.id))) continue;
      const len = ns ? grid.ys[j + 1]! - grid.ys[j]! : grid.xs[i + 1]! - grid.xs[i]!;
      const at = ns ? grid.xs[di < 0 ? i : i + 1]! : grid.ys[dj < 0 ? j : j + 1]!;
      weight += len;
      sum += len * at;
    }
  }
  // Doors in the stair space's walls along the flights.
  for (const op of openings) {
    if (op.kind === 'window' || !op.sides.includes(st.space)) continue;
    if (ns ? op.orient !== 'NS' : op.orient !== 'EW') continue;
    weight += op.width;
    sum += op.width * (ns ? op.center[0] : op.center[1]);
  }
  if (weight > 0) {
    const at = sum / weight;
    if (at < mid - 1) return -1;
    if (at > mid + 1) return 1;
  }
  const own = box(cells);
  const c = ns ? (own[0] + own[2]) / 2 : (own[1] + own[3]) / 2;
  return c < mid - 1 ? -1 : 1;
}

const pairKey = (a: string, b: string) => (a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`);

function openToPairs(level: Level): Set<string> {
  const s = new Set<string>();
  for (const sp of level.spaces) for (const o of sp.openTo ?? []) s.add(pairKey(sp.id, o));
  return s;
}

function buildPieces(grid: Grid, level: Level, owner: Int32Array): Piece[] {
  const open = openToPairs(level);
  const own = (i: number, j: number) =>
    i < 0 || j < 0 || i >= grid.nx || j >= grid.ny ? -1 : owner[cellKey(grid, i, j)]!;
  const classify = (a: number, b: number): { kind: PieceKind; exterior: boolean } | null => {
    if (a === b) return null;
    const sa = a >= 0 ? level.spaces[a]! : null;
    const sb = b >= 0 ? level.spaces[b]! : null;
    const ia = sa !== null && !isOutdoorType(sa.type);
    const ib = sb !== null && !isOutdoorType(sb.type);
    if (sa && sb && open.has(pairKey(sa.id, sb.id))) return { kind: 'open', exterior: false };
    if (ia && ib) return { kind: 'wall', exterior: false };
    if (ia || ib) return { kind: 'wall', exterior: true };
    if (sa && sb) return { kind: 'open', exterior: false };
    return { kind: 'edge', exterior: false };
  };
  const pieces: Piece[] = [];
  const scan = (orient: Orient) => {
    const lines = orient === 'NS' ? grid.nx + 1 : grid.ny + 1;
    const along = orient === 'NS' ? grid.ny : grid.nx;
    for (let line = 0; line < lines; line++) {
      let cur: Piece | null = null;
      for (let t = 0; t < along; t++) {
        const [a, b] = orient === 'NS' ? [own(line - 1, t), own(line, t)] : [own(t, line - 1), own(t, line)];
        const c = classify(a, b);
        if (c && cur && cur.to === t && cur.kind === c.kind && cur.sides[0] === a && cur.sides[1] === b) {
          cur.to = t + 1;
          continue;
        }
        if (cur) { pieces.push(cur); cur = null; }
        if (c) cur = { orient, line, from: t, to: t + 1, sides: [a, b], kind: c.kind, exterior: c.exterior, wallId: null };
      }
      if (cur) pieces.push(cur);
    }
  };
  scan('NS');
  scan('EW');
  return pieces;
}

function piecePoints(grid: Grid, p: Piece): [Point, Point] {
  if (p.orient === 'NS') {
    const x = grid.xs[p.line]!;
    return [[x, grid.ys[p.from]!], [x, grid.ys[p.to]!]];
  }
  const y = grid.ys[p.line]!;
  return [[grid.xs[p.from]!, y], [grid.xs[p.to]!, y]];
}

function pieceId(grid: Grid, levelId: string, p: Piece): string {
  const lineId = p.orient === 'NS' ? grid.xIds[p.line]! : grid.yIds[p.line]!;
  const ids = p.orient === 'NS' ? grid.yIds : grid.xIds;
  return `${levelId}:${lineId}:${ids[p.from]!}-${ids[p.to]!}`;
}

/** Position range (mm) of a piece along its line. */
function pieceRange(grid: Grid, p: Piece): [number, number] {
  const pos = p.orient === 'NS' ? grid.ys : grid.xs;
  return [pos[p.from]!, pos[p.to]!];
}

/** A maximal run of boundary along one grid line. */
export interface Run {
  orient: Orient;
  /** Line index (into xs for NS, ys for EW). */
  line: number;
  /** Index range along the line (into ys for NS, xs for EW). */
  from: number;
  to: number;
  /** Position range along the line, mm. */
  lo: number;
  hi: number;
}

/** Maximal runs of the boundary of `cells` facing `side`. */
function sideRuns(grid: Grid, cells: ReadonlySet<number>, side: Side): Run[] {
  const has = (i: number, j: number) =>
    i >= 0 && j >= 0 && i < grid.nx && j < grid.ny && cells.has(cellKey(grid, i, j));
  const runs: Run[] = [];
  const horizontal = side === 'N' || side === 'S';
  const lines = horizontal ? grid.ny + 1 : grid.nx + 1;
  const along = horizontal ? grid.nx : grid.ny;
  const pos = horizontal ? grid.xs : grid.ys;
  for (let line = 0; line < lines; line++) {
    let start = -1;
    for (let t = 0; t <= along; t++) {
      let on = false;
      if (t < along) {
        if (side === 'N') on = has(t, line - 1) && !has(t, line);
        else if (side === 'S') on = has(t, line) && !has(t, line - 1);
        else if (side === 'E') on = has(line - 1, t) && !has(line, t);
        else on = has(line, t) && !has(line - 1, t);
      }
      if (on && start < 0) start = t;
      if (!on && start >= 0) {
        runs.push({ orient: horizontal ? 'EW' : 'NS', line, from: start, to: t, lo: pos[start]!, hi: pos[t]! });
        start = -1;
      }
    }
  }
  return runs;
}

/** Maximal runs of the shared boundary between two cell sets. */
function sharedRuns(grid: Grid, a: ReadonlySet<number>, b: ReadonlySet<number>): Run[] {
  const runs: Run[] = [];
  const inSet = (s: ReadonlySet<number>, i: number, j: number) =>
    i >= 0 && j >= 0 && i < grid.nx && j < grid.ny && s.has(cellKey(grid, i, j));
  const shared = (orient: Orient, line: number, t: number) => {
    const [p, q]: [number, number][] = orient === 'NS' ? [[line - 1, t], [line, t]] : [[t, line - 1], [t, line]];
    return (inSet(a, ...p!) && inSet(b, ...q!)) || (inSet(b, ...p!) && inSet(a, ...q!));
  };
  for (const orient of ['NS', 'EW'] as const) {
    const lines = orient === 'NS' ? grid.nx + 1 : grid.ny + 1;
    const along = orient === 'NS' ? grid.ny : grid.nx;
    const pos = orient === 'NS' ? grid.ys : grid.xs;
    for (let line = 0; line < lines; line++) {
      let start = -1;
      for (let t = 0; t <= along; t++) {
        const on = t < along && shared(orient, line, t);
        if (on && start < 0) start = t;
        if (!on && start >= 0) { runs.push({ orient, line, from: start, to: t, lo: pos[start]!, hi: pos[t]! }); start = -1; }
      }
    }
  }
  return runs;
}

export function areAdjacent(grid: Grid, a: ReadonlySet<number>, b: ReadonlySet<number>): boolean {
  return sharedRuns(grid, a, b).length > 0;
}

const EPS = 0.5;
const fmt = (n: number) => `${Math.round(n)}`;

/** Grid ids of a run's line and of the lines at its ends. */
export function runIds(grid: Grid, r: { orient: Orient; line: number; from: number; to: number }): { line: string; from: string; to: string } {
  const along = r.orient === 'NS' ? grid.yIds : grid.xIds;
  return { line: r.orient === 'NS' ? grid.xIds[r.line]! : grid.yIds[r.line]!, from: along[r.from]!, to: along[r.to]! };
}

/** "1-3 on line K (3700 mm)" for each run. */
export function describeSpans(grid: Grid, runs: readonly Run[]): string {
  return runs.map((r) => {
    const ids = runIds(grid, r);
    return `${ids.from}-${ids.to} on line ${ids.line} (${fmt(r.hi - r.lo)} mm)`;
  }).join('; ');
}

/** Human description of an opening host, e.g. 'the N side of "gf-senior"'. */
export function hostText(host: OpeningHost): string {
  return 'space' in host ? `the ${host.side} side of "${host.space}"` : `the wall between "${host.between[0]}" and "${host.between[1]}"`;
}

/** Boundary runs a host refers to (all edges on that side, or all shared
 *  boundaries), or null when a space is unknown on this level. */
export function hostRuns(grid: Grid, ctx: LevelCtx, host: OpeningHost): Run[] | null {
  if ('space' in host) {
    const si = ctx.spaceIndex.get(host.space);
    if (si === undefined) return null;
    return sideRuns(grid, ctx.spaceCells[si]!, host.side);
  }
  const ia = ctx.spaceIndex.get(host.between[0]);
  const ib = ctx.spaceIndex.get(host.between[1]);
  if (ia === undefined || ib === undefined) return null;
  return sharedRuns(grid, ctx.spaceCells[ia]!, ctx.spaceCells[ib]!);
}

export interface HostSpan {
  run: Run;
  /** Span index range along the run's line and its position range (mm). */
  from: number;
  to: number;
  s0: number;
  s1: number;
}

/**
 * Resolve the edge an opening host names: the given span (which must lie on
 * one edge of that side / shared boundary), or the only edge when the span
 * is omitted. Returns null when a referenced space or grid line is unknown
 * (reference checks report those), or a problem (code + message tail).
 */
export function resolveHostSpan(grid: Grid, ctx: LevelCtx, host: OpeningHost): HostSpan | { code: string; message: string } | null {
  const runs = hostRuns(grid, ctx, host);
  if (!runs) return null;
  const where = hostText(host);
  if (runs.length === 0) {
    return 'space' in host
      ? { code: 'opening-off-edge', message: `is on ${where}, but that space has no ${host.side}-facing boundary.` }
      : { code: 'opening-not-adjacent', message: `is on ${where}, but these spaces share no boundary on level "${ctx.level.id}". Host it on a space side instead, or pick two spaces that touch.` };
  }
  const listing = `Edges of ${where}: ${describeSpans(grid, runs)}.`;
  if (!host.span) {
    if (runs.length > 1) {
      const ex = runIds(grid, runs[0]!);
      return {
        code: 'ambiguous-host',
        message: `is on ${where}, which has ${runs.length} separate edges, so the host is ambiguous. Add span to name one. ${listing} Example: "span": {"from": "${ex.from}", "to": "${ex.to}"}.`,
      };
    }
    const run = runs[0]!;
    return { run, from: run.from, to: run.to, s0: run.lo, s1: run.hi };
  }
  const { from, to } = host.span;
  const lookup = (orient: Orient) => {
    const index = orient === 'NS' ? grid.yIndex : grid.xIndex;
    const a = index.get(from);
    const b = index.get(to);
    return a === undefined || b === undefined ? null : [Math.min(a, b), Math.max(a, b)] as const;
  };
  const orients: Orient[] = 'space' in host ? [host.side === 'N' || host.side === 'S' ? 'EW' : 'NS'] : ['NS', 'EW'];
  if (orients.every((o) => lookup(o) === null)) return null;
  if (orients.every((o) => { const r = lookup(o); return r === null || r[0] === r[1]; })) {
    return { code: 'opening-span', message: `has span ${from}-${to}, whose two lines are at the same position. A span needs two different grid lines. ${listing}` };
  }
  let matches = runs.filter((r) => {
    const s = lookup(r.orient);
    return s !== null && r.from <= s[0] && s[1] <= r.to;
  });
  if (matches.length === 0) {
    return {
      code: 'opening-span',
      message: `has span ${from}-${to}, which is not (entirely) on ${where}. ${listing} Use one of these spans, or a part of one between two grid lines.`,
    };
  }
  if (matches.length > 1 && 'space' in host) matches = outermost(matches, host.side, grid);
  const run = matches[0]!;
  const s = lookup(run.orient)!;
  const pos = run.orient === 'NS' ? grid.ys : grid.xs;
  return { run, from: s[0], to: s[1], s0: pos[s[0]]!, s1: pos[s[1]]! };
}

function outermost(runs: Run[], side: Side, grid: Grid): Run[] {
  if (runs.length === 0) return runs;
  const linePos = (r: Run) => (r.orient === 'NS' ? grid.xs[r.line]! : grid.ys[r.line]!);
  const sign = side === 'N' || side === 'E' ? 1 : -1;
  const best = Math.max(...runs.map((r) => sign * linePos(r)));
  return runs.filter((r) => sign * linePos(r) === best);
}

function placeOpening(grid: Grid, ctx: LevelCtx, o: Opening, problems: Issue[]): PlacedOpening | null {
  const where = { level: ctx.level.id, opening: o.id };
  const hs = resolveHostSpan(grid, ctx, o.host);
  if (hs === null) return null; // reported by reference checks
  if ('code' in hs) {
    problems.push({ code: hs.code, severity: 'error', message: `Opening "${o.id}" ${hs.message}`, where });
    return null;
  }
  const { run, s0, s1 } = hs;
  const facing: Side | undefined = 'space' in o.host ? o.host.side : undefined;
  let lo: number;
  let hi: number;
  if (o.at === 'center') { const c = (s0 + s1) / 2; lo = c - o.width / 2; hi = c + o.width / 2; }
  else if (o.at.from === 'start') { lo = s0 + o.at.offset; hi = lo + o.width; }
  else { hi = s1 - o.at.offset; lo = hi - o.width; }
  if (lo < s0 - EPS || hi > s1 + EPS) {
    const len = s1 - s0;
    const ids = runIds(grid, { ...run, from: hs.from, to: hs.to });
    problems.push({
      code: 'opening-off-edge', severity: 'error',
      message: `Opening "${o.id}" (${fmt(lo)}..${fmt(hi)}) runs past its span ${ids.from}-${ids.to} on ${hostText(o.host)} (${fmt(s0)}..${fmt(s1)}, ${fmt(len)} mm long). ${o.width > len ? `The span is shorter than the opening; make it at most ${fmt(len)} mm wide or use a longer span.` : `For width ${fmt(o.width)} the offset must be between 0 and ${fmt(len - o.width)}.`}`,
      where,
    });
    return null;
  }
  const linePieces = ctx.pieces.filter((p) => p.orient === run.orient && p.line === run.line);
  const piece = linePieces.find((p) => {
    const [plo, phi] = pieceRange(grid, p);
    return plo <= lo + EPS && hi <= phi + EPS;
  });
  if (!piece) {
    const touched = linePieces.filter((p) => {
      const [plo, phi] = pieceRange(grid, p);
      return plo < hi - EPS && lo + EPS < phi;
    });
    const sid = (n: number) => (n >= 0 ? ctx.level.spaces[n]!.id : 'outside');
    const segs = touched.map((p) => {
      const ids = runIds(grid, p);
      const [a, b] = pieceRange(grid, p);
      return `${ids.from}-${ids.to} ${fmt(a)}..${fmt(b)} (${sid(p.sides[0])} | ${sid(p.sides[1])})`;
    });
    problems.push({
      code: 'opening-too-wide', severity: 'error',
      message: `Opening "${o.id}" (width ${fmt(o.width)}, ${fmt(lo)}..${fmt(hi)} on line ${runIds(grid, run).line}) crosses ${touched.length} wall segments: ${segs.join(', ')}. A wall is split wherever the space on either side changes, and an opening must fit inside one segment. Narrow or move it so it lies within one of those ranges.`,
      where,
    });
    return null;
  }
  if (piece.kind !== 'wall' && o.kind !== 'void') {
    problems.push({ code: 'opening-no-wall', severity: 'error', message: `Opening "${o.id}" (${o.kind}) is on a boundary with no wall (${piece.kind === 'open' ? 'the spaces are open to each other' : 'an outdoor edge'}). Use kind "void" or move it to a wall.`, where });
    return null;
  }
  const linePos = run.orient === 'NS' ? grid.xs[run.line]! : grid.ys[run.line]!;
  const pa: Point = run.orient === 'NS' ? [linePos, lo] : [lo, linePos];
  const pb: Point = run.orient === 'NS' ? [linePos, hi] : [hi, linePos];
  const sideId = (n: number) => (n >= 0 ? ctx.level.spaces[n]!.id : null);
  const resolved: ResolvedOpening = {
    id: o.id,
    kind: o.kind,
    wall: piece.kind === 'wall' ? piece.wallId : null,
    orient: run.orient,
    a: pa,
    b: pb,
    center: [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2],
    width: o.width,
    height: o.height,
    sill: o.sill,
    spanLevels: o.spanLevels ?? 1,
    sides: [sideId(piece.sides[0]), sideId(piece.sides[1])],
  };
  if (o.insert) resolved.insert = o.insert;
  if (o.canopy) resolved.canopy = o.canopy;
  if (o.panel) resolved.panel = o.panel;
  if (facing) resolved.facing = facing;
  if (o.kind === 'door') {
    const swing = o.swing ? { ...o.swing, inferred: false } : inferSwing(grid, ctx, piece, lo, hi);
    if (swing) resolved.swing = swing;
  }
  return { opening: o, levelIndex: ctx.index, orient: run.orient, line: run.line, lo, hi, piece, span: hs, resolved };
}

const CIRCULATION: ReadonlySet<SpaceType> = new Set(['hall', 'stair']);

/** Swing into the room: the interior side; between two interior spaces the
 *  one that is not circulation, else the smaller. Hinge at the end of the
 *  opening nearer the end of its wall segment (a corner). */
function inferSwing(grid: Grid, ctx: LevelCtx, piece: Piece, lo: number, hi: number): (DoorSwing & { inferred: boolean }) | null {
  const cand = piece.sides.filter((n) => n >= 0 && !isOutdoorType(ctx.level.spaces[n]!.type));
  if (cand.length === 0) return null;
  let into = cand[0]!;
  if (cand.length === 2) {
    const [a, b] = cand as [number, number];
    const ca = CIRCULATION.has(ctx.level.spaces[a]!.type);
    const cb = CIRCULATION.has(ctx.level.spaces[b]!.type);
    if (ca !== cb) into = ca ? b : a;
    else into = setArea(grid, ctx.spaceCells[a]!) <= setArea(grid, ctx.spaceCells[b]!) ? a : b;
  }
  const [plo, phi] = pieceRange(grid, piece);
  return { into: ctx.level.spaces[into]!.id, hinge: lo - plo <= phi - hi ? 'start' : 'end', inferred: true };
}

function ringsOrEmpty(grid: Grid, cells: ReadonlySet<number>): Point[][] {
  return cells.size ? rings(grid, cells) : [];
}

/** Internal: resolve and collect placement problems. */
export function analyse(house: House): Analysis {
  const grid = buildGrid(house);
  const problems: Issue[] = [];
  const ctxs: LevelCtx[] = house.levels.map((level, index) => {
    const owner = new Int32Array(grid.nx * grid.ny).fill(-1);
    const spaceCells = level.spaces.map((s) => cellsOf(grid, s.cells));
    spaceCells.forEach((cells, si) => {
      for (const k of cells) if (owner[k] === -1) owner[k] = si;
    });
    const spaceIndex = new Map<string, number>();
    level.spaces.forEach((s, i) => { if (!spaceIndex.has(s.id)) spaceIndex.set(s.id, i); });
    const pieces = buildPieces(grid, level, owner);
    for (const p of pieces) if (p.kind === 'wall') p.wallId = pieceId(grid, level.id, p);
    return { index, level, owner, spaceCells, spaceIndex, pieces, placed: [] };
  });

  let elevation = 0;
  const levels: ResolvedLevel[] = ctxs.map((ctx) => {
    const { level } = ctx;
    const spaces: ResolvedSpace[] = level.spaces.map((s, si) => {
      const cells = ctx.spaceCells[si]!;
      const rs = ringsOrEmpty(grid, cells);
      const outers = rs.filter((r) => signedArea(r) > 0).sort((a, b) => signedArea(b) - signedArea(a));
      const out: ResolvedSpace = {
        id: s.id, name: s.name, type: s.type, outdoor: isOutdoorType(s.type),
        polygon: outers[0] ?? [], rings: rs, area: setArea(grid, cells),
      };
      if (s.nameEn) out.nameEn = s.nameEn;
      if (s.edge) out.edge = s.edge;
      if (s.cover) out.cover = s.cover;
      if (s.surface) out.surface = s.surface;
      return out;
    });
    const sid = (n: number) => (n >= 0 ? level.spaces[n]!.id : null);
    const walls: ResolvedWall[] = [];
    const edges: ResolvedEdge[] = [];
    for (const p of ctx.pieces) {
      const [a, b] = piecePoints(grid, p);
      const line = p.orient === 'NS' ? grid.xIds[p.line]! : grid.yIds[p.line]!;
      if (p.kind === 'wall') {
        walls.push({
          id: p.wallId!, orient: p.orient, line, a, b,
          length: Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1]),
          thickness: p.exterior ? EXTERIOR_WALL_THICKNESS : INTERIOR_WALL_THICKNESS,
          exterior: p.exterior, sides: [sid(p.sides[0]), sid(p.sides[1])],
        });
      } else if (p.kind === 'edge') {
        const si = p.sides[0] >= 0 ? p.sides[0] : p.sides[1];
        const sp = level.spaces[si]!;
        edges.push({ id: pieceId(grid, level.id, p), orient: p.orient, line, a, b, space: sp.id, treatment: sp.edge ?? 'none' });
      }
    }
    const openings: ResolvedOpening[] = [];
    for (const o of level.openings) {
      const placed = placeOpening(grid, ctx, o, problems);
      if (placed) { ctx.placed.push(placed); openings.push(placed.resolved); }
    }
    const allCells = new Set<number>();
    const interiorCells = new Set<number>();
    level.spaces.forEach((s, si) => {
      for (const k of ctx.spaceCells[si]!) {
        allCells.add(k);
        if (!isOutdoorType(s.type)) interiorCells.add(k);
      }
    });
    const stairs: ResolvedStair[] = level.stairs.map((st) => ({
      id: st.id, space: st.space, kind: st.kind, up: st.up,
      toLevel: house.levels[ctx.index + 1]?.id ?? null,
      firstHalf: 1,
    }));
    const rl: ResolvedLevel = {
      id: level.id, name: level.name, index: ctx.index, elevation, height: level.height,
      spaces, walls, edges, openings, stairs,
      slab: ringsOrEmpty(grid, allCells), slabOpenings: [],
      interiorArea: setArea(grid, interiorCells),
    };
    elevation += level.height;
    return rl;
  });

  // Stair openings in the slab above: the stair-type spaces on the next level
  // that overlap the stair's space (the stairwell), or the stair space itself.
  ctxs.forEach((ctx) => {
    for (const st of ctx.level.stairs) {
      const si = ctx.spaceIndex.get(st.space);
      if (si === undefined) continue;
      const cells = ctx.spaceCells[si]!;
      const upper = ctxs[ctx.index + 1];
      if (!upper) continue;
      const well = new Set<number>();
      upper.level.spaces.forEach((s, ui) => {
        if (s.type !== 'stair') return;
        const uc = upper.spaceCells[ui]!;
        if ([...cells].some((k) => uc.has(k))) for (const k of uc) well.add(k);
      });
      const holeCells = well.size ? well : cells;
      levels[upper.index]!.slabOpenings.push({ stair: st.id, rings: rings(grid, holeCells) });
      const rs = levels[ctx.index]!.stairs.find((x) => x.id === st.id);
      if (rs) rs.firstHalf = stairFirstHalf(grid, ctx, st, cells, holeCells, levels[ctx.index]!.openings);
    }
  });

  const roofs: ResolvedRoof[] = house.roofs.map((r) => {
    const cells = cellsOf(grid, r.cells);
    const out: ResolvedRoof = {
      id: r.id, kind: r.kind, onLevel: r.onLevel,
      rings: ringsOrEmpty(grid, cells), bbox: bboxOf(grid, cells),
      eaveOffset: r.eaveOffset ?? 0, overhang: r.overhang, skylights: r.skylights ?? [],
    };
    if (r.pitchDeg !== undefined) out.pitchDeg = r.pitchDeg;
    if (r.fall) out.fall = r.fall;
    if (r.ridge) out.ridge = r.ridge;
    if (r.vergeOverhang !== undefined) out.vergeOverhang = r.vergeOverhang;
    if (r.kind === 'canopy') {
      const lvl = house.levels.find((l) => l.id === r.onLevel);
      out.height = r.height ?? (lvl ? lvl.height - CANOPY_DROP : 0);
    }
    return out;
  });
  // `cover: 'canopy'` is shorthand for a canopy over the whole space.
  ctxs.forEach((ctx) => {
    ctx.level.spaces.forEach((s, si) => {
      if (s.cover !== 'canopy' || !isOutdoorType(s.type)) return;
      const cells = ctx.spaceCells[si]!;
      roofs.push({
        id: `${s.id}:canopy`, kind: 'canopy', onLevel: ctx.level.id, fromSpace: s.id,
        height: ctx.level.height - CANOPY_DROP,
        rings: ringsOrEmpty(grid, cells), bbox: bboxOf(grid, cells),
        eaveOffset: 0, overhang: 0, skylights: [],
      });
    });
  });

  const resolved: ResolvedHouse = {
    name: house.name,
    site: house.site,
    grid: {
      x: grid.xs.map((pos, i) => ({ id: grid.xIds[i]!, pos })),
      y: grid.ys.map((pos, i) => ({ id: grid.yIds[i]!, pos })),
    },
    levels,
    roofs,
    entourage: house.entourage ?? [],
    interiorArea: levels.reduce((s, l) => s + l.interiorArea, 0),
    style: house.style,
  };
  return { grid, ctxs, resolved, problems };
}

/**
 * Resolve an authored house into derived elements. Assumes the house passed
 * schema validation; openings that cannot be placed are left out (run
 * `validate` to learn why).
 */
export function resolve(house: House): ResolvedHouse {
  return analyse(house).resolved;
}
