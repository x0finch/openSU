import { BufferGeometry, Float32BufferAttribute, Group, Mesh, Object3D, Vector3 } from 'three';
import type { EntouragePlacement, HouseGeometry, MaterialSlot } from '@opensu/kernel';
import { createBamboo, createGinkgo, createGrassTuft, createMaple } from './entourage/trees.js';
import { createCar } from './entourage/car.js';
import { createPerson } from './entourage/person.js';
import type { Palette, PaletteKey } from './style/materials.js';

/** Kernel material slot -> style palette material. The only mapping table. */
export const MATERIAL_SLOTS: Record<MaterialSlot, PaletteKey> = {
  wall: 'wall',
  roofTile: 'roofTile',
  fascia: 'fascia',
  wood: 'wood',
  deck: 'deck',
  frame: 'frame',
  glass: 'glass',
  glassBacking: 'glassBacking',
  balustrade: 'balustrade',
  slab: 'slab',
  metal: 'metal',
  paving: 'paving',
  gravel: 'gravel',
  soil: 'soil',
};

/** Shadow flags per slot: transparent glazing neither casts nor receives. */
const SHADOWS: Partial<Record<MaterialSlot, [cast: boolean, receive: boolean]>> = {
  glass: [false, false],
  balustrade: [false, false],
  glassBacking: [true, false],
};

/** Model axes (metres, Z up) -> scene axes (Y up, Z south). */
function toScene(src: ArrayLike<number>): Float32Array {
  const out = new Float32Array(src.length);
  for (let i = 0; i < src.length; i += 3) {
    out[i] = src[i]!;
    out[i + 1] = src[i + 2]!;
    out[i + 2] = -src[i + 1]!;
  }
  return out;
}

/**
 * Flat-shaded, non-indexed geometry with planar UVs in metres: U runs
 * horizontally along each face (along the slope for roofs), V up the face,
 * so textures keep true scale and roof tile rows follow the eaves.
 */
function partGeometry(positions: Float32Array, indices: Uint32Array): BufferGeometry {
  const n = indices.length;
  const pos = new Float32Array(n * 3);
  const nor = new Float32Array(n * 3);
  const uv = new Float32Array(n * 2);
  const a = new Vector3(), b = new Vector3(), c = new Vector3(), e1 = new Vector3(), e2 = new Vector3();
  const nrm = new Vector3(), u = new Vector3(), v = new Vector3();
  const up = new Vector3(0, 1, 0);
  for (let t = 0; t < n; t += 3) {
    a.fromArray(positions, indices[t]! * 3);
    b.fromArray(positions, indices[t + 1]! * 3);
    c.fromArray(positions, indices[t + 2]! * 3);
    nrm.crossVectors(e1.subVectors(b, a), e2.subVectors(c, a)).normalize();
    u.crossVectors(up, nrm);
    if (u.lengthSq() < 1e-6) u.set(1, 0, 0);
    u.normalize();
    v.crossVectors(nrm, u).normalize();
    [a, b, c].forEach((p, k) => {
      p.toArray(pos, (t + k) * 3);
      nrm.toArray(nor, (t + k) * 3);
      uv[(t + k) * 2] = p.dot(u);
      uv[(t + k) * 2 + 1] = p.dot(v);
    });
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  return g;
}

export interface HouseObject {
  /** Architecture and entourage, ready for `IllustrationViewer.setContent`. */
  root: Group;
  /** Architecture vertices (scene space), for camera framing. */
  framePoints: Vector3[];
}

/**
 * Builds three.js objects from kernel output using the style palette: one
 * mesh per part (the viewer bakes them into one draw call per material),
 * the kernel's feature edges and floor lines, and entourage instantiated
 * with the style generators.
 */
export function createHouseObject(geometry: HouseGeometry, pal: Palette): HouseObject {
  const root = new Group();
  root.name = 'house';
  const framePoints: Vector3[] = [];
  const seen = new Set<string>();
  for (const part of geometry.parts) {
    const positions = toScene(part.positions);
    const mesh = new Mesh(partGeometry(positions, part.indices), pal[MATERIAL_SLOTS[part.material]]);
    mesh.name = part.id;
    const [cast, receive] = SHADOWS[part.material] ?? [true, true];
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
    mesh.userData.edges = false;
    mesh.userData.partId = part.id;
    mesh.userData.role = part.role;
    if (part.level) mesh.userData.level = part.level;
    if (part.edges.length) {
      mesh.userData.lines = Array.from(toScene(part.edges));
      mesh.userData.lineNormals = Array.from(toScene(part.edgeNormals));
    }
    root.add(mesh);
    for (let i = 0; i < positions.length; i += 3) {
      const key = `${Math.round(positions[i]! * 20)},${Math.round(positions[i + 1]! * 20)},${Math.round(positions[i + 2]! * 20)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      framePoints.push(new Vector3(positions[i]!, positions[i + 1]!, positions[i + 2]!));
    }
  }
  if (geometry.floorLines.length) {
    const fl = new Object3D();
    fl.name = 'floor-lines';
    fl.userData.floorLines = Array.from(toScene(geometry.floorLines));
    root.add(fl);
  }
  for (const e of geometry.entourage) {
    const obj = createEntourage(e, pal);
    obj.position.set(e.position[0], e.position[2], -e.position[1]);
    obj.rotation.y += e.rotation;
    if (e.clip) clipFoliage(obj, e.clip);
    root.add(obj);
  }
  return { root, framePoints };
}

/**
 * Drops triangles whose centroid lies below `clip.below` and outside the
 * plan box (model metres): stray leaves through fence or wall faces.
 */
function clipFoliage(obj: Object3D, clip: NonNullable<EntouragePlacement['clip']>): void {
  obj.updateMatrixWorld(true);
  const v = new Vector3();
  obj.traverse((m) => {
    if (!(m instanceof Mesh)) return;
    const src = m.geometry as BufferGeometry;
    const g = src.index ? src.toNonIndexed() : src;
    const pos = g.getAttribute('position');
    const keep: number[] = [];
    for (let t = 0; t < pos.count; t += 3) {
      let x = 0, y = 0, z = 0;
      for (let k = 0; k < 3; k++) {
        v.fromBufferAttribute(pos, t + k).applyMatrix4(m.matrixWorld);
        x += v.x / 3; y += -v.z / 3; z += v.y / 3;
      }
      const out = x < clip.min[0] || x > clip.max[0] || y < clip.min[1] || y > clip.max[1];
      if (!(out && z < clip.below)) keep.push(t);
    }
    if (keep.length * 3 === pos.count) return;
    const ng = new BufferGeometry();
    for (const name of Object.keys(g.attributes)) {
      const a = g.getAttribute(name);
      const arr = new Float32Array(keep.length * 3 * a.itemSize);
      keep.forEach((t, i) => {
        for (let k = 0; k < 3; k++) for (let c = 0; c < a.itemSize; c++) arr[(i * 3 + k) * a.itemSize + c] = a.getComponent(t + k, c);
      });
      ng.setAttribute(name, new Float32BufferAttribute(arr, a.itemSize));
    }
    m.geometry = ng;
  });
}

function createEntourage(e: EntouragePlacement, pal: Palette): Object3D {
  const trees = { trunk: pal.trunk, leaves: pal.leaves, stalk: pal.stalk };
  switch (e.kind) {
    case 'ginkgo': return createGinkgo(trees, { height: e.scale, seed: e.seed });
    case 'maple-red': return createMaple(trees, { height: e.scale, seed: e.seed, color: 'red' });
    case 'maple-green': return createMaple(trees, { height: e.scale, seed: e.seed, color: 'green' });
    case 'bamboo': return createBamboo(trees, { height: e.scale, seed: e.seed, stalks: 16, spread: 0.45 });
    case 'grass': return createGrassTuft(trees, { height: e.scale, seed: e.seed });
    case 'person-walk': return createPerson(pal.person, 'walk', e.scale, true);
    case 'person-run': return createPerson(pal.person, 'run', e.scale);
    case 'car': return createCar({ body: pal.carBody, glass: pal.carGlass, tyre: pal.tyre });
  }
}
