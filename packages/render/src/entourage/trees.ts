import { BufferGeometry, Color, Float32BufferAttribute, Group, type Material, Mesh, Quaternion, Vector2, Vector3 } from 'three';
import { createBuilder, type GeoBuilderLike } from '../geometry/primitives.js';
import { entourage as ent } from '../style/tokens.js';
import { createRand, range, type Rand } from './random.js';

/**
 * Stylised trees in the architectural-illustration tradition: a thin pale
 * branch skeleton and many small flat leaf cards in one saturated colour.
 * All sizes in metres; the tree stands at the origin.
 */

export interface TreeMaterials {
  trunk: Material;
  leaves: Material;
  stalk: Material;
}

type LeafShape = 'ginkgo' | 'maple' | 'blade';

class LeafBuilder {
  pos: number[] = [];
  nor: number[] = [];
  col: number[] = [];
  constructor(readonly shape: LeafShape) {}

  private tri(a: Vector3, b: Vector3, c: Vector3, n: Vector3, color: Color): void {
    this.pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    for (let i = 0; i < 3; i++) {
      this.nor.push(n.x, n.y, n.z);
      this.col.push(color.r, color.g, color.b);
    }
  }

  /**
   * Adds one leaf. `along` points from the stem base to the leaf tip,
   * `normal` is the card normal (roughly), `size` the leaf length.
   */
  add(base: Vector3, along: Vector3, normal: Vector3, size: number, color: Color): void {
    const a = along.clone().normalize();
    const side = new Vector3().crossVectors(a, normal);
    if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
    side.normalize();
    const n = new Vector3().crossVectors(side, a).normalize();
    const P = (x: number, y: number) => base.clone().addScaledVector(side, x * size).addScaledVector(a, y * size);
    if (this.shape === 'ginkgo') {
      // Fan with a shallow notch; short stalk.
      const s0 = P(0, 0);
      const b = P(0, 0.28);
      const arc = (deg: number, r: number) => {
        const t = (deg * Math.PI) / 180;
        return P(Math.sin(t) * r, 0.28 + Math.cos(t) * r);
      };
      const p0 = arc(-62, 0.72), p1 = arc(-28, 0.78), notch = arc(0, 0.58), p3 = arc(28, 0.78), p4 = arc(62, 0.72);
      this.tri(b, p0, p1, n, color);
      this.tri(b, p1, notch, n, color);
      this.tri(b, notch, p3, n, color);
      this.tri(b, p3, p4, n, color);
      // Stalk as a sliver so the fan reads attached.
      this.tri(s0, P(0.03, 0.28), P(-0.03, 0.28), n, color);
    } else if (this.shape === 'maple') {
      // Five-lobed star.
      const c = P(0, 0.35);
      const lobes: [number, number][] = [[-100, 0.42], [-50, 0.6], [0, 0.66], [50, 0.6], [100, 0.42]];
      const pts: Vector3[] = [];
      for (let i = 0; i < lobes.length; i++) {
        const [deg, r] = lobes[i]!;
        const t = (deg * Math.PI) / 180;
        pts.push(P(Math.sin(t) * r, 0.35 + Math.cos(t) * r));
        if (i < lobes.length - 1) {
          const tm = ((deg + 25) * Math.PI) / 180;
          pts.push(P(Math.sin(tm) * r * 0.42, 0.35 + Math.cos(tm) * r * 0.42));
        }
      }
      pts.unshift(P(0, 0.12));
      pts.push(P(0, 0.12));
      for (let i = 0; i < pts.length - 1; i++) this.tri(c, pts[i]!, pts[i + 1]!, n, color);
    } else {
      // Narrow blade (bamboo).
      const p0 = P(0, 0), p1 = P(0.085, 0.32), p2 = P(0, 1), p3 = P(-0.085, 0.32);
      this.tri(p0, p1, p2, n, color);
      this.tri(p0, p2, p3, n, color);
    }
  }

  build(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new Float32BufferAttribute(this.col, 3));
    return g;
  }
}

function leafColor(rand: Rand, base: string, deep: string): Color {
  const c = new Color(base).lerp(new Color(deep), Math.pow(rand(), 3) * 0.8);
  const j = 1 + (rand() - 0.5) * 2 * ent.leafJitter;
  c.multiplyScalar(j);
  return c;
}

function randomUnit(rand: Rand): Vector3 {
  const z = rand() * 2 - 1;
  const t = rand() * Math.PI * 2;
  const r = Math.sqrt(1 - z * z);
  return new Vector3(r * Math.cos(t), z, r * Math.sin(t));
}

/** Rotate `dir` away from itself by `angle` around a random perpendicular axis. */
function deviate(dir: Vector3, angle: number, rand: Rand, azimuth?: number): Vector3 {
  const helper = Math.abs(dir.y) < 0.95 ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0);
  const p = new Vector3().crossVectors(dir, helper).normalize();
  const q = new Quaternion().setFromAxisAngle(dir, azimuth ?? rand() * Math.PI * 2);
  p.applyQuaternion(q);
  return dir.clone().applyQuaternion(new Quaternion().setFromAxisAngle(p, angle)).normalize();
}

interface BranchParams {
  depth: number;
  /** Children per branch at each depth. */
  children: number[];
  /** Angle from parent per depth (radians). */
  spread: number[];
  /** Length ratio child/parent. */
  ratio: number;
  /** Bias pulling growth upwards (+) or down (-) per depth. */
  lift: number[];
  /** Twist the azimuth of children evenly instead of randomly. */
  phyllotaxis?: boolean;
}

interface Twig {
  a: Vector3;
  b: Vector3;
  depth: number;
}

function growSkeleton(rand: Rand, out: GeoBuilderLike, twigs: Twig[], start: Vector3, dir: Vector3, length: number, radius: number, depth: number, p: BranchParams): void {
  // Slightly bent branch: two segments.
  const mid = start.clone().addScaledVector(dir, length * 0.5);
  const bend = deviate(dir, range(rand, 0.05, 0.2), rand);
  bend.y += p.lift[Math.min(depth, p.lift.length - 1)]! * 0.5;
  bend.normalize();
  const end = mid.clone().addScaledVector(bend, length * 0.5);
  const seg = depth < 2 ? 6 : 4;
  const r1 = radius * 0.62;
  addCylinder(out, start, mid, radius, (radius + r1) / 2, seg);
  addCylinder(out, mid, end, (radius + r1) / 2, r1, seg);
  twigs.push({ a: start, b: mid, depth }, { a: mid, b: end, depth });
  if (depth >= p.depth) return;
  const n = p.children[depth]!;
  const phase = rand() * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    const t = depth === 0 ? range(rand, 0.75, 1.0) : range(rand, 0.3, 1.0);
    const origin = t < 0.5 ? start.clone().lerp(mid, t * 2) : mid.clone().lerp(end, (t - 0.5) * 2);
    const parentDir = t < 0.5 ? dir : bend;
    const az = p.phyllotaxis ? phase + (i / n) * Math.PI * 2 + range(rand, -0.3, 0.3) : undefined;
    const childDir = deviate(parentDir, p.spread[depth]! * range(rand, 0.7, 1.2), rand, az);
    childDir.y += p.lift[depth]!;
    childDir.normalize();
    const childLen = length * p.ratio * range(rand, 0.75, 1.15) * (depth === 0 ? 1 : 1.15 - t * 0.4);
    growSkeleton(rand, out, twigs, origin, childDir, childLen, radius * 0.6, depth + 1, p);
  }
}

function addCylinder(out: GeoBuilderLike, a: Vector3, b: Vector3, r0: number, r1: number, seg: number): void {
  const axis = new Vector3().subVectors(b, a);
  const len = axis.length();
  if (len < 1e-5) return;
  axis.divideScalar(len);
  const helper = Math.abs(axis.y) < 0.9 ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0);
  const x = new Vector3().crossVectors(axis, helper).normalize();
  const y = new Vector3().crossVectors(axis, x).normalize();
  const uv = new Vector2();
  const pt = (c: Vector3, r: number, i: number) => {
    const t = (i / seg) * Math.PI * 2;
    return c.clone().addScaledVector(x, Math.cos(t) * r).addScaledVector(y, Math.sin(t) * r);
  };
  for (let i = 0; i < seg; i++) {
    const t = ((i + 0.5) / seg) * Math.PI * 2;
    const n = new Vector3().addScaledVector(x, Math.cos(t)).addScaledVector(y, Math.sin(t));
    const p0 = pt(a, r0, i), p1 = pt(a, r0, i + 1), p2 = pt(b, r1, i + 1), p3 = pt(b, r1, i);
    out.tri(p0, p1, p2, n, uv, uv, uv);
    out.tri(p0, p2, p3, n, uv, uv, uv);
  }
}

function assemble(name: string, wood: BufferGeometry, leaves: BufferGeometry, mats: TreeMaterials, woodMat?: Material): Group {
  const g = new Group();
  g.name = name;
  const w = new Mesh(wood, woodMat ?? mats.trunk);
  w.castShadow = true;
  w.receiveShadow = true;
  w.userData.edges = false;
  const l = new Mesh(leaves, mats.leaves);
  l.castShadow = true;
  l.receiveShadow = true;
  l.userData.edges = false;
  g.add(w, l);
  return g;
}

export interface TreeOptions {
  height?: number;
  seed?: number;
  /** Leaf density multiplier. */
  density?: number;
}

/** Ginkgo: a central leader with ascending side branches, airy crown of small yellow fans. */
export function createGinkgo(mats: TreeMaterials, opts: TreeOptions = {}): Group {
  const h = opts.height ?? 7;
  const rand = createRand(opts.seed ?? 1);
  const wood = createBuilder();
  const twigs: Twig[] = [];
  const s = h / 7;
  const trunkH = h * 0.3;
  const base = new Vector3(0, 0, 0);
  // Leader: a gently wandering vertical axis.
  const nodes = 7;
  let prev = base.clone();
  let prevR = 0.055 * s;
  const leader: Vector3[] = [prev];
  for (let i = 1; i <= nodes; i++) {
    const f = i / nodes;
    const y = trunkH + (h * 0.92 - trunkH) * Math.pow(f, 0.9);
    const p = new Vector3(range(rand, -0.12, 0.12) * s, i === 1 ? trunkH : y, range(rand, -0.12, 0.12) * s);
    const r = 0.055 * s * (1 - f * 0.8);
    addCylinder(wood, prev, p, prevR, r, 6);
    leader.push(p);
    prev = p;
    prevR = r;
  }
  twigs.push({ a: leader[nodes - 1]!, b: leader[nodes]!, depth: 2 });
  const params: BranchParams = { depth: 3, children: [0, 3, 3], spread: [0, 0.6, 0.7], ratio: 0.5, lift: [0, 0.12, -0.1], phyllotaxis: true };
  let az = rand() * Math.PI * 2;
  for (let i = 1; i < nodes; i++) {
    const f = i / nodes;
    const count = i === 1 ? 2 : 3;
    for (let k = 0; k < count; k++) {
      az += 2.39996 + range(rand, -0.3, 0.3);
      const t = range(rand, 0, 1);
      const o = leader[i]!.clone().lerp(leader[i + 1]!, t);
      // Ascending branches, a little flatter low down.
      const tilt = range(rand, 0.65, 0.95) + (1 - f) * 0.2;
      const dir = new Vector3(Math.cos(az) * Math.sin(tilt), Math.cos(tilt), Math.sin(az) * Math.sin(tilt));
      const len = h * (0.4 - f * 0.26) * range(rand, 0.8, 1.15);
      growSkeleton(rand, wood, twigs, o, dir, len, 0.024 * s * (1 - f * 0.6), 1, params);
    }
  }
  const leaves = new LeafBuilder('ginkgo');
  const density = opts.density ?? 1;
  const leafSize = 0.15 * Math.min(1.15, Math.max(0.8, s));
  for (const tw of twigs) {
    if (tw.depth < 2) continue;
    const len = tw.a.distanceTo(tw.b);
    const clusters = Math.max(1, Math.round((len / 0.11) * density));
    for (let c = 0; c < clusters; c++) {
      const p = new Vector3().lerpVectors(tw.a, tw.b, range(rand, 0.1, 1));
      const k = 3 + Math.floor(rand() * 4);
      for (let i = 0; i < k; i++) {
        const along = randomUnit(rand);
        along.y = along.y * 0.5 - 0.35;
        const normal = randomUnit(rand);
        normal.y = Math.abs(normal.y) + 0.5;
        const at = p.clone().add(randomUnit(rand).multiplyScalar(0.09));
        leaves.add(at, along, normal, leafSize * range(rand, 0.75, 1.2), leafColor(rand, ent.ginkgo, ent.ginkgoDeep));
      }
    }
  }
  return assemble('ginkgo', wood.build(), leaves.build(), mats);
}

/** Japanese maple: thin trunk, spreading branches, foliage in flat layered pads. */
export function createMaple(mats: TreeMaterials, opts: TreeOptions & { color?: 'red' | 'green' } = {}): Group {
  const h = opts.height ?? 3.2;
  const rand = createRand(opts.seed ?? 3);
  const red = (opts.color ?? 'red') === 'red';
  const base = red ? ent.redMaple : ent.greenMaple;
  const deep = red ? ent.redMapleDeep : ent.greenMapleDeep;
  const wood = createBuilder();
  const leaves = new LeafBuilder('maple');
  const density = opts.density ?? 1;
  const s = h / 3.2;
  const fork = new Vector3(range(rand, -0.1, 0.1) * s, h * 0.32, range(rand, -0.1, 0.1) * s);
  addCylinder(wood, new Vector3(0, 0, 0), fork, 0.045 * s, 0.035 * s, 6);
  const pad = (centre: Vector3, radius: number) => {
    const n = Math.round(150 * density * (radius / 0.4) ** 2);
    for (let i = 0; i < n; i++) {
      const r = Math.sqrt(rand()) * radius;
      const t = rand() * Math.PI * 2;
      // Slightly domed pad: higher in the middle.
      const p = centre.clone().add(new Vector3(Math.cos(t) * r, (1 - (r / radius) ** 2) * radius * 0.25 + range(rand, -0.03, 0.03), Math.sin(t) * r));
      const along = new Vector3(Math.cos(t), range(rand, -0.25, 0.15), Math.sin(t));
      const normal = new Vector3(range(rand, -0.3, 0.3), 1, range(rand, -0.3, 0.3));
      leaves.add(p, along, normal, 0.13 * range(rand, 0.8, 1.2), leafColor(rand, base, deep));
    }
  };
  const nBranches = 5;
  let az = rand() * Math.PI * 2;
  for (let b = 0; b < nBranches; b++) {
    az += (Math.PI * 2) / nBranches + range(rand, -0.4, 0.4);
    const tilt = range(rand, 0.5, 0.95);
    const dir = new Vector3(Math.cos(az) * Math.sin(tilt), Math.cos(tilt), Math.sin(az) * Math.sin(tilt));
    const len = h * range(rand, 0.32, 0.5);
    const end = fork.clone().addScaledVector(dir, len);
    addCylinder(wood, fork, end, 0.028 * s, 0.016 * s, 5);
    // Each branch carries two or three near-horizontal arms ending in pads.
    const arms = 2 + Math.floor(rand() * 2);
    for (let a = 0; a < arms; a++) {
      const t = range(rand, 0.45, 1);
      const o = fork.clone().lerp(end, t);
      const aaz = az + range(rand, -0.9, 0.9);
      const adir = new Vector3(Math.cos(aaz), range(rand, -0.05, 0.3), Math.sin(aaz)).normalize();
      const alen = h * range(rand, 0.12, 0.25);
      const ae = o.clone().addScaledVector(adir, alen);
      addCylinder(wood, o, ae, 0.014 * s, 0.008 * s, 4);
      pad(ae, range(rand, 0.3, 0.48) * s);
    }
    pad(end, range(rand, 0.32, 0.5) * s);
  }
  return assemble(red ? 'red-maple' : 'green-maple', wood.build(), leaves.build(), mats);
}

/** Bamboo clump: thin stalks with narrow blades on the upper part. */
export function createBamboo(mats: TreeMaterials, opts: TreeOptions & { stalks?: number; spread?: number } = {}): Group {
  const h = opts.height ?? 3.8;
  const rand = createRand(opts.seed ?? 5);
  const stalkGeo = createBuilder();
  const leaves = new LeafBuilder('blade');
  const count = opts.stalks ?? 26;
  const spread = opts.spread ?? 0.5;
  const density = opts.density ?? 1;
  for (let s = 0; s < count; s++) {
    const r = Math.sqrt(rand()) * spread;
    const t = rand() * Math.PI * 2;
    const base = new Vector3(Math.cos(t) * r, 0, Math.sin(t) * r);
    const lean = new Vector3(Math.cos(t) * range(rand, 0.05, 0.25), 1, Math.sin(t) * range(rand, 0.05, 0.25)).normalize();
    const height = h * range(rand, 0.75, 1.05);
    const segs = 6;
    let prev = base.clone();
    const pts: Vector3[] = [prev];
    for (let i = 1; i <= segs; i++) {
      const f = i / segs;
      const p = base.clone().addScaledVector(lean, height * f);
      p.x += lean.x * f * f * 0.6;
      p.z += lean.z * f * f * 0.6;
      addCylinder(stalkGeo, prev, p, 0.018 * (1 - f * 0.5), 0.018 * (1 - f * 0.6), 4);
      pts.push(p);
      prev = p;
    }
    // Leaves on the upper 60 %.
    const nLeaves = Math.round(range(rand, 45, 70) * density);
    for (let i = 0; i < nLeaves; i++) {
      const f = range(rand, 0.4, 1);
      const idx = Math.min(segs - 1, Math.floor(f * segs));
      const p = pts[idx]!.clone().lerp(pts[idx + 1]!, f * segs - idx);
      const out = randomUnit(rand);
      out.y = -Math.abs(out.y) * 0.8 - 0.15;
      const at = p.clone().addScaledVector(new Vector3(out.x, 0, out.z).normalize(), range(rand, 0.02, 0.18));
      const normal = randomUnit(rand);
      normal.y += 0.6;
      leaves.add(at, out, normal, range(rand, 0.18, 0.26), leafColor(rand, ent.bamboo, ent.bambooDeep));
    }
  }
  return assemble('bamboo', stalkGeo.build(), leaves.build(), mats, mats.stalk);
}

/** Low ornamental grass / shrub tuft (gravel beds, planters). */
export function createGrassTuft(mats: TreeMaterials, opts: TreeOptions & { color?: 'green' | 'red' } = {}): Group {
  const h = opts.height ?? 0.6;
  const rand = createRand(opts.seed ?? 17);
  const leaves = new LeafBuilder('blade');
  const red = opts.color === 'red';
  const n = Math.round(70 * (opts.density ?? 1));
  for (let i = 0; i < n; i++) {
    const t = rand() * Math.PI * 2;
    const r = Math.sqrt(rand()) * h * 0.35;
    const base = new Vector3(Math.cos(t) * r, 0, Math.sin(t) * r);
    const along = new Vector3(Math.cos(t) * range(rand, 0.2, 0.8), 1, Math.sin(t) * range(rand, 0.2, 0.8));
    const normal = new Vector3(-Math.sin(t), 0, Math.cos(t));
    leaves.add(base, along, normal, h * range(rand, 0.6, 1.1), leafColor(rand, red ? ent.redMaple : ent.bamboo, red ? ent.redMapleDeep : ent.bambooDeep));
  }
  const g = new Group();
  g.name = 'grass';
  const l = new Mesh(leaves.build(), mats.leaves);
  l.castShadow = true;
  l.receiveShadow = true;
  l.userData.edges = false;
  g.add(l);
  return g;
}
