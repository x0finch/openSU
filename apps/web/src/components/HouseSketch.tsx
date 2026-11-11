// A small axonometric drawing of a house for the landing page, in the
// renderer's illustration style and drawn from its tokens (no three.js).
// Painter's order: ground shadows, back walls, house, planting, front walls.
import { entourage as E, lines as L, materials as M, shading as S } from '@opensu/render/tokens';

type V3 = [number, number, number];

const SCALE = 26;
const C = Math.cos(Math.PI / 6);

/** Isometric projection seen from the south-east (model metres, Z up -> SVG px). */
function iso([x, y, z]: V3): [number, number] {
  return [(x + y) * C * SCALE, ((x - y) * 0.5 - z) * SCALE];
}

function d(pts: V3[], close = true): string {
  return pts.map((p, i) => `${i ? 'L' : 'M'}${iso(p).map((v) => v.toFixed(1)).join(' ')}`).join('') + (close ? 'Z' : '');
}

interface Poly {
  pts: V3[];
  fill: string;
  stroke?: boolean;
  width?: number;
  opacity?: number;
}

const south = (y: number, x0: number, x1: number, z0: number, z1: number): V3[] => [[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]];
const east = (x: number, y0: number, y1: number, z0: number, z1: number): V3[] => [[x, y0, z0], [x, y1, z0], [x, y1, z1], [x, y0, z1]];
const top = (z: number, x0: number, x1: number, y0: number, y1: number): V3[] => [[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]];

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A framed window on a south (y) or east (x) face: dark frame, glass, a mullion. */
function windowOn(face: 'south' | 'east', at: number, a0: number, a1: number, z0: number, z1: number, mullion = false): Poly[] {
  const r = face === 'south' ? south : east;
  const f = 0.07;
  const out: Poly[] = [
    { pts: r(at, a0, a1, z0, z1), fill: M.frame, width: 0.9 },
    { pts: r(at, a0 + f, a1 - f, z0 + f, z1 - f), fill: M.glassBacking, stroke: false },
  ];
  if (mullion) out.push({ pts: r(at, (a0 + a1) / 2 - f / 2, (a0 + a1) / 2 + f / 2, z0, z1), fill: M.frame, stroke: false });
  return out;
}

/** Shadow of an axis-aligned box on the ground, cast towards the north-east. */
function boxShadow(x0: number, x1: number, y0: number, y1: number, h: number): V3[] {
  const sx = h * 0.42;
  const sy = h * 0.62;
  return [[x0, y0, 0], [x1, y0, 0], [x1 + sx, y0 + sy, 0], [x1 + sx, y1 + sy, 0], [x0 + sx, y1 + sy, 0], [x0, y1, 0]];
}

// Plot and fence.
const PX0 = -2.2, PX1 = 15.6, PY0 = -2.6, PY1 = 11.6, FH = 1.25, FT = 0.2;

function back(): Poly[] {
  const coping = M.slab;
  return [
    // North wall: inner (south-facing) face and coping.
    { pts: south(PY1 - FT, PX0, PX1, 0, FH), fill: M.wall },
    { pts: top(FH, PX0, PX1, PY1 - FT, PY1), fill: coping },
    // West wall: inner (east-facing) face and coping.
    { pts: east(PX0 + FT, PY0, PY1 - FT, 0, FH), fill: S.awayTone },
    { pts: top(FH, PX0, PX0 + FT, PY0, PY1), fill: coping },
  ];
}

function front(): Poly[] {
  const coping = M.slab;
  const out: Poly[] = [
    // South wall, west of the gate.
    { pts: south(PY0, PX0, 8.6, 0, FH), fill: M.wall },
    { pts: top(FH, PX0, 8.6, PY0, PY0 + FT), fill: coping },
    // Gate: dark vertical bars between two piers.
    { pts: south(PY0 + 0.1, 8.6, 12.4, 0, 1.55), fill: M.metal, opacity: 0.92, width: 0.8 },
    // South wall, east of the gate.
    { pts: south(PY0, 12.4, PX1, 0, FH), fill: M.wall },
    { pts: top(FH, 12.4, PX1, PY0, PY0 + FT), fill: coping },
    { pts: east(12.4, PY0, PY0 + FT, 0, FH), fill: S.awayTone },
    // East wall: outer face (turned away from the sun) and coping.
    { pts: east(PX1, PY0, PY1, 0, FH), fill: S.awayTone },
    { pts: top(FH, PX1 - FT, PX1, PY0, PY1), fill: coping },
  ];
  // Pier with a house-number plate.
  out.push({ pts: south(PY0 - 0.05, 7.9, 8.6, 0, 1.75), fill: M.wall });
  out.push({ pts: east(8.6, PY0 - 0.05, PY0 + 0.35, 0, 1.75), fill: S.awayTone });
  out.push({ pts: top(1.75, 7.9, 8.6, PY0 - 0.05, PY0 + 0.35), fill: M.wall });
  out.push({ pts: south(PY0 - 0.06, 8.05, 8.45, 1.1, 1.3), fill: M.wood, width: 0.7 });
  // Small square openings in the east wall.
  for (const y of [1.4, 2.4, 3.4]) out.push({ pts: east(PX1, y, y + 0.42, 0.55, 0.97), fill: M.recess, width: 0.8 });
  return out;
}

function house(): Poly[] {
  const polys: Poly[] = [];
  const W = M.wall, AWAY = S.awayTone, SH = S.shadowTone;

  // Main block A (x 0-8, y 2-10) under a mono-pitch roof rising to the north.
  const eave = 6.6, ridge = 9.0, y0 = 1.5, y1 = 10.5, fascia = 0.28;
  const roofZ = (y: number) => eave + ((y - y0) * (ridge - eave)) / (y1 - y0);
  const under = (y: number) => roofZ(y) - fascia;
  polys.push({ pts: [[0, 2, 0], [8, 2, 0], [8, 2, under(2)], [0, 2, under(2)]], fill: W });
  polys.push({ pts: [[8, 2, 0], [8, 10, 0], [8, 10, under(10)], [8, 2, under(2)]], fill: AWAY });
  // Soffit shadow on the sunlit south wall.
  polys.push({ pts: south(2, 0, 8, under(2) - 0.5, under(2)), fill: SH, stroke: false });
  // Floor line.
  polys.push({ pts: [[0, 2, 3.3], [8, 2, 3.3], [8, 10, 3.3]], fill: 'none', width: 0.7 });
  polys.push(...windowOn('south', 2, 1.5, 2.4, 0.9, 5.7));
  polys.push({ pts: south(2, 2.4, 3.1, 0.9, 5.7), fill: M.wood });
  polys.push(...windowOn('south', 2, 4.4, 7.1, 3.9, 5.6, true));
  polys.push(...windowOn('south', 2, 4.4, 7.1, 0.05, 2.6, true));
  polys.push(...windowOn('east', 8, 5.0, 6.6, 4.0, 5.8));
  polys.push(...windowOn('east', 8, 8.1, 8.9, 0.8, 5.8));
  // Roof: tiles, then the timber fascia boards.
  polys.push({ pts: [[-0.45, y0, eave], [8.45, y0, eave], [8.45, y1, ridge], [-0.45, y1, ridge]], fill: M.roofTile });
  polys.push({ pts: [[-0.45, y0, eave], [8.45, y0, eave], [8.45, y0, eave - fascia], [-0.45, y0, eave - fascia]], fill: M.fascia });
  polys.push({ pts: [[8.45, y0, eave], [8.45, y1, ridge], [8.45, y1, ridge - fascia], [8.45, y0, eave - fascia]], fill: M.fascia });

  // Wing B (x 8-13.4, y 0-7) with a terrace behind a glass balustrade.
  const hb = 3.3;
  polys.push({ pts: south(0, 8, 13.4, 0, hb), fill: W });
  polys.push({ pts: east(13.4, 0, 7, 0, hb), fill: AWAY });
  polys.push(...windowOn('south', 0, 8.8, 12.0, 0.05, 2.55, true));
  polys.push({ pts: south(0, 12.0, 12.7, 0.05, 2.55), fill: M.wood });
  polys.push(...windowOn('east', 13.4, 2.2, 4.6, 1.0, 2.5, true));
  polys.push({ pts: south(0, 8, 13.4, hb, hb + 0.18), fill: M.slab });
  polys.push({ pts: east(13.4, 0, 7, hb, hb + 0.18), fill: M.slab });
  polys.push({ pts: top(hb + 0.18, 8, 13.4, 0, 7), fill: M.wood });
  // Canopy over the glazing, casting a band of shadow on the wall.
  polys.push({ pts: south(0, 8.5, 12.6, 2.05, 2.7), fill: SH, stroke: false });
  polys.push({ pts: top(2.85, 8.5, 12.6, -1.3, 0), fill: W });
  polys.push({ pts: south(-1.3, 8.5, 12.6, 2.7, 2.85), fill: M.slab });
  polys.push({ pts: east(12.6, -1.3, 0, 2.7, 2.85), fill: M.slab });
  return polys;
}

function balustrade(): Poly[] {
  const z0 = 3.48, z1 = 4.55;
  return [
    { pts: south(0, 8, 13.4, z0, z1), fill: M.balustradeGlass, opacity: M.balustradeOpacity, width: 0.8 },
    { pts: east(13.4, 0, 7, z0, z1), fill: M.balustradeGlass, opacity: M.balustradeOpacity, width: 0.8 },
  ];
}

function roofTiles(): string {
  const out: string[] = [];
  const eave = 6.6, ridge = 9.0, y0 = 1.5, y1 = 10.5;
  for (let i = 1; i < 18; i++) {
    const y = y0 + ((y1 - y0) * i) / 18;
    const z = eave + ((y - y0) * (ridge - eave)) / (y1 - y0);
    out.push(d([[-0.45, y, z], [8.45, y, z]], false));
  }
  return out.join('');
}

interface Leaf {
  x: number;
  y: number;
  r: number;
  a: number;
  c: string;
}

/** Stylised tree: thin pale trunk and branches, many small flat leaf cards. */
function tree(x: number, y: number, seed: number, h: number, spread: number, light: string, deep: string, count: number) {
  const rnd = mulberry32(seed);
  const [bx, by] = iso([x, y, 0]);
  const H = h * SCALE;
  const leaves: Leaf[] = [];
  const blobs = [
    [0, -H * 0.78, spread, spread * 1.15],
    [-spread * 0.55, -H * 0.62, spread * 0.6, spread * 0.6],
    [spread * 0.5, -H * 0.66, spread * 0.65, spread * 0.65],
  ] as const;
  for (let i = 0; i < count; i++) {
    const [ox, oy, rx, ry] = blobs[i % 3]!;
    const a = rnd() * Math.PI * 2;
    const r = Math.sqrt(rnd());
    const lx = bx + ox + Math.cos(a) * r * rx;
    const ly = by + oy + Math.sin(a) * r * ry;
    // Leaves on the right (away from the sun) are deeper.
    const shade = (lx - bx) / (spread * 2) + (rnd() - 0.5) * 0.7;
    leaves.push({ x: lx, y: ly, r: 1.8 + rnd() * 1.6, a: rnd() * 180, c: shade > 0.12 ? deep : light });
  }
  const trunk = [
    `M${bx} ${by}L${bx + 1.5} ${by - H * 0.8}`,
    `M${bx + 0.6} ${by - H * 0.38}L${bx - spread * 0.62} ${by - H * 0.7}`,
    `M${bx + 1} ${by - H * 0.5}L${bx + spread * 0.6} ${by - H * 0.78}`,
    `M${bx + 1.2} ${by - H * 0.62}L${bx - spread * 0.2} ${by - H * 0.95}`,
  ].join('');
  return { trunk, leaves };
}

function bamboo(x0: number, y0: number, x1: number, y1: number, seed: number) {
  const rnd = mulberry32(seed);
  const stalks: string[] = [];
  const leaves: string[] = [];
  for (let i = 0; i < 26; i++) {
    const t = rnd();
    const [sx, sy] = iso([x0 + (x1 - x0) * t + (rnd() - 0.5) * 0.4, y0 + (y1 - y0) * t + (rnd() - 0.5) * 0.4, 0]);
    const h = (2.6 + rnd() * 1.8) * SCALE;
    const lean = (rnd() - 0.5) * 12;
    stalks.push(`M${sx.toFixed(1)} ${sy.toFixed(1)}L${(sx + lean).toFixed(1)} ${(sy - h).toFixed(1)}`);
    for (let k = 0; k < 9; k++) {
      const u = 0.3 + rnd() * 0.7;
      const lx = sx + lean * u;
      const ly = sy - h * u;
      const dir = rnd() < 0.5 ? -1 : 1;
      leaves.push(`M${lx.toFixed(1)} ${ly.toFixed(1)}q${(dir * 5).toFixed(1)} -1.5 ${(dir * 10).toFixed(1)} ${(1.5 + rnd() * 4).toFixed(1)}`);
    }
  }
  return { stalks: stalks.join(''), leaves: leaves.join('') };
}

/** Walking figure (flat black silhouette). */
function person(x: number, y: number): string {
  const [px, py] = iso([x, y, 0]);
  const p = (dx: number, dy: number) => `${(px + dx).toFixed(1)} ${(py + dy).toFixed(1)}`;
  return [
    `M${p(-2.4, -32)}L${p(2.6, -32)}L${p(3.2, -17)}L${p(7, -1)}L${p(4, 0)}L${p(0.2, -13)}L${p(-3.5, 0)}L${p(-6.5, -1)}L${p(-3, -17)}Z`,
    `M${p(-2.2, -31)}L${p(-8, -20)}L${p(-6, -19)}L${p(-1.4, -26)}Z`,
    `M${p(2.4, -31)}L${p(8, -22)}L${p(6.4, -20.5)}L${p(1.6, -26)}Z`,
  ].join('');
}

function Polys({ polys }: { polys: Poly[] }) {
  return (
    <>
      {polys.map((p, i) => (
        <path
          key={i}
          d={d(p.pts, p.fill !== 'none')}
          fill={p.fill}
          fillOpacity={p.opacity ?? 1}
          stroke={p.stroke === false ? 'none' : L.color}
          strokeWidth={p.width ?? 1.1}
        />
      ))}
    </>
  );
}

function Leaves({ leaves }: { leaves: Leaf[] }) {
  return (
    <>
      {leaves.map((l, i) => (
        <ellipse key={i} cx={l.x.toFixed(1)} cy={l.y.toFixed(1)} rx={l.r.toFixed(2)} ry={(l.r * 0.62).toFixed(2)} transform={`rotate(${l.a.toFixed(0)} ${l.x.toFixed(1)} ${l.y.toFixed(1)})`} fill={l.c} />
      ))}
    </>
  );
}

export function HouseSketch({ className }: { className?: string }) {
  const ginkgo = tree(-0.6, -0.9, 11, 6.2, 46, E.ginkgo, E.ginkgoDeep, 420);
  const maple = tree(5.6, -1.6, 5, 3.2, 26, E.redMaple, E.redMapleDeep, 220);
  const bam = bamboo(14.5, 4.2, 14.6, 10.6, 3);
  const shadows = [boxShadow(0, 8, 2, 10, 8.2), boxShadow(8, 13.4, 0, 7, 4.5), boxShadow(PX0, PX1, PY1 - FT, PY1, FH), boxShadow(PX1 - FT, PX1, PY0, PY1, FH)];
  const corners: V3[] = [[PX0, PY0, 0], [PX1, PY0, 0], [PX1, PY1, 0], [PX0, PY1, 0], [-0.45, 10.5, 9.4], [-0.45, 1.5, 6.6], [PX1 + 2.4, PY1 + 3, 0]];
  const pts = corners.map(iso);
  const pad = 14;
  const x0 = Math.min(...pts.map((p) => p[0])) - pad;
  const x1 = Math.max(...pts.map((p) => p[0])) + pad;
  const y0 = Math.min(...pts.map((p) => p[1])) - pad - 20;
  const y1 = Math.max(...pts.map((p) => p[1])) + pad;
  return (
    <svg viewBox={`${x0.toFixed(0)} ${y0.toFixed(0)} ${(x1 - x0).toFixed(0)} ${(y1 - y0).toFixed(0)}`} className={className} role="img" aria-label="House axonometric sketch">
      <g strokeLinejoin="round" strokeLinecap="round">
        {shadows.map((s, i) => (
          <path key={i} d={d(s)} fill={S.groundShadowTone} />
        ))}
        <Polys polys={back()} />
        <path d={d(top(0.02, 0.2, 7.6, -2.3, 1.7))} fill={M.paving} stroke="none" />
        <Polys polys={house()} />
        <path d={roofTiles()} stroke={M.roofTileHighlight} strokeWidth={0.7} fill="none" />
        <path d={bam.stalks} stroke={E.bambooStalk} strokeWidth={1.3} fill="none" />
        <path d={bam.leaves} stroke={E.bamboo} strokeWidth={2} fill="none" />
        <Polys polys={balustrade()} />
        <path d={d([[8, 0, 4.55], [13.4, 0, 4.55], [13.4, 7, 4.55]], false)} stroke={M.metal} strokeWidth={2.2} fill="none" />
        <path d={person(10.4, -1.6)} fill={E.person} />
        <circle cx={iso([10.4, -1.6, 0])[0] + 0.4} cy={iso([10.4, -1.6, 0])[1] - 36} r={3.6} fill={E.person} />
        <Polys polys={front()} />
        <path
          d={Array.from({ length: 15 }, (_, i) => d([[8.85 + i * 0.25, PY0 + 0.1, 0.08], [8.85 + i * 0.25, PY0 + 0.1, 1.47]], false)).join('')}
          stroke={M.slab}
          strokeWidth={1}
          fill="none"
        />
        <path d={maple.trunk} stroke={E.trunk} strokeWidth={1.6} fill="none" />
        <path d={ginkgo.trunk} stroke={E.trunk} strokeWidth={2} fill="none" />
        <path d={ginkgo.trunk} stroke={L.color} strokeOpacity={0.25} strokeWidth={0.6} fill="none" />
        <Leaves leaves={maple.leaves} />
        <Leaves leaves={ginkgo.leaves} />
      </g>
    </svg>
  );
}
