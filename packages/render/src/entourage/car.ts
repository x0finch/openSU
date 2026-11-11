import { Group, type Material, Mesh, Vector3 } from 'three';
import { extrude, type V2 } from '../geometry/primitives.js';

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
  add(extrude(new Vector3(0, 0, -(width - 0.16) / 2), new Vector3(1, 0, 0), new Vector3(0, 1, 0), cabin, width - 0.16), mats.glass);
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
