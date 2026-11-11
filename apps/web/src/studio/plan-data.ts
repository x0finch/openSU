// Lazy chunk: SVG floor plans from @opensu/plan.
import type { ResolvedHouse } from '@opensu/model';
import { renderPlanDetailed } from '@opensu/plan';

export interface PlanDrawing {
  svg: string;
  width: number;
  height: number;
}

const cache = new WeakMap<ResolvedHouse, Map<string, PlanDrawing>>();

export function planDrawing(house: ResolvedHouse, levelId: string): PlanDrawing {
  let byLevel = cache.get(house);
  if (!byLevel) cache.set(house, (byLevel = new Map()));
  let d = byLevel.get(levelId);
  if (!d) {
    const r = renderPlanDetailed(house, levelId);
    d = { svg: r.svg, width: r.width, height: r.height };
    byLevel.set(levelId, d);
  }
  return d;
}
