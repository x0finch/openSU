// Lazy chunk: SVG floor plans from @opensu/plan.
import type { ResolvedHouse } from '@opensu/model';
import { renderPlanDetailed } from '@opensu/plan';

export interface PlanDrawing {
  svg: string;
  width: number;
  height: number;
  /** Model mm -> drawing px (the walk mini-map places its marker with it). */
  px: (x: number, y: number) => [number, number];
}

const cache = new WeakMap<ResolvedHouse, Map<string, PlanDrawing>>();

export function planDrawing(house: ResolvedHouse, levelId: string): PlanDrawing {
  let byLevel = cache.get(house);
  if (!byLevel) cache.set(house, (byLevel = new Map()));
  let d = byLevel.get(levelId);
  if (!d) {
    const r = renderPlanDetailed(house, levelId);
    const v = r.view;
    d = { svg: r.svg, width: r.width, height: r.height, px: (x, y) => [v.x(x), v.y(y)] };
    byLevel.set(levelId, d);
  }
  return d;
}
