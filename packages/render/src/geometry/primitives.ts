import { BufferGeometry, Float32BufferAttribute, Matrix4, Shape, ShapeGeometry, Vector2, Vector3 } from 'three';

/**
 * Low-level geometry builders. All coordinates are scene units (metres,
 * three.js axes: X east, Y up, Z south). Every builder emits non-indexed
 * geometry with flat normals and planar UVs in metres, so faces can be
 * merged freely and textures keep true scale.
 */

export type V2 = readonly [number, number];

export class GeoBuilder {
  pos: number[] = [];
  nor: number[] = [];
  uv: number[] = [];

  tri(a: Vector3, b: Vector3, c: Vector3, n: Vector3, ua: Vector2, ub: Vector2, uc: Vector2): void {
    this.pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    for (let i = 0; i < 3; i++) this.nor.push(n.x, n.y, n.z);
    this.uv.push(ua.x, ua.y, ub.x, ub.y, uc.x, uc.y);
  }

  build(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new Float32BufferAttribute(this.uv, 2));
    return g;
  }
}

const _e1 = new Vector3();
const _e2 = new Vector3();

/** Newell normal of a planar polygon (counter-clockwise seen from the front). */
export function polygonNormal(pts: readonly Vector3[]): Vector3 {
  const n = new Vector3();
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    n.x += (a.y - b.y) * (a.z + b.z);
    n.y += (a.z - b.z) * (a.x + b.x);
    n.z += (a.x - b.x) * (a.y + b.y);
  }
  return n.normalize();
}

/**
 * Convex planar polygons (counter-clockwise seen from the front), fan
 * triangulated. UVs: U along the polygon's horizontal direction when there
 * is one, otherwise along its first edge.
 */
export function polygons(faces: readonly (readonly Vector3[])[]): BufferGeometry {
  const b = new GeoBuilder();
  for (const f of faces) {
    if (f.length < 3) continue;
    const n = polygonNormal(f);
    const up = new Vector3(0, 1, 0);
    const u = new Vector3().crossVectors(up, n);
    if (u.lengthSq() < 1e-6) u.subVectors(f[1]!, f[0]!);
    u.normalize();
    const v = new Vector3().crossVectors(n, u).normalize();
    const uvOf = (p: Vector3) => new Vector2(p.dot(u), p.dot(v));
    const p0 = f[0]!;
    for (let i = 1; i < f.length - 1; i++) {
      const p1 = f[i]!;
      const p2 = f[i + 1]!;
      _e1.subVectors(p1, p0);
      _e2.subVectors(p2, p0);
      if (_e1.cross(_e2).lengthSq() < 1e-12) continue;
      b.tri(p0, p1, p2, n, uvOf(p0), uvOf(p1), uvOf(p2));
    }
  }
  return b.build();
}

/** Axis-aligned box (closed, outward normals). */
export function box(min: Vector3, max: Vector3): BufferGeometry {
  const c = (x: number, y: number, z: number) => new Vector3(x ? max.x : min.x, y ? max.y : min.y, z ? max.z : min.z);
  return hexahedron([c(0, 0, 1), c(1, 0, 1), c(1, 0, 0), c(0, 0, 0)], [c(0, 1, 1), c(1, 1, 1), c(1, 1, 0), c(0, 1, 0)]);
}

/**
 * Closed six-sided solid from a bottom quad and a top quad. Both quads are
 * given counter-clockwise when seen from above.
 */
export function hexahedron(bottom: readonly Vector3[], top: readonly Vector3[]): BufferGeometry {
  const [b0, b1, b2, b3] = bottom as [Vector3, Vector3, Vector3, Vector3];
  const [t0, t1, t2, t3] = top as [Vector3, Vector3, Vector3, Vector3];
  return polygons([
    [t0, t1, t2, t3],
    [b0, b3, b2, b1],
    [b0, b1, t1, t0],
    [b1, b2, t2, t1],
    [b2, b3, t3, t2],
    [b3, b0, t0, t3],
  ]);
}

/**
 * Planar polygon with holes. `origin`, `uAxis`, `vAxis` define the plane;
 * outline and holes are 2D coordinates (metres) in that frame. The front
 * face points along uAxis x vAxis.
 */
export function polygonWithHoles(origin: Vector3, uAxis: Vector3, vAxis: Vector3, outline: readonly V2[], holes: readonly (readonly V2[])[] = []): BufferGeometry {
  const shape = new Shape(outline.map(([x, y]) => new Vector2(x, y)));
  for (const h of holes) shape.holes.push(new Shape(h.map(([x, y]) => new Vector2(x, y))));
  const g = new ShapeGeometry(shape, 1);
  const n = new Vector3().crossVectors(uAxis, vAxis).normalize();
  const m = new Matrix4().makeBasis(uAxis.clone().normalize(), vAxis.clone().normalize(), n).setPosition(origin);
  // UVs from ShapeGeometry are the 2D coordinates in metres already.
  g.applyMatrix4(m);
  const ng = g.toNonIndexed();
  g.dispose();
  return dropDegenerate(ng);
}

/**
 * Extrude a planar polygon (2D in the u/v frame at origin) along the frame
 * normal by `depth`. Closed solid with outward normals.
 */
export function extrude(origin: Vector3, uAxis: Vector3, vAxis: Vector3, profile: readonly V2[], depth: number, holes: readonly (readonly V2[])[] = []): BufferGeometry {
  const u = uAxis.clone().normalize();
  const v = vAxis.clone().normalize();
  const n = new Vector3().crossVectors(u, v);
  const ccw = signedArea(profile) > 0;
  const outline = ccw ? profile : [...profile].reverse();
  const to3 = (p: V2, d: number) => origin.clone().addScaledVector(u, p[0]).addScaledVector(v, p[1]).addScaledVector(n, d);
  const parts: BufferGeometry[] = [];
  // Front cap (towards +n) and back cap.
  parts.push(polygonWithHoles(origin.clone().addScaledVector(n, depth), u, v, outline, holes));
  parts.push(polygonWithHoles(origin, u.clone().negate(), v, outline.map(([x, y]) => [-x, y] as V2), holes.map((h) => h.map(([x, y]) => [-x, y] as V2))));
  const sides: Vector3[][] = [];
  const ring = (loop: readonly V2[], outward: boolean) => {
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i]!;
      const b = loop[(i + 1) % loop.length]!;
      const q = [to3(a, 0), to3(b, 0), to3(b, depth), to3(a, depth)];
      sides.push(outward ? q : q.reverse());
    }
  };
  ring(outline, true);
  for (const h of holes) ring(signedArea(h) > 0 ? [...h].reverse() : h, true);
  parts.push(polygons(sides));
  return mergeSimple(parts);
}

export function signedArea(pts: readonly V2[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    const q = pts[(i + 1) % pts.length]!;
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

/**
 * Tapered cylinder between two points (used for branches and stalks).
 * Open ends; flat-ish shading comes from the illustration material.
 */
export function taperedCylinder(a: Vector3, b: Vector3, r0: number, r1: number, segments: number, out?: GeoBuilderLike): BufferGeometry | undefined {
  const axis = new Vector3().subVectors(b, a);
  const len = axis.length();
  if (len < 1e-6) return undefined;
  axis.divideScalar(len);
  const helper = Math.abs(axis.y) < 0.9 ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0);
  const x = new Vector3().crossVectors(axis, helper).normalize();
  const y = new Vector3().crossVectors(axis, x).normalize();
  const target = out ?? new GeoBuilder();
  const ring = (c: Vector3, r: number, i: number) => {
    const t = (i / segments) * Math.PI * 2;
    return c.clone().addScaledVector(x, Math.cos(t) * r).addScaledVector(y, Math.sin(t) * r);
  };
  const nrm = (i: number) => {
    const t = (i / segments) * Math.PI * 2;
    return new Vector3().addScaledVector(x, Math.cos(t)).addScaledVector(y, Math.sin(t));
  };
  const uv0 = new Vector2();
  for (let i = 0; i < segments; i++) {
    const p0 = ring(a, r0, i);
    const p1 = ring(a, r0, i + 1);
    const p2 = ring(b, r1, i + 1);
    const p3 = ring(b, r1, i);
    const n = nrm(i + 0.5);
    target.tri(p0, p1, p2, n, uv0, uv0, uv0);
    target.tri(p0, p2, p3, n, uv0, uv0, uv0);
  }
  return out ? undefined : (target as GeoBuilder).build();
}

export interface GeoBuilderLike {
  tri(a: Vector3, b: Vector3, c: Vector3, n: Vector3, ua: Vector2, ub: Vector2, uc: Vector2): void;
}

export function createBuilder(): GeoBuilder {
  return new GeoBuilder();
}

/** Concatenate non-indexed geometries that share position/normal/uv. */
export function mergeSimple(parts: readonly BufferGeometry[]): BufferGeometry {
  const names = ['position', 'normal', 'uv'] as const;
  const sizes = { position: 3, normal: 3, uv: 2 };
  const out = new BufferGeometry();
  for (const name of names) {
    let total = 0;
    for (const p of parts) total += p.getAttribute(name)?.count ?? 0;
    const arr = new Float32Array(total * sizes[name]);
    let off = 0;
    for (const p of parts) {
      const src = (p.index ? p.toNonIndexed() : p).getAttribute(name);
      if (!src) continue;
      arr.set(src.array as Float32Array, off);
      off += src.count * sizes[name];
    }
    out.setAttribute(name, new Float32BufferAttribute(arr, sizes[name]));
  }
  return out;
}

/**
 * Removes zero-area triangles (earcut emits them when hole edges are
 * collinear). They have no normal, so edge extraction would otherwise draw
 * spurious lines across flat faces.
 */
export function dropDegenerate(geo: BufferGeometry, minArea = 1e-10): BufferGeometry {
  const pos = geo.getAttribute('position');
  const keep: number[] = [];
  const a = new Vector3(), b = new Vector3(), c = new Vector3();
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i);
    b.fromBufferAttribute(pos, i + 1);
    c.fromBufferAttribute(pos, i + 2);
    if (b.sub(a).cross(c.sub(a)).lengthSq() > minArea) keep.push(i);
  }
  if (keep.length * 3 === pos.count) return geo;
  const out = new BufferGeometry();
  for (const name of Object.keys(geo.attributes)) {
    const attr = geo.getAttribute(name);
    const size = attr.itemSize;
    const arr = new Float32Array(keep.length * 3 * size);
    keep.forEach((t, k) => {
      for (let v = 0; v < 3; v++) for (let j = 0; j < size; j++) arr[(k * 3 + v) * size + j] = attr.getComponent(t + v, j);
    });
    out.setAttribute(name, new Float32BufferAttribute(arr, size));
  }
  geo.dispose();
  return out;
}
