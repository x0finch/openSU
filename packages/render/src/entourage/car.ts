import { Group, type Material, Mesh, Vector3 } from 'three';
import { extrude, polygons, type V2 } from '../geometry/primitives.js';

export interface CarMaterials {
  body: Material;
  glass: Material;
  tyre: Material;
}

/**
 * Very low detail car: white body, black glasshouse, black wheels.
 * Length along +X (front at +X), centred on the origin, standing on y = 0.
 */
export function createCar(mats: CarMaterials): Group {
  const g = new Group();
  g.name = 'car';
  const width = 1.86;
  const body: V2[] = [
    [-2.42, 0.2], [2.38, 0.2], [2.46, 0.42], [2.4, 0.66], [1.05, 0.84], [-2.25, 0.86], [-2.44, 0.66],
  ];
  const cabin: V2[] = [
    [-2.12, 0.86], [1.0, 0.84], [0.1, 1.36], [-1.75, 1.4], [-2.18, 1.02],
  ];
  const add = (geo: ReturnType<typeof extrude>, mat: Material, edges = true) => {
    const m = new Mesh(geo, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    m.userData.edges = edges;
    g.add(m);
    return m;
  };
  add(extrude(new Vector3(0, 0, -width / 2), new Vector3(1, 0, 0), new Vector3(0, 1, 0), body, width), mats.body);
  const cw = width - 0.16;
  // White cabin shell (roof and pillars) with black glazing panels on it.
  add(extrude(new Vector3(0, 0, -cw / 2), new Vector3(1, 0, 0), new Vector3(0, 1, 0), cabin, cw), mats.body);
  const off = 0.004;
  const side: V2[] = [[-1.98, 0.9], [0.86, 0.88], [0.1, 1.3], [-1.68, 1.33], [-2.02, 1.04]];
  const sideGlass = (zs: number) => {
    const pts = side.map(([x, y]) => new Vector3(x, y, zs * (cw / 2 + off)));
    return zs > 0 ? pts : [...pts].reverse();
  };
  const panel = (a: V2, c: V2, inset: number) => {
    // Quad on the sloped cabin face between profile points a and c, offset outwards.
    const dx = c[0] - a[0], dy = c[1] - a[1];
    const l = Math.hypot(dx, dy);
    const nx = dy / l, ny = -dx / l;
    const p = (t: number, z: number) => new Vector3(a[0] + dx * t + nx * off, a[1] + dy * t + ny * off, z);
    const h = cw / 2 - inset;
    return [p(0.08, -h), p(0.92, -h), p(0.92, h), p(0.08, h)];
  };
  const glass = polygons([sideGlass(1), sideGlass(-1), panel(cabin[1]!, cabin[2]!, 0.1), panel(cabin[3]!, cabin[4]!, 0.12)]);
  const gm = new Mesh(glass, mats.glass);
  gm.castShadow = false;
  gm.userData.edges = true;
  g.add(gm);
  const wheel: V2[] = [];
  for (let i = 0; i < 16; i++) {
    const t = (i / 16) * Math.PI * 2;
    wheel.push([Math.cos(t) * 0.34, Math.sin(t) * 0.34]);
  }
  for (const x of [-1.5, 1.45]) {
    for (const side of [-1, 1]) {
      const z0 = side > 0 ? width / 2 - 0.2 : -width / 2 - 0.02;
      const geo = extrude(new Vector3(x, 0.34, z0), new Vector3(1, 0, 0), new Vector3(0, 1, 0), wheel, 0.22);
      add(geo, mats.tyre, false);
    }
  }
  return g;
}
