// Validation: schema, references, geometry and building rules. Every issue
// message says what is wrong and what to change, so an LLM can act on it.
import {
  MIN_BATHROOM_SHORT_SIDE, MIN_BEDROOM_SHORT_SIDE, MIN_DOOR_WIDTH,
  MIN_OPENING_GAP, MIN_STAIR_WIDTH, NEEDS_EXTERIOR_WINDOW,
} from './constants';
import {
  bboxOf, buildGrid, cellsLabel, cellsOf, componentCount, largestRect, rectIndex, setArea,
  type Grid,
} from './grid';
import type { Issue } from './issues';
import { analyse, areAdjacent, runIds, type Analysis, type LevelCtx, type Piece } from './resolve';
import { House, isOutdoorType, type CellRect } from './schema';

const m2 = (mm2: number) => `${(mm2 / 1e6).toFixed(2)} m²`;
const fmt = (n: number) => `${Math.round(n)}`;

/** Validate an authored house (any JSON). Returns all issues found. */
export function validate(input: unknown): Issue[] {
  const parsed = House.safeParse(input);
  if (!parsed.success) {
    return parsed.error.issues.map((i) => ({
      code: 'schema',
      severity: 'error' as const,
      message: `Schema error at ${i.path.length ? i.path.join('.') : '(root)'}: ${i.message}.`,
      where: { path: i.path.map((p) => (typeof p === 'number' ? p : String(p))) },
    }));
  }
  const house = parsed.data;
  const issues = checkReferences(house);
  if (issues.some((i) => i.severity === 'error')) return issues;
  const analysis = analyse(house);
  const found = suppressUnplacedNoise(analysis, [...analysis.problems, ...checkGeometry(house, analysis)]);
  return [...issues, ...suppressOverlapNoise(analysis, found)];
}

/**
 * An opening that cannot be placed is left out, so its spaces may look
 * windowless or unreachable. While any opening fails to place, drop
 * `unreachable` (it cascades through doors and stairs) and drop
 * `no-exterior-window` for the spaces that opening would serve.
 */
function suppressUnplacedNoise(an: Analysis, issues: Issue[]): Issue[] {
  const unplaced = new Set(an.problems.map((p) => p.where.opening).filter((id): id is string => id !== undefined));
  if (unplaced.size === 0) return issues;
  const served = new Set<string>();
  for (const ctx of an.ctxs) {
    for (const o of ctx.level.openings) {
      if (!unplaced.has(o.id)) continue;
      for (const s of 'space' in o.host ? [o.host.space] : o.host.between) served.add(`${ctx.level.id}\u0000${s}`);
    }
  }
  return issues.filter((i) => {
    if (i.code === 'unreachable') return false;
    if (i.code === 'no-exterior-window') return !served.has(`${i.where.level}\u0000${i.where.space}`);
    return true;
  });
}

/** Issue codes that an overlap cannot cause (kept when overlaps are reported). */
const OVERLAP_SAFE = new Set(['space-overlap', 'space-disconnected', 'roof-params', 'gate-off-fence', 'outdoor-only']);

/**
 * When spaces overlap, the cells go to the first listed space and the other
 * space's walls, openings and stairs come out wrong, which produces a cascade
 * of confusing follow-on errors. Report the overlap and drop issues located
 * on that level or the levels next to it (stairs, tall windows and supports
 * cross one level), plus all reachability issues, until it is fixed.
 */
function suppressOverlapNoise(an: Analysis, issues: Issue[]): Issue[] {
  const overlapping = an.ctxs.filter((ctx) => issues.some((i) => i.code === 'space-overlap' && i.where.level === ctx.level.id));
  if (overlapping.length === 0) return issues;
  const affected = new Set<string>();
  for (const ctx of overlapping) {
    for (const k of [-1, 0, 1]) {
      const near = an.ctxs[ctx.index + k];
      if (near) affected.add(near.level.id);
    }
  }
  return issues.filter((i) => {
    if (OVERLAP_SAFE.has(i.code)) return true;
    if (i.code === 'unreachable') return false;
    return !(i.where.level !== undefined && affected.has(i.where.level));
  });
}

// ---------------------------------------------------------------------------

function checkReferences(house: House): Issue[] {
  const issues: Issue[] = [];
  const err = (code: string, message: string, where: Issue['where']) => issues.push({ code, severity: 'error', message, where });
  const grid = buildGrid(house);

  const dupes = (ids: string[], what: string, where: (id: string) => Issue['where']) => {
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) err('duplicate-id', `Duplicate ${what} id "${id}". Ids must be unique; rename one of them.`, where(id));
      seen.add(id);
    }
  };
  dupes(house.grid.x.map((g) => g.id), 'X grid line', () => ({ path: ['grid', 'x'] }));
  dupes(house.grid.y.map((g) => g.id), 'Y grid line', () => ({ path: ['grid', 'y'] }));
  dupes(house.levels.map((l) => l.id), 'level', (id) => ({ level: id }));
  dupes(house.levels.flatMap((l) => l.spaces.map((s) => s.id)), 'space', (id) => ({ space: id }));
  dupes(house.levels.flatMap((l) => l.openings.map((o) => o.id)), 'opening', (id) => ({ opening: id }));
  dupes(house.levels.flatMap((l) => l.stairs.map((s) => s.id)), 'stair', (id) => ({ stair: id }));
  dupes(house.roofs.map((r) => r.id), 'roof', (id) => ({ roof: id }));
  dupes(house.site.fence?.gates.map((g) => g.id) ?? [], 'gate', (id) => ({ gate: id }));

  const xIds = house.grid.x.map((g) => g.id).join(', ');
  const yIds = house.grid.y.map((g) => g.id).join(', ');
  const checkRect = (r: CellRect, path: (string | number)[], where: Issue['where']) => {
    for (const k of ['x0', 'x1'] as const) {
      if (!grid.xIndex.has(r[k])) err('unknown-grid-line', `Unknown X grid line "${r[k]}" in ${k}. Known X lines: ${xIds}.`, { ...where, path: [...path, k] });
    }
    for (const k of ['y0', 'y1'] as const) {
      if (!grid.yIndex.has(r[k])) err('unknown-grid-line', `Unknown Y grid line "${r[k]}" in ${k}. Known Y lines: ${yIds}.`, { ...where, path: [...path, k] });
    }
    const ri = rectIndex(grid, r);
    if (!ri) return;
    const x0 = house.grid.x.find((g) => g.id === r.x0)!.pos;
    const x1 = house.grid.x.find((g) => g.id === r.x1)!.pos;
    const y0 = house.grid.y.find((g) => g.id === r.y0)!.pos;
    const y1 = house.grid.y.find((g) => g.id === r.y1)!.pos;
    if (x1 <= x0 || y1 <= y0) {
      err('empty-rect', `Cell rect ${r.x0}..${r.x1} x ${r.y0}..${r.y1} has zero or negative size (x ${fmt(x0)}..${fmt(x1)}, y ${fmt(y0)}..${fmt(y1)}). x1 must lie east of x0 and y1 north of y0.`, { ...where, path });
      return;
    }
    if (x0 < 0 || y0 < 0 || x1 > house.site.width || y1 > house.site.depth) {
      err('outside-plot', `Cell rect ${r.x0}..${r.x1} x ${r.y0}..${r.y1} (x ${fmt(x0)}..${fmt(x1)}, y ${fmt(y0)}..${fmt(y1)}) lies outside the ${fmt(house.site.width)} x ${fmt(house.site.depth)} plot.`, { ...where, path });
    }
  };

  const checkSpanIds = (id: string, host: House['levels'][number]['openings'][number]['host'], where: Issue['where']) => {
    const span = host.span!;
    const ids = [span.from, span.to];
    if ('space' in host) {
      const ew = host.side === 'N' || host.side === 'S';
      const [own, other] = ew ? [grid.xIndex, grid.yIndex] : [grid.yIndex, grid.xIndex];
      const axis = ew ? 'X' : 'Y';
      for (const g of ids) {
        if (own.has(g)) continue;
        err('unknown-grid-line', other.has(g)
          ? `Opening "${id}" has span ${span.from}-${span.to}, but "${g}" is a ${ew ? 'Y' : 'X'} grid line. The ${host.side} side of a space runs ${ew ? 'west-east' : 'south-north'}, so its span is between two ${axis} lines (${ew ? xIds : yIds}).`
          : `Opening "${id}" has span ${span.from}-${span.to}, but "${g}" is not a grid line. ${axis} lines: ${ew ? xIds : yIds}.`, where);
      }
    } else {
      const bothX = ids.every((g) => grid.xIndex.has(g));
      const bothY = ids.every((g) => grid.yIndex.has(g));
      if (!bothX && !bothY) {
        err('unknown-grid-line', `Opening "${id}" has span ${span.from}-${span.to}; both ends must be X grid lines (${xIds}) for a wall running west-east, or both Y grid lines (${yIds}) for a wall running south-north.`, where);
      }
    }
  };

  const levelIds = new Set(house.levels.map((l) => l.id));
  house.levels.forEach((level, li) => {
    const spaceIds = new Set(level.spaces.map((s) => s.id));
    const known = [...spaceIds].join(', ');
    level.spaces.forEach((s, si) => {
      const where = { level: level.id, space: s.id };
      s.cells.forEach((r, ci) => checkRect(r, ['levels', li, 'spaces', si, 'cells', ci], where));
      for (const o of s.openTo ?? []) {
        if (!spaceIds.has(o)) err('unknown-space', `Space "${s.id}" is openTo "${o}", which is not a space on level "${level.id}". Spaces here: ${known}.`, where);
        if (o === s.id) err('unknown-space', `Space "${s.id}" lists itself in openTo.`, where);
      }
      const outdoor = isOutdoorType(s.type);
      if (!outdoor && (s.edge !== undefined || s.cover !== undefined || s.surface !== undefined)) {
        issues.push({ code: 'outdoor-only', severity: 'warning', message: `Space "${s.id}" is ${s.type} (interior) but sets edge/cover/surface, which only apply to outdoor spaces; they are ignored.`, where });
      }
    });
    level.openings.forEach((o) => {
      const where = { level: level.id, opening: o.id };
      const refs = 'space' in o.host ? [o.host.space] : o.host.between;
      for (const r of refs) {
        if (!spaceIds.has(r)) err('unknown-space', `Opening "${o.id}" refers to space "${r}", which is not on level "${level.id}". Spaces here: ${known}.`, where);
      }
      if ('between' in o.host && o.host.between[0] === o.host.between[1]) err('unknown-space', `Opening "${o.id}" is between "${o.host.between[0]}" and itself.`, where);
      if (o.host.span) checkSpanIds(o.id, o.host, where);
    });
    level.stairs.forEach((st) => {
      if (!spaceIds.has(st.space)) err('unknown-space', `Stair "${st.id}" is in space "${st.space}", which is not on level "${level.id}". Spaces here: ${known}.`, { level: level.id, stair: st.id });
    });
  });
  house.roofs.forEach((r, ri) => {
    const where = { roof: r.id };
    if (!levelIds.has(r.onLevel)) err('unknown-level', `Roof "${r.id}" sits on level "${r.onLevel}", which does not exist. Levels: ${[...levelIds].join(', ')}.`, where);
    r.cells.forEach((c, ci) => checkRect(c, ['roofs', ri, 'cells', ci], where));
  });
  return issues;
}

// ---------------------------------------------------------------------------

function checkGeometry(house: House, an: Analysis): Issue[] {
  const issues: Issue[] = [];
  const { grid, ctxs } = an;
  const err = (code: string, message: string, where: Issue['where']) => issues.push({ code, severity: 'error', message, where });
  const warn = (code: string, message: string, where: Issue['where']) => issues.push({ code, severity: 'warning', message, where });

  for (const ctx of ctxs) {
    const { level } = ctx;
    // Overlaps.
    const reported = new Set<string>();
    level.spaces.forEach((a, ai) => {
      level.spaces.forEach((b, bi) => {
        if (bi <= ai) return;
        const common = [...ctx.spaceCells[ai]!].filter((k) => ctx.spaceCells[bi]!.has(k));
        if (common.length === 0) return;
        const key = `${a.id}|${b.id}`;
        if (reported.has(key)) return;
        reported.add(key);
        const cs = new Set(common);
        err('space-overlap', `Spaces "${a.id}" and "${b.id}" overlap on level "${level.id}" in cells ${cellsLabel(grid, cs)} (${m2(setArea(grid, cs))}). Each grid cell belongs to one space: remove those cells from one of them. Checks that depend on the layout of "${level.id}" (walls, openings, stairs, reachability) are skipped until this is fixed.`, { level: level.id, space: a.id });
      });
    });
    // Connectivity of each space.
    level.spaces.forEach((s, si) => {
      const n = componentCount(grid, ctx.spaceCells[si]!);
      if (n > 1) err('space-disconnected', `Space "${s.id}" consists of ${n} separate parts. Its cell rects must touch along an edge; split it into separate spaces or fill the gap.`, { level: level.id, space: s.id });
    });
    // openTo must name a neighbour.
    level.spaces.forEach((s, si) => {
      for (const o of s.openTo ?? []) {
        const oi = ctx.spaceIndex.get(o);
        if (oi === undefined) continue;
        if (!areAdjacent(grid, ctx.spaceCells[si]!, ctx.spaceCells[oi]!)) {
          warn('open-to-not-adjacent', `Space "${s.id}" is openTo "${o}", but they share no boundary on level "${level.id}"; openTo has no effect.`, { level: level.id, space: s.id });
        }
      }
    });
    // Minimum sizes.
    level.spaces.forEach((s, si) => {
      const { w, h } = largestRect(grid, ctx.spaceCells[si]!);
      const short = Math.min(w, h);
      const where = { level: level.id, space: s.id };
      if (s.type === 'bedroom' && short < MIN_BEDROOM_SHORT_SIDE) {
        err('min-size', `Bedroom "${s.id}" is only ${fmt(short)} mm on its short side; bedrooms need at least ${MIN_BEDROOM_SHORT_SIDE} mm. Widen it.`, where);
      }
      if (s.type === 'bathroom' && short < MIN_BATHROOM_SHORT_SIDE) {
        err('min-size', `Bathroom "${s.id}" is only ${fmt(short)} mm on its short side; bathrooms need at least ${MIN_BATHROOM_SHORT_SIDE} mm. Widen it.`, where);
      }
    });
    for (const st of level.stairs) {
      const si = ctx.spaceIndex.get(st.space);
      if (si === undefined) continue;
      // The stair's footprint is the stairwell it climbs into (stair spaces
      // on the level above that overlap its space); fall back to its space.
      const own = ctx.spaceCells[si]!;
      const upper = ctxs[ctx.index + 1];
      const well = new Set<number>();
      upper?.level.spaces.forEach((s, ui) => {
        const uc = upper.spaceCells[ui]!;
        if (s.type === 'stair' && [...own].some((k) => uc.has(k))) uc.forEach((k) => well.add(k));
      });
      const bb = bboxOf(grid, well.size ? well : own);
      if (!bb) continue;
      const across = st.up === 'N' || st.up === 'S' ? bb.x1 - bb.x0 : bb.y1 - bb.y0;
      const flight = st.kind === 'u' ? across / 2 : across;
      if (flight < MIN_STAIR_WIDTH) {
        err('min-size', `Stair "${st.id}" flights are only ${fmt(flight)} mm wide (its stairwell is ${fmt(across)} mm across the climb${st.kind === 'u' ? ', split into two flights' : ''}); stairs need at least ${MIN_STAIR_WIDTH} mm. Widen the stair space and the stairwell above.`, { level: level.id, stair: st.id });
      }
    }
    for (const o of level.openings) {
      if ((o.kind === 'door' || o.kind === 'sliding-door') && o.width < MIN_DOOR_WIDTH) {
        err('min-size', `Door "${o.id}" is ${fmt(o.width)} mm wide; doors need at least ${MIN_DOOR_WIDTH} mm.`, { level: level.id, opening: o.id });
      }
      const limit = headroom(house, an, ctx.index, o.id);
      if ((o.spanLevels ?? 1) === 1 && o.sill + o.height > limit) {
        warn('opening-too-tall', `Opening "${o.id}" reaches ${fmt(o.sill + o.height)} mm above the floor but ${limit > level.height ? `the roof underside there is ${fmt(limit)} mm above the floor of level "${level.id}"` : `level "${level.id}" is ${fmt(level.height)} mm high`}. Lower it or set spanLevels.`, { level: level.id, opening: o.id });
      }
    }
  }

  checkSwings(an, issues);
  checkOpeningOverlaps(an, issues);
  checkStairs(house, an, issues);
  checkReachability(house, an, issues);
  checkWindows(an, issues);
  checkSupport(an, issues);
  checkRoofs(house, an, issues);
  checkGates(house, issues);
  return issues;
}

function checkSwings(an: Analysis, issues: Issue[]): void {
  for (const ctx of an.ctxs) {
    for (const o of ctx.level.openings) {
      if (o.canopy && o.kind !== 'door' && o.kind !== 'sliding-door') {
        issues.push({ code: 'unsupported-attribute', severity: 'warning', message: `Opening "${o.id}" is a ${o.kind}; canopy only applies to doors and sliding doors and is ignored.`, where: { level: ctx.level.id, opening: o.id } });
      }
      if (o.panel && o.kind === 'void') {
        issues.push({ code: 'unsupported-attribute', severity: 'warning', message: `Opening "${o.id}" is a void; panel is ignored.`, where: { level: ctx.level.id, opening: o.id } });
      }
    }
    // Openings on the same wall segment need a pier of at least MIN_OPENING_GAP between them.
    const byWall = new Map<Piece, typeof ctx.placed>();
    for (const p of ctx.placed) {
      const list = byWall.get(p.piece) ?? [];
      list.push(p);
      byWall.set(p.piece, list);
    }
    for (const list of byWall.values()) {
      const sorted = [...list].sort((a, b) => a.lo - b.lo);
      for (let i = 0; i + 1 < sorted.length; i++) {
        const a = sorted[i]!, b = sorted[i + 1]!;
        const gap = b.lo - a.hi;
        if (gap > -0.5 && gap < MIN_OPENING_GAP) {
          issues.push({
            code: 'opening-spacing', severity: 'error',
            message: `Openings "${a.opening.id}" and "${b.opening.id}" on the same wall of level "${ctx.level.id}" are only ${fmt(Math.max(0, gap))} mm apart (${fmt(a.lo)}..${fmt(a.hi)} and ${fmt(b.lo)}..${fmt(b.hi)}); leave at least ${MIN_OPENING_GAP} mm of wall between them, or merge them into one wider opening.`,
            where: { level: ctx.level.id, opening: b.opening.id },
          });
        }
      }
    }
  }
  for (const ctx of an.ctxs) {
    for (const o of ctx.level.openings) {
      if (!o.swing) continue;
      const where = { level: ctx.level.id, opening: o.id };
      if (o.kind !== 'door') {
        issues.push({ code: 'swing', severity: 'warning', message: `Opening "${o.id}" is a ${o.kind}; swing only applies to doors and is ignored.`, where });
        continue;
      }
      const p = ctx.placed.find((q) => q.opening.id === o.id);
      if (!p) continue;
      const sides = p.piece.sides.filter((n) => n >= 0).map((n) => ctx.level.spaces[n]!.id);
      if (!sides.includes(o.swing.into)) {
        issues.push({ code: 'swing', severity: 'error', message: `Door "${o.id}" swings into "${o.swing.into}", which is not on either side of it (${sides.join(', ') || 'nothing'}). Use one of those, or drop swing to let the engine choose.`, where });
      }
    }
  }
}

/**
 * Clear height above the floor at an opening: the level height, or under a
 * pitched roof sitting on this level, the roof underside at the opening's
 * wall line (walls of the roofed level rise to it).
 */
function headroom(house: House, an: Analysis, li: number, openingId: string): number {
  const ctx = an.ctxs[li]!;
  const level = ctx.level;
  const p = ctx.placed.find((q) => q.opening.id === openingId);
  if (!p) return level.height;
  const [x, y] = p.resolved.center;
  let best = level.height;
  for (const r of house.roofs) {
    if (r.onLevel !== level.id || r.kind === 'flat' || r.kind === 'canopy' || r.pitchDeg === undefined) continue;
    const bb = bboxOf(an.grid, cellsOf(an.grid, r.cells));
    if (!bb || x < bb.x0 - 120 || x > bb.x1 + 120 || y < bb.y0 - 120 || y > bb.y1 + 120) continue;
    const t = Math.tan((r.pitchDeg * Math.PI) / 180);
    const run = { N: bb.y1 - y, S: y - bb.y0, E: bb.x1 - x, W: x - bb.x0 };
    let rise: number;
    if (r.kind === 'mono') rise = run[r.fall ?? 'S'];
    else if (r.kind === 'gable') rise = r.ridge === 'NS' ? Math.min(run.E, run.W) : Math.min(run.N, run.S);
    else rise = Math.min(run.N, run.S, run.E, run.W);
    best = Math.max(best, level.height + (r.eaveOffset ?? 0) + Math.max(0, rise) * t);
  }
  return best;
}

function checkOpeningOverlaps(an: Analysis, issues: Issue[]): void {
  const { ctxs, grid } = an;
  // Occupied intervals per level and line, including spans from below.
  type Occ = { id: string; lo: number; hi: number; from: string };
  const occ = new Map<string, Occ[]>();
  const key = (li: number, orient: string, line: number) => `${li}|${orient}|${line}`;
  for (const ctx of ctxs) {
    for (const p of ctx.placed) {
      const span = p.opening.spanLevels ?? 1;
      for (let k = 0; k < span; k++) {
        const li = ctx.index + k;
        const kk = key(li, p.orient, p.line);
        const list = occ.get(kk) ?? [];
        list.push({ id: p.opening.id, lo: p.lo, hi: p.hi, from: k === 0 ? '' : ` (from level "${ctx.level.id}", spanLevels ${span})` });
        occ.set(kk, list);
        if (k === 0) continue;
        const upper = ctxs[li];
        const where = { level: ctx.level.id, opening: p.opening.id };
        if (!upper) {
          issues.push({ code: 'span-no-wall', severity: 'error', message: `Opening "${p.opening.id}" on level "${ctx.level.id}" has spanLevels ${span}, but only ${k - 1} level(s) exist above "${ctx.level.id}". Set spanLevels to ${k} or less.`, where });
          break;
        }
        const pos = p.orient === 'NS' ? grid.ys : grid.xs;
        const lineId = p.orient === 'NS' ? grid.xIds[p.line]! : grid.yIds[p.line]!;
        const there = upper.pieces.filter((q) => q.orient === p.orient && q.line === p.line && pos[q.from]! < p.hi - 0.5 && p.lo + 0.5 < pos[q.to]!);
        const wall = there.find((q) => q.kind === 'wall' && pos[q.from]! <= p.lo + 0.5 && p.hi <= pos[q.to]! + 0.5);
        if (!wall) {
          const sid = (n: number) => (n >= 0 ? upper.level.spaces[n]!.id : 'outside');
          const what = there.length === 0
            ? 'there is no wall or boundary there at all'
            : there.length > 1
              ? `the wall there is split into ${there.length} segments (${there.map((q) => `${runIds(grid, q).from}-${runIds(grid, q).to}: ${sid(q.sides[0])} | ${sid(q.sides[1])}`).join(', ')})`
              : there[0]!.kind === 'wall' ? 'the wall there is shorter than the opening' : `the boundary there has no wall (${there[0]!.kind === 'open' ? 'open between two spaces' : 'an outdoor edge'})`;
          issues.push({
            code: 'span-no-wall', severity: 'error',
            message: `Opening "${p.opening.id}" on level "${ctx.level.id}" has spanLevels ${span}, so it continues up through level "${upper.level.id}" in the same wall (line ${lineId}, ${fmt(p.lo)}..${fmt(p.hi)}). But on "${upper.level.id}" ${what}. Set spanLevels to ${k} to stop below "${upper.level.id}", or change "${upper.level.id}" so a single wall runs there.`,
            where,
          });
        }
      }
    }
  }
  for (const [k, list] of occ) {
    const li = Number(k.split('|')[0]);
    const levelId = ctxs[li]?.level.id ?? '?';
    const sorted = [...list].sort((a, b) => a.lo - b.lo);
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const a = sorted[i]!;
        const b = sorted[j]!;
        if (b.lo < a.hi - 0.5) {
          issues.push({ code: 'opening-overlap', severity: 'error', message: `Openings "${a.id}"${a.from} and "${b.id}"${b.from} overlap on level "${levelId}" (${fmt(a.lo)}..${fmt(a.hi)} and ${fmt(b.lo)}..${fmt(b.hi)} on the same wall line). Move or narrow one of them${a.from || b.from ? ', or reduce spanLevels' : ''}.`, where: { level: levelId, opening: b.id } });
        }
      }
    }
  }
}

function checkStairs(house: House, an: Analysis, issues: Issue[]): void {
  const { ctxs, grid } = an;
  for (const ctx of ctxs) {
    for (const st of ctx.level.stairs) {
      const where = { level: ctx.level.id, stair: st.id };
      const si = ctx.spaceIndex.get(st.space);
      if (si === undefined) continue;
      const sp = ctx.level.spaces[si]!;
      if (sp.type !== 'stair') {
        issues.push({ code: 'stair-space-type', severity: 'error', message: `Stair "${st.id}" is placed in "${sp.id}" of type ${sp.type}; a stair must sit in a space of type "stair".`, where });
      }
      const upper = ctxs[ctx.index + 1];
      if (!upper) {
        issues.push({ code: 'stair-misaligned', severity: 'error', message: `Stair "${st.id}" is on "${ctx.level.id}", the top level, so it leads nowhere (a stair climbs from its own level to the next level up). Remove it, or add a level above "${ctx.level.id}" with a "stair" space over ${cellsLabel(grid, ctx.spaceCells[si]!)}.`, where });
        continue;
      }
      const cells = ctx.spaceCells[si]!;
      const well = new Set<number>();
      const upperStairs: string[] = [];
      upper.level.spaces.forEach((s, ui) => {
        if (s.type !== 'stair') return;
        for (const k of upper.spaceCells[ui]!) well.add(k);
        upperStairs.push(`"${s.id}" ${cellsLabel(grid, upper.spaceCells[ui]!)}`);
      });
      const missing = new Set([...cells].filter((k) => !well.has(k)));
      if (missing.size) {
        issues.push({
          code: 'stair-misaligned', severity: 'error',
          message: `Stair "${st.id}" in "${st.space}" on level "${ctx.level.id}" (cells ${cellsLabel(grid, cells)}) climbs to level "${upper.level.id}", but on "${upper.level.id}" cells ${cellsLabel(grid, missing)} above it are ${occupants(grid, upper, missing)}, not a space of type "stair". Fix it on "${upper.level.id}" (make a "stair" space cover ${cellsLabel(grid, cells)}), or move "${st.space}" on "${ctx.level.id}" under a stair space of "${upper.level.id}" (${upperStairs.join(', ') || 'it has none'}).`,
          where,
        });
      }
    }
  }
  void house;
}

/** What occupies some cells of a level, e.g. '"l2-hall" (hall)' or 'empty'. */
function occupants(grid: Grid, ctx: LevelCtx, cells: ReadonlySet<number>): string {
  const names: string[] = [];
  let empty = false;
  for (const k of cells) {
    const si = ctx.owner[k]!;
    if (si < 0) { empty = true; continue; }
    const s = ctx.level.spaces[si]!;
    const n = `"${s.id}" (${s.type})`;
    if (!names.includes(n)) names.push(n);
  }
  if (empty) names.push('empty');
  void grid;
  return names.join(' and ');
}

function checkReachability(house: House, an: Analysis, issues: Issue[]): void {
  const { ctxs, grid } = an;
  const OUT = 'outside';
  const node = (li: number, si: number) => `${li}:${si}`;
  const adj = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    if (!adj.has(a)) adj.set(a, new Set());
    if (!adj.has(b)) adj.set(b, new Set());
    adj.get(a)!.add(b);
    adj.get(b)!.add(a);
  };
  for (const ctx of ctxs) {
    const li = ctx.index;
    ctx.level.spaces.forEach((s, si) => {
      if (li === 0 && isOutdoorType(s.type)) link(OUT, node(li, si));
    });
    for (const p of ctx.pieces) {
      if (p.kind === 'open') link(node(li, p.sides[0]), node(li, p.sides[1]));
    }
    for (const p of ctx.placed) {
      if (p.opening.kind === 'window') continue;
      const [a, b] = p.piece.sides;
      const na = a >= 0 ? node(li, a) : li === 0 ? OUT : null;
      const nb = b >= 0 ? node(li, b) : li === 0 ? OUT : null;
      if (na && nb) link(na, nb);
    }
    const upper = ctxs[li + 1];
    for (const st of ctx.level.stairs) {
      const si = ctx.spaceIndex.get(st.space);
      if (si === undefined || !upper) continue;
      const cells = ctx.spaceCells[si]!;
      upper.level.spaces.forEach((s, ui) => {
        if (s.type !== 'stair') return;
        if ([...cells].some((k) => upper.spaceCells[ui]!.has(k))) link(node(li, si), node(li + 1, ui));
      });
    }
  }
  const seen = new Set<string>([OUT]);
  const queue = [OUT];
  while (queue.length) {
    const n = queue.shift()!;
    for (const m of adj.get(n) ?? []) if (!seen.has(m)) { seen.add(m); queue.push(m); }
  }
  for (const ctx of ctxs) {
    ctx.level.spaces.forEach((s, si) => {
      if (isOutdoorType(s.type) && ctx.index === 0) return;
      if (seen.has(node(ctx.index, si))) return;
      const neighbours = ctx.level.spaces
        .filter((_, oi) => oi !== si && areAdjacent(grid, ctx.spaceCells[si]!, ctx.spaceCells[oi]!))
        .map((o) => o.id);
      issues.push({
        code: 'unreachable', severity: isOutdoorType(s.type) ? 'warning' : 'error',
        message: `Space "${s.id}" on level "${ctx.level.id}" cannot be reached from the entrance through doors, openTo or stairs. Add a door to one of its neighbours (${neighbours.join(', ') || 'none'})${ctx.index === 0 ? ' or to the outside' : ''}.`,
        where: { level: ctx.level.id, space: s.id },
      });
    });
  }
  void house;
}

function checkWindows(an: Analysis, issues: Issue[]): void {
  const needs: ReadonlySet<string> = new Set(NEEDS_EXTERIOR_WINDOW);
  for (const ctx of an.ctxs) {
    // A window that ended up between two interior spaces (usually because a
    // space was added outside it) lets in no daylight.
    for (const p of ctx.placed) {
      if (p.opening.kind !== 'window' || p.piece.kind !== 'wall' || p.piece.exterior) continue;
      const [a, b] = p.piece.sides.map((n) => ctx.level.spaces[n]!.id);
      issues.push({ code: 'interior-window', severity: 'warning', message: `Window "${p.opening.id}" on level "${ctx.level.id}" is in an interior wall between "${a}" and "${b}", so it gets no daylight. Keep it only if borrowed light is intended; otherwise move it to an exterior wall or remove it.`, where: { level: ctx.level.id, opening: p.opening.id } });
    }
    ctx.level.spaces.forEach((s, si) => {
      if (!needs.has(s.type)) return;
      const ok = ctx.placed.some((p) =>
        (p.opening.kind === 'window' || p.opening.kind === 'sliding-door') &&
        p.piece.exterior && (p.piece.sides[0] === si || p.piece.sides[1] === si));
      if (!ok) {
        issues.push({ code: 'no-exterior-window', severity: 'error', message: `${s.type[0]!.toUpperCase()}${s.type.slice(1)} "${s.id}" has no window on an exterior wall. Add a window (or sliding door) on one of its outside walls.`, where: { level: ctx.level.id, space: s.id } });
      }
    });
  }
}

function checkSupport(an: Analysis, issues: Issue[]): void {
  const { ctxs, grid } = an;
  for (const ctx of ctxs) {
    if (ctx.index === 0) continue;
    const below = ctxs[ctx.index - 1]!;
    const supported = new Set<number>();
    below.level.spaces.forEach((s, si) => {
      if (!isOutdoorType(s.type)) for (const k of below.spaceCells[si]!) supported.add(k);
    });
    ctx.level.spaces.forEach((s, si) => {
      if (isOutdoorType(s.type)) return;
      const free = new Set([...ctx.spaceCells[si]!].filter((k) => !supported.has(k)));
      if (free.size === 0) return;
      issues.push({ code: 'unsupported', severity: 'warning', message: `Space "${s.id}" on level "${ctx.level.id}" has ${m2(setArea(grid, free))} (cells ${cellsLabel(grid, free)}) with no interior space below it on "${below.level.id}" (there: ${occupants(grid, below, free)}). Check that this overhang is intended.`, where: { level: ctx.level.id, space: s.id } });
    });
  }
}

function checkRoofs(house: House, an: Analysis, issues: Issue[]): void {
  const { ctxs, grid } = an;
  for (const r of house.roofs) {
    const where = { roof: r.id };
    if (r.kind === 'canopy') {
      const lvl = house.levels.find((l) => l.id === r.onLevel);
      if (lvl && r.height !== undefined && r.height > lvl.height) issues.push({ code: 'roof-params', severity: 'error', message: `Canopy "${r.id}" is ${fmt(r.height)} mm above the floor of "${lvl.id}", higher than that level (${fmt(lvl.height)} mm). Lower its height or put it on the level above.`, where });
      if (r.pitchDeg !== undefined || r.fall || r.ridge || (r.skylights?.length ?? 0) > 0) issues.push({ code: 'roof-params', severity: 'warning', message: `Canopy "${r.id}" is a flat slab; pitchDeg, fall, ridge and skylights are ignored.`, where });
    } else if (r.height !== undefined) {
      issues.push({ code: 'roof-params', severity: 'warning', message: `Roof "${r.id}" is ${r.kind}; height only applies to canopies and is ignored.`, where });
    }
    if (r.kind !== 'flat' && r.kind !== 'canopy' && r.pitchDeg === undefined) issues.push({ code: 'roof-params', severity: 'error', message: `Roof "${r.id}" is ${r.kind} and needs pitchDeg.`, where });
    if (r.kind === 'mono' && !r.fall) issues.push({ code: 'roof-params', severity: 'error', message: `Mono-pitch roof "${r.id}" needs fall (direction of its low edge: N, S, E or W).`, where });
    if ((r.kind === 'gable' || r.kind === 'hip') && !r.ridge) issues.push({ code: 'roof-params', severity: 'error', message: `Roof "${r.id}" is ${r.kind} and needs ridge ("EW" or "NS").`, where });
    const bb = bboxOf(grid, cellsOf(grid, r.cells));
    for (const sk of r.skylights ?? []) {
      if (bb && (sk.at[0] - sk.width / 2 < bb.x0 || sk.at[0] + sk.width / 2 > bb.x1 || sk.at[1] - sk.length / 2 < bb.y0 || sk.at[1] + sk.length / 2 > bb.y1)) {
        issues.push({ code: 'roof-params', severity: 'error', message: `A skylight of roof "${r.id}" at (${fmt(sk.at[0])}, ${fmt(sk.at[1])}) does not fit inside the roof (x ${fmt(bb.x0)}..${fmt(bb.x1)}, y ${fmt(bb.y0)}..${fmt(bb.y1)}).`, where });
      }
    }
  }
  for (const ctx of ctxs) {
    const above = ctxs[ctx.index + 1];
    const coveredAbove = new Set<number>();
    if (above) above.spaceCells.forEach((c) => c.forEach((k) => coveredAbove.add(k)));
    const roofCells = new Set<number>();
    for (const r of house.roofs) if (r.onLevel === ctx.level.id && r.kind !== 'canopy') cellsOf(grid, r.cells).forEach((k) => roofCells.add(k));
    ctx.level.spaces.forEach((s, si) => {
      if (isOutdoorType(s.type)) return;
      const open = [...ctx.spaceCells[si]!].filter((k) => !coveredAbove.has(k) && !roofCells.has(k));
      if (open.length === 0) return;
      const oc = new Set(open);
      issues.push({ code: 'roof-gap', severity: 'warning', message: `Space "${s.id}" on level "${ctx.level.id}" has ${m2(setArea(grid, oc))} (cells ${cellsLabel(grid, oc)}) with neither a roof (onLevel "${ctx.level.id}") nor a space ${above ? `on "${above.level.id}" ` : ''}above it. Add or extend a roof with onLevel "${ctx.level.id}" over those cells.`, where: { level: ctx.level.id, space: s.id } });
    });
  }
}

function checkGates(house: House, issues: Issue[]): void {
  for (const g of house.site.fence?.gates ?? []) {
    const len = g.side === 'N' || g.side === 'S' ? house.site.width : house.site.depth;
    let lo: number;
    if (g.at === 'center') lo = (len - g.width) / 2;
    else lo = g.at.from === 'start' ? g.at.offset : len - g.at.offset - g.width;
    if (lo < 0 || lo + g.width > len) {
      issues.push({ code: 'gate-off-fence', severity: 'error', message: `Gate "${g.id}" (${fmt(lo)}..${fmt(lo + g.width)}) does not fit on the ${g.side} fence, which is ${fmt(len)} mm long.`, where: { gate: g.id } });
    }
  }
}
