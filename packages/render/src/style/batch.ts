import { BufferGeometry, Float32BufferAttribute, Group, type Material, Mesh, type Object3D } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { appendDirections, appendSegments, createLineObject, dedupeSegments, EdgeAdjacency, featureEdgePositions } from './edges.js';
import { setShadowLight, twinMaterial } from './materials.js';

/**
 * Per-object flags read by the baker (set on `object.userData`):
 * - `edges: false`        do not generate feature edges for this mesh
 * - `edgeAngle: number`   feature angle override (degrees)
 * - `lines: number[]`     extra feature segments (local xyz pairs)
 * - `lineNormals: number[]` the two adjacent face normals of each `lines`
 *                          segment (local; used for outer-profile widening)
 * - `floorLines: number[]` floor-level marker segments (local xyz pairs)
 * - `live: true`          keep the object as is (billboards, animated)
 * - `bakeGroup: string`   bake group (inherited by descendants; default
 *                          'site'). Each group gets its own meshes and line
 *                          objects so it can be shown, hidden or clipped on
 *                          its own. The group 'house' is clippable: its
 *                          materials are twins that can take clipping planes.
 * - `noFrame: true`       not part of framing and shadow bounds
 * - `interior: true`      inside the house though not clippable (stairs): it
 *                          takes the interior sun's shadows (see
 *                          `setShadowLight`), as the clippable group does
 */
export interface BakeResult {
  group: Group;
  triangles: number;
  meshes: number;
  /** Baked meshes and line objects per bake group. */
  groups: Map<string, Object3D[]>;
  /** Materials of the clippable group (twins of the palette materials). */
  clipMaterials: Material[];
  /** Line materials of the clippable group (their resolution must follow the viewport). */
  clipLineMaterials: LineMaterial[];
}

/** The bake group whose materials can be clipped (level cutaway). */
export const CLIP_GROUP = 'house';
const DEFAULT_GROUP = 'site';

interface Bucket {
  material: Material;
  interior: boolean;
  cast: boolean;
  receive: boolean;
  group: string;
  noFrame: boolean;
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

function groupOf(obj: Object3D): string {
  for (let o: Object3D | null = obj; o; o = o.parent) {
    const g = o.userData.bakeGroup as string | undefined;
    if (g) return g;
  }
  return DEFAULT_GROUP;
}

/**
 * Bakes a scene description into a handful of draw calls: one merged mesh
 * per (bake group, material, shadow flags), one line object for feature
 * edges and one for floor lines per group. Transparent materials are merged
 * across groups (their blending order stays that of one draw call); a
 * transparent bucket that holds clippable geometry is clippable as a whole.
 * Objects flagged `live` are carried over untouched.
 */
export function bakeScene(root: Object3D, edgeMaterial: LineMaterial, floorMaterial: LineMaterial): BakeResult {
  root.updateMatrixWorld(true);
  const buckets = new Map<string, Bucket>();
  // Edge segments in traversal order with their group (deduplicated globally).
  const edgePos: number[] = [];
  const edgeNorm: number[] = [];
  const edgeGroup: string[] = [];
  const floorPos = new Map<string, number[]>();
  const live: Object3D[] = [];
  const adjacency = new EdgeAdjacency();
  const twins = new Map<Material, Material>();
  const twin = (m: Material) => {
    let t = twins.get(m);
    if (!t) {
      twins.set(m, (t = twinMaterial(m)));
      setShadowLight(t, 0);
    }
    return t;
  };
  const interiorTwins = new Map<Material, Material>();
  const interiorTwin = (m: Material) => {
    let t = interiorTwins.get(m);
    if (!t) {
      interiorTwins.set(m, (t = twinMaterial(m)));
      setShadowLight(t, 0);
    }
    return t;
  };
  const tagEdges = (group: string) => {
    while (edgeNorm.length < edgePos.length) edgeNorm.push(0);
    while (edgeGroup.length < edgePos.length / 6) edgeGroup.push(group);
  };

  root.traverse((obj) => {
    if (!obj.visible) return;
    if (obj.userData.live) {
      live.push(obj);
      return;
    }
    if (isInsideLive(obj)) return;
    const group = groupOf(obj);
    const lines = obj.userData.lines as number[] | undefined;
    if (lines) {
      appendSegments(lines, obj.matrixWorld, edgePos);
      const ln = obj.userData.lineNormals as number[] | undefined;
      if (ln) appendDirections(ln, obj.matrixWorld, edgeNorm);
      tagEdges(group);
    }
    const floors = obj.userData.floorLines as number[] | undefined;
    if (floors) {
      let list = floorPos.get(group);
      if (!list) floorPos.set(group, (list = []));
      appendSegments(floors, obj.matrixWorld, list);
    }
    if (!(obj instanceof Mesh)) return;
    const material = obj.material as Material;
    const geo = obj.geometry as BufferGeometry;
    if (obj.userData.edges !== false) featureEdgePositions(geo, obj.matrixWorld, edgePos, obj.userData.edgeAngle as number | undefined);
    tagEdges(group);
    const noFrame = !!obj.userData.noFrame;
    const interior = !!obj.userData.interior && group !== CLIP_GROUP && !material.transparent;
    const bucketGroup = material.transparent ? '*' : group;
    const key = `${bucketGroup}:${material.uuid}:${obj.castShadow}:${obj.receiveShadow}:${noFrame}:${interior}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { material, interior, cast: obj.castShadow, receive: obj.receiveShadow, group, noFrame, geos: [] };
      buckets.set(key, bucket);
    }
    if (material.transparent && group === CLIP_GROUP) bucket.group = CLIP_GROUP;
    const g = prepare(geo, material);
    g.applyMatrix4(obj.matrixWorld);
    if ((obj.userData.edges !== false || lines) && !material.transparent && !noFrame) adjacency.addGeometry(g);
    bucket.geos.push(g);
  });

  const group = new Group();
  group.name = 'baked';
  const groups = new Map<string, Object3D[]>();
  const addTo = (name: string, o: Object3D) => {
    let list = groups.get(name);
    if (!list) groups.set(name, (list = []));
    list.push(o);
    group.add(o);
  };
  const clipMaterials = new Set<Material>();
  let triangles = 0;
  let meshes = 0;
  for (const b of buckets.values()) {
    const merged = mergeGeometries(b.geos, false);
    if (!merged) throw new Error(`bakeScene: cannot merge geometries for material ${b.material.name || b.material.type}`);
    for (const g of b.geos) g.dispose();
    merged.computeBoundingBox();
    merged.computeBoundingSphere();
    let material = b.material;
    if (b.interior) material = interiorTwin(material);
    if (b.group === CLIP_GROUP) {
      // Transparent buckets keep their material (house only); opaque ones get a twin.
      if (!material.transparent) material = twin(material);
      clipMaterials.add(material);
    }
    const mesh = new Mesh(merged, material);
    mesh.castShadow = b.cast;
    mesh.receiveShadow = b.receive;
    if (b.noFrame) mesh.userData.noFrame = true;
    mesh.userData.bakeGroup = b.group;
    mesh.userData.paletteMaterial = b.material;
    // Transparent glass after everything opaque; lines before glass.
    if ((b.material as Material).transparent) mesh.renderOrder = 2;
    addTo(b.group, mesh);
    triangles += merged.getAttribute('position').count / 3;
    meshes++;
  }
  const clipLineMaterials: LineMaterial[] = [];
  const lineMaterialFor = (g: string, base: LineMaterial) => {
    if (g !== CLIP_GROUP) return base;
    const t = twin(base) as LineMaterial;
    if (!clipLineMaterials.includes(t)) clipLineMaterials.push(t);
    clipMaterials.add(t);
    return t;
  };
  if (edgePos.length) {
    // Deduplicate across all groups in traversal order, then split by group.
    const keptNorms: number[] = [];
    const segs = dedupeSegments(edgePos, edgeNorm, keptNorms);
    const byGroup = new Map<string, { pos: number[]; norm: number[] }>();
    for (let s = 0; s < segs.kept.length; s++) {
      const g = edgeGroup[segs.kept[s]!]!;
      let e = byGroup.get(g);
      if (!e) byGroup.set(g, (e = { pos: [], norm: [] }));
      for (let k = 0; k < 6; k++) {
        e.pos.push(segs.positions[s * 6 + k]!);
        e.norm.push(keptNorms[s * 6 + k]!);
      }
    }
    for (const [g, e] of byGroup) addTo(g, createLineObject(e.pos, lineMaterialFor(g, edgeMaterial), g === DEFAULT_GROUP ? 'feature-edges' : `feature-edges:${g}`, adjacency, e.norm));
  }
  for (const [g, pos] of floorPos) {
    if (pos.length) addTo(g, createLineObject(dedupeSegments(pos).positions, lineMaterialFor(g, floorMaterial), 'floor-lines'));
  }
  for (const obj of live) {
    obj.updateMatrixWorld(true);
    obj.matrixWorld.decompose(obj.position, obj.quaternion, obj.scale);
    addTo(groupOf(obj), obj);
  }
  return { group, triangles, meshes, groups, clipMaterials: [...clipMaterials], clipLineMaterials };
}

function isInsideLive(obj: Object3D): boolean {
  let p = obj.parent;
  while (p) {
    if (p.userData.live) return true;
    p = p.parent;
  }
  return false;
}
