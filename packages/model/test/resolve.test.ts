import { describe, expect, it } from 'vitest';
import {
  EXTERIOR_WALL_THICKNESS, INTERIOR_WALL_THICKNESS, golden, resolve,
} from '../src/index';
import { buildGrid, cellsOf, rings, signedArea } from '../src/grid';
import { c, clone, smallHouse } from './fixtures';

describe('grid geometry', () => {
  const grid = buildGrid(smallHouse());

  it('traces an L-shaped union as one CCW rectilinear ring', () => {
    const cells = cellsOf(grid, [c('a', 'c', '1', '2'), c('a', 'b', '2', '3')]);
    const rs = rings(grid, cells);
    expect(rs).toHaveLength(1);
    expect(rs[0]).toEqual([[0, 0], [8000, 0], [8000, 4000], [4000, 4000], [4000, 8000], [0, 8000]]);
    expect(signedArea(rs[0]!)).toBe(8000 * 4000 + 4000 * 4000);
  });

  it('keeps corner-touching parts as separate rings and holes clockwise', () => {
    const diag = cellsOf(grid, [c('a', 'b', '1', '2'), c('b', 'c', '2', '3')]);
    expect(rings(grid, diag)).toHaveLength(2);
    const ringWithHole = cellsOf(grid, [c('a', 'd', '1', '2'), c('a', 'd', '3', '4'), c('a', 'b', '2', '3'), c('c', 'd', '2', '3')]);
    const rs = rings(grid, ringWithHole);
    expect(rs).toHaveLength(2);
    const areas = rs.map(signedArea).sort((x, y) => x - y);
    expect(areas[0]).toBe(-4000 * 4000);
    expect(areas[1]).toBe(12000 * 10000);
  });
});

describe('resolve', () => {
  const r = resolve(smallHouse());
  const L1 = r.levels[0]!;

  it('computes space polygons and areas', () => {
    const living = L1.spaces.find((s) => s.id === 'living')!;
    expect(living.polygon).toEqual([[0, 0], [4000, 0], [4000, 4000], [0, 4000]]);
    expect(living.area).toBe(16e6);
    expect(L1.interiorArea).toBe(4 * 16e6);
    expect(r.interiorArea).toBe(4 * 16e6 + 2 * 16e6);
  });

  it('derives exterior and interior walls with thicknesses and sides', () => {
    const between = L1.walls.find((w) => w.sides[0] === 'living' && w.sides[1] === 'bed')!;
    expect(between).toMatchObject({ orient: 'NS', line: 'b', a: [4000, 0], b: [4000, 4000], exterior: false, thickness: INTERIOR_WALL_THICKNESS });
    // South wall of living + bed meets nothing: split per space, both exterior.
    const south = L1.walls.filter((w) => w.orient === 'EW' && w.line === '1');
    expect(south.map((w) => w.sides)).toEqual([[null, 'living'], [null, 'bed']]);
    expect(south.every((w) => w.exterior && w.thickness === EXTERIOR_WALL_THICKNESS)).toBe(true);
    // Hall/stair are openTo: no wall between them.
    expect(L1.walls.some((w) => w.sides.includes('hall') && w.sides.includes('stair1'))).toBe(false);
    // Interior meeting an outdoor space is exterior.
    const bedGarden = L1.walls.find((w) => w.sides[0] === 'bed' && w.sides[1] === 'garden')!;
    expect(bedGarden.exterior).toBe(true);
  });

  it('merges collinear continuous wall pieces between the same spaces', () => {
    const r2 = resolve(golden);
    const l1 = r2.levels[0]!;
    // The west plot-edge wall of the senior room spans F..K (crossing grid
    // lines G, H, J) as one piece.
    const west = l1.walls.filter((w) => w.line === '1' && w.sides[1] === 'gf-senior');
    expect(west).toHaveLength(1);
    expect(west[0]!.a).toEqual([0, 6900]);
    expect(west[0]!.b).toEqual([0, 10500]);
    // Hall to dining is openTo: the line x=5500 carries walls only where it borders other spaces.
    expect(l1.walls.some((w) => w.sides.includes('gf-hall') && w.sides.includes('gf-dining'))).toBe(false);
  });

  it('places openings on concrete walls with absolute positions', () => {
    const entry = L1.openings.find((o) => o.id === 'entry')!;
    expect(entry).toMatchObject({ orient: 'EW', a: [1500, 8000], b: [2500, 8000], facing: 'N', sides: ['hall', 'yard'] });
    expect(entry.wall).toBe(L1.walls.find((w) => w.sides[0] === 'hall' && w.sides[1] === 'yard')!.id);
    const dLiving = L1.openings.find((o) => o.id === 'd-living')!;
    expect(dLiving.a).toEqual([500, 4000]);
    const wBed = L1.openings.find((o) => o.id === 'w-bed')!;
    expect(wBed.a).toEqual([5000, 0]);
    expect(wBed.b).toEqual([6500, 0]);
  });

  it('measures side offsets from the space extent and picks the matching edge of an L-shape', () => {
    const r2 = resolve(golden);
    const hallWindow = r2.levels[1]!.openings.find((o) => o.id === 'l2-w-hall-n')!;
    expect(hallWindow.a).toEqual([9800, 6900]);
    const terrace = r2.levels[2]!.openings.find((o) => o.id === 'l3-d-terrace')!;
    expect(terrace.a).toEqual([9100, 5800]);
    expect(terrace.sides).toEqual(['l3-hall', 'l3-terrace']);
  });

  it('computes elevations, slabs and stair openings in the slab above', () => {
    expect(r.levels.map((l) => l.elevation)).toEqual([0, 3000]);
    expect(L1.slab).toEqual([[[0, 0], [12000, 0], [12000, 10000], [0, 10000]]]);
    const L2 = r.levels[1]!;
    expect(L2.slabOpenings).toEqual([{ stair: 's1', rings: [[[4000, 4000], [8000, 4000], [8000, 8000], [4000, 8000]]] }]);
    expect(L1.stairs[0]).toMatchObject({ id: 's1', toLevel: 'L2' });
  });

  it('reports outdoor edges with their treatment', () => {
    const h = smallHouse();
    h.levels[1]!.spaces.push({ id: 'bal', name: 'Balcony', type: 'balcony', cells: [c('a', 'b', '3', '4')], edge: 'glass-rail' });
    const L2 = resolve(h).levels[1]!;
    expect(L2.edges.map((e) => e.treatment)).toEqual(['glass-rail', 'glass-rail', 'glass-rail']);
    expect(L2.walls.find((w) => w.sides[1] === 'bal')!.exterior).toBe(true);
  });

  it('is deterministic', () => {
    expect(resolve(clone(golden))).toEqual(resolve(golden));
    expect(JSON.stringify(resolve(golden))).toBe(JSON.stringify(resolve(clone(golden))));
  });
});
