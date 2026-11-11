// Command layer: atomic, validated edits of an authored house. Pure: the
// input house is never mutated. See README "Commands".
import type { z } from 'zod';
import {
  Command, COMMAND_OPS,
  type AddGridLine, type AddLevel, type AddOpening, type AddRoof, type AddSpace, type AddStair,
  type MoveGridLine, type RemoveGridLine, type RemoveLevel, type RemoveOpening, type RemoveRoof,
  type RemoveSpace, type RemoveStair, type RenameHouse, type SetStyle, type UpdateLevel,
  type UpdateOpening, type UpdateRoof, type UpdateSite, type UpdateSpace,
} from './command-schema';
import { buildGrid, cellsOf, bboxOf, setArea, type Grid } from './grid';
import type { Issue } from './issues';
import {
  analyse, describeSpans, hostRuns, hostText, resolveHostSpan, runIds, type Analysis, type PlacedOpening,
} from './resolve';
import type { CellRect, GridLine, House, Level, Opening, OpeningHost, Roof, Space, Stair } from './schema';
import { validate } from './validate';

/** What one command did. */
export interface AppliedCommand {
  /** Index of the command in the batch. */
  command: number;
  op: string;
  /** One or two sentences for the LLM / the UI. */
  summary: string;
  /** Ids created (including generated ones) and removed. */
  created: string[];
  removed: string[];
}

export interface ApplyResult {
  /** True when the batch was kept. */
  ok: boolean;
  /** The new house when ok, else the original house (rollback). */
  house: House;
  /** ok: all issues of the new house (warnings only, plus errors that the
   *  original house already had). Not ok: why the batch was rejected. */
  issues: Issue[];
  /** What each command did, in order. When ok is false none of it was kept. */
  applied: AppliedCommand[];
}

class CommandError extends Error {
  constructor(readonly code: string, message: string, readonly where: Issue['where'] = {}) {
    super(message);
  }
}

const fail = (code: string, message: string, where?: Issue['where']): never => {
  throw new CommandError(code, message, where);
};

const fmt = (n: number) => `${Math.round(n)}`;
/** Houses and commands are plain JSON. */
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const m = (mm: number) => (mm / 1000).toFixed(2);
const m2 = (mm2: number) => `${(mm2 / 1e6).toFixed(2)} m²`;

// ---------------------------------------------------------------------------
// Ids

function levenshtein(a: string, b: string): number {
  const d = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0]!;
    d[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = d[j]!;
      d[j] = Math.min(d[j]! + 1, d[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return d[b.length]!;
}

/** The candidates closest to `id` (substring matches first, then edit distance). */
export function nearestIds(id: string, candidates: readonly string[], n = 5): string[] {
  const q = id.toLowerCase();
  return [...new Set(candidates)]
    .map((c) => {
      const l = c.toLowerCase();
      const sub = l.includes(q) || q.includes(l) ? -100 : 0;
      return { c, score: sub + levenshtein(q, l) };
    })
    .sort((a, b) => a.score - b.score || a.c.localeCompare(b.c))
    .slice(0, n)
    .map((x) => x.c);
}

function unknown(what: string, id: string, candidates: readonly string[], extra = ''): never {
  const near = nearestIds(id, candidates);
  return fail('unknown-id', `Unknown ${what} "${id}".${near.length ? ` Nearest ${what} ids: ${near.join(', ')}.` : ` There are no ${what}s yet.`}${extra}`);
}

function uniqueId(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'x';

// ---------------------------------------------------------------------------
// Working state

interface Found<T> { level: Level; li: number; item: T; index: number }

class Work {
  readonly applied: AppliedCommand[] = [];
  /** Openings added or edited in this batch (exempt from the move check). */
  readonly touched = new Set<string>();
  private cache: Analysis | null = null;

  constructor(readonly house: House) {}

  changed(): void { this.cache = null; }
  analysis(): Analysis { return (this.cache ??= analyse(this.house)); }

  levelIds(): string[] { return this.house.levels.map((l) => l.id); }
  level(id: string): { level: Level; li: number } {
    const li = this.house.levels.findIndex((l) => l.id === id);
    if (li < 0) unknown('level', id, this.levelIds(), ` Levels bottom to top: ${this.levelIds().join(', ')}.`);
    return { level: this.house.levels[li]!, li };
  }

  allSpaceIds(): string[] { return this.house.levels.flatMap((l) => l.spaces.map((s) => s.id)); }
  allOpeningIds(): string[] { return this.house.levels.flatMap((l) => l.openings.map((o) => o.id)); }
  allStairIds(): string[] { return this.house.levels.flatMap((l) => l.stairs.map((s) => s.id)); }
  allRoofIds(): string[] { return this.house.roofs.map((r) => r.id); }
  /** Every element id in the house (ids are unique across element kinds' namespaces only by convention, so generate against all). */
  takenIds(): Set<string> {
    return new Set([
      ...this.allSpaceIds(), ...this.allOpeningIds(), ...this.allStairIds(), ...this.allRoofIds(),
      ...this.levelIds(), ...(this.house.site.fence?.gates.map((g) => g.id) ?? []),
    ]);
  }

  private find<T>(kind: string, id: string, list: (l: Level) => T[], ids: () => string[], idOf: (t: T) => string): Found<T> {
    for (const [li, level] of this.house.levels.entries()) {
      const index = list(level).findIndex((t) => idOf(t) === id);
      if (index >= 0) return { level, li, item: list(level)[index]!, index };
    }
    return unknown(kind, id, ids());
  }
  space(id: string): Found<Space> { return this.find('space', id, (l) => l.spaces, () => this.allSpaceIds(), (s) => s.id); }
  opening(id: string): Found<Opening> { return this.find('opening', id, (l) => l.openings, () => this.allOpeningIds(), (o) => o.id); }
  stair(id: string): Found<Stair> { return this.find('stair', id, (l) => l.stairs, () => this.allStairIds(), (s) => s.id); }
  roof(id: string): { roof: Roof; index: number } {
    const index = this.house.roofs.findIndex((r) => r.id === id);
    if (index < 0) unknown('roof', id, this.allRoofIds());
    return { roof: this.house.roofs[index]!, index };
  }

  gridLine(id: string, axis?: 'x' | 'y'): { axis: 'x' | 'y'; line: GridLine; index: number } {
    const inX = this.house.grid.x.findIndex((g) => g.id === id);
    const inY = this.house.grid.y.findIndex((g) => g.id === id);
    if (axis === 'x' || (axis === undefined && inX >= 0 && inY < 0)) {
      if (inX < 0) unknown('X grid line', id, this.house.grid.x.map((g) => g.id));
      return { axis: 'x', line: this.house.grid.x[inX]!, index: inX };
    }
    if (axis === 'y' || (axis === undefined && inY >= 0 && inX < 0)) {
      if (inY < 0) unknown('Y grid line', id, this.house.grid.y.map((g) => g.id));
      return { axis: 'y', line: this.house.grid.y[inY]!, index: inY };
    }
    if (inX >= 0 && inY >= 0) return fail('ambiguous-id', `"${id}" is both an X and a Y grid line id; add "axis": "x" or "y".`);
    return unknown('grid line', id, [...this.house.grid.x, ...this.house.grid.y].map((g) => g.id));
  }

  /** Level holding a host's space(s); both spaces of a `between` host must be on one level. */
  hostLevel(host: OpeningHost): Found<Space> {
    if ('space' in host) return this.space(host.space);
    const [a, b] = host.between.map((id) => this.space(id)) as [Found<Space>, Found<Space>];
    if (a.li !== b.li) fail('host-levels', `"${a.item.id}" is on level "${a.level.id}" but "${b.item.id}" is on "${b.level.id}"; a between-host needs two spaces on the same level.`);
    if (a.item.id === b.item.id) fail('host-levels', `An opening cannot be between "${a.item.id}" and itself.`);
    return a;
  }

  record(command: number, op: string, summary: string, created: string[] = [], removed: string[] = []): void {
    this.applied.push({ command, op, summary, created, removed });
  }
}

const DEFAULT_SIZE: Record<Opening['kind'], { height: number; sill: number }> = {
  'door': { height: 2100, sill: 0 },
  'sliding-door': { height: 2400, sill: 0 },
  'window': { height: 1500, sill: 900 },
  'void': { height: 2100, sill: 0 },
};
const KIND_ABBR: Record<Opening['kind'], string> = { 'door': 'd', 'sliding-door': 'sd', 'window': 'w', 'void': 'v' };

const levelPrefix = (levelId: string) => slug(levelId);

function sizeText(grid: Grid, rects: readonly CellRect[]): string {
  const cells = cellsOf(grid, rects);
  const bb = bboxOf(grid, cells);
  if (!bb) return 'no valid cells';
  const area = setArea(grid, cells);
  const rect = area === (bb.x1 - bb.x0) * (bb.y1 - bb.y0);
  return `${rect ? '' : 'bounding box '}${m(bb.x1 - bb.x0)} x ${m(bb.y1 - bb.y0)} m, ${m2(area)}`;
}

const cellsText = (rects: readonly CellRect[]) => rects.map((r) => `${r.x0}-${r.x1}/${r.y0}-${r.y1}`).join(' + ');

/** Assign `value` to `obj[key]`; null deletes, undefined leaves it. */
function patch<T extends object, K extends keyof T>(obj: T, key: K, value: T[K] | null | undefined): boolean {
  if (value === undefined) return false;
  if (value === null) delete obj[key];
  else obj[key] = value;
  return true;
}

// ---------------------------------------------------------------------------
// Opening helpers

function placedOf(an: Analysis, id: string): PlacedOpening | undefined {
  for (const ctx of an.ctxs) {
    const p = ctx.placed.find((q) => q.opening.id === id);
    if (p) return p;
  }
  return undefined;
}

/** Fill in an omitted span when the host has exactly one edge; explain otherwise. */
function withSpan(work: Work, host: OpeningHost, li: number): OpeningHost {
  if (host.span) return host;
  const an = work.analysis();
  const ctx = an.ctxs[li]!;
  const runs = hostRuns(an.grid, ctx, host);
  if (!runs) return host; // unknown space: reported elsewhere
  if (runs.length === 1) {
    const ids = runIds(an.grid, runs[0]!);
    return { ...host, span: { from: ids.from, to: ids.to } };
  }
  if (runs.length === 0) {
    if ('between' in host) {
      const si = ctx.spaceIndex.get(host.between[0])!;
      const near = ctx.level.spaces.filter((s, i) => i !== si && hostRuns(an.grid, ctx, { between: [host.between[0], s.id] })!.length > 0).map((s) => s.id);
      return fail('opening-not-adjacent', `"${host.between[0]}" and "${host.between[1]}" share no wall on level "${ctx.level.id}". Spaces touching "${host.between[0]}": ${near.join(', ') || 'none'}. For an outside wall use {"space": id, "side": ...}.`);
    }
    return fail('opening-off-edge', `"${host.space}" has no ${host.side}-facing boundary.`);
  }
  const ex = runIds(an.grid, runs[0]!);
  return fail('ambiguous-host', `${hostText(host)} has ${runs.length} separate edges; add span to say which. Edges: ${describeSpans(an.grid, runs)}. Example: "span": {"from": "${ex.from}", "to": "${ex.to}"}.`);
}

function placementText(an: Analysis, id: string): string {
  const p = placedOf(an, id);
  if (!p) return '';
  const lineId = runIds(an.grid, p.span.run).line;
  const ext = p.piece.exterior ? 'exterior wall' : p.piece.kind === 'wall' ? 'interior wall' : 'open boundary';
  return ` It sits at ${fmt(p.lo)}..${fmt(p.hi)} on grid line ${lineId} (${ext}).`;
}

// ---------------------------------------------------------------------------
// Handlers

type Handler<T> = (work: Work, cmd: T, index: number) => void;

const addGridLine: Handler<z.infer<typeof AddGridLine>> = (work, cmd, index) => {
  const lines = work.house.grid[cmd.axis];
  const AX = cmd.axis.toUpperCase();
  if ((cmd.pos === undefined) === (cmd.relativeTo === undefined)) fail('bad-args', 'Give exactly one of pos (absolute mm) or relativeTo ({line, offset}).');
  let pos: number;
  if (cmd.relativeTo) {
    const ref = work.gridLine(cmd.relativeTo.line, cmd.axis);
    pos = ref.line.pos + cmd.relativeTo.offset;
  } else pos = cmd.pos!;
  const clash = lines.find((g) => g.pos === pos);
  if (clash) fail('duplicate-line', `${AX} line "${clash.id}" is already at ${cmd.axis}=${fmt(pos)}; use it instead of adding another.`);
  const allIds = new Set([...work.house.grid.x, ...work.house.grid.y].map((g) => g.id));
  let id = cmd.id;
  if (id !== undefined) {
    if (allIds.has(id)) fail('duplicate-id', `Grid line id "${id}" is already used. Grid line ids must be unique across X and Y.`);
  } else {
    const prev = [...lines].filter((g) => g.pos < pos).sort((a, b) => b.pos - a.pos)[0];
    id = '';
    if (prev) {
      for (const ch of 'abcdefghijklmnopqrstuvwxyz') if (!allIds.has(`${prev.id}${ch}`)) { id = `${prev.id}${ch}`; break; }
    }
    if (!id) id = uniqueId(`${cmd.axis}${fmt(pos)}`, allIds);
  }
  lines.push({ id, pos });
  lines.sort((a, b) => a.pos - b.pos);
  work.changed();
  const sorted = lines;
  const k = sorted.findIndex((g) => g.id === id);
  const prev = sorted[k - 1];
  const next = sorted[k + 1];
  work.record(index, cmd.op, `Added ${AX} line "${id}" at ${cmd.axis}=${fmt(pos)}${prev ? ` (${fmt(pos - prev.pos)} ${cmd.axis === 'x' ? 'east' : 'north'} of "${prev.id}"` : ' ('}${next ? `${prev ? ', ' : ''}${fmt(next.pos - pos)} ${cmd.axis === 'x' ? 'west' : 'south'} of "${next.id}")` : ')'}. No space changed: use the line in cells to split or reshape spaces.`, [id]);
};

/** Piecewise-linear remap of a coordinate when grid positions change. */
function remap(oldPos: number[], newPos: number[], v: number): number {
  for (let i = 0; i + 1 < oldPos.length; i++) {
    const a = oldPos[i]!, b = oldPos[i + 1]!;
    if (v >= a && v <= b && b > a) return newPos[i]! + ((v - a) / (b - a)) * (newPos[i + 1]! - newPos[i]!);
  }
  return v;
}

const moveGridLine: Handler<z.infer<typeof MoveGridLine>> = (work, cmd, index) => {
  if ((cmd.by === undefined) === (cmd.to === undefined)) fail('bad-args', 'Give exactly one of by (relative mm) or to (absolute mm).');
  const { axis, line } = work.gridLine(cmd.line, cmd.axis);
  const lines = work.house.grid[axis];
  const old = line.pos;
  const pos = cmd.to ?? old + cmd.by!;
  if (pos === old) fail('bad-args', `Line "${line.id}" is already at ${axis}=${fmt(old)}.`);
  const others = lines.filter((g) => g !== line);
  const lower = others.filter((g) => g.pos < old).sort((a, b) => b.pos - a.pos)[0];
  const upper = others.filter((g) => g.pos > old).sort((a, b) => a.pos - b.pos)[0];
  if ((lower && pos <= lower.pos) || (upper && pos >= upper.pos) || others.some((g) => g.pos === pos)) {
    fail('line-order', `Line "${line.id}" (${axis}=${fmt(old)}) can only move strictly between ${lower ? `"${lower.id}" at ${fmt(lower.pos)}` : '-infinity'} and ${upper ? `"${upper.id}" at ${fmt(upper.pos)}` : '+infinity'}; ${fmt(pos)} would cross or meet a neighbour and change which cells the spaces cover. Move the neighbour first, or reshape the spaces with other lines.`);
  }
  const before = buildGrid(work.house);
  const areaOf = (g: Grid) => new Map(work.house.levels.flatMap((l) => l.spaces.map((s) => [s.id, setArea(g, cellsOf(g, s.cells))] as const)));
  const areasBefore = areaOf(before);
  line.pos = pos;
  lines.sort((a, b) => a.pos - b.pos);
  const after = buildGrid(work.house);
  // Points given in plan coordinates follow the stretch of their grid cell.
  const [oldPs, newPs] = axis === 'x' ? [before.xs, after.xs] : [before.ys, after.ys];
  const k = axis === 'x' ? 0 : 1;
  if (oldPs.length === newPs.length) {
    for (const r of work.house.roofs) for (const s of r.skylights ?? []) s.at[k] = remap(oldPs, newPs, s.at[k]);
    for (const e of work.house.entourage ?? []) e.at[k] = remap(oldPs, newPs, e.at[k]);
  }
  work.changed();
  const areasAfter = areaOf(after);
  const changed = [...areasAfter].filter(([id, a]) => Math.abs(a - (areasBefore.get(id) ?? a)) > 0.5)
    .map(([id, a]) => `${id} ${(areasBefore.get(id)! / 1e6).toFixed(2)}->${(a / 1e6).toFixed(2)}`);
  const d = pos - old;
  const dirWord = axis === 'x' ? (d > 0 ? 'east' : 'west') : (d > 0 ? 'north' : 'south');
  const bands = [lower && `"${lower.id}"-"${line.id}" now ${fmt(pos - lower.pos)} (was ${fmt(old - lower.pos)})`, upper && `"${line.id}"-"${upper.id}" now ${fmt(upper.pos - pos)} (was ${fmt(upper.pos - old)})`].filter(Boolean).join('; ');
  work.record(index, cmd.op, `Moved ${axis.toUpperCase()} line "${line.id}" ${fmt(Math.abs(d))} mm ${dirWord} to ${fmt(pos)}. Bands: ${bands}. Spaces resized (m²): ${changed.join(', ') || 'none'}.`);
};

const removeGridLine: Handler<z.infer<typeof RemoveGridLine>> = (work, cmd, index) => {
  const { axis, line } = work.gridLine(cmd.line, cmd.axis);
  const users: string[] = [];
  const keys = axis === 'x' ? (['x0', 'x1'] as const) : (['y0', 'y1'] as const);
  const usesRect = (rs: readonly CellRect[]) => rs.some((r) => keys.some((k2) => r[k2] === line.id));
  for (const l of work.house.levels) {
    for (const s of l.spaces) if (usesRect(s.cells)) users.push(`space "${s.id}" (cells)`);
    for (const o of l.openings) if (o.host.span && (o.host.span.from === line.id || o.host.span.to === line.id)) users.push(`opening "${o.id}" (span)`);
  }
  for (const r of work.house.roofs) if (usesRect(r.cells)) users.push(`roof "${r.id}" (cells)`);
  if (users.length) fail('line-in-use', `Grid line "${line.id}" is still used by ${users.slice(0, 12).join(', ')}${users.length > 12 ? ` and ${users.length - 12} more` : ''}. Change those first (earlier in the same batch) or keep the line.`);
  work.house.grid[axis] = work.house.grid[axis].filter((g) => g !== line);
  if (work.house.grid[axis].length < 2) fail('bad-args', `The grid needs at least two ${axis.toUpperCase()} lines.`);
  work.changed();
  work.record(index, cmd.op, `Removed ${axis.toUpperCase()} line "${line.id}" (was at ${fmt(line.pos)}).`, [], [line.id]);
};

const addLevel: Handler<z.infer<typeof AddLevel>> = (work, cmd, index) => {
  const levels = work.house.levels;
  const taken = work.takenIds();
  let id = cmd.id;
  if (id !== undefined) {
    if (taken.has(id)) fail('duplicate-id', `Id "${id}" is already used.`);
  } else {
    for (let n = levels.length + 1; ; n++) if (!taken.has(`L${n}`)) { id = `L${n}`; break; }
  }
  const at = cmd.after !== undefined ? work.level(cmd.after).li + 1 : levels.length;
  const src = cmd.copyFrom !== undefined ? work.level(cmd.copyFrom).level : null;
  const level: Level = { id: id!, name: cmd.name, height: cmd.height ?? src?.height ?? 3000, spaces: [], openings: [], stairs: [] };
  const created: string[] = [id!];
  let copied = '';
  if (src) {
    // Re-prefix ids: "<src prefix>-rest" -> "<new prefix>-rest" when the source
    // level's spaces share a prefix (e.g. "l2-"), else "<new prefix>-<id>".
    const firstDash = (s: string) => (s.includes('-') ? s.slice(0, s.indexOf('-') + 1) : null);
    const prefixes = new Set(src.spaces.map((s) => firstDash(s.id)));
    const srcPrefix = prefixes.size === 1 ? [...prefixes][0] : null;
    const np = `${levelPrefix(id!)}-`;
    const used = new Set([...taken, id!]);
    const map = new Map<string, string>();
    const rename = (old: string) => {
      const base = srcPrefix && old.startsWith(srcPrefix) ? np + old.slice(srcPrefix.length) : np + old;
      const nid = uniqueId(base, used);
      used.add(nid);
      map.set(old, nid);
      return nid;
    };
    const ref = (old: string) => map.get(old) ?? old;
    for (const s of src.spaces) {
      const copy = clone(s);
      copy.id = rename(s.id);
      level.spaces.push(copy);
    }
    for (const s of level.spaces) if (s.openTo) s.openTo = s.openTo.map(ref);
    for (const o of src.openings) {
      const copy = clone(o);
      copy.id = rename(o.id);
      copy.host = 'space' in o.host ? { ...copy.host, space: ref(o.host.space) } as OpeningHost : { ...copy.host, between: [ref(o.host.between[0]), ref(o.host.between[1])] } as OpeningHost;
      if (copy.swing) copy.swing.into = ref(copy.swing.into);
      level.openings.push(copy);
    }
    for (const st of src.stairs) level.stairs.push({ ...st, id: rename(st.id), space: ref(st.space) });
    created.push(...map.values());
    copied = ` Copied from "${src.id}": ${src.spaces.length} spaces, ${src.openings.length} openings, ${src.stairs.length} stairs (ids ${srcPrefix ? `"${srcPrefix}…"` : '…'} -> "${np}…"; e.g. ${[...map].slice(0, 3).map(([a, b]) => `${a} -> ${b}`).join(', ')}).`;
  }
  levels.splice(at, 0, level);
  work.changed();
  const below = levels[at - 1];
  const above = levels[at + 1];
  work.record(index, cmd.op, `Added level "${id}" "${cmd.name}" (height ${fmt(level.height)}) ${below ? `above "${below.id}"` : 'at the bottom'}. Levels bottom to top: ${levels.map((l) => l.id).join(', ')}.${copied}${below && below.stairs.length ? ` Stairs on "${below.id}" now climb to "${id}".` : ''}${above ? ` Roofs keep their onLevel; "${above.id}" is now above "${id}".` : ''}`, created);
};

const removeLevel: Handler<z.infer<typeof RemoveLevel>> = (work, cmd, index) => {
  const { level, li } = work.level(cmd.level);
  if (work.house.levels.length === 1) fail('bad-args', 'A house needs at least one level.');
  const roofs = work.house.roofs.filter((r) => r.onLevel === level.id);
  work.house.roofs = work.house.roofs.filter((r) => r.onLevel !== level.id);
  work.house.levels.splice(li, 1);
  work.changed();
  const removed = [level.id, ...level.spaces.map((s) => s.id), ...level.openings.map((o) => o.id), ...level.stairs.map((s) => s.id), ...roofs.map((r) => r.id)];
  const below = work.house.levels[li - 1];
  work.record(index, cmd.op, `Removed level "${level.id}" with ${level.spaces.length} spaces, ${level.openings.length} openings, ${level.stairs.length} stairs${roofs.length ? ` and roofs ${roofs.map((r) => `"${r.id}"`).join(', ')}` : ''}. Levels bottom to top: ${work.levelIds().join(', ')}.${below && below.stairs.length ? ` Stairs on "${below.id}" now climb to "${work.house.levels[li]?.id ?? 'nothing'}".` : ''}`, [], removed);
};

const updateLevel: Handler<z.infer<typeof UpdateLevel>> = (work, cmd, index) => {
  const { level } = work.level(cmd.level);
  const parts: string[] = [];
  if (cmd.name !== undefined) { level.name = cmd.name; parts.push(`name "${cmd.name}"`); }
  if (cmd.height !== undefined) { parts.push(`height ${fmt(level.height)} -> ${fmt(cmd.height)}`); level.height = cmd.height; }
  if (!parts.length) fail('bad-args', 'Nothing to change: give name and/or height.');
  work.changed();
  work.record(index, cmd.op, `Level "${level.id}": ${parts.join(', ')}.`);
};

const addSpace: Handler<z.infer<typeof AddSpace>> = (work, cmd, index) => {
  const { level } = work.level(cmd.level);
  const taken = work.takenIds();
  let id = cmd.id;
  if (id !== undefined) { if (taken.has(id)) fail('duplicate-id', `Id "${id}" is already used.`); }
  else id = uniqueId(`${levelPrefix(level.id)}-${cmd.type}`, taken);
  const { op: _op, level: _level, id: _id, ...fields } = cmd;
  void _op; void _level; void _id;
  const space: Space = { id, ...fields };
  level.spaces.push(space);
  work.changed();
  work.record(index, cmd.op, `Added ${cmd.type} "${id}" on "${level.id}": cells ${cellsText(cmd.cells)} (${sizeText(buildGrid(work.house), cmd.cells)}).`, [id]);
};

const updateSpace: Handler<z.infer<typeof UpdateSpace>> = (work, cmd, index) => {
  const { item: s, level } = work.space(cmd.space);
  const parts: string[] = [];
  if (cmd.name !== undefined) { s.name = cmd.name; parts.push(`name "${cmd.name}"`); }
  if (patch(s, 'nameEn', cmd.nameEn)) parts.push(`nameEn ${cmd.nameEn === null ? 'removed' : `"${cmd.nameEn}"`}`);
  if (cmd.type !== undefined) { parts.push(`type ${s.type} -> ${cmd.type}`); s.type = cmd.type; }
  if (cmd.cells !== undefined) { s.cells = cmd.cells; parts.push(`cells ${cellsText(cmd.cells)} (${sizeText(buildGrid(work.house), cmd.cells)})`); }
  if (cmd.openTo !== undefined) {
    if (cmd.openTo.length) s.openTo = cmd.openTo; else delete s.openTo;
    parts.push(`openTo [${cmd.openTo.join(', ')}]`);
  }
  for (const k of ['edge', 'cover', 'surface'] as const) if (patch(s, k, cmd[k] as never)) parts.push(`${k} ${cmd[k] ?? 'removed'}`);
  if (!parts.length) fail('bad-args', 'Nothing to change.');
  work.changed();
  work.record(index, cmd.op, `Space "${s.id}" on "${level.id}": ${parts.join('; ')}.`);
};

const removeSpace: Handler<z.infer<typeof RemoveSpace>> = (work, cmd, index) => {
  const { item: s, level } = work.space(cmd.space);
  const hosted = (o: Opening) => ('space' in o.host ? o.host.space === s.id : o.host.between.includes(s.id));
  const openings = level.openings.filter(hosted);
  const stairs = level.stairs.filter((st) => st.space === s.id);
  level.spaces = level.spaces.filter((x) => x !== s);
  level.openings = level.openings.filter((o) => !hosted(o));
  level.stairs = level.stairs.filter((st) => st.space !== s.id);
  const notes: string[] = [];
  for (const other of level.spaces) {
    if (other.openTo?.includes(s.id)) {
      other.openTo = other.openTo.filter((x) => x !== s.id);
      if (!other.openTo.length) delete other.openTo;
      notes.push(`dropped "${s.id}" from openTo of "${other.id}"`);
    }
  }
  for (const o of level.openings) {
    if (o.swing?.into === s.id) { delete o.swing; notes.push(`door "${o.id}" swing reset`); }
  }
  work.changed();
  const removed = [s.id, ...openings.map((o) => o.id), ...stairs.map((st) => st.id)];
  work.record(index, cmd.op, `Removed space "${s.id}" from "${level.id}"${openings.length ? `, its openings ${openings.map((o) => `"${o.id}"`).join(', ')}` : ''}${stairs.length ? `, its stairs ${stairs.map((st) => `"${st.id}"`).join(', ')}` : ''}.${notes.length ? ` Also ${notes.join('; ')}.` : ''} Its cells are now free.`, [], removed);
};

const addOpening: Handler<z.infer<typeof AddOpening>> = (work, cmd, index) => {
  const host0 = work.hostLevel(cmd.host);
  const level = host0.level;
  const host = withSpan(work, cmd.host, host0.li);
  const taken = work.takenIds();
  let id = cmd.id;
  if (id !== undefined) { if (taken.has(id)) fail('duplicate-id', `Id "${id}" is already used.`); }
  else id = uniqueId(`${host0.item.id}-${KIND_ABBR[cmd.kind]}`, taken);
  const d = DEFAULT_SIZE[cmd.kind];
  const o: Opening = { id, kind: cmd.kind, host, at: cmd.at ?? 'center', width: cmd.width, height: cmd.height ?? d.height, sill: cmd.sill ?? d.sill };
  for (const k of ['spanLevels', 'insert', 'swing', 'canopy', 'panel'] as const) if (cmd[k] !== undefined) (o as Record<string, unknown>)[k] = cmd[k];
  level.openings.push(o);
  work.touched.add(id);
  work.changed();
  const span = host.span ? ` span ${host.span.from}-${host.span.to}` : '';
  work.record(index, cmd.op, `Added ${cmd.kind} "${id}" (${fmt(o.width)} x ${fmt(o.height)}, sill ${fmt(o.sill)}) on ${hostText(host)}${span}, ${o.at === 'center' ? 'centred' : `${fmt(o.at.offset)} from the ${o.at.from}`}.${placementText(work.analysis(), id)}`, [id]);
};

const updateOpening: Handler<z.infer<typeof UpdateOpening>> = (work, cmd, index) => {
  const found = work.opening(cmd.opening);
  const o = found.item;
  const parts: string[] = [];
  if (cmd.move && cmd.at) fail('bad-args', 'Give either move or at, not both.');
  if (cmd.move) {
    const p = placedOf(work.analysis(), o.id);
    if (!p) fail('not-placed', `Opening "${o.id}" cannot be placed right now (see the validation errors), so it cannot be moved relative to its position; set at instead.`);
    const along = p!.orient === 'EW' ? ['E', 'W'] : ['N', 'S'];
    if (!along.includes(cmd.move.dir)) {
      fail('bad-direction', `Opening "${o.id}" is in a wall running ${p!.orient === 'EW' ? 'west-east' : 'south-north'} (grid line ${runIds(work.analysis().grid, p!.span.run).line}), so it can only move ${along.join(' or ')}. To put it on another wall, change host.`);
    }
    const delta = (cmd.move.dir === 'E' || cmd.move.dir === 'N' ? 1 : -1) * cmd.move.by;
    const { s0, s1 } = p!.span;
    const offset = p!.lo + delta - s0;
    if (offset < -0.5 || p!.hi + delta > s1 + 0.5) {
      const spanIds = runIds(work.analysis().grid, { ...p!.span.run, from: p!.span.from, to: p!.span.to });
      const [plus, minus] = p!.orient === 'EW' ? ['E', 'W'] : ['N', 'S'];
      fail('off-span', `Moving "${o.id}" ${fmt(cmd.move.by)} mm ${cmd.move.dir} would take it past its span ${spanIds.from}-${spanIds.to} (${fmt(s0)}..${fmt(s1)}); it can move at most ${fmt(s1 - p!.hi)} mm ${plus} or ${fmt(p!.lo - s0)} mm ${minus}. For a larger move give a longer span in host.`);
    }
    o.at = { from: 'start', offset: Math.round(offset) };
    parts.push(`moved ${fmt(cmd.move.by)} mm ${cmd.move.dir} (now ${fmt(offset)} from the span start)`);
  }
  if (cmd.host !== undefined) {
    const h = work.hostLevel(cmd.host);
    const host = withSpan(work, cmd.host, h.li);
    o.host = host;
    if (h.li !== found.li) {
      found.level.openings.splice(found.index, 1);
      h.level.openings.push(o);
      parts.push(`moved to level "${h.level.id}"`);
    }
    parts.push(`host ${hostText(host)}${host.span ? ` span ${host.span.from}-${host.span.to}` : ''}`);
  }
  if (cmd.at !== undefined) { o.at = cmd.at; parts.push(`at ${cmd.at === 'center' ? 'center' : `${fmt(cmd.at.offset)} from ${cmd.at.from}`}`); }
  if (cmd.kind !== undefined) { parts.push(`kind ${o.kind} -> ${cmd.kind}`); o.kind = cmd.kind; }
  if (cmd.width !== undefined) {
    // Keep the start edge (or the centre): an `end` offset is converted so the start stays put.
    if (o.at !== 'center' && o.at.from === 'end') o.at = { from: 'end', offset: o.at.offset + o.width - cmd.width };
    parts.push(`width ${fmt(o.width)} -> ${fmt(cmd.width)}`);
    o.width = cmd.width;
    if (o.at !== 'center' && o.at.offset < 0) fail('off-span', `With width ${fmt(cmd.width)} opening "${o.id}" would start past the end of its span; set at as well.`);
  }
  if (cmd.height !== undefined) { o.height = cmd.height; parts.push(`height ${fmt(cmd.height)}`); }
  if (cmd.sill !== undefined) { o.sill = cmd.sill; parts.push(`sill ${fmt(cmd.sill)}`); }
  if (cmd.spanLevels !== undefined) {
    if (cmd.spanLevels === 1) delete o.spanLevels; else o.spanLevels = cmd.spanLevels;
    parts.push(`spanLevels ${cmd.spanLevels}`);
  }
  for (const k of ['insert', 'swing', 'canopy', 'panel'] as const) if (patch(o, k, cmd[k] as never)) parts.push(`${k} ${cmd[k] === null ? 'removed' : 'set'}`);
  if (!parts.length) fail('bad-args', 'Nothing to change.');
  work.touched.add(o.id);
  work.changed();
  work.record(index, cmd.op, `Opening "${o.id}": ${parts.join('; ')}.${placementText(work.analysis(), o.id)}`);
};

const removeOpening: Handler<z.infer<typeof RemoveOpening>> = (work, cmd, index) => {
  const { level, index: i, item } = work.opening(cmd.opening);
  level.openings.splice(i, 1);
  work.changed();
  work.record(index, cmd.op, `Removed ${item.kind} "${item.id}" from ${hostText(item.host)} on "${level.id}".`, [], [item.id]);
};

const addStair: Handler<z.infer<typeof AddStair>> = (work, cmd, index) => {
  const { level, li, item } = work.space(cmd.space);
  const taken = work.takenIds();
  let id = cmd.id;
  if (id !== undefined) { if (taken.has(id)) fail('duplicate-id', `Id "${id}" is already used.`); }
  else id = uniqueId(`stair-${levelPrefix(level.id)}`, taken);
  level.stairs.push({ id, space: item.id, kind: cmd.kind, up: cmd.up });
  work.changed();
  const above = work.house.levels[li + 1];
  work.record(index, cmd.op, `Added ${cmd.kind} stair "${id}" in "${item.id}" on "${level.id}", climbing ${cmd.up} to ${above ? `"${above.id}"` : 'nothing (top level)'}.`, [id]);
};

const removeStair: Handler<z.infer<typeof RemoveStair>> = (work, cmd, index) => {
  const { level, index: i, item } = work.stair(cmd.stair);
  level.stairs.splice(i, 1);
  work.changed();
  work.record(index, cmd.op, `Removed stair "${item.id}" from "${level.id}".`, [], [item.id]);
};

const addRoof: Handler<z.infer<typeof AddRoof>> = (work, cmd, index) => {
  const { level } = work.level(cmd.onLevel);
  const taken = work.takenIds();
  let id = cmd.id;
  if (id !== undefined) { if (taken.has(id)) fail('duplicate-id', `Id "${id}" is already used.`); }
  else id = uniqueId(`${cmd.kind === 'canopy' ? 'canopy' : 'roof'}-${levelPrefix(level.id)}`, taken);
  const { op: _op, id: _id, overhang, ...rest } = cmd;
  void _op; void _id;
  const roof: Roof = { id, ...rest, overhang: overhang ?? (cmd.kind === 'canopy' ? 0 : cmd.kind === 'flat' ? 300 : 500) };
  work.house.roofs.push(roof);
  work.changed();
  work.record(index, cmd.op, `Added ${cmd.kind} roof "${id}" on "${level.id}" over ${cellsText(cmd.cells)} (overhang ${fmt(roof.overhang)}).`, [id]);
};

const updateRoof: Handler<z.infer<typeof UpdateRoof>> = (work, cmd, index) => {
  const { roof } = work.roof(cmd.roof);
  const parts: string[] = [];
  if (cmd.onLevel !== undefined) { work.level(cmd.onLevel); roof.onLevel = cmd.onLevel; parts.push(`onLevel ${cmd.onLevel}`); }
  if (cmd.kind !== undefined) { roof.kind = cmd.kind; parts.push(`kind ${cmd.kind}`); }
  if (cmd.cells !== undefined) { roof.cells = cmd.cells; parts.push(`cells ${cellsText(cmd.cells)}`); }
  if (cmd.overhang !== undefined) { roof.overhang = cmd.overhang; parts.push(`overhang ${fmt(cmd.overhang)}`); }
  if (cmd.skylights !== undefined) {
    if (cmd.skylights.length) roof.skylights = cmd.skylights; else delete roof.skylights;
    parts.push(`${cmd.skylights.length} skylights`);
  }
  for (const k of ['pitchDeg', 'fall', 'ridge', 'eaveOffset', 'vergeOverhang', 'height'] as const) {
    if (patch(roof, k, cmd[k] as never)) parts.push(`${k} ${cmd[k] ?? 'removed'}`);
  }
  if (!parts.length) fail('bad-args', 'Nothing to change.');
  work.changed();
  work.record(index, cmd.op, `Roof "${roof.id}": ${parts.join('; ')}.`);
};

const removeRoof: Handler<z.infer<typeof RemoveRoof>> = (work, cmd, index) => {
  const { roof, index: i } = work.roof(cmd.roof);
  work.house.roofs.splice(i, 1);
  work.changed();
  work.record(index, cmd.op, `Removed roof "${roof.id}".`, [], [roof.id]);
};

/** True for a time zone the platform knows (Intl); without Intl any name passes. */
function validTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch (e) {
    return !(e instanceof RangeError);
  }
}

const updateSite: Handler<z.infer<typeof UpdateSite>> = (work, cmd, index) => {
  const site = work.house.site;
  const parts: string[] = [];
  for (const k of ['width', 'depth', 'northDeg', 'latitude', 'longitude'] as const) {
    if (cmd[k] !== undefined) { site[k] = cmd[k]; parts.push(`${k} ${cmd[k]}`); }
  }
  if (patch(site, 'utcOffsetHours', cmd.utcOffsetHours)) parts.push(`utcOffsetHours ${cmd.utcOffsetHours ?? 'default'}`);
  if (cmd.timeZone && !validTimeZone(cmd.timeZone)) fail('bad-args', `Unknown time zone "${cmd.timeZone}" (use an IANA name such as "Asia/Shanghai").`);
  if (patch(site, 'timeZone', cmd.timeZone)) parts.push(`timeZone ${cmd.timeZone ?? 'removed'}`);
  if (patch(site, 'placeName', cmd.placeName)) parts.push(`place ${cmd.placeName ?? 'removed'}`);
  if (patch(site, 'fence', cmd.fence)) parts.push(cmd.fence ? `fence ${fmt(cmd.fence.height)} high, ${cmd.fence.gates.length} gates` : 'fence removed');
  if (!parts.length) fail('bad-args', 'Nothing to change.');
  work.changed();
  work.record(index, cmd.op, `Site: ${parts.join(', ')}.`);
};

const setStyle: Handler<z.infer<typeof SetStyle>> = (work, cmd, index) => {
  work.house.style = cmd.style;
  work.record(index, cmd.op, `Style set to "${cmd.style}".`);
};

const renameHouse: Handler<z.infer<typeof RenameHouse>> = (work, cmd, index) => {
  work.house.name = cmd.name;
  work.record(index, cmd.op, `House renamed to "${cmd.name}".`);
};

const HANDLERS: { [K in Command['op']]: Handler<Extract<Command, { op: K }>> } = {
  add_grid_line: addGridLine,
  move_grid_line: moveGridLine,
  remove_grid_line: removeGridLine,
  add_level: addLevel,
  remove_level: removeLevel,
  update_level: updateLevel,
  add_space: addSpace,
  update_space: updateSpace,
  remove_space: removeSpace,
  add_opening: addOpening,
  update_opening: updateOpening,
  remove_opening: removeOpening,
  add_stair: addStair,
  remove_stair: removeStair,
  add_roof: addRoof,
  update_roof: updateRoof,
  remove_roof: removeRoof,
  update_site: updateSite,
  set_style: setStyle,
  rename_house: renameHouse,
};

// ---------------------------------------------------------------------------
// Batch

function parseCommand(raw: unknown, index: number): Command | Issue {
  const r = Command.safeParse(raw);
  if (r.success) return r.data;
  const op = raw && typeof raw === 'object' && 'op' in raw ? String((raw as { op: unknown }).op) : undefined;
  const where = { command: index };
  if (op === undefined || !(COMMAND_OPS as string[]).includes(op)) {
    const near = op ? nearestIds(op, COMMAND_OPS, 3) : [];
    return { code: 'command-schema', severity: 'error', message: `Command ${index}: ${op === undefined ? 'missing "op"' : `unknown op "${op}"${near.length ? ` (did you mean ${near.join(', ')}?)` : ''}`}. Valid ops: ${COMMAND_OPS.join(', ')}.`, where };
  }
  const details = r.error.issues.map((i) => {
    const path = i.path.join('.');
    const keys = 'keys' in i && Array.isArray(i.keys) ? ` (${(i.keys as string[]).join(', ')})` : '';
    return `${path || '(command)'}: ${i.message}${keys}`;
  });
  return { code: 'command-schema', severity: 'error', message: `Command ${index} (${op}) is malformed: ${details.join('; ')}.`, where };
}

const issueKey = (i: Issue) => `${i.code}|${JSON.stringify(i.where)}`;

/**
 * Openings the batch did not touch must not jump to another wall because a
 * space's cells changed (their span now lies on a different grid line).
 */
function movedOpenings(before: Analysis, after: Analysis, touched: ReadonlySet<string>): Issue[] {
  const issues: Issue[] = [];
  for (const ctx of after.ctxs) {
    for (const o of ctx.level.openings) {
      if (touched.has(o.id)) continue;
      const q = placedOf(before, o.id);
      if (!q) continue;
      const hs = resolveHostSpan(after.grid, ctx, o.host);
      if (!hs || 'code' in hs) continue;
      const was = runIds(before.grid, q.span.run).line;
      const now = runIds(after.grid, hs.run).line;
      if (q.orient === hs.run.orient && was === now) continue;
      issues.push({
        code: 'opening-moved', severity: 'error',
        message: `Opening "${o.id}" was not edited in this batch, but it would jump from the wall on grid line ${was} to grid line ${now} (it is on ${hostText(o.host)}, whose cells changed). Re-host it with update_opening (or remove it) in the same batch, or keep that edge of the space where it was.`,
        where: { level: ctx.level.id, opening: o.id },
      });
    }
  }
  return issues;
}

const bySeverity = (a: Issue, b: Issue) => (a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1);

/**
 * Apply a batch of commands atomically. Pure: works on a copy. If any
 * command fails, or the resulting house has an error that the original did
 * not have, the original house is returned with the issues (rollback).
 * Warnings never block.
 */
export function applyCommands(house: House, commands: readonly unknown[]): ApplyResult {
  const original = house;
  if (!Array.isArray(commands) || commands.length === 0) {
    return { ok: false, house: original, applied: [], issues: [{ code: 'command-schema', severity: 'error', message: 'Expected a non-empty array of commands.', where: {} }] };
  }
  const work = new Work(clone(house));
  const errors: Issue[] = [];
  commands.forEach((raw, index) => {
    const cmd = parseCommand(raw, index);
    if ('severity' in cmd) { errors.push(cmd); return; }
    try {
      (HANDLERS[cmd.op] as Handler<Command>)(work, cmd, index);
    } catch (e) {
      if (!(e instanceof CommandError)) throw e;
      errors.push({ code: e.code, severity: 'error', message: `Command ${index} (${cmd.op}): ${e.message}`, where: { ...e.where, command: index } });
      work.changed();
    }
  });
  if (errors.length) {
    errors.push({ code: 'rolled-back', severity: 'error', message: `No changes were kept (${errors.length} command${errors.length > 1 ? 's' : ''} failed). Fix them and send the whole batch again.`, where: {} });
    return { ok: false, house: original, issues: errors, applied: work.applied };
  }
  const before = validate(original);
  const known = new Set(before.filter((i) => i.severity === 'error').map(issueKey));
  let issues = validate(work.house);
  if (!issues.some((i) => i.code === 'schema')) {
    // A jumped opening explains its own follow-on errors (no wall there, overlaps).
    const moved = movedOpenings(analyse(original), work.analysis(), work.touched);
    const ids = new Set(moved.map((i) => i.where.opening));
    issues = [...moved, ...issues.filter((i) => !(i.where.opening && ids.has(i.where.opening)))];
  }
  const fresh = issues.filter((i) => i.severity === 'error' && !known.has(issueKey(i)));
  issues.sort(bySeverity);
  if (fresh.length) {
    issues.push({ code: 'rolled-back', severity: 'error', message: `No changes were kept: the batch would leave ${fresh.length} error${fresh.length > 1 ? 's' : ''}. Fix them (add the missing commands or change the failing ones) and send the whole batch again.`, where: {} });
    return { ok: false, house: original, issues, applied: work.applied };
  }
  return { ok: true, house: work.house, issues, applied: work.applied };
}
