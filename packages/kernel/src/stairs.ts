// Stairs inferred from the stairwell (the slab opening in the level above)
// and the storey height: straight, U (two flights and a landing) or L.
import { FLOOR_SLAB, RISER, STEP_SLAB } from './constants';
import type { Ctx, Rect } from './context';
import { flat } from './massing';

/** Walking data of a stair flight set (mm): ramps over the flights and the landing, rails between flights. */
export interface StairWalk {
  /** Level index the stair starts on. */
  level: number;
  /** Stairwell (inset to the wall faces). */
  well: Rect;
  /** Plan rect with z (relative to the start level) linear along an axis, or flat. */
  ramps: { rect: Rect; axis: 'x' | 'y'; from: number; to: number; z0: number; z1: number }[];
  /** Thin rails between flights (plan rects). */
  rails: Rect[];
  /**
   * A U stair: the floor of the level above that reaches over the foot of
   * the first flight (plan rect), where someone leaving the top of the
   * second flight steps across to the first flight's side; null when the
   * headroom over the flight leaves no room for it.
   */
  cover: Rect | null;
  /** Storey height climbed. */
  rise: number;
}

export interface StairInfo { id: string; risers: number; riser: number; flights: number; walk: StairWalk }

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
      // Walking surfaces: ramps from the well edge (the slab edge of the
      // level above / the floor below) over each flight, flat landings.
      const walk: StairWalk = { level: lv.index, well: r, ramps: [], rails: [], rise: H, cover: null };
      const edgeA = startA - sign * inset, farA = (sign > 0 ? a1 : a0) + sign * inset;
      const ramp = (al0: number, al1: number, cr0: number, cr1: number, along: [number, number], z: [number, number], onCross = false) => {
        const rect: Rect = ns
          ? [Math.min(cr0, cr1), Math.min(al0, al1), Math.max(cr0, cr1), Math.max(al0, al1)]
          : [Math.min(al0, al1), Math.min(cr0, cr1), Math.max(al0, al1), Math.max(cr0, cr1)];
        // Axis of the slope: along the flight, or across it (L stair, second flight).
        const axis: 'x' | 'y' = onCross ? (ns ? 'x' : 'y') : (ns ? 'y' : 'x');
        walk.ramps.push({ rect, axis, from: along[0], to: along[1], z0: z[0], z1: z[1] });
      };
      if (st.kind === 'straight') {
        ramp(edgeA, farA, c0, c1, [edgeA, farA], [0, H]);
        const g = (a1 - a0) / n;
        for (let k = 1; k < n; k++) box(startA + sign * (k - 1) * g, startA + sign * k * g, c0, c1, k * riser);
        info.push({ id: st.id, risers: n, riser, flights: 1, walk });
        continue;
      }
      const width = (c1 - c0) / 2;
      const cm = (c0 + c1) / 2;
      // First flight on the half the stair is entered from (the model decides: ResolvedStair.firstHalf).
      const firstHigh = st.firstHalf > 0;
      const f1: [number, number] = firstHigh ? [cm, c1] : [c0, cm];
      const f2: [number, number] = firstHigh ? [c0, cm] : [cm, c1];
      const n1 = Math.ceil(n / 2), n2 = n - n1;
      const landing = width;
      const run = a1 - a0 - landing;
      const lEnd = sign > 0 ? a1 : a0;
      const lStart = lEnd - sign * landing;
      // Entered from the side (the start end is a wall; ResolvedStair.sideEntry): the first flight starts with
      // winders in its first square, fanning a quarter turn round the corner where the flight's open side meets
      // the end of that square, so the first step faces the side the stair is entered from (task 037, as in the
      // reference walk-through's stair). Enough winders that the straight treads after them keep a 220 mm going.
      const side = st.kind === 'u' && st.sideEntry && run > width + 200;
      const nw = side ? Math.min(5, Math.max(3, Math.ceil(n1 - 1 - (run - width) / 220))) : 0;
      if (side) {
        const fw = f1[1] - f1[0];
        const cOut = firstHigh ? f1[1] : f1[0];
        const C = 8, cs = fw / C;
        for (let ia = 0; ia < C; ia++) {
          for (let ic = 0; ic < C; ic++) {
            // u: from the open side inwards; v: from the start end along the flight (cell centres).
            const u = (ic + 0.5) * cs, v = (ia + 0.5) * cs;
            const phi = (Math.atan2(fw - v, u) * 180) / Math.PI;
            const k = Math.min(nw, Math.floor((90 - phi) / (90 / nw)) + 1);
            const cr0 = firstHigh ? cOut - (ic + 1) * cs : cOut + ic * cs;
            box(startA + sign * ia * cs, startA + sign * (ia + 1) * cs, cr0, cr0 + cs, k * riser);
          }
        }
        const g = (run - fw) / Math.max(1, n1 - 1 - nw);
        for (let k = nw + 1; k < n1; k++) box(startA + sign * (fw + (k - nw - 1) * g), startA + sign * (fw + (k - nw) * g), f1[0], f1[1], k * riser);
        // Walking: the winders as a slope along the square (low at the end wall, where the side is entered), then the flight.
        ramp(edgeA, startA + sign * fw, f1[0], f1[1], [edgeA, startA + sign * fw], [0, nw * riser]);
        ramp(startA + sign * fw, lStart, f1[0], f1[1], [startA + sign * fw, lStart], [nw * riser, n1 * riser]);
      } else {
        const g1 = run / Math.max(1, n1 - 1);
        for (let k = 1; k < n1; k++) box(startA + sign * (k - 1) * g1, startA + sign * k * g1, f1[0], f1[1], k * riser);
        ramp(edgeA, lStart, f1[0], f1[1], [edgeA, lStart], [0, n1 * riser]);
      }
      if (st.kind === 'u') {
        ramp(lStart, lEnd + sign * inset, c0, c1, [lStart, lStart], [n1 * riser, n1 * riser]);
        ramp(lStart, edgeA, f2[0], f2[1], [lStart, edgeA], [n1 * riser, H]);
        // The second flight arrives at the start end, over the first flight's foot (task 037): the floor above
        // reaches over that foot, as far as the headroom over the flight allows, so the top of the second flight
        // steps across onto it and out of the well on the first flight's side (the side the stair is entered from).
        const headroom = 2000;
        const reach = side ? (H - FLOOR_SLAB - headroom >= nw * riser ? width : 0) : ((H - FLOOR_SLAB - headroom) / (n1 * riser)) * run;
        const cover = Math.min(width, run * 0.5, reach);
        let railFrom = edgeA;
        if (cover >= 700) {
          const coverEnd = startA + sign * cover;
          const fOut = firstHigh ? c1 + inset : c0 - inset;
          ramp(edgeA, coverEnd, cm, fOut, [edgeA, edgeA], [H, H]);
          const rc: Rect = ns ? [Math.min(cm, fOut), Math.min(edgeA, coverEnd), Math.max(cm, fOut), Math.max(edgeA, coverEnd)] : [Math.min(edgeA, coverEnd), Math.min(cm, fOut), Math.max(edgeA, coverEnd), Math.max(cm, fOut)];
          walk.cover = rc;
          const up = ctx.levels[lv.index + 1]!;
          const slab = { id: `${up.level.id}:slab`, level: up.level.id, role: 'slab' as const, material: 'wall' as const };
          const floor = { id: `${up.level.id}:floor`, level: up.level.id, role: 'floor' as const, material: 'floor' as const };
          ctx.massing.add({ x0: rc[0], y0: rc[1], x1: rc[2], y1: rc[3], z0: upper.elev - FLOOR_SLAB, top: flat(upper.elev), part: slab, topPart: floor, prio: 10, tag: 'house' });
          railFrom = coverEnd;
        }
        const rail = 20;
        walk.rails.push(ns ? [cm - rail, Math.min(railFrom, lStart), cm + rail, Math.max(railFrom, lStart)] : [Math.min(railFrom, lStart), cm - rail, Math.max(railFrom, lStart), cm + rail]);
        box(lStart, lEnd, c0, c1, n1 * riser);
        const g2 = run / Math.max(1, n2);
        for (let k = 1; k < n2; k++) box(lStart - sign * (k - 1) * g2, lStart - sign * k * g2, f2[0], f2[1], (n1 + k) * riser);
      } else {
        // L: landing in the corner, second flight across the far end.
        box(lStart, lEnd, f1[0], f1[1], n1 * riser);
        ramp(lStart, lEnd + sign * inset, f1[0], f1[1], [lStart, lStart], [n1 * riser, n1 * riser]);
        const fOut = firstHigh ? c0 - inset : c1 + inset;
        ramp(lStart, lEnd + sign * inset, cm, fOut, [cm, fOut], [n1 * riser, H], true);
        const g2 = (width) / Math.max(1, n2);
        const dir = firstHigh ? -1 : 1;
        const cStart = firstHigh ? cm : cm;
        for (let k = 1; k < n2; k++) box(lStart, lEnd, cStart + dir * (k - 1) * g2, cStart + dir * k * g2, (n1 + k) * riser);
      }
      info.push({ id: st.id, risers: n, riser, flights: 2, walk });
    }
  }
  return info;
}
