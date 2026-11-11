// Automated overlap checks on a rendered plan: text/text, text/wall,
// furniture/wall, furniture/door swing, furniture/furniture.
import { footprint, isSolid } from './furnish/types';
import { overlaps, type Rect } from './geom';
import type { PlanReport } from './render';

export interface Overlap { kind: string; a: string; b: string }

export function checkPlan(r: PlanReport): Overlap[] {
  const out: Overlap[] = [];
  const v = r.view;
  const t = r.texts;
  for (let i = 0; i < t.length; i++) {
    for (let j = i + 1; j < t.length; j++) {
      if (overlaps(t[i]!, t[j]!, 0.01)) out.push({ kind: 'text/text', a: t[i]!.text, b: t[j]!.text });
    }
  }
  const wallsPx = r.walls.map((w) => v.rect(w));
  for (const b of t) {
    if (b.kind === 'dim' || b.kind === 'title' || b.kind === 'north') continue;
    const w = wallsPx.find((x) => overlaps(x, b, 0.01));
    if (w) out.push({ kind: 'text/wall', a: b.text, b: rectName(w) });
  }
  // Dimension and title text must stay clear of the drawing entirely.
  const furnPx = r.furniture.filter(isSolid).map((p) => ({ id: p.id, r: v.rect(footprint(p)) }));
  for (const b of t) {
    if (b.kind !== 'label' && b.kind !== 'stair') continue;
    const fp = furnPx.find((x) => overlaps(x.r, b, 0.01));
    if (fp) out.push({ kind: 'text/furniture', a: b.text, b: fp.id });
    const rug = r.furniture.filter((p) => p.layer === 'floor').find((p) => overlaps(v.rect(footprint(p)), b, 0.01));
    if (rug) out.push({ kind: 'text/rug', a: b.text, b: rug.id });
    const sw = r.swings.map((s) => v.rect(s)).find((s) => overlaps(s, b, 0.01));
    if (sw) out.push({ kind: 'text/door-swing', a: b.text, b: rectName(sw) });
  }
  const solids = r.furniture.filter((p) => isSolid(p) || p.kind === 'counter');
  for (const p of solids) {
    const fp = footprint(p);
    const w = r.walls.find((x) => overlaps(x, fp, 1));
    if (w) out.push({ kind: 'furniture/wall', a: p.id, b: rectName(w) });
    const s = r.swings.find((x) => overlaps(x, fp, 1));
    if (s) out.push({ kind: 'furniture/door-swing', a: p.id, b: rectName(s) });
  }
  for (let i = 0; i < solids.length; i++) {
    for (let j = i + 1; j < solids.length; j++) {
      const a = solids[i]!, b = solids[j]!;
      // Planting may cluster; counters carry tops; everything else must not touch.
      if (a.layer === 'plant' && b.layer === 'plant') continue;
      // Chairs tuck under their table (round tables: the boxes overlap at the corners).
      if (a.space === b.space && isSeating(a.kind) && isSeating(b.kind)) {
        const roundSet = a.kind === 'dining-table-round' || b.kind === 'dining-table-round' || (a.variant ?? '').startsWith('rot:') || (b.variant ?? '').startsWith('rot:');
        if (roundSet) continue;
      }
      if (overlaps(footprint(a), footprint(b), 1)) out.push({ kind: 'furniture/furniture', a: a.id, b: b.id });
    }
  }
  return out;
}

const rectName = (r: Rect) => `[${Math.round(r.x0)},${Math.round(r.y0)} ${Math.round(r.x1)},${Math.round(r.y1)}]`;

const isSeating = (k: string) => k === 'chair' || k === 'dining-table-round' || k === 'stool';
