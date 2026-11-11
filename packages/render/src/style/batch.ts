import { BufferGeometry, Float32BufferAttribute, Group, type Material, Mesh, type Object3D } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { appendDirections, appendSegments, createLineObject, dedupeSegments, EdgeAdjacency, featureEdgePositions } from './edges.js';

/**
 * Per-object flags read by the baker (set on `object.userData`):
 * - `edges: false`        do not generate feature edges for this mesh
 * - `edgeAngle: number`   feature angle override (degrees)
 * - `lines: number[]`     extra feature segments (local xyz pairs)
 * - `lineNormals: number[]` the two adjacent face normals of each `lines`
 *                          segment (local; used for outer-profile widening)
 * - `floorLines: number[]` floor-level marker segments (local xyz pairs)
 * - `live: true`          keep the object as is (billboards, animated)
 */
export interface BakeResult {
  group: Group;
  triangles: number;
  meshes: number;
}

interface Bucket {
  material: Material;
  cast: boolean;
  receive: boolean;
  geos: BufferGeometry[];
}

function prepare(geo: BufferGeometry, material: Material): BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  const keep = new Set(['position', 'normal']);
  const mat = material as Material & { map?: unknown; vertexColors?: boolean };
  if (mat.map) keep.add('uv');
  if (mat.vertexColors) keep.add('color');
  for (const name of Object.keys(g.attributes)) if (!keep.has(name)) g.deleteAttribute(name);
  if (mat.map && !g.getAttribute('uv')) g.setAttribute('uv', new Float32BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  g.clearGroups();
  return g;
}

/**
 * Bakes a scene description into a handful of draw calls: one merged mesh
 * per (material, shadow flags), one line object for feature edges and one
 * for floor lines. Objects flagged `live` are carried over untouched.
 */
export function bakeScene(root: Object3D, edgeMaterial: LineMaterial, floorMaterial: LineMaterial): BakeResult {
  root.updateMatrixWorld(true);
  const buckets = new Map<string, Bucket>();
  const edgePos: number[] = [];
  const edgeNorm: number[] = [];
  const floorPos: number[] = [];
  const live: Object3D[] = [];
  const adjacency = new EdgeAdjacency();

  root.traverse((obj) => {
    if (!obj.visible) return;
    if (obj.userData.live) {
      live.push(obj);
      return;
    }
    if (isInsideLive(obj)) return;
    const lines = obj.userData.lines as number[] | undefined;
    if (lines) {
      appendSegments(lines, obj.matrixWorld, edgePos);
      const ln = obj.userData.lineNormals as number[] | undefined;
      if (ln) appendDirections(ln, obj.matrixWorld, edgeNorm);
      while (edgeNorm.length < edgePos.length) edgeNorm.push(0);
    }
    const floors = obj.userData.floorLines as number[] | undefined;
    if (floors) appendSegments(floors, obj.matrixWorld, floorPos);
    if (!(obj instanceof Mesh)) return;
    const material = obj.material as Material;
    const geo = obj.geometry as BufferGeometry;
    if (obj.userData.edges !== false) featureEdgePositions(geo, obj.matrixWorld, edgePos, obj.userData.edgeAngle as number | undefined);
    while (edgeNorm.length < edgePos.length) edgeNorm.push(0);
    const key = `${material.uuid}:${obj.castShadow}:${obj.receiveShadow}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { material, cast: obj.castShadow, receive: obj.receiveShadow, geos: [] };
      buckets.set(key, bucket);
    }
    const g = prepare(geo, material);
    g.applyMatrix4(obj.matrixWorld);
    if ((obj.userData.edges !== false || lines) && !material.transparent) adjacency.addGeometry(g);
    bucket.geos.push(g);
  });

  const group = new Group();
  group.name = 'baked';
  let triangles = 0;
  let meshes = 0;
  for (const b of buckets.values()) {
    const merged = mergeGeometries(b.geos, false);
    if (!merged) throw new Error(`bakeScene: cannot merge geometries for material ${b.material.name || b.material.type}`);
    for (const g of b.geos) g.dispose();
    merged.computeBoundingBox();
    merged.computeBoundingSphere();
    const mesh = new Mesh(merged, b.material);
    mesh.castShadow = b.cast;
    mesh.receiveShadow = b.receive;
    // Transparent glass after everything opaque; lines before glass.
    if ((b.material as Material).transparent) mesh.renderOrder = 2;
    group.add(mesh);
    triangles += merged.getAttribute('position').count / 3;
    meshes++;
  }
  if (edgePos.length) {
    const norms: number[] = [];
    const segs = dedupeSegments(edgePos, edgeNorm, norms);
    group.add(createLineObject(segs, edgeMaterial, 'feature-edges', adjacency, norms));
  }
  if (floorPos.length) group.add(createLineObject(dedupeSegments(floorPos), floorMaterial, 'floor-lines'));
  for (const obj of live) {
    obj.updateMatrixWorld(true);
    obj.matrixWorld.decompose(obj.position, obj.quaternion, obj.scale);
    group.add(obj);
  }
  return { group, triangles, meshes };
}

function isInsideLive(obj: Object3D): boolean {
  let p = obj.parent;
  while (p) {
    if (p.userData.live) return true;
    p = p.parent;
  }
  return false;
}
