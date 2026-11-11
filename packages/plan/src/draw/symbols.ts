// Furniture and planting symbols. Each symbol is drawn in a local px frame
// centred on the piece: x along its width, y front-to-back with the back at
// -d/2 (top) and the front at +d/2; the caller rotates it to its facing.
import type { Placement } from '../furnish/types';
import { attrs, f } from '../svg';
import { color, stroke } from '../tokens';

const ROT: Record<string, number> = { S: 0, N: 180, E: -90, W: 90 };

type A = Record<string, string | number | undefined>;
const R = (x: number, y: number, w: number, h: number, a: A = {}) => `<rect${attrs({ x, y, width: w, height: h, ...a })}/>`;
const C = (cx: number, cy: number, r: number, a: A = {}) => `<circle${attrs({ cx, cy, r, ...a })}/>`;
const E = (cx: number, cy: number, rx: number, ry: number, a: A = {}) => `<ellipse${attrs({ cx, cy, rx, ry, ...a })}/>`;
const L = (x1: number, y1: number, x2: number, y2: number, a: A = {}) => `<line${attrs({ x1, y1, x2, y2, ...a })}/>`;
const P = (d: string, a: A = {}) => `<path${attrs({ d, ...a })}/>`;

const base: A = { fill: color.furnitureFill, stroke: color.furnitureLine, 'stroke-width': stroke.furniture };
const detail: A = { fill: 'none', stroke: color.furnitureDetail, 'stroke-width': stroke.furnitureDetail };
const detailFill: A = { fill: color.furnitureFill, stroke: color.furnitureDetail, 'stroke-width': stroke.furnitureDetail };
const fixture: A = { fill: color.fixtureFill, stroke: color.fixtureLine, 'stroke-width': stroke.furnitureDetail };
const wood: A = { fill: color.woodFill, stroke: color.woodLine, 'stroke-width': stroke.furnitureDetail };

/** Symbol body for a piece of size W x D px (k = px per mm). */
function body(p: Placement, W: number, D: number, k: number): string {
  const x0 = -W / 2, y0 = -D / 2;
  const m = (mm: number) => mm * k;
  switch (p.kind) {
    case 'bed': {
      const double = p.variant !== 'single';
      const pw = double ? (W - m(260)) / 2 : W - m(260);
      const duvetTop = y0 + m(560);
      let s = R(x0, y0, W, D, { ...base, rx: m(40) });
      s += R(x0, y0, W, m(70), { ...detailFill, rx: m(20) });
      if (double) {
        s += R(x0 + m(100), y0 + m(130), pw, m(330), { ...detailFill, rx: m(70) });
        s += R(x0 + m(160) + pw, y0 + m(130), pw, m(330), { ...detailFill, rx: m(70) });
      } else s += R(x0 + m(130), y0 + m(130), pw, m(330), { ...detailFill, rx: m(70) });
      s += R(x0 + m(25), duvetTop, W - m(50), D / 2 - duvetTop - m(25), { ...detailFill, rx: m(30) });
      s += L(x0 + m(25), duvetTop + m(300), -x0 - m(25), duvetTop + m(300), detail);
      // Soft fold across one corner of the duvet.
      s += P(`M${f(-x0 - m(25))},${f(duvetTop + m(620))}Q${f(-x0 - m(260))},${f(D / 2 - m(320))} ${f(-x0 - m(520))},${f(D / 2 - m(25))}`, detail);
      return s;
    }
    case 'nightstand':
      return R(x0, y0, W, D, { ...base, rx: m(30) }) + C(0, 0, Math.min(W, D) * 0.28, detail) + C(0, 0, Math.min(W, D) * 0.1, detail);
    case 'wardrobe': {
      let s = R(x0, y0, W, D, base) + L(x0 + m(40), 0, -x0 - m(40), 0, detail);
      const n = Math.max(2, Math.floor((W - m(120)) / m(150)));
      for (let i = 0; i <= n; i++) {
        const x = x0 + m(60) + ((W - m(120)) * i) / n;
        s += P(`M${f(x - m(28))},${f(-D * 0.32)}L${f(x)},${f(-D * 0.26)}L${f(x + m(28))},${f(-D * 0.32)}M${f(x)},${f(-D * 0.26)}L${f(x)},${f(D * 0.3)}`, detail);
      }
      return s;
    }
    case 'rug':
      return R(x0, y0, W, D, { fill: color.rugFill, stroke: color.rugLine, 'stroke-width': stroke.rug, rx: m(30) });
    case 'rug-round':
      return C(0, 0, W / 2, { fill: color.rugFill, stroke: color.rugLine, 'stroke-width': stroke.rug });
    case 'sofa':
    case 'armchair': {
      const arm = m(170), back = m(210);
      const seats = p.kind === 'armchair' ? 1 : p.variant === '2' ? 2 : 3;
      let s = R(x0, y0, W, D, { ...base, rx: m(70) });
      s += R(x0 + arm, y0 + m(10), W - 2 * arm, back, { ...detailFill, rx: m(50) });
      s += R(x0, y0, arm, D, { ...detailFill, rx: m(70) }) + R(-x0 - arm, y0, arm, D, { ...detailFill, rx: m(70) });
      const sw = (W - 2 * arm) / seats;
      for (let i = 0; i < seats; i++) s += R(x0 + arm + i * sw + m(15), y0 + back + m(20), sw - m(30), D - back - m(60), { ...detailFill, rx: m(45) });
      return s;
    }
    case 'coffee-table':
      return R(x0, y0, W, D, { ...base, rx: m(30) }) + R(x0 + m(60), y0 + m(60), W - m(120), D - m(120), detail)
        + R(-W * 0.12, -D * 0.2, W * 0.3, D * 0.4, { fill: color.accentFill, stroke: 'none', rx: m(15) });
    case 'side-table':
      return C(0, 0, Math.min(W, D) / 2, base) + C(0, 0, Math.min(W, D) * 0.2, detail);
    case 'tv-unit':
      return R(x0, y0, W, D, base) + R(-W * 0.36, y0 + m(50), W * 0.72, m(60), { fill: color.furnitureDetail, stroke: 'none' });
    case 'dining-table-round':
      return C(0, 0, W / 2, base) + C(0, 0, W * 0.34, detail) + C(0, 0, m(110), { fill: color.accentFill, stroke: 'none' });
    case 'dining-table':
    case 'island':
      return R(x0, y0, W, D, { ...base, rx: m(30) }) + R(x0 + m(50), y0 + m(50), W - m(100), D - m(100), detail);
    case 'chair':
    case 'desk-chair':
    case 'outdoor-chair': {
      const a: A = p.kind === 'outdoor-chair' ? { ...wood, rx: m(80) } : { ...base, rx: m(90) };
      const back: A = p.kind === 'outdoor-chair' ? { ...wood, rx: m(45) } : { ...base, rx: m(45) };
      return R(x0 + m(25), y0 + m(70), W - m(50), D - m(70), a) + R(x0, y0, W, m(110), back);
    }
    case 'stool':
      return C(0, 0, Math.min(W, D) / 2, base);
    case 'counter':
      return R(x0, y0, W, D, base) + L(x0, D / 2 - m(45), -x0, D / 2 - m(45), detail);
    case 'sink': {
      if (p.variant === 'double') {
        const bw = W / 2 - m(40);
        return R(x0, y0, bw, D, { ...fixture, rx: m(60) }) + R(x0 + bw + m(80), y0, bw, D, { ...fixture, rx: m(60) })
          + C(x0 + bw / 2, 0, m(30), { fill: color.fixtureLine }) + C(-x0 - bw / 2, 0, m(30), { fill: color.fixtureLine })
          + C(0, y0 - m(20), m(30), detail);
      }
      return R(x0, y0, W, D, { ...fixture, rx: m(70) }) + C(0, m(30), m(30), { fill: color.fixtureLine }) + C(0, y0 - m(25), m(28), detail);
    }
    case 'hob':
      return R(x0, y0, W, D, { ...detailFill, rx: m(30) })
        + C(-W * 0.25, 0, m(115), detail) + C(-W * 0.25, 0, m(55), detail)
        + C(W * 0.25, 0, m(115), detail) + C(W * 0.25, 0, m(55), detail);
    case 'fridge':
      return R(x0, y0, W, D, base) + R(x0 + m(40), y0 + m(40), W - m(80), D - m(110), detail) + L(x0 + m(60), D / 2 - m(35), -x0 - m(60), D / 2 - m(35), { stroke: color.furnitureLine, 'stroke-width': stroke.furniture });
    case 'toilet': {
      const tank = m(180);
      return R(x0 + m(10), y0, W - m(20), tank, { ...base, rx: m(40) })
        + E(0, y0 + tank + (D - tank) / 2 - m(10), W / 2 - m(15), (D - tank) / 2 - m(5), base)
        + E(0, y0 + tank + (D - tank) / 2 + m(10), W / 2 - m(85), (D - tank) / 2 - m(85), detail);
    }
    case 'vanity':
      return R(x0, y0, W, D, base) + E(0, m(20), Math.min(W * 0.32, m(220)), D * 0.3, fixture) + C(0, y0 + m(60), m(25), { fill: color.fixtureLine });
    case 'shower': {
      let s = R(x0, y0, W, D, base);
      const step = m(100);
      for (let x = x0 + step; x < -x0 - 1; x += step) s += L(x, y0 + m(30), x, -y0 - m(40), { stroke: color.furnitureDetail, 'stroke-width': stroke.hairline });
      for (let y = y0 + step; y < -y0 - 1; y += step) s += L(x0 + m(30), y, -x0 - m(30), y, { stroke: color.furnitureDetail, 'stroke-width': stroke.hairline });
      s += C(0, 0, m(45), detail);
      s += L(x0, D / 2, -x0, D / 2, { stroke: color.glassLine, 'stroke-width': stroke.furniture * 1.6 });
      s += L(x0 + W * 0.45, D / 2, x0 + W * 0.45 + W * 0.32, D / 2 - W * 0.32, { stroke: color.glassLine, 'stroke-width': stroke.furniture });
      return s;
    }
    case 'washer':
      return R(x0, y0, W, D, { ...base, rx: m(30) }) + C(0, m(30), Math.min(W, D) * 0.32, detail) + C(0, m(30), Math.min(W, D) * 0.2, detail) + L(x0 + m(40), y0 + m(110), -x0 - m(40), y0 + m(110), detail);
    case 'desk':
      return R(x0, y0, W, D, base) + R(-m(170), -m(120), m(340), m(230), detail) + C(x0 + m(130), y0 + m(130), m(70), detail);
    case 'bookshelf':
    case 'shelves': {
      let s = R(x0, y0, W, D, base);
      const n = Math.max(1, Math.round(W / m(600)));
      for (let i = 1; i < n; i++) s += L(x0 + (W * i) / n, y0, x0 + (W * i) / n, -y0, detail);
      if (p.kind === 'shelves') s += L(x0, y0, -x0, -y0, detail) + L(x0, -y0, -x0, y0, detail);
      return s;
    }
    case 'outdoor-table': {
      let s = R(x0, y0, W, D, { ...wood, rx: m(20) });
      for (let y = y0 + m(100); y < -y0 - 1; y += m(100)) s += L(x0 + m(20), y, -x0 - m(20), y, { stroke: color.woodLine, 'stroke-width': stroke.hairline });
      return s;
    }
    case 'bistro-table':
      return C(0, 0, Math.min(W, D) / 2, wood) + C(0, 0, Math.min(W, D) * 0.12, { fill: color.woodLine });
    case 'lounger':
      return R(x0, y0, W, D, { ...base, rx: m(60) }) + R(x0 + m(40), y0 + m(40), W - m(80), D * 0.3, { ...detailFill, rx: m(50) })
        + L(x0 + m(40), y0 + D * 0.42, -x0 - m(40), y0 + D * 0.42, detail);
    case 'tree':
    case 'shrub':
    case 'pot-plant':
      return plant(p, W, k);
    case 'car':
      return car(W, D, k);
    case 'parking-bay':
      return R(x0, y0, W, D, { fill: color.carBay, stroke: color.canopyLine, 'stroke-width': stroke.canopy });
  }
}

function lobes(r: number, n: number, depth: number, phase: number): string {
  let d = '';
  for (let i = 0; i <= n; i++) {
    const a = phase + (i * 2 * Math.PI) / n;
    const px = Math.cos(a) * r, py = Math.sin(a) * r;
    if (i === 0) { d += `M${f(px)},${f(py)}`; continue; }
    const am = a - Math.PI / n;
    const cx = Math.cos(am) * r * (1 + depth), cy = Math.sin(am) * r * (1 + depth);
    d += `Q${f(cx)},${f(cy)} ${f(px)},${f(py)}`;
  }
  return d + 'Z';
}

function plant(p: Placement, W: number, k: number): string {
  const seed = Number(p.variant ?? 0) || 0;
  const phase = (seed * 0.7) % (2 * Math.PI);
  if (p.kind === 'shrub') {
    const r = W / 2 / 1.12;
    return P(lobes(r, 8, 0.22, phase), { fill: color.shrubFill, stroke: color.treeLine, 'stroke-width': stroke.tree, opacity: 0.9 });
  }
  let s = '';
  let r = W / 2 / 1.14;
  if (p.kind === 'pot-plant') {
    s += C(0, 0, W / 2, { fill: color.furnitureFill, stroke: color.furnitureLine, 'stroke-width': stroke.furniture });
    r = (W / 2 - 60 * k) / 1.14;
  }
  const n = 11;
  s += P(lobes(r, n, 0.16, phase), { fill: color.treeFill, stroke: color.treeLine, 'stroke-width': stroke.tree });
  for (let i = 0; i < n; i++) {
    const a = phase + ((i + 0.5) * 2 * Math.PI) / n;
    s += L(Math.cos(a) * r * 0.18, Math.sin(a) * r * 0.18, Math.cos(a) * r * 0.78, Math.sin(a) * r * 0.78, { stroke: color.treeVein, 'stroke-width': stroke.tree * 0.8 });
  }
  s += C(0, 0, Math.max(1.2, r * 0.09), { fill: color.treeLine });
  return s;
}

/** Plan car, front towards +y (bottom of the local frame). */
function car(W: number, D: number, k: number): string {
  const m = (mm: number) => mm * k;
  const x0 = -W / 2, y0 = -D / 2;
  const body = `M${f(x0 + m(160))},${f(y0)}L${f(-x0 - m(160))},${f(y0)}Q${f(-x0)},${f(y0)} ${f(-x0)},${f(y0 + m(260))}`
    + `L${f(-x0)},${f(-y0 - m(420))}Q${f(-x0)},${f(-y0)} ${f(-x0 - m(330))},${f(-y0)}L${f(x0 + m(330))},${f(-y0)}`
    + `Q${f(x0)},${f(-y0)} ${f(x0)},${f(-y0 - m(420))}L${f(x0)},${f(y0 + m(260))}Q${f(x0)},${f(y0)} ${f(x0 + m(160))},${f(y0)}Z`;
  let s = P(body, base);
  // Windscreen (front), rear window and roof.
  const wsY = -y0 - m(1500), rwY = y0 + m(700);
  s += P(`M${f(x0 + m(150))},${f(wsY + m(520))}Q0,${f(wsY + m(620))} ${f(-x0 - m(150))},${f(wsY + m(520))}L${f(-x0 - m(260))},${f(wsY)}Q0,${f(wsY + m(60))} ${f(x0 + m(260))},${f(wsY)}Z`, detailFill);
  s += P(`M${f(x0 + m(200))},${f(rwY - m(380))}Q0,${f(rwY - m(470))} ${f(-x0 - m(200))},${f(rwY - m(380))}L${f(-x0 - m(280))},${f(rwY)}Q0,${f(rwY - m(50))} ${f(x0 + m(280))},${f(rwY)}Z`, detailFill);
  s += R(x0 + m(280), rwY + m(80), W - m(560), wsY - rwY - m(160), { ...detail, rx: m(80) });
  // Mirrors and bonnet line.
  s += R(x0 - m(110), wsY + m(380), m(110), m(170), { ...detailFill, rx: m(30) }) + R(-x0, wsY + m(380), m(110), m(170), { ...detailFill, rx: m(30) });
  s += P(`M${f(x0 + m(220))},${f(-y0 - m(380))}Q0,${f(-y0 - m(300))} ${f(-x0 - m(220))},${f(-y0 - m(380))}`, detail);
  return s;
}

/** One placed piece as an SVG group (px frame). */
export function symbol(p: Placement, cx: number, cy: number, k: number): string {
  const W = p.w * k, D = p.d * k;
  let rot = ROT[p.facing] ?? 0;
  if (p.variant?.startsWith('rot:')) rot = Number(p.variant.slice(4));
  return `<g transform="translate(${f(cx)} ${f(cy)})${rot ? ` rotate(${f(rot)})` : ''}">${body(p, W, D, k)}</g>`;
}
