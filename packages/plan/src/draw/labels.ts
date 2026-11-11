// Room labels: Chinese name over small tracked uppercase English, placed at
// the most open spot of the room (largest clearance from furniture, door
// swings, stairs, walls and other text). Furniture yields when nothing fits.
import type { LevelPlan, SpaceInfo } from '@opensu/furnish';
import { footprint, isSolid, type Placement } from '@opensu/furnish';
import { contains, overlaps, type Rect } from '@opensu/furnish';
import { attrs, f, type View } from '../svg';
import { escapeXml, textWidth } from '../text';
import { color, font as baseFont, type Typography, typography } from '../tokens';

export interface TextBox extends Rect {
  text: string;
  kind: 'label' | 'dim' | 'stair' | 'title' | 'north';
  space?: string;
}

/** `vertical`: the Chinese name stacked one character per line (narrow rooms). */
interface Variant { cn: number; en: number | null; vertical?: boolean }

/** Enlarged text (sheets): the screen plan's smaller forms, tried only after furniture has yielded. */
const lastResort = (font: Typography['font']): Variant[] => font.cnSizeTiny > baseFont.cnSizeTiny
  ? [{ cn: baseFont.cnSize, en: null }, { cn: baseFont.cnSizeSmall, en: null }, { cn: baseFont.cnSizeTiny, en: null }, { cn: baseFont.cnSizeTiny, en: null, vertical: true }]
  : [];

const variants = (font: Typography['font']): Variant[] => [
  { cn: font.cnSize, en: font.enSize },
  { cn: font.cnSizeSmall, en: font.enSizeSmall },
  { cn: font.cnSize, en: null },
  { cn: font.cnSizeSmall, en: null },
  { cn: font.cnSizeTiny, en: null },
  { cn: font.cnSizeSmall, en: null, vertical: true },
  { cn: font.cnSizeTiny, en: null, vertical: true },
];

function boxSize(sp: SpaceInfo, va: Variant, ty: Typography) {
  if (va.vertical) {
    const n = [...sp.name].length;
    return { w: va.cn, h: n * va.cn * 1.08, en: null, cnW: va.cn, enW: 0 };
  }
  const cnW = textWidth(sp.name, va.cn);
  const en = va.en && sp.nameEn ? sp.nameEn.toUpperCase() : null;
  const enW = en ? textWidth(en, va.en!, ty.font.enTracking) : 0;
  const h = va.cn + (en ? ty.font.labelGap + va.en! * 0.8 : 0);
  return { w: Math.max(cnW, enW), h, en, cnW, enW };
}

/** Outdoor spaces that are not worth a label (narrow planters). */
function wantsLabel(sp: SpaceInfo): boolean {
  // Stairs are labelled by their 上 / 下 arrows.
  if (sp.type === 'stair') return false;
  if (!sp.outdoor) return true;
  if (sp.type === 'garden') {
    const short = Math.min(sp.main.x1 - sp.main.x0, sp.main.y1 - sp.main.y0);
    return short >= 2500 && sp.area >= 8e6;
  }
  return true;
}

export interface LabelResult { svg: string; boxes: TextBox[]; removed: Set<string>; missing: string[] }

/**
 * `compact` (small screens): Chinese names only, and furniture yields before
 * a name is set smaller, so names stay as large as the room allows.
 */
export function placeLabels(plan: LevelPlan, v: View, items: Placement[], swings: Rect[], taken: TextBox[], wallBoxes: Rect[], ty: Typography = typography(), compact = false): LabelResult {
  const VARIANTS = variants(ty.font);
  const removed = new Set<string>();
  const boxes: TextBox[] = [];
  const missing: string[] = [];
  let svg = '';
  const pad = ty.font.labelPad;
  const stairs = plan.stairs.map((s) => v.rect(s.clip));
  const swingPx = swings.map((r) => v.rect(r));
  const wallPx = wallBoxes.map((r) => v.rect(r));

  // Larger rooms first: they have the most freedom, small ones get what is left.
  const order = plan.spaces.filter(wantsLabel).sort((a, b) => (a.outdoor === b.outdoor ? b.area - a.area : a.outdoor ? 1 : -1));
  for (const sp of order) {
    const parts = sp.parts.map((r) => v.rect(r)).filter((r) => r.x1 - r.x0 > 8 && r.y1 - r.y0 > 8);
    const centroid = (() => {
      const r = v.rect(sp.clear);
      return [(r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2] as [number, number];
    })();
    const attemptWith = (gone: ReadonlySet<string>, variants: Variant[]): boolean => {
      const live = items.filter((p) => !gone.has(p.id));
      const solids = live.filter((p) => isSolid(p) || p.kind === 'counter').map((p) => v.rect(footprint(p)));
      const softs = live.filter((p) => p.layer === 'floor').map((p) => v.rect(footprint(p)));
      const obstacles = [...solids, ...swingPx, ...stairs, ...wallPx, ...taken, ...boxes];
      for (const va of variants) {
        // Outdoor labels are optional: only the full form. Stacked names only in niches.
        if (sp.outdoor && va.en === null && !compact) continue;
        if (va.vertical && !compact && Math.min(sp.clear.x1 - sp.clear.x0, sp.clear.y1 - sp.clear.y0) > 900) continue;
        const { w, h } = boxSize(sp, va, ty);
        const best = bestSpot(parts, w + 2 * pad, h + 2 * pad, obstacles, softs, centroid);
        if (!best) continue;
        const cx = best[0], top = best[1] - h / 2;
        svg += labelSvg(sp, va, cx, top, ty);
        boxes.push({ x0: cx - w / 2, x1: cx + w / 2, y0: top, y1: top + h, text: sp.name, kind: 'label', space: sp.id });
        return true;
      }
      return false;
    };
    // 1. The full label as things are. 2. The full label once this room's
    // rugs give way (a rug is the cheapest thing to lose). 3. Smaller forms,
    // then furniture yields piece by piece, lowest priority first.
    const BIG: Variant[] = [{ cn: ty.font.cnSize, en: null }, { cn: ty.font.cnSize, en: null, vertical: true }];
    let done = attemptWith(removed, compact ? BIG.slice(0, 1) : VARIANTS.slice(0, 1));
    // Outdoor names are optional: on small screens only at full size.
    if (!done && compact && sp.outdoor) continue;
    if (!done && compact) {
      // Furniture yields first, piece by piece; only then do names shrink.
      for (let attempt = 0; attempt < 12 && !done; attempt++) {
        if (attemptWith(removed, BIG)) { done = true; break; }
        const live = items.filter((p) => !removed.has(p.id));
        const victim = live.filter((p) => p.space === sp.id && p.layer !== 'top' && p.layer !== 'plant' && p.priority < 9)
          .sort((a, b) => a.priority - b.priority || dist(a, centroid, v) - dist(b, centroid, v))[0];
        if (!victim) break;
        removed.add(victim.id);
        for (const p of live) if (p.layer === 'top' && victim.kind === 'counter' && overlaps(footprint(p), footprint(victim))) removed.add(p.id);
      }
    }
    if (!done) {
      const rugs = items.filter((p) => p.space === sp.id && p.layer === 'floor' && p.priority <= 1);
      if (rugs.length) {
        const trial = new Set([...removed, ...rugs.map((p) => p.id)]);
        if (attemptWith(trial, VARIANTS.slice(0, 1))) { for (const p of rugs) removed.add(p.id); done = true; }
      }
    }
    for (let attempt = 0; attempt < 12 && !done; attempt++) {
      if (attemptWith(removed, compact ? VARIANTS.filter((x) => x.en === null) : VARIANTS)) { done = true; break; }
      const live = items.filter((p) => !removed.has(p.id));
      const mine = live.filter((p) => p.space === sp.id && p.layer !== 'top').sort((a, b) => a.priority - b.priority || dist(a, centroid, v) - dist(b, centroid, v));
      const victim = mine.find((p) => p.priority < 8);
      if (!victim) break;
      removed.add(victim.id);
      // Items on top of a removed piece go with it.
      for (const p of live) if (p.layer === 'top' && victim.kind === 'counter' && overlaps(footprint(p), footprint(victim))) removed.add(p.id);
    }
    if (!done && lastResort(ty.font).length) done = attemptWith(removed, lastResort(ty.font));
    if (!done && !sp.outdoor) missing.push(sp.id);
  }
  return { svg, boxes, removed, missing };
}

const dist = (p: Placement, c: [number, number], v: View) => Math.hypot(v.x(p.x) - c[0], v.y(p.y) - c[1]);

function bestSpot(parts: Rect[], w: number, h: number, obstacles: Rect[], softs: Rect[], centroid: [number, number]): [number, number] | null {
  let best: [number, number] | null = null;
  let bestScore = -Infinity;
  for (const part of parts) {
    if (part.x1 - part.x0 < w || part.y1 - part.y0 < h) continue;
    const step = 3;
    for (let cy = part.y0 + h / 2; cy <= part.y1 - h / 2 + 0.01; cy += step) {
      for (let cx = part.x0 + w / 2; cx <= part.x1 - w / 2 + 0.01; cx += step) {
        const b = { x0: cx - w / 2, x1: cx + w / 2, y0: cy - h / 2, y1: cy + h / 2 };
        if (obstacles.some((o) => overlaps(o, b, 0.01))) continue;
        // Rugs: fully on or fully off, never across an edge.
        // Rugs read as furniture: labels stay off them (with a little air).
        if (softs.some((s) => overlaps(s, b, -6))) continue;
        // Clearance to the nearest obstacle or part edge, capped so the
        // room centre wins once there is comfortable space.
        let clr = Math.min(b.x0 - part.x0, part.x1 - b.x1, b.y0 - part.y0, part.y1 - b.y1);
        for (const o of obstacles) {
          const dx = Math.max(0, o.x0 - b.x1, b.x0 - o.x1), dy = Math.max(0, o.y0 - b.y1, b.y0 - o.y1);
          clr = Math.min(clr, Math.hypot(dx, dy));
        }
        const score = Math.min(clr, 22) * 4 - Math.hypot(cx - centroid[0], cy - centroid[1]) * 0.25;
        if (score > bestScore) { bestScore = score; best = [cx, cy]; }
      }
    }
  }
  return best;
}

function labelSvg(sp: SpaceInfo, va: Variant, cx: number, top: number, ty: Typography): string {
  const lb = boxSize(sp, va, ty);
  if (va.vertical) {
    return [...sp.name].map((ch, i) => `<text${attrs({ x: cx, y: top + va.cn * (1.08 * i + 0.88), 'text-anchor': 'middle', 'font-family': ty.font.cjk, 'font-size': va.cn, fill: color.labelCn })}>${escapeXml(ch)}</text>`).join('');
  }
  let s = `<text${attrs({ x: cx, y: top + va.cn * 0.88, 'text-anchor': 'middle', 'font-family': ty.font.cjk, 'font-size': va.cn, fill: color.labelCn })}>${escapeXml(sp.name)}</text>`;
  if (lb.en && va.en) {
    const tr = ty.font.enTracking * va.en;
    s += `<text${attrs({ x: cx + tr / 2, y: top + va.cn + ty.font.labelGap + va.en * 0.8, 'text-anchor': 'middle', 'font-family': ty.font.latin, 'font-size': va.en, 'letter-spacing': f(tr), fill: color.labelEn })}>${escapeXml(lb.en)}</text>`;
  }
  return s;
}
