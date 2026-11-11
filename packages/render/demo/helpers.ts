/**
 * Throwaway demo helpers: build the reference house massing from a few
 * architectural primitives. Model units are millimetres with X east,
 * Y north, Z up; conversion to scene metres happens only in `P`.
 */
import { type BufferGeometry, Group, type Material, Mesh, Vector3 } from 'three';
import { box, extrude, hexahedron, polygonNormal, polygons, polygonWithHoles, type Palette, type V2 } from '../src/index.js';

const MM = 0.001;

/** Model point (mm, Z up) to scene point (m, Y up). */
export function P(x: number, y: number, z: number): Vector3 {
  return new Vector3(x * MM, z * MM, -y * MM);
}

export interface MeshOpts {
  edges?: boolean;
  cast?: boolean;
  receive?: boolean;
  floorLines?: number[];
  lines?: number[];
}

export class Builder {
  readonly root = new Group();
  constructor(readonly pal: Palette) {}

  add(geo: BufferGeometry, mat: Material, o: MeshOpts = {}): Mesh {
    const m = new Mesh(geo, mat);
    m.castShadow = o.cast ?? true;
    m.receiveShadow = o.receive ?? true;
    m.userData.edges = o.edges ?? true;
    if (o.floorLines?.length) m.userData.floorLines = o.floorLines;
    if (o.lines?.length) m.userData.lines = o.lines;
    this.root.add(m);
    return m;
  }

  /** Axis-aligned box in model mm. */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, mat: Material, o: MeshOpts = {}): Mesh {
    const a = P(Math.min(x0, x1), Math.max(y0, y1), Math.min(z0, z1));
    const b = P(Math.max(x0, x1), Math.min(y0, y1), Math.max(z0, z1));
    return this.add(box(a, b), mat, o);
  }
}

/** Orient a planar polygon so its normal points along `desired`. */
function oriented(pts: Vector3[], desired: Vector3): Vector3[] {
  return polygonNormal(pts).dot(desired) < 0 ? [...pts].reverse() : pts;
}

export type CellType = 'glass' | 'wood' | 'door' | 'open';

export interface Cell {
  /** Cell bounds relative to the opening's lower-left corner (mm). */
  u0: number;
  u1: number;
  z0: number;
  z1: number;
  type: CellType;
}

export interface Opening {
  u0: number;
  u1: number;
  z0: number;
  z1: number;
  /** Subdivision; defaults to one glass cell. */
  cells?: Cell[];
  /** Split horizontally into this many equal glass cells. */
  cols?: number;
  reveal?: number;
  /** Blind recess of this depth (mm) with a flat back: small wall openings. */
  recess?: number;
}

export interface FaceSpec {
  /** Lower-left corner of the face seen from outside (model mm, on z = 0). */
  origin: [number, number];
  /** Unit horizontal direction of the face's U axis (left to right seen from outside). */
  dir: [number, number];
  /** Outline in (u, z) mm, counter-clockwise seen from outside. */
  outline: V2[];
  openings?: Opening[];
  floorLevels?: number[];
  material?: Material;
}

const FRAME_W = 50;
const FRAME_D = 60;

/** Horizontal intervals of a polygon at height z. */
function scanline(outline: readonly V2[], z: number): [number, number][] {
  const xs: number[] = [];
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i]!;
    const b = outline[(i + 1) % outline.length]!;
    if ((a[1] <= z && b[1] > z) || (b[1] <= z && a[1] > z)) {
      xs.push(a[0] + ((z - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
    }
  }
  xs.sort((p, q) => p - q);
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < xs.length; i += 2) out.push([xs[i]!, xs[i + 1]!]);
  return out;
}

function subtract(intervals: [number, number][], cuts: [number, number][]): [number, number][] {
  let cur = intervals;
  for (const [c0, c1] of cuts) {
    const next: [number, number][] = [];
    for (const [a, b] of cur) {
      if (c1 <= a || c0 >= b) next.push([a, b]);
      else {
        if (c0 > a) next.push([a, c0]);
        if (c1 < b) next.push([c1, b]);
      }
    }
    cur = next;
  }
  return cur;
}

/** A planar wall face with openings, reveals, frames, glazing and interiors. */
export function face(b: Builder, spec: FaceSpec): void {
  const [dx, dy] = spec.dir;
  const U = new Vector3(dx, 0, -dy);
  const V = new Vector3(0, 1, 0);
  const N = new Vector3().crossVectors(U, V);
  const O = P(spec.origin[0], spec.origin[1], 0);
  const F = (u: number, z: number, depth = 0) => O.clone().addScaledVector(U, u * MM).addScaledVector(V, z * MM).addScaledVector(N, -depth * MM);
  const openings = spec.openings ?? [];
  // Openings that reach the bottom of the face become notches in the
  // outline (faces start exactly at the ground), the rest become holes.
  const zBottom = Math.min(...spec.outline.map((p) => p[1]));
  const isNotch = (o: Opening) => o.z0 <= zBottom + 1;
  let outline: V2[] = [...spec.outline];
  const notches = openings.filter(isNotch).sort((a, c) => a.u0 - c.u0);
  if (notches.length) {
    const [p0, p1] = [outline[0]!, outline[1]!];
    if (p0[1] !== zBottom || p1[1] !== zBottom) throw new Error('face: notches need the outline to start with its bottom edge');
    const bottom: V2[] = [p0];
    for (const o of notches) bottom.push([o.u0, zBottom], [o.u0, o.z1], [o.u1, o.z1], [o.u1, zBottom]);
    outline = [...bottom, ...outline.slice(1)];
  }
  const holes = openings.filter((o) => !isNotch(o)).map((o) => [[o.u0, o.z0], [o.u1, o.z0], [o.u1, o.z1], [o.u0, o.z1]].map(([u, z]) => [u! * MM, z! * MM] as V2));
  const outlineM = outline.map(([u, z]) => [u * MM, z * MM] as V2);
  const floorLines: number[] = [];
  for (const level of spec.floorLevels ?? []) {
    const cuts = openings.filter((o) => o.z0 < level && o.z1 > level).map((o) => [o.u0, o.u1] as [number, number]);
    for (const [a, c] of subtract(scanline(spec.outline, level), cuts)) {
      const p = F(a, level);
      const q = F(c, level);
      floorLines.push(p.x, p.y, p.z, q.x, q.y, q.z);
    }
  }
  // Feature edges of a planar face are exactly its outline and hole loops;
  // emitting them analytically avoids spurious lines from triangulation.
  const loopLines: number[] = [];
  const loop = (pts: readonly V2[]) => {
    for (let i = 0; i < pts.length; i++) {
      const p = F(pts[i]![0] / MM, pts[i]![1] / MM);
      const q = F(pts[(i + 1) % pts.length]![0] / MM, pts[(i + 1) % pts.length]![1] / MM);
      loopLines.push(p.x, p.y, p.z, q.x, q.y, q.z);
    }
  };
  loop(outlineM);
  holes.forEach(loop);
  b.add(polygonWithHoles(O, U, V, outlineM, holes), spec.material ?? b.pal.wall, { floorLines, edges: false, lines: loopLines });


  for (const o of openings) {
    const rd = o.recess ?? o.reveal ?? 140;
    const wallMat = spec.material ?? b.pal.wall;
    const reveal = (pts: Vector3[], desired: Vector3) => b.add(polygons([oriented(pts, desired)]), wallMat);
    // Reveals stop at the frame's outer face so the two never overlap (no z-fighting).
    const rv = o.recess ? rd : rd - FRAME_D / 2;
    if (!isNotch(o)) reveal([F(o.u0, o.z0), F(o.u1, o.z0), F(o.u1, o.z0, rv), F(o.u0, o.z0, rv)], V);
    reveal([F(o.u0, o.z1), F(o.u1, o.z1), F(o.u1, o.z1, rv), F(o.u0, o.z1, rv)], V.clone().negate());
    reveal([F(o.u0, o.z0), F(o.u0, o.z1), F(o.u0, o.z1, rv), F(o.u0, o.z0, rv)], U);
    reveal([F(o.u1, o.z0), F(o.u1, o.z1), F(o.u1, o.z1, rv), F(o.u1, o.z0, rv)], U.clone().negate());
    if (o.recess) {
      b.add(polygons([oriented([F(o.u0, o.z0, rd), F(o.u1, o.z0, rd), F(o.u1, o.z1, rd), F(o.u0, o.z1, rd)], N)]), b.pal.recess, { edges: false });
      continue;
    }

    const w = o.u1 - o.u0;
    const h = o.z1 - o.z0;
    let cells = o.cells;
    if (!cells) {
      const n = o.cols ?? 1;
      cells = [];
      for (let i = 0; i < n; i++) cells.push({ u0: (w * i) / n, u1: (w * (i + 1)) / n, z0: 0, z1: h, type: 'glass' });
    }
    for (const c of cells) {
      const u0 = o.u0 + c.u0, u1 = o.u0 + c.u1, z0 = o.z0 + c.z0, z1 = o.z0 + c.z1;
      if (c.type === 'open') continue;
      // Frame ring.
      const frameOrigin = F(0, 0, rd + FRAME_D / 2);
      const ring: V2[] = [[u0, z0], [u1, z0], [u1, z1], [u0, z1]].map(([u, z]) => [u! * MM, z! * MM] as V2);
      const fw = FRAME_W;
      const hole: V2[] = [[u0 + fw, z0 + fw], [u1 - fw, z0 + fw], [u1 - fw, z1 - fw], [u0 + fw, z1 - fw]].map(([u, z]) => [u! * MM, z! * MM] as V2);
      b.add(extrude(frameOrigin, U, V, ring, FRAME_D * MM, [hole]), b.pal.frame);
      if (c.type === 'glass' || c.type === 'door') {
        b.add(polygons([[F(u0 + fw, z0 + fw, rd), F(u1 - fw, z0 + fw, rd), F(u1 - fw, z1 - fw, rd), F(u0 + fw, z1 - fw, rd)]]), b.pal.glass, { edges: false, cast: false, receive: false });
        // Flat backing just behind the pane: glazing reads as one flat grey,
        // and it closes the hollow massing for the shadow pass.
        const bd = rd + FRAME_D / 2 - 5;
        b.add(polygons([oriented([F(u0 + fw, z0 + fw, bd), F(u1 - fw, z0 + fw, bd), F(u1 - fw, z1 - fw, bd), F(u0 + fw, z1 - fw, bd)], N)]), b.pal.glassBacking, { edges: false, cast: true, receive: false });
      } else if (c.type === 'wood') {
        const woodOrigin = F(0, 0, rd + 20);
        b.add(extrude(woodOrigin, U, V, hole, 40 * MM), b.pal.wood);
      }
    }
  }
}

/**
 * Mono-pitch roof. The roof is a sloped slab of constant vertical depth:
 * its top is the tiled plane, its edges are fascia (eave and high edge) and
 * barge boards (gable sides) that follow the slope with constant depth, and
 * its underside is the soffit under the overhangs. Nothing hangs below the
 * soffit plane. Works for any fall direction, pitch and overhangs.
 */
export interface RoofSpec {
  /** Wall footprint the roof sits on (mm). */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** Direction the roof falls towards. */
  fall: 'N' | 'S' | 'E' | 'W';
  /** Underside (soffit) height at the high wall line (mm). */
  zHigh: number;
  slopeDeg: number;
  overhang: { n: number; s: number; e: number; w: number };
  /** Total vertical depth of fascia / barge boards (mm). */
  depth?: number;
  /** Top part of that depth shown as the tile edge (mm). */
  tileEdge?: number;
}

/** Height of the roof underside (soffit plane) at a plan point. */
export function roofUnderside(r: RoofSpec, x: number, y: number): number {
  const t = Math.tan((r.slopeDeg * Math.PI) / 180);
  const run = r.fall === 'N' ? y - r.y0 : r.fall === 'S' ? r.y1 - y : r.fall === 'E' ? x - r.x0 : r.x1 - x;
  return r.zHigh - run * t;
}

export function monoRoof(b: Builder, r: RoofSpec): { topAt: (x: number, y: number) => number } {
  const depth = r.depth ?? 200;
  const tileEdge = Math.min(r.tileEdge ?? 45, depth);
  const xa = r.x0 - r.overhang.w, xb = r.x1 + r.overhang.e, ya = r.y0 - r.overhang.s, yb = r.y1 + r.overhang.n;
  // Counter-clockwise seen from above.
  const corners: [number, number][] = [[xa, ya], [xb, ya], [xb, yb], [xa, yb]];
  const ring = (dz: number) => corners.map(([x, y]) => P(x, y, roofUnderside(r, x, y) + dz));
  // Board zone (fascia, barge boards, soffit) and the tiled top with its edge.
  b.add(hexahedron(ring(0), ring(depth - tileEdge)), b.pal.fascia);
  b.add(hexahedron(ring(depth - tileEdge), ring(depth)), b.pal.roofTile);
  return { topAt: (x: number, y: number) => roofUnderside(r, x, y) + depth };
}

/** Flat skylight lying on a roof plane (three panes). */
export function skylight(b: Builder, xc: number, yc: number, w: number, d: number, panes: number, topAt: (x: number, y: number) => number): void {
  const t = 40;
  const ring = (x0: number, x1: number, y0: number, y1: number, dz: number) =>
    [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(([x, y]) => P(x!, y!, topAt(x!, y!) + dz));
  b.add(hexahedron(ring(xc - w / 2, xc + w / 2, yc - d / 2, yc + d / 2, -10), ring(xc - w / 2, xc + w / 2, yc - d / 2, yc + d / 2, t)), b.pal.frame);
  const pw = (w - 60 * (panes + 1)) / panes;
  for (let i = 0; i < panes; i++) {
    const x0 = xc - w / 2 + 60 + i * (pw + 60);
    b.add(hexahedron(ring(x0, x0 + pw, yc - d / 2 + 60, yc + d / 2 - 60, t - 5), ring(x0, x0 + pw, yc - d / 2 + 60, yc + d / 2 - 60, t + 8)), b.pal.gravel, { cast: false });
    const pane = ring(x0, x0 + pw, yc - d / 2 + 60, yc + d / 2 - 60, t + 14);
    b.add(polygons([pane]), b.pal.glass, { edges: false, cast: false, receive: false });
  }
}

/** Glass balustrade along a straight line: glass panels, base shoe and top rail. */
export function glassBalustrade(b: Builder, x0: number, y0: number, x1: number, y1: number, z: number, height = 1100): void {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const n = Math.max(1, Math.round(len / 1250));
  const ux = (x1 - x0) / len, uy = (y1 - y0) / len;
  const gap = 12;
  for (let i = 0; i < n; i++) {
    const a = (len * i) / n + gap, c = (len * (i + 1)) / n - gap;
    const p = (s: number, zz: number) => P(x0 + ux * s, y0 + uy * s, zz);
    b.add(polygons([[p(a, z + 60), p(c, z + 60), p(c, z + height - 30), p(a, z + height - 30)]]), b.pal.balustrade, { cast: false, receive: false });
  }
  // Top rail and base shoe as thin boxes along the line.
  const nx = -uy * 25, ny = ux * 25;
  const bar = (zz0: number, zz1: number, wide: number) => {
    const k = wide / 25;
    const q = [P(x0 - nx * k, y0 - ny * k, 0), P(x1 - nx * k, y1 - ny * k, 0), P(x1 + nx * k, y1 + ny * k, 0), P(x0 + nx * k, y0 + ny * k, 0)];
    const ccw = polygonNormal(q).y > 0 ? q : [...q].reverse();
    const at = (zz: number) => ccw.map((v) => new Vector3(v.x, zz * MM, v.z));
    b.add(hexahedron(at(zz0), at(zz1)), b.pal.metal);
  };
  bar(z + height - 30, z + height + 10, 25);
  bar(z, z + 60, 30);
}

/** Vertical bar railing / gate. */
export function bars(b: Builder, x0: number, y0: number, x1: number, y1: number, z0: number, z1: number, spacing: number, barW: number, mat: Material, rails = true): void {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const ux = (x1 - x0) / len, uy = (y1 - y0) / len;
  const n = Math.max(2, Math.round(len / spacing) + 1);
  const geos: Vector3[][][] = [];
  for (let i = 0; i < n; i++) {
    const s = barW / 2 + ((len - barW) * i) / (n - 1);
    const cx = x0 + ux * s, cy = y0 + uy * s;
    b.box(cx - barW / 2, cy - barW / 2, z0, cx + barW / 2, cy + barW / 2, z1, mat, { edges: false });
  }
  void geos;
  if (rails) {
    const t = barW * 1.6;
    railBox(b, x0, y0, x1, y1, z1 - 30, z1 + 10, t, mat);
    railBox(b, x0, y0, x1, y1, z0, z0 + 50, t, mat);
  }
}

function railBox(b: Builder, x0: number, y0: number, x1: number, y1: number, z0: number, z1: number, t: number, mat: Material): void {
  if (Math.abs(y1 - y0) < 1) b.box(Math.min(x0, x1), y0 - t / 2, z0, Math.max(x0, x1), y0 + t / 2, z1, mat);
  else b.box(x0 - t / 2, Math.min(y0, y1), z0, x0 + t / 2, Math.max(y0, y1), z1, mat);
}

/**
 * Fence/parapet wall between two points along an axis, thickness to the
 * left side of the run direction, with optional through-openings and a
 * dark coping.
 */
export function fenceWall(
  b: Builder,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  height: number,
  thickness: number,
  holes: { a0: number; a1: number; z0: number; z1: number }[] = [],
  /** Draw the end faces (false where the run abuts a building or another run). */
  ends: [boolean, boolean] = [true, true],
  /**
   * Corner joints: extend the outer face over the neighbouring run's end by
   * this much (mm) at the start / end, so a corner reads as one continuous
   * face, and shorten the coping to meet the neighbour's coping.
   */
  corner: [number, number] = [0, 0],
  /** Shorten the inner face at the start / end where another run joins at a corner (mm). */
  innerTrim: [number, number] = [0, 0],
): void {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const ux = (x1 - x0) / len, uy = (y1 - y0) / len;
  // Left normal of the run direction.
  const lx = -uy, ly = ux;
  const ox = x0 + lx * thickness, oy = y0 + ly * thickness;
  const [cs, ce] = corner;
  const outer: V2[] = [[0, 0], [len + cs + ce, 0], [len + cs + ce, height], [0, height]];
  // Outer face: seen from the right side (outside), U runs x0 -> x1.
  face(b, { origin: [x0 - ux * cs, y0 - uy * cs], dir: [ux, uy], outline: outer, openings: holes.map((h) => ({ u0: h.a0 + cs, u1: h.a1 + cs, z0: h.z0, z1: h.z1, recess: thickness / 2 })) });
  // Inner face: seen from the left, U runs x1 -> x0.
  const [ts, te] = innerTrim;
  const innerLen = len - ts - te;
  face(b, { origin: [ox + ux * (len - te), oy + uy * (len - te)], dir: [-ux, -uy], outline: [[0, 0], [innerLen, 0], [innerLen, height], [0, height]] });
  const q = (s: number, t: number, z: number) => P(x0 + ux * s + lx * t, y0 + uy * s + ly * t, z);
  const endFaces: Vector3[][] = [];
  if (ends[0]) endFaces.push(oriented([q(0, 0, 0), q(0, thickness, 0), q(0, thickness, height), q(0, 0, height)], new Vector3(-ux, 0, uy)));
  if (ends[1]) endFaces.push(oriented([q(len, 0, 0), q(len, thickness, 0), q(len, thickness, height), q(len, 0, height)], new Vector3(ux, 0, -uy)));
  if (endFaces.length) b.add(polygons(endFaces), b.pal.wall);
  const e = 25;
  const ring = (z: number) => {
    const s0 = cs ? e : 0;
    const s1 = ce ? len - e : len;
    const pts = [q(s0, -e, z), q(s1, -e, z), q(s1, thickness + e, z), q(s0, thickness + e, z)];
    return polygonNormal(pts).y > 0 ? pts : [pts[0]!, pts[3]!, pts[2]!, pts[1]!];
  };
  b.add(hexahedron(ring(height), ring(height + 60)), b.pal.slab);
}

/** Wooden slat gate between two points. */
export function slatGate(b: Builder, x0: number, y0: number, x1: number, y1: number, height: number, slatW = 60, gap = 45): void {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const ux = (x1 - x0) / len, uy = (y1 - y0) / len;
  const n = Math.floor((len + gap) / (slatW + gap));
  const lx = -uy * 50, ly = ux * 50;
  for (let i = 0; i < n; i++) {
    const s = i * (slatW + gap) + (len - (n * (slatW + gap) - gap)) / 2;
    const ax = x0 + ux * s + lx, ay = y0 + uy * s + ly;
    const bx = ax + ux * slatW + lx * 0.8, by = ay + uy * slatW + ly * 0.8;
    b.box(ax, ay, 30, bx, by, height, b.pal.wood);
  }
}
