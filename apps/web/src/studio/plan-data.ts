// Lazy chunk: SVG floor plans from @opensu/plan.
import type { ResolvedHouse } from '@opensu/model';
import { checkPlan, renderPlanDetailed, tokens } from '@opensu/plan';

export interface PlanDrawing {
  svg: string;
  width: number;
  height: number;
  /** Text size relative to the default screen plan. */
  textScale: number;
  /** Model mm -> drawing px (the walk mini-map places its marker with it). */
  px: (x: number, y: number) => [number, number];
}

type Drawn = PlanDrawing & { clean: boolean; minLabel: number };

/** Smallest room-name font size in a plan SVG (drawing px); stair arrows' 上 / 下 aside. */
function minRoomLabel(svg: string): number {
  const re = new RegExp(`<text[^>]*font-size="([\\d.]+)"[^>]*fill="${tokens.color.labelCn}"[^>]*>([^<]*)</text>`, 'g');
  let min = Infinity;
  for (const m of svg.matchAll(re)) {
    if (m[2] === '上' || m[2] === '下') continue;
    min = Math.min(min, Number(m[1]));
  }
  return Number.isFinite(min) ? min : tokens.font.cnSize;
}

const cache = new WeakMap<ResolvedHouse, Map<string, Drawn>>();

function draw(house: ResolvedHouse, levelId: string, textScale: number, compact = false): Drawn {
  let byLevel = cache.get(house);
  if (!byLevel) cache.set(house, (byLevel = new Map()));
  const key = `${levelId}@${textScale.toFixed(2)}${compact ? 'c' : ''}`;
  let d = byLevel.get(key);
  if (!d) {
    const r = renderPlanDetailed(house, levelId, { ...(textScale === 1 ? {} : { textScale }), ...(compact ? { compact } : {}) });
    const v = r.view;
    // Larger text must still fit: no overlaps, every room labelled.
    const clean = (textScale === 1 && !compact) || (checkPlan(r).length === 0 && r.missingLabels.length === 0);
    // No <title> in the studio (task 023): the browser shows it as a tooltip that stays over the drawing; the plan carries its title below.
    d = { svg: r.svg.replace(/<title>[^<]*<\/title>/, ''), width: r.width, height: r.height, textScale, clean, minLabel: minRoomLabel(r.svg), px: (x, y) => [v.x(x), v.y(y)] };
    byLevel.set(key, d);
  }
  return d;
}

/** Text never grows past this (dimension figures would crowd the drawing). */
const MAX_TEXT_SCALE = 3;

export function planDrawing(house: ResolvedHouse, levelId: string, textScale = 1): PlanDrawing {
  return draw(house, levelId, textScale);
}

/** Text sizes tried for a viewport (few distinct drawings, stable cache keys). */
const SCALES = [1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, MAX_TEXT_SCALE];

/**
 * The plan for a viewport: `fit(width, height)` gives the scale at which a
 * drawing of that size is shown. Room names are drawn large enough that the
 * smallest one is at least `minLabelPx` on screen at that scale (the plan's
 * `textScale`), with the plan free of overlaps and every room labelled.
 * Narrow rooms fall back to smaller names as text grows, so the result is
 * not monotonic: the smallest text size that works wins, else the one that
 * comes closest. `compact` (phones) drops the dimension chains and the
 * title, which leaves more of the screen to the rooms.
 */
export function planForViewport(house: ResolvedHouse, levelId: string, fit: (w: number, h: number) => number, minLabelPx: number, compact = false): PlanDrawing {
  const base = draw(house, levelId, 1, compact);
  const shown = (d: Drawn) => d.minLabel * fit(d.width, d.height);
  if (shown(base) >= minLabelPx - 0.05) return base;
  // No smaller text size can work: names are at most cnSize x textScale.
  const lower = minLabelPx / (tokens.font.cnSize * fit(base.width, base.height));
  let best = base;
  for (const k of SCALES) {
    if (k <= 1 || k < lower - 0.25) continue;
    const d = draw(house, levelId, k, compact);
    if (!d.clean) continue;
    if (shown(d) >= minLabelPx - 0.05) return d;
    if (shown(d) > shown(best) + 0.05) best = d;
  }
  return best;
}

/** One level of a registered house plan: its drawing and where it sits in the house's frame. */
export interface LevelSheet extends PlanDrawing {
  /** Offset of this drawing in the house frame (drawing px): every level maps model mm to the same point. */
  ox: number;
  oy: number;
}

/**
 * Every level of the house, drawn at one text size and registered (task
 * 023): in the house frame (drawing px, origin at model x = y = 0, y down)
 * a model point is at the same place on every level, so switching level
 * never moves the drawing. The text size is chosen as `planForViewport`
 * does, for the union of the levels: the smallest size at which every
 * level's room names reach `minLabelPx` at the fitted zoom, every level
 * clean.
 */
export interface HousePlan {
  textScale: number;
  levels: Record<string, LevelSheet>;
}

function sheetsAt(house: ResolvedHouse, k: number, compact: boolean): { all: (Drawn & { ox: number; oy: number })[]; w: number; h: number } {
  const all = house.levels.map((l) => {
    const d = draw(house, l.id, k, compact);
    const [x0, y0] = d.px(0, 0);
    return { ...d, ox: -x0, oy: -y0 };
  });
  const x0 = Math.min(...all.map((d) => d.ox)), x1 = Math.max(...all.map((d) => d.ox + d.width));
  const y0 = Math.min(...all.map((d) => d.oy)), y1 = Math.max(...all.map((d) => d.oy + d.height));
  return { all, w: x1 - x0, h: y1 - y0 };
}

export function housePlan(house: ResolvedHouse, fit: (w: number, h: number) => number, minLabelPx: number, compact = false): HousePlan {
  const pack = (k: number, all: (Drawn & { ox: number; oy: number })[]): HousePlan => ({
    textScale: k,
    levels: Object.fromEntries(all.map((d, i) => [house.levels[i]!.id, { svg: d.svg, width: d.width, height: d.height, textScale: d.textScale, px: d.px, ox: d.ox, oy: d.oy }])),
  });
  const shown = (p: ReturnType<typeof sheetsAt>) => Math.min(...p.all.map((d) => d.minLabel)) * fit(p.w, p.h);
  const base = sheetsAt(house, 1, compact);
  if (!house.levels.length || shown(base) >= minLabelPx - 0.05) return pack(1, base.all);
  const lower = minLabelPx / (tokens.font.cnSize * fit(base.w, base.h));
  let best = { k: 1, p: base };
  for (const k of SCALES) {
    if (k <= 1 || k < lower - 0.25) continue;
    const p = sheetsAt(house, k, compact);
    if (!p.all.every((d) => d.clean)) continue;
    if (shown(p) >= minLabelPx - 0.05) return pack(k, p.all);
    if (shown(p) > shown(best.p) + 0.05) best = { k, p };
  }
  return pack(best.k, best.p.all);
}
