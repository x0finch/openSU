// Stairs inferred from the stairwell (the slab opening in the level above)
// and the storey height: straight, U (two flights and a landing) or L.
import { RISER, STEP_SLAB } from './constants';
import type { Ctx, Rect } from './context';
import { flat } from './massing';

export interface StairInfo { id: string; risers: number; riser: number; flights: number }

export function buildStairs(ctx: Ctx): StairInfo[] {
  const info: StairInfo[] = [];
  for (const lv of ctx.levels) {
    const upper = ctx.levels[lv.index + 1];
    if (!upper) continue;
    for (const st of lv.level.stairs) {
      const hole = upper.level.slabOpenings.find((s) => s.stair === st.id);
      const pts = hole?.rings.flat() ?? [];
      if (pts.length === 0) continue;
      const inset = 120;
      const r: Rect = [Math.min(...pts.map((p) => p[0])) + inset, Math.min(...pts.map((p) => p[1])) + inset, Math.max(...pts.map((p) => p[0])) - inset, Math.max(...pts.map((p) => p[1])) - inset];
      const H = upper.elev - lv.elev;
      const n = Math.max(2, Math.round(H / RISER));
      const riser = H / n;
      const space = lv.level.spaces.find((s) => s.id === st.space);
      const sp = space?.polygon ?? [];
      const sx = sp.length ? sp.reduce((a, p) => a + p[0], 0) / sp.length : (r[0] + r[2]) / 2;
      const sy = sp.length ? sp.reduce((a, p) => a + p[1], 0) / sp.length : (r[1] + r[3]) / 2;
      const part = { id: `${lv.level.id}:stair`, level: lv.level.id, role: 'stair' as const, material: 'wall' as const };
      const step = (x0: number, y0: number, x1: number, y1: number, top: number) =>
        ctx.massing.add({ x0: Math.min(x0, x1), y0: Math.min(y0, y1), x1: Math.max(x0, x1), y1: Math.max(y0, y1), z0: lv.elev + Math.max(0, top - riser - STEP_SLAB), top: flat(lv.elev + top), part, prio: 10, tag: 'stair' });
      // Local frame: "along" = climbing direction of the first flight.
      const ns = st.up === 'N' || st.up === 'S';
      const sign = st.up === 'N' || st.up === 'E' ? 1 : -1;
      const a0 = ns ? r[1] : r[0], a1 = ns ? r[3] : r[2];
      const c0 = ns ? r[0] : r[1], c1 = ns ? r[2] : r[3];
      const box = (along0: number, along1: number, cross0: number, cross1: number, top: number) =>
        ns ? step(cross0, along0, cross1, along1, top) : step(along0, cross0, along1, cross1, top);
      const startA = sign > 0 ? a0 : a1;
      if (st.kind === 'straight') {
        const g = (a1 - a0) / n;
        for (let k = 1; k < n; k++) box(startA + sign * (k - 1) * g, startA + sign * k * g, c0, c1, k * riser);
        info.push({ id: st.id, risers: n, riser, flights: 1 });
        continue;
      }
      const width = (c1 - c0) / 2;
      const cm = (c0 + c1) / 2;
      // First flight on the half that holds the stair space.
      const firstHigh = (ns ? sx : sy) >= cm;
      const f1: [number, number] = firstHigh ? [cm, c1] : [c0, cm];
      const f2: [number, number] = firstHigh ? [c0, cm] : [cm, c1];
      const n1 = Math.ceil(n / 2), n2 = n - n1;
      const landing = width;
      const run = a1 - a0 - landing;
      const g1 = run / Math.max(1, n1 - 1);
      for (let k = 1; k < n1; k++) box(startA + sign * (k - 1) * g1, startA + sign * k * g1, f1[0], f1[1], k * riser);
      const lEnd = sign > 0 ? a1 : a0;
      const lStart = lEnd - sign * landing;
      if (st.kind === 'u') {
        box(lStart, lEnd, c0, c1, n1 * riser);
        const g2 = run / Math.max(1, n2);
        for (let k = 1; k < n2; k++) box(lStart - sign * (k - 1) * g2, lStart - sign * k * g2, f2[0], f2[1], (n1 + k) * riser);
      } else {
        // L: landing in the corner, second flight across the far end.
        box(lStart, lEnd, f1[0], f1[1], n1 * riser);
        const g2 = (width) / Math.max(1, n2);
        const dir = firstHigh ? -1 : 1;
        const cStart = firstHigh ? cm : cm;
        for (let k = 1; k < n2; k++) box(lStart, lEnd, cStart + dir * (k - 1) * g2, cStart + dir * k * g2, (n1 + k) * riser);
      }
      info.push({ id: st.id, risers: n, riser, flights: 2 });
    }
  }
  return info;
}
