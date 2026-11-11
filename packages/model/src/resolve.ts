// Resolver: authored model -> derived elements (space polygons, walls,
// openings on concrete walls, slabs, stair openings). Pure and deterministic.
import { EXTERIOR_WALL_THICKNESS, INTERIOR_WALL_THICKNESS } from './constants';
import {
  bboxOf, buildGrid, cellKey, cellsOf, rings, setArea, signedArea,
  type Grid, type Point,
} from './grid';
import type { Issue } from './issues';
import {
  isOutdoorType, type House, type Level, type Opening, type Roof, type Side,
  type Space, type SpaceType, type Stair,
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
  /** Space ids on the [west|south, east|north] side. */
  sides: [string | null, string | null];
  /** Outward direction when hosted on a space side. */
  facing?: Side;
}

export interface ResolvedStair {
  id: string;
  space: string;
  kind: Stair['kind'];
  up: Side;
  /** Level the stair arrives at, or null when there is none (invalid). */
  toLevel: string | null;
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
  rings: Point[][];
  bbox: { x0: number; x1: number; y0: number; y1: number } | null;
  pitchDeg?: number;
  fall?: Side;
  ridge?: Roof['ridge'];
  eaveOffset: number;
  overhang: number;
  skylights: NonNullable<Roof['skylights']>;
}

export interface ResolvedHouse {
  name: string;
  site: House['site'];
  grid: { x: { id: string; pos: number }[]; y: { id: string; pos: number }[] };
  levels: ResolvedLevel[];
  roofs: ResolvedRoof[];
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

interface Run { orient: Orient; line: number; lo: number; hi: number }

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
        runs.push({ orient: horizontal ? 'EW' : 'NS', line, lo: pos[start]!, hi: pos[t]! });
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
        if (!on && start >= 0) { runs.push({ orient, line, lo: pos[start]!, hi: pos[t]! }); start = -1; }
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
const describeRuns = (grid: Grid, runs: Run[]) =>
  runs.map((r) => `${r.orient === 'NS' ? `x=${fmt(grid.xs[r.line]!)}` : `y=${fmt(grid.ys[r.line]!)}`} from ${fmt(r.lo)} to ${fmt(r.hi)}`).join('; ');

function outermost(runs: Run[], side: Side, grid: Grid): Run[] {
  if (runs.length === 0) return runs;
  const linePos = (r: Run) => (r.orient === 'NS' ? grid.xs[r.line]! : grid.ys[r.line]!);
  const sign = side === 'N' || side === 'E' ? 1 : -1;
  const best = Math.max(...runs.map((r) => sign * linePos(r)));
  return runs.filter((r) => sign * linePos(r) === best);
}

function placeOpening(grid: Grid, ctx: LevelCtx, o: Opening, problems: Issue[]): PlacedOpening | null {
  const where = { level: ctx.level.id, opening: o.id };
  let runs: Run[];
  let lo: number;
  let hi: number;
  let run: Run | undefined;
  let facing: Side | undefined;
  if ('space' in o.host) {
    const si = ctx.spaceIndex.get(o.host.space);
    if (si === undefined) return null; // reported by reference checks
    const cells = ctx.spaceCells[si]!;
    const side = o.host.side;
    facing = side;
    runs = sideRuns(grid, cells, side);
    const bb = bboxOf(grid, cells);
    if (!bb || runs.length === 0) {
      problems.push({ code: 'opening-off-edge', severity: 'error', message: `Opening "${o.id}" is on the ${side} side of "${o.host.space}", but that space has no ${side}-facing boundary.`, where });
      return null;
    }
    const [bmin, bmax] = side === 'N' || side === 'S' ? [bb.x0, bb.x1] : [bb.y0, bb.y1];
    if (o.at === 'center') {
      const outer = outermost(runs, side, grid).sort((a, b) => (b.hi - b.lo) - (a.hi - a.lo));
      run = outer[0]!;
      const c = (run.lo + run.hi) / 2;
      lo = c - o.width / 2; hi = c + o.width / 2;
    } else {
      if (o.at.from === 'start') { lo = bmin + o.at.offset; hi = lo + o.width; }
      else { hi = bmax - o.at.offset; lo = hi - o.width; }
      const fits = runs.filter((r) => r.lo <= lo + EPS && hi <= r.hi + EPS);
      run = outermost(fits, side, grid)[0];
      if (!run) {
        problems.push({
          code: 'opening-off-edge', severity: 'error',
          message: `Opening "${o.id}" (${fmt(lo)}..${fmt(hi)} along the ${side} side of "${o.host.space}", offset measured from the space's ${o.at.from === 'start' ? (side === 'N' || side === 'S' ? 'west' : 'south') : (side === 'N' || side === 'S' ? 'east' : 'north')} extent) does not fit on any ${side}-facing edge. Available ${side} edges: ${describeRuns(grid, runs)}. Change offset or width.`,
          where,
        });
        return null;
      }
    }
  } else {
    const [a, b] = o.host.between;
    const ia = ctx.spaceIndex.get(a);
    const ib = ctx.spaceIndex.get(b);
    if (ia === undefined || ib === undefined) return null;
    runs = sharedRuns(grid, ctx.spaceCells[ia]!, ctx.spaceCells[ib]!).sort((p, q) => (q.hi - q.lo) - (p.hi - p.lo));
    run = runs[0];
    if (!run) {
      problems.push({ code: 'opening-not-adjacent', severity: 'error', message: `Opening "${o.id}" is between "${a}" and "${b}", but these spaces share no boundary on level "${ctx.level.id}". Host it on a space side instead, or pick adjacent spaces.`, where });
      return null;
    }
    if (o.at === 'center') { const c = (run.lo + run.hi) / 2; lo = c - o.width / 2; hi = c + o.width / 2; }
    else if (o.at.from === 'start') { lo = run.lo + o.at.offset; hi = lo + o.width; }
    else { hi = run.hi - o.at.offset; lo = hi - o.width; }
    if (lo < run.lo - EPS || hi > run.hi + EPS) {
      problems.push({ code: 'opening-off-edge', severity: 'error', message: `Opening "${o.id}" (${fmt(lo)}..${fmt(hi)}) runs past the shared boundary of "${a}" and "${b}" (${describeRuns(grid, [run])}). Reduce width or offset.`, where });
      return null;
    }
  }
  const linePieces = ctx.pieces.filter((p) => p.orient === run!.orient && p.line === run!.line);
  const piece = linePieces.find((p) => {
    const [plo, phi] = pieceRange(grid, p);
    return plo <= lo + EPS && hi <= phi + EPS;
  });
  if (!piece) {
    const touched = linePieces.filter((p) => {
      const [plo, phi] = pieceRange(grid, p);
      return plo < hi - EPS && lo + EPS < phi;
    });
    const longest = Math.max(0, ...touched.map((p) => { const [a, b] = pieceRange(grid, p); return b - a; }));
    problems.push({
      code: 'opening-too-wide', severity: 'error',
      message: `Opening "${o.id}" (width ${fmt(o.width)}, ${fmt(lo)}..${fmt(hi)}) spans ${touched.length} wall segments; an opening must sit on one segment between the same two spaces. The longest segment there is ${fmt(longest)} mm. Make it narrower or move it.`,
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
  if (facing) resolved.facing = facing;
  return { opening: o, levelIndex: ctx.index, orient: run.orient, line: run.line, lo, hi, piece, resolved };
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
    return out;
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
