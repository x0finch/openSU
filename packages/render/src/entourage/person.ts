import { DoubleSide, Group, type Material, Mesh, Vector3 } from 'three';
import { mergeSimple, polygons } from '../geometry/primitives.js';

/**
 * Flat black silhouette people (billboards). Poses are 2D joint lists in
 * metres; limbs are tapered quads with rounded joints.
 */
export type PersonPose = 'run' | 'walk';

type J = [number, number];

interface Pose {
  head: J;
  neck: J;
  hip: J;
  limbs: [J, J, number, number][];
}

const POSES: Record<PersonPose, Pose> = {
  run: {
    head: [0.07, 1.6],
    neck: [0.04, 1.44],
    hip: [-0.02, 0.95],
    limbs: [
      // legs: hip-knee-ankle-toe
      [[-0.02, 0.95], [0.22, 0.6], 0.075, 0.055],
      [[0.22, 0.6], [0.14, 0.12], 0.055, 0.04],
      [[0.14, 0.12], [0.3, 0.06], 0.04, 0.03],
      [[-0.02, 0.95], [-0.16, 0.56], 0.075, 0.055],
      [[-0.16, 0.56], [-0.48, 0.4], 0.055, 0.04],
      [[-0.48, 0.4], [-0.5, 0.25], 0.04, 0.03],
      // arms: shoulder-elbow-hand
      [[0.05, 1.38], [0.3, 1.24], 0.045, 0.038],
      [[0.3, 1.24], [0.5, 1.4], 0.038, 0.03],
      [[0.0, 1.38], [-0.22, 1.2], 0.045, 0.038],
      [[-0.22, 1.2], [-0.42, 1.08], 0.038, 0.03],
    ],
  },
  walk: {
    head: [0.02, 1.62],
    neck: [0.01, 1.46],
    hip: [0.0, 0.95],
    limbs: [
      [[0.0, 0.95], [0.1, 0.5], 0.075, 0.055],
      [[0.1, 0.5], [0.18, 0.06], 0.055, 0.04],
      [[0.18, 0.06], [0.3, 0.04], 0.04, 0.03],
      [[0.0, 0.95], [-0.08, 0.5], 0.075, 0.055],
      [[-0.08, 0.5], [-0.2, 0.08], 0.055, 0.04],
      [[-0.2, 0.08], [-0.1, 0.03], 0.04, 0.03],
      [[0.03, 1.4], [0.13, 1.1], 0.045, 0.038],
      [[0.13, 1.1], [0.2, 0.86], 0.038, 0.03],
      [[-0.01, 1.4], [-0.1, 1.12], 0.045, 0.038],
      [[-0.1, 1.12], [-0.12, 0.88], 0.038, 0.03],
    ],
  },
};

function disc(c: J, r: number, n = 10): Vector3[] {
  const pts: Vector3[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    pts.push(new Vector3(c[0] + Math.cos(t) * r, c[1] + Math.sin(t) * r, 0));
  }
  return pts;
}

function limb(a: J, b: J, wa: number, wb: number): Vector3[] {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l = Math.hypot(dx, dy) || 1;
  const px = -dy / l;
  const py = dx / l;
  return [
    new Vector3(a[0] - px * wa, a[1] - py * wa, 0),
    new Vector3(b[0] - px * wb, b[1] - py * wb, 0),
    new Vector3(b[0] + px * wb, b[1] + py * wb, 0),
    new Vector3(a[0] + px * wa, a[1] + py * wa, 0),
  ];
}

/** A silhouette person standing at the origin, facing the camera (billboard). */
export function createPerson(material: Material, pose: PersonPose = 'run', height = 1.72, mirror = false): Group {
  const p = POSES[pose];
  const faces: Vector3[][] = [];
  faces.push(disc(p.head, 0.105, 12));
  // Torso.
  faces.push([
    new Vector3(p.hip[0] - 0.12, p.hip[1] - 0.04, 0),
    new Vector3(p.hip[0] + 0.12, p.hip[1] - 0.04, 0),
    new Vector3(p.neck[0] + 0.15, p.neck[1] - 0.08, 0),
    new Vector3(p.neck[0] + 0.05, p.neck[1] + 0.02, 0),
    new Vector3(p.neck[0] - 0.05, p.neck[1] + 0.02, 0),
    new Vector3(p.neck[0] - 0.15, p.neck[1] - 0.08, 0),
  ]);
  for (const [a, b, wa, wb] of p.limbs) {
    faces.push(limb(a, b, wa, wb));
    faces.push(disc(b, wb, 8));
    faces.push(disc(a, wa, 8));
  }
  const geo = mergeSimple([polygons(faces)]);
  const s = height / 1.72;
  geo.scale(mirror ? -s : s, s, s);
  if (material.side !== DoubleSide) material.side = DoubleSide;
  const mesh = new Mesh(geo, material);
  mesh.castShadow = true;
  mesh.receiveShadow = false;
  mesh.userData.edges = false;
  const g = new Group();
  g.name = `person-${pose}`;
  g.add(mesh);
  g.userData.live = true;
  g.userData.billboard = true;
  return g;
}
