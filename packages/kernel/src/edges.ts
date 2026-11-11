// Feature edges from polygon outlines (never from triangulations).
//
// Every outline segment of every planar polygon is put on its supporting
// line. Along each line the segments are split into elementary intervals;
// on each interval we know which faces touch it (normal, which side of the
// line the face lies on, material). Two faces of the same plane and
// material on opposite sides continue each other: no edge (this removes
// tessellation seams and T-junction artefacts). Whatever remains is a
// feature: a free edge, a fold sharper than the threshold, or a material
// change. Coplanar wall faces that continue each other across a floor
// level give the floor lines.
import { cross, dot, type Loop, norm, sub, type V3 } from './mesh';

export interface EdgeOptions {
  /** Fold angle (degrees) above which an edge is drawn. */
  featureAngleDeg: number;
  /** Floor elevations (mm) at which continuous exterior wall faces get a floor line. */
  floorLevels: number[];
}

export interface EdgeResult {
  /** Per part: segments (mm) and face normals (two per segment). */
  edges: Map<number, { seg: number[]; normals: number[] }>;
  floorLines: number[];
  /** Overlapping coplanar faces found (should be 0). */
  overlaps: number;
}

interface Entry { t0: number; t1: number; n: V3; s: V3; mat: string; part: number; ext: boolean }
interface Line { d: V3; o: V3; entries: Entry[] }

const R = (v: number, k: number) => Math.round(v * k);

export function extractEdges(loops: readonly Loop[], opts: EdgeOptions): EdgeResult {
  const lines = new Map<string, Line>();
  for (const loop of loops) {
    const pts = loop.pts;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i]!, q = pts[(i + 1) % pts.length]!;
      const e = sub(q, p);
      const l = Math.hypot(e[0], e[1], e[2]);
      if (l < 0.5) continue;
      let d: V3 = [e[0] / l, e[1] / l, e[2] / l];
      if (d[0] < -1e-9 || (Math.abs(d[0]) <= 1e-9 && (d[1] < -1e-9 || (Math.abs(d[1]) <= 1e-9 && d[2] < 0)))) d = [-d[0], -d[1], -d[2]];
      // Snap near-axis directions so axis-aligned lines group exactly.
      d = d.map((c) => (Math.abs(c) < 1e-9 ? 0 : Math.abs(Math.abs(c) - 1) < 1e-9 ? Math.sign(c) : c)) as V3;
      const s = norm(cross(loop.n, e));
      const tp = dot(p, d), tq = dot(q, d);
      const o: V3 = [p[0] - tp * d[0], p[1] - tp * d[1], p[2] - tp * d[2]];
      const key = `${R(d[0], 1e5)},${R(d[1], 1e5)},${R(d[2], 1e5)}|${R(o[0], 5)},${R(o[1], 5)},${R(o[2], 5)}`;
      let line = lines.get(key);
      if (!line) lines.set(key, (line = { d, o, entries: [] }));
      line.entries.push({ t0: Math.min(tp, tq), t1: Math.max(tp, tq), n: loop.n, s, mat: loop.material, part: loop.part, ext: loop.exterior });
    }
  }

  const cosFeature = Math.cos((opts.featureAngleDeg * Math.PI) / 180);
  const edges = new Map<number, { seg: number[]; normals: number[] }>();
  const floorLines: number[] = [];
  let overlaps = 0;
  const keys = [...lines.keys()].sort();
  for (const key of keys) {
    const line = lines.get(key)!;
    const ts = [...new Set(line.entries.flatMap((e) => [R(e.t0, 100), R(e.t1, 100)]))].sort((a, b) => a - b).map((t) => t / 100);
    const P = (t: number): V3 => [line.o[0] + line.d[0] * t, line.o[1] + line.d[1] * t, line.o[2] + line.d[2] * t];
    let open: { t0: number; t1: number; part: number; n1: V3; n2: V3 } | null = null;
    let openFloor: { t0: number; t1: number } | null = null;
    const flush = () => {
      if (open) {
        let e = edges.get(open.part);
        if (!e) edges.set(open.part, (e = { seg: [], normals: [] }));
        e.seg.push(...P(open.t0), ...P(open.t1));
        e.normals.push(...open.n1, ...open.n2);
        open = null;
      }
    };
    const flushFloor = () => {
      if (openFloor) {
        floorLines.push(...P(openFloor.t0), ...P(openFloor.t1));
        openFloor = null;
      }
    };
    const horizontal = Math.abs(line.d[2]) < 1e-9;
    const z = line.o[2];
    const atFloor = horizontal && opts.floorLevels.some((f) => Math.abs(f - z) < 0.5);
    for (let k = 0; k + 1 < ts.length; k++) {
      const ta = ts[k]!, tb = ts[k + 1]!;
      if (tb - ta < 0.05) continue;
      const tm = (ta + tb) / 2;
      const active = line.entries.filter((e) => e.t0 <= tm && tm <= e.t1);
      // Cancel continuing pairs.
      const rest = [...active];
      let floor = false;
      for (let a = 0; a < rest.length; a++) {
        for (let b = a + 1; b < rest.length; b++) {
          const ea = rest[a]!, eb = rest[b]!;
          if (ea.mat !== eb.mat || dot(ea.n, eb.n) < 0.99999) continue;
          const ss = dot(ea.s, eb.s);
          if (ss < -0.99999) {
            if (atFloor && ea.mat === 'wall' && ea.ext && eb.ext && Math.abs(ea.n[2]) < 1e-6) floor = true;
            rest.splice(b, 1);
            rest.splice(a, 1);
            a--;
            break;
          }
          if (ss > 0.99999) overlaps++;
        }
      }
      let feature = rest.length > 0;
      if (rest.length === 2 && rest[0]!.mat === rest[1]!.mat && dot(rest[0]!.n, rest[1]!.n) > cosFeature) feature = false;
      if (feature) {
        const owner = rest.reduce((m, e) => (e.part < m.part ? e : m), rest[0]!);
        const other = rest.find((e) => dot(e.n, owner.n) < 0.9999) ?? owner;
        if (open && open.part === owner.part && Math.abs(open.t1 - ta) < 0.05 && dot(open.n1, owner.n) > 0.9999 && dot(open.n2, other.n) > 0.9999) open.t1 = tb;
        else { flush(); open = { t0: ta, t1: tb, part: owner.part, n1: owner.n, n2: other.n }; }
      } else flush();
      if (floor) {
        if (openFloor && Math.abs(openFloor.t1 - ta) < 0.05) openFloor.t1 = tb;
        else { flushFloor(); openFloor = { t0: ta, t1: tb }; }
      } else flushFloor();
    }
    flush();
    flushFloor();
  }
  return { edges, floorLines, overlaps };
}
