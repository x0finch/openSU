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
    expect(geo.parts.length).toBeLessThan(80);
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
    // North roof ridge: L3 top 9.3 m + 0.6 m eave offset + 3.6 m * tan 25 + roof depth.
    expect(max[2]).toBeGreaterThan(11.5);
    expect(max[2]).toBeLessThan(12.3);
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
