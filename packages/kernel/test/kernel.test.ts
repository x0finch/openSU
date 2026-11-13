import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { golden, resolve, type House } from '@opensu/model';
import { buildHouse, buildHouseDetailed, type HouseGeometry } from '../src/index';

const hashOf = (g: HouseGeometry) => {
  const h = createHash('sha256');
  for (const p of g.parts) {
    h.update(p.id);
    h.update(Buffer.from(p.positions.buffer));
    h.update(Buffer.from(p.indices.buffer));
    h.update(Buffer.from(p.edges.buffer));
  }
  h.update(Buffer.from(g.floorLines.buffer));
  h.update(JSON.stringify(g.entourage));
  return h.digest('hex');
};

const gold = resolve(golden);
const detail = buildHouseDetailed(gold);
const geo = detail.geometry;

describe('kernel: golden sample', () => {
  it('is deterministic (byte-identical output)', () => {
    expect(hashOf(buildHouse(resolve(structuredClone(golden))))).toBe(hashOf(geo));
  });

  it('has no part without triangles and stays within budget', () => {
    for (const p of geo.parts) expect(p.indices.length, p.id).toBeGreaterThan(0);
    expect(geo.stats.triangles).toBeLessThan(60000);
    // Parts are merged per material by the renderer; furniture adds a few per level.
    expect(geo.parts.length).toBeLessThan(110);
  });

  it('has no overlapping coplanar faces', () => {
    expect(detail.overlaps).toBe(0);
  });

  it('bounds match the model', () => {
    const { min, max } = geo.bounds;
    // Plot 15 x 12 m; the west wall and roof verge sit just outside x = 0.
    expect(min[0]).toBeGreaterThan(-0.5);
    expect(min[0]).toBeLessThan(0);
    expect(max[0]).toBeCloseTo(15, 1);
    expect(min[1]).toBeCloseTo(-0.03, 1);
    // The level-2 north balcony slab edge projects 180 mm past the plot edge.
    expect(max[1]).toBeCloseTo(12.18, 2);
    expect(min[2]).toBeCloseTo(0, 3);
    // North roof high edge: attic eaves at 8.1 m + 0.3 m eave offset, + 3.6 m * tan 25,
    // + 0.6 m overhang * tan 25, + 0.2 m roof depth.
    expect(max[2]).toBeCloseTo(8.4 + 4.2 * Math.tan((25 * Math.PI) / 180) + 0.2, 2);
  });

  it('cuts every opening into its wall', () => {
    for (const lv of detail.ctx.levels) {
      for (const o of lv.level.openings) {
        if (!o.wall) continue;
        const z = lv.elev + o.sill + o.height / 2;
        const segs = detail.ctx.massing.probe(o.center[0], o.center[1]);
        const solidAt = segs.some((s) => s.z0 < z && z < s.z1 && /:wall$/.test(s.part));
        expect(solidAt, o.id).toBe(false);
      }
    }
  });

  it('infers U stairs with risers of 165-175 mm', () => {
    expect(detail.stairs.map((s) => s.id)).toEqual(['stair-1', 'stair-2']);
    for (const s of detail.stairs) {
      expect(s.riser).toBeGreaterThanOrEqual(165);
      expect(s.riser).toBeLessThanOrEqual(175);
      expect(s.flights).toBe(2);
    }
    expect(detail.stairs[0]!.risers).toBe(19);
  });

  it('places entourage deterministically', () => {
    const kinds = geo.entourage.map((e) => e.kind);
    expect(kinds).toContain('ginkgo');
    expect(kinds).toContain('car');
    expect(kinds.filter((k) => k.startsWith('person')).length).toBeGreaterThanOrEqual(1);
  });
});

describe('kernel: review round features', () => {
  it('opens the corner pier of a corner window and frames both faces', () => {
    const l3 = detail.ctx.levels[2]!;
    const z = l3.elev + 600 + 800;
    const corner = detail.ctx.massing.probe(-60, 6840);
    expect(corner.some((s) => s.z0 < z && z < s.z1)).toBe(false);
    // Below the sill the corner is solid wall.
    expect(corner.some((s) => s.z0 < l3.elev + 300 && l3.elev + 300 < s.z1)).toBe(true);
  });

  it('builds door canopies, timber side panels and the courtyard deck', () => {
    expect(geo.parts.find((p) => p.id === 'L1:door-canopy')?.material).toBe('slab');
    expect(geo.parts.find((p) => p.id === 'L3:insert')?.indices.length).toBeGreaterThan(0);
    expect(geo.parts.find((p) => p.id === 'site:deck')?.material).toBe('deck');
    expect(geo.parts.some((p) => p.id === 'canopy:canopy-carport')).toBe(false);
  });

  it('keeps people clear of tree crowns and plants clipped to the fence', () => {
    const trees = geo.entourage.filter((e) => ['ginkgo', 'maple-red', 'maple-green'].includes(e.kind));
    for (const p of geo.entourage.filter((e) => e.kind.startsWith('person'))) {
      for (const t of trees) {
        const d = Math.hypot(t.position[0] - p.position[0], t.position[1] - p.position[1]);
        expect(d, `${p.kind} vs ${t.kind}`).toBeGreaterThan(0.5 * t.scale);
      }
    }
    for (const e of geo.entourage.filter((x) => x.kind !== 'car' && !x.kind.startsWith('person'))) expect(e.clip, e.kind).toBeDefined();
  });
});

describe('kernel: sun study and cutaway data', () => {
  it('reports the site (default UTC+8) and the storeys with their cut heights', () => {
    expect(geo.site).toEqual({ latitude: 30.3, longitude: 120.2, northDeg: 0, utcOffsetHours: 8 });
    const h = structuredClone(golden);
    h.site.utcOffsetHours = 9;
    expect(buildHouse(resolve(h)).site.utcOffsetHours).toBe(9);
    expect(geo.levels.map((l) => l.id)).toEqual(['L1', 'L2', 'L3']);
    for (const l of geo.levels) expect(l.cutZ).toBeCloseTo(l.elevation + 1.25, 6);
  });

  it('gives every storey a floor finish at its elevation', () => {
    for (const l of geo.levels) {
      const floor = geo.parts.find((p) => p.id === `${l.id}:floor`)!;
      expect(floor.material, l.id).toBe('floor');
      expect(floor.level).toBe(l.id);
      const tops = Array.from(floor.positions).filter((_, i) => i % 3 === 2);
      expect(Math.max(...tops), l.id).toBeCloseTo(l.elevation, 4);
    }
    // The ground-floor finish has no feature edges (its outline lies under the walls).
    expect(geo.parts.find((p) => p.id === 'L1:floor')!.edges.length).toBe(0);
  });

  it('caps the walls at each cut plane, with outlines, but not the stairs', () => {
    for (const l of geo.levels) {
      const cut = geo.parts.find((p) => p.id === `${l.id}:cut`)!;
      expect(cut.role).toBe('cut');
      expect(cut.indices.length, l.id).toBeGreaterThan(0);
      expect(cut.edges.length, l.id).toBeGreaterThan(0);
      for (let i = 2; i < cut.positions.length; i += 3) expect(cut.positions[i]).toBeCloseTo(l.cutZ, 4);
    }
    // No cap inside the L1 stair core (gf-stair, x 4.3..5.5 m, y 4.0..5.3 m).
    const cut = geo.parts.find((p) => p.id === 'L1:cut')!;
    const q: [number, number] = [4.9, 4.6];
    const area = (u: number[], v: number[], w: number[]) => (v[0]! - u[0]!) * (w[1]! - u[1]!) - (w[0]! - u[0]!) * (v[1]! - u[1]!);
    for (let t = 0; t < cut.indices.length; t += 3) {
      const [a, b, c] = [0, 1, 2].map((k) => cut.indices[t + k]! * 3).map((o) => [cut.positions[o]!, cut.positions[o + 1]!]) as [number[], number[], number[]];
      const s = [area(a, b, q), area(b, c, q), area(c, a, q)];
      expect(s.every((v) => v > 0) || s.every((v) => v < 0)).toBe(false);
    }
  });
});

/** One-room house with a single roof of the given kind and fall. */
function shed(kind: 'mono' | 'gable' | 'hip', fall: 'N' | 'S' | 'E' | 'W' = 'S'): House {
  return {
    version: 1, name: 'shed', style: 'x',
    site: { width: 10000, depth: 8000, northDeg: 0, latitude: 30, longitude: 120 },
    grid: { x: [{ id: 'a', pos: 2000 }, { id: 'b', pos: 8000 }], y: [{ id: '1', pos: 2000 }, { id: '2', pos: 6000 }] },
    levels: [{
      id: 'L1', name: 'G', height: 3000,
      spaces: [{ id: 'room', name: 'Room', type: 'living', cells: [{ x0: 'a', x1: 'b', y0: '1', y1: '2' }] }],
      openings: [{ id: 'w', kind: 'window', host: { space: 'room', side: 'S' }, at: 'center', width: 1500, height: 1500, sill: 900 }],
      stairs: [],
    }],
    roofs: [{ id: 'r', kind, cells: [{ x0: 'a', x1: 'b', y0: '1', y1: '2' }], onLevel: 'L1', pitchDeg: 20, overhang: 500, ...(kind === 'mono' ? { fall } : { ridge: 'EW' as const }) }],
  };
}

describe('kernel: roof helper', () => {
  const t = Math.tan((20 * Math.PI) / 180);
  for (const fall of ['N', 'S', 'E', 'W'] as const) {
    it(`mono roof falling ${fall}: low edge on the ${fall} side, eave and verge overhangs`, () => {
      const g = buildHouse(resolve(shed('mono', fall)));
      const tile = g.parts.find((p) => p.id === 'r:tile')!;
      const pts: [number, number, number][] = [];
      for (let i = 0; i < tile.positions.length; i += 3) pts.push([tile.positions[i]!, tile.positions[i + 1]!, tile.positions[i + 2]!]);
      const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
      const ew = fall === 'N' || fall === 'S';
      // Eaves (perpendicular to the fall) overhang 0.5 m, verges 0.3 m.
      expect(Math.min(...xs)).toBeCloseTo(2 - (ew ? 0.3 : 0.5), 3);
      expect(Math.max(...ys)).toBeCloseTo(6 + (ew ? 0.5 : 0.3), 3);
      const low = pts.reduce((m, p) => (p[2] < m[2] ? p : m));
      const dir = { N: [0, 1], S: [0, -1], E: [1, 0], W: [-1, 0] }[fall];
      expect((low[0] - 5) * dir[0]! + (low[1] - 4) * dir[1]!).toBeGreaterThan(0);
      // Underside at the eave wall line = level top; tile top 200 mm above.
      const span = ew ? 4 : 6;
      expect(Math.max(...pts.map((p) => p[2]))).toBeCloseTo(3 + (span + 0.5) * t + 0.2, 2);
    });
  }

  it('gable and hip roofs build closed slabs over their footprint', () => {
    for (const kind of ['gable', 'hip'] as const) {
      const g = buildHouse(resolve(shed(kind)));
      const tile = g.parts.find((p) => p.id === 'r:tile')!;
      expect(tile.indices.length).toBeGreaterThan(0);
      const zs = Array.from(tile.positions).filter((_, i) => i % 3 === 2);
      expect(Math.max(...zs)).toBeCloseTo(3 + 2 * t + 0.2, 2);
    }
  });
});

describe('kernel: furniture and walk data', () => {
  const house = resolve(golden);
  const furnished = geo.furniture;

  it('furnishes every level, within the triangle budget', () => {
    for (const id of ['L1', 'L2', 'L3']) expect(furnished.filter((f) => f.level === id).length, id).toBeGreaterThan(5);
    const tris = geo.parts.filter((p) => p.role === 'furniture').reduce((a, p) => a + p.indices.length / 3, 0);
    expect(tris).toBeGreaterThan(1000);
    expect(tris).toBeLessThan(15000);
    expect(geo.stats.triangles).toBeLessThan(60000);
  });

  it('never puts furniture into a wall, and every piece stands on its floor', () => {
    for (const f of furnished) {
      const lv = house.levels.find((l) => l.id === f.level)!;
      expect(f.min[2], f.id).toBeGreaterThanOrEqual(lv.elevation / 1000 - 1e-6);
      // Sinks and hobs sit on the worktop.
      expect(f.min[2], f.id).toBeLessThan(lv.elevation / 1000 + (f.kind === 'sink' || f.kind === 'hob' ? 0.95 : 0.35));
      for (const w of lv.walls) {
        const t = w.thickness / 2000;
        const x0 = Math.min(w.a[0], w.b[0]) / 1000 - t, x1 = Math.max(w.a[0], w.b[0]) / 1000 + t;
        const y0 = Math.min(w.a[1], w.b[1]) / 1000 - t, y1 = Math.max(w.a[1], w.b[1]) / 1000 + t;
        const overlap = f.min[0] < x1 - 1e-3 && f.max[0] > x0 + 1e-3 && f.min[1] < y1 - 1e-3 && f.max[1] > y0 + 1e-3;
        expect(overlap, `${f.id} in ${w.id}`).toBe(false);
      }
    }
  });

  it('keeps doorways free (no piece within 0.4 m of a door or sliding door)', () => {
    for (const lv of house.levels) {
      for (const o of lv.openings) {
        if (o.kind === 'window') continue;
        const ns = o.orient === 'NS';
        const lo = (ns ? Math.min(o.a[1], o.b[1]) : Math.min(o.a[0], o.b[0])) / 1000;
        const hi = lo + o.width / 1000;
        const c = (ns ? o.a[0] : o.a[1]) / 1000;
        const zone = ns ? [c - 0.4, lo, c + 0.4, hi] : [lo, c - 0.4, hi, c + 0.4];
        // Pot plants may stand at the end of wide glazing (as on the plan).
        for (const f of furnished.filter((x) => x.level === lv.id && x.max[2] - x.min[2] > 0.05 && x.kind !== 'pot-plant')) {
          const overlap = f.min[0] < zone[2]! && f.max[0] > zone[0]! && f.min[1] < zone[3]! && f.max[1] > zone[1]!;
          expect(overlap, `${f.id} blocks ${o.id}`).toBe(false);
        }
      }
    }
  });

  it('starts the walk inside the main entrance and connects the levels by stairs', () => {
    expect(geo.walk.start.level).toBe('L1');
    expect(geo.walk.arrivals.map((a) => a.level)).toEqual(['L1', 'L2', 'L3']);
    const ramps = geo.walk.surfaces.filter((s) => s.ramp);
    expect(ramps.length).toBe(4);
    // The flights climb a full storey each, up to the attic floor.
    expect(Math.max(...ramps.map((r) => r.ramp!.z1))).toBeCloseTo(geo.levels[2]!.elevation, 3);
    expect(geo.walk.blockers.some((b) => b.kind === 'fence')).toBe(true);
    expect(geo.walk.blockers.filter((b) => b.kind === 'furniture').length).toBeGreaterThan(20);
  });
});

describe('kernel: empty plot', () => {
  it('builds an empty plot (new_house "blank") without throwing', () => {
    const blank: House = {
      version: 1,
      name: 'blank',
      site: { width: 14000, depth: 11000, northDeg: 0, latitude: 30.3, longitude: 120.2 },
      grid: { x: [{ id: '0', pos: 0 }, { id: '9', pos: 14000 }], y: [{ id: 'A', pos: 0 }, { id: 'Z', pos: 11000 }] },
      levels: [{ id: 'L1', name: '一层', height: 3300, spaces: [], openings: [], stairs: [] }],
      roofs: [],
      style: 'modern-pitched',
    } as House;
    const g = buildHouse(resolve(blank));
    expect(g.parts.every((p) => p.indices.length > 0)).toBe(true);
  });
});
