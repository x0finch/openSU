// Stairs: treads, central rail, break line, direction arrows and 上 / 下.
import type { StairInfo } from '../analyse';
import { intersection, rectUnionRings, type Rect } from '../geom';
import { attrs, f, line, pathOfRings, rectEl, type View } from '../svg';
import { textWidth } from '../text';
import { color, font, mm, stroke } from '../tokens';
import type { TextBox } from './labels';

interface Flight { across: [number, number]; from: number; to: number }

/** Lay out the flights of a stair in its well (mm, along/across axes). */
function layout(st: StairInfo) {
  const ns = st.dir === 'N' || st.dir === 'S';
  const W = st.well;
  const across: [number, number] = ns ? [W.x0, W.x1] : [W.y0, W.y1];
  const along: [number, number] = ns ? [W.y0, W.y1] : [W.x0, W.x1];
  const sgn = st.dir === 'N' || st.dir === 'E' ? 1 : -1;
  const start = sgn > 0 ? along[0] : along[1];
  const end = sgn > 0 ? along[1] : along[0];
  if (st.kind !== 'u') {
    return { ns, sgn, start, landing: end, flights: [{ across, from: start, to: end }], rail: null as [number, number] | null, first: 0 };
  }
  const gap = mm.stairGap;
  const fw = (across[1] - across[0] - gap) / 2;
  const lo: [number, number] = [across[0], across[0] + fw];
  const hi: [number, number] = [across[1] - fw, across[1]];
  const landing = end - sgn * fw;
  const firstA = st.firstHalf < 0 ? lo : hi;
  const secondA = st.firstHalf < 0 ? hi : lo;
  return {
    ns, sgn, start, landing,
    flights: [{ across: firstA, from: start, to: landing }, { across: secondA, from: start, to: landing }],
    rail: [across[0] + fw, across[1] - fw] as [number, number],
    first: 0,
  };
}

export function drawStair(st: StairInfo, v: View, texts: TextBox[]): string {
  const L = layout(st);
  const toRect = (a: [number, number], p: number, q: number): Rect => L.ns
    ? { x0: a[0], x1: a[1], y0: Math.min(p, q), y1: Math.max(p, q) }
    : { y0: a[0], y1: a[1], x0: Math.min(p, q), x1: Math.max(p, q) };
  const seg = (a: number, b: number, at: number) => (L.ns
    ? line(v.x(a), v.y(at), v.x(b), v.y(at), { stroke: color.stairLine, 'stroke-width': stroke.stair })
    : line(v.x(at), v.y(a), v.x(at), v.y(b), { stroke: color.stairLine, 'stroke-width': stroke.stair }));
  const clip = st.clip;
  const runLen = Math.abs(L.landing - L.start);
  const risers = Math.max(4, Math.round(runLen / mm.tread));
  const step = runLen / risers;
  // Only the first flight starts on this level; above it is cut by the break.
  const clipLen = L.ns ? clip.y1 - clip.y0 : clip.x1 - clip.x0;
  const breakAt = L.start + L.sgn * Math.min(runLen * (st.down ? 0.5 : 0.62), clipLen * 0.62);
  let s = '';
  const flights = st.down ? L.flights : [L.flights[0]!];
  flights.forEach((fl, i) => {
    const isFirst = i === 0;
    const limit = st.up && isFirst && !st.down ? breakAt : L.landing;
    const outline = intersection(toRect(fl.across, fl.from, limit), clip);
    if (!outline) return;
    s += rectEl(v.rect(outline), { fill: color.furnitureFill, stroke: color.stairLine, 'stroke-width': stroke.stair });
    for (let k = 1; k <= risers; k++) {
      const at = L.start + L.sgn * step * k;
      if (L.sgn * (at - limit) > 0.5) break;
      const inClip = L.ns ? at > clip.y0 && at < clip.y1 : at > clip.x0 && at < clip.x1;
      if (inClip) s += seg(Math.max(fl.across[0], L.ns ? clip.x0 : clip.y0), Math.min(fl.across[1], L.ns ? clip.x1 : clip.y1), at);
    }
  });
  // Landing and central rail (only where the whole well is on this level).
  if (st.down && L.rail) {
    const land = intersection(toRect([L.flights[0]!.across[0] < L.flights[1]!.across[0] ? L.flights[0]!.across[0] : L.flights[1]!.across[0], Math.max(L.flights[0]!.across[1], L.flights[1]!.across[1])], L.landing, L.landing + L.sgn * Math.abs(L.flights[0]!.across[1] - L.flights[0]!.across[0])), clip);
    if (land) s += rectEl(v.rect(land), { fill: color.furnitureFill, stroke: color.stairLine, 'stroke-width': stroke.stair });
    const top = !st.up;
    const railR = intersection(toRect(L.rail, L.start + L.sgn * (top ? 0 : 150), L.landing), clip);
    // Top floor: the guard rail closes the open end of the flight below,
    // where the stairwell meets the corridor, and joins the central rail.
    const f0 = L.flights[0]!.across;
    const guard = top ? intersection(toRect([Math.min(f0[0], L.rail[0]), Math.max(f0[1], L.rail[1])], L.start, L.start + L.sgn * mm.stairRail), clip) : null;
    const railRects = [railR, guard].filter((r): r is Rect => !!r);
    if (railRects.length) s += `<path${attrs({ d: pathOfRings(rectUnionRings(railRects), v), fill: color.furnitureFill, stroke: color.stairArrow, 'stroke-width': stroke.stair })}/>`;
  }
  // Break line across the first flight when a flight starts here.
  const first = L.flights[0]!;
  if (st.up) {
    const a0 = first.across[0] - 60, a1 = first.across[1] + 60;
    const am = (a0 + a1) / 2, b = breakAt;
    const z = 110;
    const pts: [number, number][] = [[a0, b + L.sgn * 180], [am - z, b + L.sgn * 40], [am - z / 3, b + L.sgn * 160], [am + z / 3, b - L.sgn * 160], [am + z, b - L.sgn * 40], [a1, b - L.sgn * 180]];
    const P = pts.map(([a, bb]) => (L.ns ? [v.x(a), v.y(bb)] : [v.x(bb), v.y(a)]) as [number, number]);
    s += `<path${attrs({ d: 'M' + P.map(([x, y]) => `${f(x)},${f(y)}`).join('L'), fill: 'none', stroke: color.stairArrow, 'stroke-width': stroke.stair })}/>`;
  }
  // Arrows: up along the first flight to the break; down along the arriving flight.
  const arrow = (fl: Flight, from: number, to: number, label: string) => {
    const c = (fl.across[0] + fl.across[1]) / 2;
    const p0 = L.ns ? v.p([c, from]) : v.p([from, c]);
    const p1 = L.ns ? v.p([c, to]) : v.p([to, c]);
    const ang = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]);
    const ah = 6.5, aw = 2.4;
    const hx = p1[0] - Math.cos(ang) * ah, hy = p1[1] - Math.sin(ang) * ah;
    let a = line(p0[0], p0[1], hx, hy, { stroke: color.stairArrow, 'stroke-width': stroke.stairArrow });
    a += `<path${attrs({ d: `M${f(p1[0])},${f(p1[1])}L${f(hx - Math.sin(ang) * aw)},${f(hy + Math.cos(ang) * aw)}L${f(hx + Math.sin(ang) * aw)},${f(hy - Math.cos(ang) * aw)}Z`, fill: color.stairArrow })}/>`;
    a += `<circle${attrs({ cx: p0[0], cy: p0[1], r: 1.6, fill: color.stairArrow })}/>`;
    // Label just outside the start end of the flight.
    const size = font.stairSize;
    const out = v.len(Math.abs(from - L.start)) + 4 + size / 2;
    const lx = p0[0] - Math.cos(ang) * out, ly = p0[1] - Math.sin(ang) * out;
    const w = textWidth(label, size);
    a += `<text${attrs({ x: lx, y: ly + size * 0.36, 'text-anchor': 'middle', 'font-family': font.cjk, 'font-size': size, fill: color.labelCn })}>${label}</text>`;
    texts.push({ x0: lx - w / 2, x1: lx + w / 2, y0: ly - size / 2, y1: ly + size / 2, text: label, kind: 'stair' });
    return a;
  };
  const walkLine = (a: Flight, b: Flight, from: number, mid: number, to: number) => {
    const ca = (a.across[0] + a.across[1]) / 2, cb = (b.across[0] + b.across[1]) / 2;
    const P = (c: number, t: number) => (L.ns ? v.p([c, t]) : v.p([t, c]));
    const pts = [P(ca, from), P(ca, mid), P(cb, mid), P(cb, to)];
    const [q, e] = [pts[2]!, pts[3]!];
    const ang = Math.atan2(e[1] - q[1], e[0] - q[0]);
    const ah = 6.5, aw = 2.4;
    const hx = e[0] - Math.cos(ang) * ah, hy = e[1] - Math.sin(ang) * ah;
    let w = `<path${attrs({ d: `M${pts.slice(0, 3).map(([x, y]) => `${f(x)},${f(y)}`).join('L')}L${f(hx)},${f(hy)}`, fill: 'none', stroke: color.stairArrow, 'stroke-width': stroke.stair })}/>`;
    w += `<path${attrs({ d: `M${f(e[0])},${f(e[1])}L${f(hx - Math.sin(ang) * aw)},${f(hy + Math.cos(ang) * aw)}L${f(hx + Math.sin(ang) * aw)},${f(hy - Math.cos(ang) * aw)}Z`, fill: color.stairArrow })}/>`;
    w += `<circle${attrs({ cx: pts[0]![0], cy: pts[0]![1], r: 1.6, fill: color.stairArrow })}/>`;
    // 下 just outside the top of the arriving flight.
    const size = font.stairSize;
    const p0 = pts[0]!, p1 = pts[1]!;
    const dirA = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]);
    const out = v.len(Math.abs(from - L.start)) + 4 + size / 2;
    const lx = p0[0] - Math.cos(dirA) * out, ly = p0[1] - Math.sin(dirA) * out;
    const tw = textWidth('下', size);
    w += `<text${attrs({ x: lx, y: ly + size * 0.36, 'text-anchor': 'middle', 'font-family': font.cjk, 'font-size': size, fill: color.labelCn })}>下</text>`;
    texts.push({ x0: lx - tw / 2, x1: lx + tw / 2, y0: ly - size / 2, y1: ly + size / 2, text: '下', kind: 'stair' });
    return w;
  };
  if (st.up) s += arrow(first, L.start + L.sgn * 120, breakAt - L.sgn * 220, '上');
  if (st.down && !st.up && L.flights.length > 1) {
    // Top floor: one walking line down the arriving flight, across the
    // landing and on down the flight below, arrow at its end (no 上).
    s += walkLine(L.flights[1]!, first, L.start + L.sgn * 120, L.landing + L.sgn * (Math.abs(first.across[1] - first.across[0]) / 2), L.start + L.sgn * 260);
  } else if (st.down) {
    const arr = L.flights.length > 1 ? L.flights[1]! : first;
    if (L.flights.length > 1) s += arrow(arr, L.start + L.sgn * 120, L.landing - L.sgn * 200, '下');
    else s += arrow(arr, L.landing - L.sgn * 120, L.start + L.sgn * 300, '下');
  }
  return s;
}
