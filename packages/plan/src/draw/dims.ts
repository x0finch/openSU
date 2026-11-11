// Dimension chains on all four sides: tier 1 = segments between the grid
// lines that bound walls seen from that side, tier 2 = overall.
import type { Side } from '@opensu/model';
import type { LevelPlan } from '../analyse';
import { overlaps, type Rect } from '../geom';
import { attrs, f, line, type View } from '../svg';
import { textWidth } from '../text';
import { color, stroke, type Typography, typography } from '../tokens';
import type { TextBox } from './labels';

interface Seg { lo: number; hi: number; at: number }

/** Merge collinear wall pieces (and rails) into runs per line. */
function runs(plan: LevelPlan, orient: 'NS' | 'EW', rails = true): Seg[] {
  const raw: Seg[] = [];
  for (const w of plan.walls) if (w.orient === orient) raw.push(seg(w.a, w.b, orient));
  if (rails) for (const e of plan.level.edges) if (e.orient === orient && e.treatment !== 'none') raw.push(seg(e.a, e.b, orient));
  raw.sort((a, b) => a.at - b.at || a.lo - b.lo);
  const out: Seg[] = [];
  for (const s of raw) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.at - s.at) < 1 && s.lo <= last.hi + 1) last.hi = Math.max(last.hi, s.hi);
    else out.push({ ...s });
  }
  return out;
}

const seg = (a: [number, number], b: [number, number], orient: 'NS' | 'EW'): Seg => orient === 'NS'
  ? { at: a[0], lo: Math.min(a[1], b[1]), hi: Math.max(a[1], b[1]) }
  : { at: a[1], lo: Math.min(a[0], b[0]), hi: Math.max(a[0], b[0]) };

/** Space boundaries that are dimensioned like walls (parking bays). */
function extraRuns(plan: LevelPlan, orient: 'NS' | 'EW'): Seg[] {
  const out: Seg[] = [];
  for (const sp of plan.spaces) {
    if (sp.type !== 'carport') continue;
    for (const r of sp.rings) for (let i = 0; i < r.length; i++) {
      const a = r[i]!, b = r[(i + 1) % r.length]!;
      const o = a[0] === b[0] ? 'NS' : 'EW';
      if (o === orient) out.push(seg(a, b, o));
    }
  }
  return out;
}

/**
 * Positions (mm along the side) of the lines bounding walls visible from
 * `side`: a wall or rail run counts when a ray from its end towards that side
 * meets no other run (plot fence and plain plot edges do not block) and the
 * run reaches the outside there (not a T into an inner facade line).
 */
export function chainPositions(plan: LevelPlan, side: Side): number[] {
  const perpOrient = side === 'N' || side === 'S' ? 'NS' : 'EW';
  const crossOrient = perpOrient === 'NS' ? 'EW' : 'NS';
  const perp = [...runs(plan, perpOrient), ...extraRuns(plan, perpOrient)];
  const cross = runs(plan, crossOrient);
  const dir = side === 'N' || side === 'E' ? 1 : -1;
  const pos = new Set<number>();
  // Runs perpendicular to the side: ray from their outer end.
  // The building's outermost wall line on this side (walls only, not rails).
  const wallCross = plan.walls.filter((w) => w.orient === crossOrient).map((w) => seg(w.a, w.b, crossOrient).at);
  const wallRuns = runs(plan, crossOrient, false);
  const extreme = wallCross.length ? (dir > 0 ? Math.max(...wallCross) : Math.min(...wallCross)) : null;
  for (const r of perp) {
    const start = dir > 0 ? r.hi : r.lo;
    const blocked = cross.some((c) => dir * (c.at - start) > 0.5 && c.lo < r.at - 0.5 && c.hi > r.at + 0.5);
    if (blocked) continue;
    // A partition that stops in a T against a wall run reaches the outside
    // only when that run is the outermost facade on this side.
    const tee = wallRuns.find((c) => Math.abs(c.at - start) < 0.5 && c.lo < r.at - 0.5 && c.hi > r.at + 0.5);
    if (tee && extreme !== null && Math.abs(tee.at - extreme) > 0.5) continue;
    pos.add(r.at);
  }
  if (plan.plot) {
    const p = plan.plot;
    if (side === 'N' || side === 'S') { pos.add(p.x0); pos.add(p.x1); } else { pos.add(p.y0); pos.add(p.y1); }
  }
  return [...pos].map((n) => Math.round(n)).sort((a, b) => a - b).filter((n, i, arr) => i === 0 || n - arr[i - 1]! > 1);
}

export interface DimResult { svg: string; boxes: TextBox[]; extentPx: Rect; /** Extent of the plan plus dimension lines (no text). */ linesPx: Rect }

/**
 * Draw the chains around `ext` (plan extent in px). `planBox` is the drawn
 * building in px; text boxes go into `taken` so later text avoids them.
 */
export function drawDims(plan: LevelPlan, v: View, ext: Rect, taken: TextBox[], typo: Typography = typography()): DimResult {
  let svg = '';
  const boxes: TextBox[] = [];
  let outer: Rect = { ...ext };
  let lines: Rect = { ...ext };
  for (const side of ['N', 'S', 'W', 'E'] as Side[]) {
    const pts = chainPositions(plan, side);
    if (pts.length < 2) continue;
    const horiz = side === 'N' || side === 'S';
    const out = side === 'N' || side === 'W' ? -1 : 1;
    const base = horiz ? (out < 0 ? ext.y0 : ext.y1) : (out < 0 ? ext.x0 : ext.x1);
    const t1 = base + out * typo.layout.dimOffset1;
    const tiers = pts.length > 2 ? [t1, t1 + out * typo.layout.dimTierGap] : [t1];
    const tLast = tiers[tiers.length - 1]!;
    const P = (along: number, across: number): [number, number] => (horiz ? [v.x(along), across] : [across, v.y(along)]);
    const extFrom = base + out * typo.layout.dimExtGap;
    const a = { stroke: color.dimLine, 'stroke-width': stroke.dimExt };
    // Extension lines: segment points to tier 1, end points to the last tier.
    pts.forEach((p, i) => {
      const isEnd = i === 0 || i === pts.length - 1;
      const to = (isEnd ? tLast : t1) + out * typo.layout.dimExtOver;
      const [x1, y1] = P(p, extFrom), [x2, y2] = P(p, to);
      svg += line(x1, y1, x2, y2, a);
    });
    const tick = (p: number, t: number) => {
      const [x, y] = P(p, t);
      const h = typo.layout.dimTickLen / 2 / Math.SQRT2 * Math.SQRT2;
      return line(x - h * 0.7, y + h * 0.7, x + h * 0.7, y - h * 0.7, { stroke: color.dimTick, 'stroke-width': stroke.dimTick, 'stroke-linecap': 'butt' });
    };
    const over = typo.layout.dimExtOver * 0.8;
    const drawTier = (t: number, list: number[]) => {
      const [x1, y1] = P(list[0]!, t), [x2, y2] = P(list[list.length - 1]!, t);
      svg += horiz ? line(x1 - over, y1, x2 + over, y2, { stroke: color.dimLine, 'stroke-width': stroke.dim })
        : line(x1, y1 + over, x2, y2 - over, { stroke: color.dimLine, 'stroke-width': stroke.dim });
      for (const p of list) svg += tick(p, t);
      // Numbers: centred above the line; narrow segments shrink, then move
      // outside next to their segment, then stagger outwards.
      const placed: TextBox[] = [];
      for (let i = 0; i < list.length - 1; i++) {
        const lo = list[i]!, hi = list[i + 1]!;
        const txt = String(Math.round(hi - lo));
        const segPx = v.len(hi - lo);
        const cands: { size: number; along: number; lift: number }[] = [];
        for (const size of [typo.font.dimSize, typo.font.dimSizeSmall]) cands.push({ size, along: (lo + hi) / 2, lift: 0 });
        const wS = textWidth(txt, typo.font.dimSizeSmall) + 6;
        cands.push({ size: typo.font.dimSizeSmall, along: lo - (wS / 2 + 3) / v.s, lift: 0 });
        cands.push({ size: typo.font.dimSizeSmall, along: hi + (wS / 2 + 3) / v.s, lift: 0 });
        cands.push({ size: typo.font.dimSizeSmall, along: (lo + hi) / 2, lift: typo.font.dimSizeSmall + 3 });
        let chosen: TextBox | null = null;
        for (const c of cands) {
          const w = textWidth(txt, c.size);
          const fits = c.lift > 0 || c.along < lo || c.along > hi || w + 6 <= segPx;
          if (!fits) continue;
          const dist = typo.layout.dimTextGap + c.lift;
          const [cx, cy] = P(c.along, t);
          // "Above" the line = away from the plan for N/W, towards it for S/E
          // (numbers always read from the bottom or the right).
          const b: TextBox = horiz
            ? { x0: cx - w / 2, x1: cx + w / 2, y1: cy - dist, y0: cy - dist - c.size * 0.74, text: txt, kind: 'dim' }
            : { y0: cy - w / 2, y1: cy + w / 2, x1: cx - dist, x0: cx - dist - c.size * 0.74, text: txt, kind: 'dim' };
          const clash = [...placed, ...taken, ...boxes].some((o) => overlaps(o, b, -1.5));
          if (clash) continue;
          chosen = b;
          const tx = horiz ? cx : cx - dist;
          const ty = horiz ? cy - dist : cy;
          svg += `<text${attrs({ x: tx, y: ty, 'text-anchor': 'middle', 'font-family': typo.font.latin, 'font-size': c.size, 'font-weight': 300, fill: color.dimText, ...(horiz ? {} : { transform: `rotate(-90 ${f(tx)} ${f(ty)})` }) })}>${txt}</text>`;
          break;
        }
        if (chosen) placed.push(chosen);
      }
      boxes.push(...placed);
    };
    drawTier(t1, pts);
    if (tiers.length > 1) drawTier(tLast, [pts[0]!, pts[pts.length - 1]!]);
    const reach = tLast + out * (typo.font.dimSize + 8 * typo.scale);
    const lineReach = tLast + out * typo.layout.dimExtOver;
    if (horiz) lines = out < 0 ? { ...lines, y0: Math.min(lines.y0, lineReach) } : { ...lines, y1: Math.max(lines.y1, lineReach) };
    else lines = out < 0 ? { ...lines, x0: Math.min(lines.x0, lineReach) } : { ...lines, x1: Math.max(lines.x1, lineReach) };
    if (horiz) outer = out < 0 ? { ...outer, y0: Math.min(outer.y0, reach) } : { ...outer, y1: Math.max(outer.y1, reach) };
    else outer = out < 0 ? { ...outer, x0: Math.min(outer.x0, reach) } : { ...outer, x1: Math.max(outer.x1, reach) };
  }
  return { svg, boxes, extentPx: outer, linesPx: lines };
}
