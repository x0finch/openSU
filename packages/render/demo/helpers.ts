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
  /** No glazing, frames or interior (through-holes in fence walls). */
  through?: boolean;
  /** Interior room depth behind the glazing (mm). */
  room?: number;
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
  /** Wall thickness for through-openings. */
  thickness?: number;
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

/** Lowest top of the outline over the horizontal range [u0, u1]. */
function topOver(outline: readonly V2[], u0: number, u1: number): number {
  let top = Infinity;
  for (let k = 0; k <= 8; k++) {
    const u = u0 + ((u1 - u0) * k) / 8;
    let best = -Infinity;
    for (let i = 0; i < outline.length; i++) {
      const a = outline[i]!;
      const b = outline[(i + 1) % outline.length]!;
      if ((a[0] <= u && b[0] >= u) || (b[0] <= u && a[0] >= u)) {
        const z = a[0] === b[0] ? Math.max(a[1], b[1]) : a[1] + ((u - a[0]) / (b[0] - a[0])) * (b[1] - a[1]);
        best = Math.max(best, z);
      }
    }
    top = Math.min(top, best);
  }
  return top;
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
  b.add(polygonWithHoles(O, U, V, outlineM, holes), spec.material ?? b.pal.wall, { floorLines });

  const zMax = Math.max(...spec.outline.map((p) => p[1]));
  const zMin = Math.min(...spec.outline.map((p) => p[1]));
  const uMax = Math.max(...spec.outline.map((p) => p[0]));
  const uMin = Math.min(...spec.outline.map((p) => p[0]));

  for (const o of openings) {
    const rd = o.through ? (spec.thickness ?? 200) : (o.reveal ?? 140);
    const wallMat = spec.material ?? b.pal.wall;
    const reveal = (pts: Vector3[], desired: Vector3) => b.add(polygons([oriented(pts, desired)]), wallMat);
    // Reveals stop at the frame's outer face so the two never overlap (no z-fighting).
    const rv = o.through ? rd : rd - FRAME_D / 2;
    if (!isNotch(o)) reveal([F(o.u0, o.z0), F(o.u1, o.z0), F(o.u1, o.z0, rv), F(o.u0, o.z0, rv)], V);
    reveal([F(o.u0, o.z1), F(o.u1, o.z1), F(o.u1, o.z1, rv), F(o.u0, o.z1, rv)], V.clone().negate());
    reveal([F(o.u0, o.z0), F(o.u0, o.z1), F(o.u0, o.z1, rv), F(o.u0, o.z0, rv)], U);
    reveal([F(o.u1, o.z0), F(o.u1, o.z1), F(o.u1, o.z1, rv), F(o.u1, o.z0, rv)], U.clone().negate());
    if (o.through) continue;

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
      } else if (c.type === 'wood') {
        const woodOrigin = F(0, 0, rd + 20);
        b.add(extrude(woodOrigin, U, V, hole, 40 * MM), b.pal.wood);
      }
    }
    // Interior behind the glazing.
    const depth = o.room ?? 1100;
    const m = 450;
    const ru0 = Math.max(uMin + 120, o.u0 - m);
    const ru1 = Math.min(uMax - 120, o.u1 + m);
    const rz0 = Math.max(zMin + 0, o.z0 - m);
    const rz1 = Math.min(zMax - 120, o.z1 + m, topOver(spec.outline, ru0, ru1) - 250);
    const d0 = rd;
    const d1 = rd + depth;
    const inner = (pts: Vector3[], desired: Vector3, mat: Material) => b.add(polygons([oriented(pts, desired)]), mat, { cast: true });
    inner([F(ru0, rz0, d1), F(ru1, rz0, d1), F(ru1, rz1, d1), F(ru0, rz1, d1)], N, b.pal.interior);
    inner([F(ru0, rz0, d0), F(ru0, rz1, d0), F(ru0, rz1, d1), F(ru0, rz0, d1)], U, b.pal.interior);
    inner([F(ru1, rz0, d0), F(ru1, rz1, d0), F(ru1, rz1, d1), F(ru1, rz0, d1)], U.clone().negate(), b.pal.interior);
    inner([F(ru0, rz1, d0), F(ru1, rz1, d0), F(ru1, rz1, d1), F(ru0, rz1, d1)], V.clone().negate(), b.pal.interior);
    const fz = Math.max(o.z0, 15);
    inner([F(ru0, fz, d0), F(ru1, fz, d0), F(ru1, fz, d1), F(ru0, fz, d1)], V, b.pal.interiorFloor);
    // Close the gaps between the hole and the larger room box.
    const ring: Vector3[][] = [];
    const front = (pts: Vector3[]) => ring.push(oriented(pts, N.clone().negate()));
    if (ru0 < o.u0) front([F(ru0, rz0, d0), F(o.u0, rz0, d0), F(o.u0, rz1, d0), F(ru0, rz1, d0)]);
    if (ru1 > o.u1) front([F(o.u1, rz0, d0), F(ru1, rz0, d0), F(ru1, rz1, d0), F(o.u1, rz1, d0)]);
    if (rz1 > o.z1) front([F(o.u0, o.z1, d0), F(o.u1, o.z1, d0), F(o.u1, rz1, d0), F(o.u0, rz1, d0)]);
    if (ring.length) b.add(polygons(ring), b.pal.interior, { cast: true, edges: false });
  }
}

/** Mono-pitch roof: wood body (fascia/soffit) with a thin tile layer on top. */
export interface RoofSpec {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** Direction the roof falls towards. */
  fall: 'N' | 'S';
  /** Underside height at the high wall line (mm). */
  zHigh: number;
  slopeDeg: number;
  overhang: { n: number; s: number; e: number; w: number };
  woodT?: number;
  tileT?: number;
}

export function roofUnderside(r: RoofSpec, y: number): number {
  const t = Math.tan((r.slopeDeg * Math.PI) / 180);
  return r.fall === 'S' ? r.zHigh - (r.y1 - y) * t : r.zHigh - (y - r.y0) * t;
}

export function monoRoof(b: Builder, r: RoofSpec): { topAt: (y: number) => number } {
  const woodT = r.woodT ?? 200;
  const tileT = r.tileT ?? 70;
  const xa = r.x0 - r.overhang.w, xb = r.x1 + r.overhang.e, ya = r.y0 - r.overhang.s, yb = r.y1 + r.overhang.n;
  const corners: [number, number][] = [[xa, ya], [xb, ya], [xb, yb], [xa, yb]];
  const ring = (dz: number) => corners.map(([x, y]) => P(x, y, roofUnderside(r, y) + dz));
  b.add(hexahedron(ring(0), ring(woodT)), b.pal.fascia);
  b.add(hexahedron(ring(woodT), ring(woodT + tileT)), b.pal.roofTile);
  return { topAt: (y: number) => roofUnderside(r, y) + woodT + tileT };
}

/** Flat skylight lying on a roof plane (three panes). */
export function skylight(b: Builder, r: RoofSpec, xc: number, yc: number, w: number, d: number, panes: number, topAt: (y: number) => number): void {
  const t = 40;
  const ring = (x0: number, x1: number, y0: number, y1: number, dz: number) =>
    [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(([x, y]) => P(x!, y!, topAt(y!) + dz));
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
export function fenceWall(b: Builder, x0: number, y0: number, x1: number, y1: number, height: number, thickness: number, holes: { a0: number; a1: number; z0: number; z1: number }[] = [], coping = true): void {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const ux = (x1 - x0) / len, uy = (y1 - y0) / len;
  // Left normal of the run direction.
  const lx = -uy, ly = ux;
  const ox = x0 + lx * thickness, oy = y0 + ly * thickness;
  const outline: V2[] = [[0, 0], [len, 0], [len, height], [0, height]];
  // Outer face: seen from the right side (outside), U runs x0 -> x1.
  face(b, { origin: [x0, y0], dir: [ux, uy], outline, thickness, openings: holes.map((h) => ({ u0: h.a0, u1: h.a1, z0: h.z0, z1: h.z1, through: true })) });
  // Inner face: seen from the left, U runs x1 -> x0.
  face(b, {
    origin: [ox + ux * len, oy + uy * len],
    dir: [-ux, -uy],
    outline,
    thickness: 0,
    openings: holes.map((h) => ({ u0: len - h.a1, u1: len - h.a0, z0: h.z0, z1: h.z1, through: true })),
  });
  const q = (s: number, t: number, z: number) => P(x0 + ux * s + lx * t, y0 + uy * s + ly * t, z);
  const ends: Vector3[][] = [
    oriented([q(0, 0, 0), q(0, thickness, 0), q(0, thickness, height), q(0, 0, height)], new Vector3(-ux, 0, uy)),
    oriented([q(len, 0, 0), q(len, thickness, 0), q(len, thickness, height), q(len, 0, height)], new Vector3(ux, 0, -uy)),
  ];
  if (!coping) ends.push(oriented([q(0, 0, height), q(len, 0, height), q(len, thickness, height), q(0, thickness, height)], new Vector3(0, 1, 0)));
  b.add(polygons(ends), b.pal.wall);
  if (coping) {
    const e = 25;
    const ring = (z: number) => {
      const pts = [q(-e * 0, -e, z), q(len, -e, z), q(len, thickness + e, z), q(0, thickness + e, z)];
      return polygonNormal(pts).y > 0 ? pts : [pts[0]!, pts[3]!, pts[2]!, pts[1]!];
    };
    b.add(hexahedron(ring(height), ring(height + 60)), b.pal.slab);
  }
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
