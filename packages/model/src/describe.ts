// Compact, deterministic plain-text description of a house for LLM context.
// Everything an author needs to write correct commands: grid ids and
// positions, spaces by cells, the walls around each room with what is on the
// other side, openings with their host span and absolute position, stairs,
// roofs and the current validation issues. See README "Description format".
import { bboxOf, cellsOf, setArea, type Grid } from './grid';
import type { Issue } from './issues';
import { analyse, runIds, type Analysis, type LevelCtx, type Piece } from './resolve';
import { isOutdoorType, type House, type Opening, type Roof, type Side } from './schema';
import { validate } from './validate';

const fmt = (n: number) => `${Math.round(n)}`;
const m = (mm: number) => (mm / 1000).toFixed(2).replace(/\.?0+$/, '');
const area = (mm2: number) => (mm2 / 1e6).toFixed(1);

function atText(o: Opening): string {
  if (o.at === 'center') return 'center';
  return `${o.at.from}+${fmt(o.at.offset)}`;
}

function hostShort(o: Opening): string {
  const span = o.host.span ? ` ${o.host.span.from}-${o.host.span.to}` : '';
  return 'space' in o.host ? `${o.host.space}:${o.host.side}${span}` : `${o.host.between[0]}|${o.host.between[1]}${span}`;
}

function extras(o: Opening): string {
  const x: string[] = [];
  if (o.spanLevels && o.spanLevels > 1) x.push(`spanLevels ${o.spanLevels}`);
  if (o.insert) x.push(o.insert);
  if (o.canopy) x.push(`canopy ${fmt(o.canopy.depth)}`);
  if (o.panel) x.push(`panel ${o.panel}`);
  if (o.swing) x.push(`swing into ${o.swing.into} hinge ${o.swing.hinge}`);
  return x.length ? ` ${x.join(', ')}` : '';
}

const SIDES: Side[] = ['N', 'E', 'S', 'W'];
/** Opening heights / sills printed only when they differ from these. */
const DEFAULTS: Record<Opening['kind'], { height: number; sill: number }> = {
  'door': { height: 2100, sill: 0 }, 'sliding-door': { height: 2400, sill: 0 }, 'window': { height: 1500, sill: 900 }, 'void': { height: 2100, sill: 0 },
};

/** Walls of an interior space, side by side: "N@K 1-2:gf-patio 2-3:gf-planter-n". */
function wallsText(grid: Grid, ctx: LevelCtx, si: number): string {
  const sid = (n: number) => (n < 0 ? 'out' : ctx.level.spaces[n]!.id);
  const out: string[] = [];
  for (const side of SIDES) {
    // Pieces on this space's boundary that face `side`.
    const facing = ctx.pieces.filter((p: Piece) => {
      if (side === 'N' || side === 'S') { if (p.orient !== 'EW') return false; } else if (p.orient !== 'NS') return false;
      // sides = [west|south, east|north]; the space is on the inner side.
      return side === 'N' || side === 'E' ? p.sides[0] === si : p.sides[1] === si;
    });
    if (!facing.length) continue;
    const byLine = new Map<number, Piece[]>();
    for (const p of facing) byLine.set(p.line, [...(byLine.get(p.line) ?? []), p]);
    const single = byLine.size === 1;
    const parts = [...byLine].sort((a, b) => a[0] - b[0]).map(([, ps]) => {
      const lineId = runIds(grid, ps[0]!).line;
      const segs = ps.sort((a, b) => a.from - b.from).map((p) => {
        const ids = runIds(grid, p);
        const other = side === 'N' || side === 'E' ? p.sides[1] : p.sides[0];
        const tag = p.kind === 'open' ? '~' : '';
        return `${ids.from}-${ids.to}:${tag}${sid(other)}`;
      });
      // One edge with one neighbour: no span needed to host an opening there.
      if (single && segs.length === 1) return `${side}@${lineId} ${segs[0]!.slice(segs[0]!.indexOf(':') + 1)}`;
      return `${side}@${lineId} ${segs.join(' ')}`;
    });
    out.push(parts.join('; '));
  }
  return out.join(' | ');
}

function roofText(grid: Grid, r: Roof): string {
  const parts = [`${r.id} ${r.kind} on ${r.onLevel} ${r.cells.map((c) => `${c.x0}-${c.x1}/${c.y0}-${c.y1}`).join('+')}`];
  if (r.pitchDeg !== undefined) parts.push(`pitch ${r.pitchDeg}`);
  if (r.fall) parts.push(`fall ${r.fall}`);
  if (r.ridge) parts.push(`ridge ${r.ridge}`);
  if (r.eaveOffset) parts.push(`eaveOffset ${fmt(r.eaveOffset)}`);
  parts.push(`overhang ${fmt(r.overhang)}`);
  if (r.vergeOverhang !== undefined) parts.push(`verge ${fmt(r.vergeOverhang)}`);
  if (r.height !== undefined) parts.push(`height ${fmt(r.height)}`);
  for (const s of r.skylights ?? []) parts.push(`skylight ${fmt(s.width)}x${fmt(s.length)} at (${fmt(s.at[0])},${fmt(s.at[1])})`);
  void grid;
  return parts.join(', ');
}

/**
 * Describe a house as compact plain text (deterministic). Pass `issues` to
 * reuse a validation you already ran; otherwise `validate` is called.
 */
export function describeHouse(house: House, issues?: readonly Issue[]): string {
  const found = issues ?? validate(house);
  const L: string[] = [];
  const s = house.site;
  L.push(`HOUSE "${house.name}" style ${house.style}`);
  L.push('Units mm; X east, Y north, origin = SW plot corner. Cells "6-7/F-K" = between X lines 6..7 and Y lines F..K.');
  L.push('Space rows: id type cells WxD(m) area(m²) "name" [flags] | walls of interior spaces per side: side@line span:neighbour (out = outside, ~ = open, no wall).');
  L.push('Opening rows: id kind host:side span at width[xheight sill] [extras] => from-to along its wall (x for N/S walls, y for E/W). at = start+offset from the west/south end of the span, end+offset, or center. Height/sill omitted = defaults (door 2100/0, sliding-door 2400/0, window 1500/900).');
  const gates = (s.fence?.gates ?? []).map((g) => `${g.id} ${g.side} ${g.at === 'center' ? 'center' : `${g.at.from}+${fmt(g.at.offset)}`} w${fmt(g.width)}${g.kind ? ` ${g.kind}` : ''}`);
  L.push(`SITE ${fmt(s.width)} x ${fmt(s.depth)}, north ${s.northDeg}°, lat ${s.latitude} lon ${s.longitude}${s.placeName ? ` (${s.placeName})` : ''}${s.timeZone ? ` ${s.timeZone}` : s.utcOffsetHours !== undefined ? ` UTC${s.utcOffsetHours >= 0 ? '+' : ''}${s.utcOffsetHours}` : ''}${s.fence ? `; fence h${fmt(s.fence.height)}${gates.length ? `, gates: ${gates.join('; ')}` : ''}` : '; no fence'}`);
  L.push(`GRID X ${house.grid.x.map((g) => `${g.id}=${fmt(g.pos)}`).join(' ')}`);
  L.push(`GRID Y ${house.grid.y.map((g) => `${g.id}=${fmt(g.pos)}`).join(' ')}`);

  // Analysis needs a schema-valid house; describe what we can otherwise.
  let an: Analysis | null = null;
  if (!found.some((i) => i.code === 'schema')) an = analyse(house);

  let elevation = 0;
  house.levels.forEach((level, li) => {
    const above = house.levels[li + 1];
    L.push('');
    L.push(`LEVEL ${level.id} "${level.name}" height ${fmt(level.height)}, floor +${fmt(elevation)}${above ? `, below ${above.id}` : ', top'}`);
    elevation += level.height;
    const ctx = an?.ctxs[li];
    L.push('spaces:');
    level.spaces.forEach((sp, si) => {
      const cells = an ? cellsOf(an.grid, sp.cells) : null;
      const bb = an && cells ? bboxOf(an.grid, cells) : null;
      const a = an && cells ? setArea(an.grid, cells) : 0;
      const rect = bb && a === (bb.x1 - bb.x0) * (bb.y1 - bb.y0);
      const size = bb ? `${rect ? '' : '~'}${m(bb.x1 - bb.x0)}x${m(bb.y1 - bb.y0)} ${area(a)}` : '?';
      const name = sp.name;
      const flags: string[] = [];
      if (sp.openTo?.length) flags.push(`openTo ${sp.openTo.join(',')}`);
      if (sp.edge && sp.edge !== 'none') flags.push(`edge ${sp.edge}`);
      if (sp.cover) flags.push(`cover ${sp.cover}`);
      if (sp.surface) flags.push(`surface ${sp.surface}`);
      const walls = ctx && an && !isOutdoorType(sp.type) ? ` | ${wallsText(an.grid, ctx, si)}` : '';
      L.push(`- ${sp.id} ${sp.type} ${sp.cells.map((c) => `${c.x0}-${c.x1}/${c.y0}-${c.y1}`).join('+')} ${size} "${name}"${flags.length ? ` [${flags.join('; ')}]` : ''}${walls}`);
    });
    if (level.openings.length) {
      L.push('openings:');
      for (const o of level.openings) {
        const p = ctx?.placed.find((q) => q.opening.id === o.id);
        const pos = p ? ` => ${fmt(p.lo)}-${fmt(p.hi)}` : ' => not placed';
        const d = DEFAULTS[o.kind];
        const size = `${fmt(o.width)}${o.height !== d.height || o.sill !== d.sill ? `x${fmt(o.height)} sill${fmt(o.sill)}` : ''}`;
        L.push(`- ${o.id} ${o.kind} ${hostShort(o)} ${atText(o)} ${size}${extras(o)}${pos}`);
      }
    }
    for (const st of level.stairs) L.push(`stair ${st.id}: ${st.kind}, in ${st.space}, first flight up ${st.up}, to ${above ? above.id : 'nothing'}`);
  });

  L.push('');
  L.push('ROOFS');
  for (const r of house.roofs) L.push(`- ${roofText(an?.grid as Grid, r)}`);
  const derived = house.levels.flatMap((l) => l.spaces.filter((sp) => sp.cover === 'canopy' && isOutdoorType(sp.type)).map((sp) => `${sp.id}:canopy`));
  if (derived.length) L.push(`- derived canopies (space cover): ${derived.join(', ')}`);
  if (house.entourage?.length) L.push(`ENTOURAGE ${house.entourage.map((e) => `${e.kind}@(${fmt(e.at[0])},${fmt(e.at[1])})`).join(' ')}`);
  L.push('');
  const total = an ? an.resolved.interiorArea : 0;
  if (an) L.push(`Interior floor area ${area(total)} m² (${an.resolved.levels.map((l) => `${l.id} ${area(l.interiorArea)}`).join(', ')})`);
  if (found.length === 0) L.push('ISSUES none');
  else {
    L.push(`ISSUES ${found.filter((i) => i.severity === 'error').length} errors, ${found.filter((i) => i.severity === 'warning').length} warnings`);
    for (const i of found) L.push(`- ${i.severity} ${i.code}: ${i.message}`);
  }
  return L.join('\n');
}
