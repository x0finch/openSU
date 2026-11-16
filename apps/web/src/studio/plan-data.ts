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

/** Every font size used by texts of one colour (room names: the stair arrows 上 / 下 aside). */
function sizesOf(svg: string, fill: string): Set<number> {
  const re = new RegExp(`<text[^>]*font-size="([\\d.]+)"[^>]*fill="${fill}"[^>]*>([^<]*)</text>`, 'g');
  const out = new Set<number>();
  for (const m of svg.matchAll(re)) if (m[2] !== '上' && m[2] !== '下') out.add(Number(m[1]));
  return out;
}

type Sheet = Drawn & { ox: number; oy: number; uniform: boolean };

/** Registered drawings use one size per kind of text: cached apart from the others. */
const uniformCache = new WeakMap<ResolvedHouse, Map<string, Sheet>>();
function sheet(house: ResolvedHouse, levelId: string, k: number, compact: boolean): Sheet {
  let byLevel = uniformCache.get(house);
  if (!byLevel) uniformCache.set(house, (byLevel = new Map()));
  const key = `${levelId}@${k.toFixed(2)}${compact ? 'c' : ''}`;
  let d = byLevel.get(key);
  if (!d) {
    const r = renderPlanDetailed(house, levelId, { ...(k === 1 ? {} : { textScale: k }), ...(compact ? { compact } : {}), uniformText: true });
    const v = r.view;
    // The plan's name for assistive tech without the browser's hover tooltip (task 023): aria-label, no <title>.
    const name = /<title>([^<]*)<\/title>/.exec(r.svg)?.[1] ?? '';
    const svg = r.svg.replace(/<title>[^<]*<\/title>/, '').replace('<svg ', `<svg role="img" aria-label="${name.replace(/"/g, "&quot;")}" `);
    const [x0, y0] = [v.x(0), v.y(0)];
    const one = (fill: string) => sizesOf(svg, fill).size <= 1;
    d = {
      svg, width: r.width, height: r.height, textScale: k, px: (x, y) => [v.x(x), v.y(y)], minLabel: minRoomLabel(svg), ox: -x0, oy: -y0,
      clean: k === 1 || (checkPlan(r).length === 0 && r.missingLabels.length === 0),
      uniform: one(tokens.color.labelCn) && one(tokens.color.labelEn) && one(tokens.color.dimText),
    };
    byLevel.set(key, d);
  }
  return d;
}

function sheetsAt(house: ResolvedHouse, k: number, compact: boolean): { all: Sheet[]; w: number; h: number } {
  const all = house.levels.map((l) => sheet(house, l.id, k, compact));
  const x0 = Math.min(...all.map((d) => d.ox)), x1 = Math.max(...all.map((d) => d.ox + d.width));
  const y0 = Math.min(...all.map((d) => d.oy)), y1 = Math.max(...all.map((d) => d.oy + d.height));
  return { all, w: x1 - x0, h: y1 - y0 };
}

/**
 * The text size of a registered house plan (task 023): one for every level,
 * so a level switch changes neither the drawing's place nor its type, and
 * within a drawing one size for room names, one for their English lines and
 * one for dimension figures. The smallest size that brings room names to
 * `minLabelPx` on screen at the fitted zoom, or the largest size below it at
 * which every level still keeps that typography (clean, every room named);
 * text then stays the same size on screen on every level.
 */
export function housePlan(house: ResolvedHouse, fit: (w: number, h: number) => number, minLabelPx: number, compact = false): HousePlan {
  const pack = (k: number, all: Sheet[]): HousePlan => ({
    textScale: k,
    levels: Object.fromEntries(all.map((d, i) => [house.levels[i]!.id, { svg: d.svg, width: d.width, height: d.height, textScale: d.textScale, px: d.px, ox: d.ox, oy: d.oy }])),
  });
  if (!house.levels.length) return { textScale: 1, levels: {} };
  // The size room names need: names are cnSize x k, all of them.
  let need = 1;
  for (const k of SCALES) {
    need = k;
    const p = sheetsAt(house, k, compact);
    if (tokens.font.cnSize * k * fit(p.w, p.h) >= minLabelPx - 0.05) break;
  }
  for (const k of [...SCALES].reverse()) {
    if (k > need) continue;
    const p = sheetsAt(house, k, compact);
    if (k === 1 || p.all.every((d) => d.clean && d.uniform)) return pack(k, p.all);
  }
  return pack(1, sheetsAt(house, 1, compact).all);
}
