import { type BufferGeometry, EdgesGeometry, InstancedBufferAttribute, type Matrix4, Vector3 } from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import type { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { lines } from './tokens.js';

/**
 * Feature edges come from geometry, never from screen-space edge detection:
 * every primitive contributes its boundary edges plus the edges whose
 * dihedral angle exceeds the feature threshold. Coplanar tessellation seams
 * are never drawn.
 */
export function featureEdgePositions(geometry: BufferGeometry, matrix: Matrix4, out: number[], angleDeg: number = lines.featureAngleDeg): void {
  const edges = new EdgesGeometry(geometry, angleDeg);
  const pos = edges.getAttribute('position');
  const v = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(matrix);
    out.push(v.x, v.y, v.z);
  }
  edges.dispose();
}

/** Append explicit line segments (pairs of points, local space) transformed to world. */
export function appendSegments(local: readonly number[], matrix: Matrix4, out: number[]): void {
  const v = new Vector3();
  for (let i = 0; i < local.length; i += 3) {
    v.set(local[i]!, local[i + 1]!, local[i + 2]!).applyMatrix4(matrix);
    out.push(v.x, v.y, v.z);
  }
}

/** Append directions (xyz triples, local space) rotated to world and normalised. */
export function appendDirections(local: readonly number[], matrix: Matrix4, out: number[]): void {
  const v = new Vector3();
  for (let i = 0; i < local.length; i += 3) {
    v.set(local[i]!, local[i + 1]!, local[i + 2]!).transformDirection(matrix);
    out.push(v.x, v.y, v.z);
  }
}

const q = (x: number) => Math.round(x * 2000);
const vkey = (x: number, y: number, z: number) => `${q(x)},${q(y)},${q(z)}`;
const ekey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/**
 * Edge adjacency across every opaque primitive of the scene (welded by
 * position), so an edge knows the normals of the faces on both sides even
 * when those faces belong to different primitives (e.g. two facades
 * meeting at a block corner).
 */
export class EdgeAdjacency {
  private readonly map = new Map<string, number[]>();

  addGeometry(geo: BufferGeometry): void {
    const pos = geo.getAttribute('position');
    const a = new Vector3(), b = new Vector3(), c = new Vector3(), n = new Vector3(), e = new Vector3();
    const count = geo.index ? geo.index.count : pos.count;
    const idx = (i: number) => (geo.index ? geo.index.getX(i) : i);
    for (let i = 0; i < count; i += 3) {
      a.fromBufferAttribute(pos, idx(i));
      b.fromBufferAttribute(pos, idx(i + 1));
      c.fromBufferAttribute(pos, idx(i + 2));
      n.subVectors(c, b).cross(e.subVectors(a, b));
      if (n.lengthSq() < 1e-14) continue;
      n.normalize();
      const ka = vkey(a.x, a.y, a.z), kb = vkey(b.x, b.y, b.z), kc = vkey(c.x, c.y, c.z);
      for (const k of [ekey(ka, kb), ekey(kb, kc), ekey(kc, ka)]) {
        let list = this.map.get(k);
        if (!list) this.map.set(k, (list = []));
        if (list.length < 18) list.push(n.x, n.y, n.z);
      }
    }
  }

  /** Normals of the two faces adjacent to a segment; zeros if unknown. */
  normals(ax: number, ay: number, az: number, bx: number, by: number, bz: number): [number, number, number, number, number, number] {
    const list = this.map.get(ekey(vkey(ax, ay, az), vkey(bx, by, bz)));
    if (!list || list.length < 6) return [0, 0, 0, 0, 0, 0];
    // Pick the most different pair of adjacent faces.
    let best = [0, 3];
    let bestDot = 2;
    for (let i = 0; i < list.length; i += 3) {
      for (let j = i + 3; j < list.length; j += 3) {
        const d = list[i]! * list[j]! + list[i + 1]! * list[j + 1]! + list[i + 2]! * list[j + 2]!;
        if (d < bestDot) {
          bestDot = d;
          best = [i, j];
        }
      }
    }
    const [i, j] = best as [number, number];
    return [list[i]!, list[i + 1]!, list[i + 2]!, list[j]!, list[j + 1]!, list[j + 2]!];
  }
}

/**
 * Removes duplicated segments (shared edges of adjacent primitives). When
 * `normals` (two face normals per segment) are given, `normalsOut` receives
 * the normals of the kept segments. `kept` lists the input index of every
 * kept segment.
 */
export function dedupeSegments(pos: readonly number[], normals?: readonly number[], normalsOut?: number[]): { positions: number[]; kept: number[] } {
  const seen = new Set<string>();
  const out: number[] = [];
  const kept: number[] = [];
  for (let i = 0; i < pos.length; i += 6) {
    const a = `${q(pos[i]!)},${q(pos[i + 1]!)},${q(pos[i + 2]!)}`;
    const b = `${q(pos[i + 3]!)},${q(pos[i + 4]!)},${q(pos[i + 5]!)}`;
    if (a === b) continue;
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(i / 6);
    for (let k = 0; k < 6; k++) out.push(pos[i + k]!);
    if (normals && normalsOut) for (let k = 0; k < 6; k++) normalsOut.push(normals[i + k] ?? 0);
  }
  return { positions: out, kept };
}

/**
 * Fat-line object. Each segment carries the normals of its two adjacent
 * faces (for outer-profile widening): taken from `normals` when given and
 * non-zero, otherwise looked up in `adjacency`.
 */
export function createLineObject(positions: readonly number[], material: LineMaterial, name: string, adjacency?: EdgeAdjacency, normals?: readonly number[]): LineSegments2 {
  const geo = new LineSegmentsGeometry();
  geo.setPositions(positions as number[]);
  const n = positions.length / 6;
  const n1 = new Float32Array(n * 3);
  const n2 = new Float32Array(n * 3);
  if (adjacency || normals) {
    for (let i = 0; i < n; i++) {
      const p = i * 6;
      if (normals && (normals[p]! !== 0 || normals[p + 1]! !== 0 || normals[p + 2]! !== 0)) {
        n1.set(normals.slice(p, p + 3), i * 3);
        n2.set(normals.slice(p + 3, p + 6), i * 3);
        continue;
      }
      if (!adjacency) continue;
      const r = adjacency.normals(positions[p]!, positions[p + 1]!, positions[p + 2]!, positions[p + 3]!, positions[p + 4]!, positions[p + 5]!);
      n1.set(r.slice(0, 3), i * 3);
      n2.set(r.slice(3, 6), i * 3);
    }
  }
  geo.setAttribute('instanceN1', new InstancedBufferAttribute(n1, 3));
  geo.setAttribute('instanceN2', new InstancedBufferAttribute(n2, 3));
  const obj = new LineSegments2(geo, material);
  obj.name = name;
  obj.frustumCulled = false;
  obj.renderOrder = 1;
  return obj;
}
