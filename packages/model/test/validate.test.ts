import { describe, expect, it } from 'vitest';
import { golden, validate, type House, type Issue } from '../src/index';
import { c, clone, smallHouse } from './fixtures';

const codes = (issues: Issue[]) => issues.map((i) => `${i.severity}:${i.code}`);
const broken = (mutate: (h: House) => void): Issue[] => {
  const h = clone(smallHouse());
  mutate(h);
  return validate(h);
};
const L = (h: House, i: number) => h.levels[i]!;

describe('validate: valid houses', () => {
  it('accepts the small fixture with no issues', () => {
    expect(validate(smallHouse())).toEqual([]);
  });
  it('accepts the golden sample with no issues', () => {
    expect(validate(golden)).toEqual([]);
  });
});

describe('validate: one deliberately broken house per rule', () => {
  it('schema: missing and mistyped fields', () => {
    const issues = broken((h) => {
      delete (h as Partial<House>).style;
      (L(h, 0).spaces[0] as { type: string }).type = 'ballroom';
    });
    expect(issues.every((i) => i.code === 'schema' && i.severity === 'error')).toBe(true);
    expect(issues.map((i) => i.where.path?.join('.'))).toEqual(expect.arrayContaining(['style', 'levels.0.spaces.0.type']));
  });

  it('schema: unknown keys are rejected (typos surface)', () => {
    const issues = broken((h) => { (L(h, 0).spaces[0] as Record<string, unknown>).open_to = ['hall']; });
    expect(codes(issues)).toEqual(['error:schema']);
  });

  it('duplicate-id', () => {
    const issues = broken((h) => { L(h, 1).spaces[0]!.id = 'living'; });
    expect(codes(issues)).toContain('error:duplicate-id');
  });

  it('unknown-grid-line', () => {
    const issues = broken((h) => { L(h, 0).spaces[0]!.cells[0]!.x1 = 'zz'; });
    expect(codes(issues)).toContain('error:unknown-grid-line');
    expect(issues.find((i) => i.code === 'unknown-grid-line')!.message).toMatch(/Known X lines: a, b, c, d/);
  });

  it('empty-rect: zero and negative size', () => {
    expect(codes(broken((h) => { L(h, 0).spaces[0]!.cells[0] = c('a', 'a', '1', '2'); }))).toContain('error:empty-rect');
    expect(codes(broken((h) => { L(h, 0).spaces[0]!.cells[0] = c('b', 'a', '1', '2'); }))).toContain('error:empty-rect');
  });

  it('outside-plot', () => {
    const issues = broken((h) => {
      h.grid.x.push({ id: 'e', pos: 14000 });
      L(h, 0).spaces.find((s) => s.id === 'garden')!.cells.push(c('d', 'e', '1', '2'));
    });
    expect(codes(issues)).toContain('error:outside-plot');
  });

  it('unknown-space and unknown-level references', () => {
    expect(codes(broken((h) => { L(h, 0).spaces[0]!.openTo = ['kitchen']; }))).toContain('error:unknown-space');
    expect(codes(broken((h) => { L(h, 0).openings[0]!.host = { space: 'nope', side: 'N' }; }))).toContain('error:unknown-space');
    expect(codes(broken((h) => { L(h, 0).stairs[0]!.space = 'nope'; }))).toContain('error:unknown-space');
    expect(codes(broken((h) => { h.roofs[0]!.onLevel = 'L9'; }))).toContain('error:unknown-level');
  });

  it('space-overlap', () => {
    const issues = broken((h) => { L(h, 0).spaces[0]!.cells = [c('a', 'c', '1', '2')]; });
    const o = issues.find((i) => i.code === 'space-overlap')!;
    expect(o.severity).toBe('error');
    expect(o.message).toMatch(/"living" and "bed"/);
  });

  it('space-disconnected', () => {
    const issues = broken((h) => { L(h, 0).spaces.find((s) => s.id === 'garden')!.cells = [c('c', 'd', '1', '2'), c('c', 'd', '3', '4')]; });
    expect(codes(issues)).toContain('error:space-disconnected');
  });

  it('open-to-not-adjacent (warning)', () => {
    const issues = broken((h) => { L(h, 0).spaces[0]!.openTo = ['stair1']; });
    expect(codes(issues)).toEqual(['warning:open-to-not-adjacent']);
  });

  it('unreachable: interior space without a door', () => {
    const issues = broken((h) => { L(h, 0).openings = L(h, 0).openings.filter((o) => o.id !== 'd-bed'); });
    const u = issues.find((i) => i.code === 'unreachable')!;
    expect(u.severity).toBe('error');
    expect(u.where.space).toBe('bed');
    expect(u.message).toMatch(/living/);
  });

  it('unreachable: whole house without an entrance', () => {
    const issues = broken((h) => { L(h, 0).openings = L(h, 0).openings.filter((o) => o.id !== 'entry'); });
    expect(issues.filter((i) => i.code === 'unreachable').map((i) => i.where.space).sort())
      .toEqual(['bed', 'bed2', 'hall', 'living', 'stair1', 'stair2']);
  });

  it('no-exterior-window', () => {
    const issues = broken((h) => { L(h, 0).openings = L(h, 0).openings.filter((o) => o.id !== 'w-bed'); });
    expect(codes(issues)).toEqual(['error:no-exterior-window']);
    // A window onto another interior space does not count.
    const inner = broken((h) => {
      const l = L(h, 0);
      l.openings = l.openings.filter((o) => o.id !== 'w-bed');
      l.openings.push({ id: 'w-inner', kind: 'window', host: { between: ['bed', 'stair1'] }, at: 'center', width: 800, height: 800, sill: 1200 });
    });
    expect(codes(inner)).toContain('error:no-exterior-window');
  });

  it('opening-too-wide: wider than its wall segment', () => {
    const issues = broken((h) => {
      const w = L(h, 0).openings.find((o) => o.id === 'w-living')!;
      w.at = { from: 'start', offset: 3000 };
      w.width = 2000; // living S side is 0..4000 but the wall there splits at 4000 (bed)
      w.host = { space: 'living', side: 'S' };
    });
    expect(codes(issues)).toContain('error:opening-off-edge');
    const wide = broken((h) => {
      // Host on the hall/yard wall but make it longer than the 4000 segment.
      const e = L(h, 0).openings.find((o) => o.id === 'entry')!;
      e.host = { space: 'yard', side: 'S' };
      e.at = { from: 'start', offset: 3000 };
      e.width = 2000;
    });
    expect(codes(wide)).toContain('error:opening-too-wide');
  });

  it('opening-overlap (also across levels for tall windows)', () => {
    const issues = broken((h) => {
      L(h, 0).openings.push({ id: 'w-living-2', kind: 'window', host: { space: 'living', side: 'S' }, at: { from: 'start', offset: 2500 }, width: 1000, height: 1500, sill: 900 });
    });
    expect(codes(issues)).toEqual(['error:opening-overlap']);
    const span = broken((h) => {
      L(h, 1).spaces.push({ id: 'bed3', name: 'Bed 3', type: 'bedroom', cells: [c('a', 'b', '1', '2')] });
      L(h, 1).openings.push({ id: 'w-bed3', kind: 'window', host: { space: 'bed3', side: 'S' }, at: 'center', width: 1000, height: 1500, sill: 900 });
      L(h, 1).openings.push({ id: 'd-bed3', kind: 'door', host: { between: ['bed3', 'bed2'] }, at: 'center', width: 900, height: 2100, sill: 0 });
      h.roofs[0]!.onLevel = 'L2';
      h.roofs.push({ id: 'r-bed', kind: 'flat', cells: [c('b', 'c', '1', '2')], onLevel: 'L1', overhang: 0 });
      const w = L(h, 0).openings.find((o) => o.id === 'w-living')!;
      w.spanLevels = 2;
      w.height = 4000;
    });
    expect(codes(span)).toEqual(['error:opening-overlap']);
  });

  it('span-no-wall', () => {
    const issues = broken((h) => {
      const w = L(h, 0).openings.find((o) => o.id === 'w-living')!;
      w.spanLevels = 2;
      w.height = 4500;
    });
    expect(codes(issues)).toEqual(['error:span-no-wall']);
  });

  it('opening-off-edge: offset beyond the side', () => {
    const issues = broken((h) => { L(h, 0).openings.find((o) => o.id === 'w-bed')!.at = { from: 'start', offset: 3000 }; });
    const i = issues.find((x) => x.code === 'opening-off-edge')!;
    expect(i.message).toMatch(/Available S edges: y=0 from 4000 to 8000/);
  });

  it('opening-no-wall: door between open-plan spaces', () => {
    const issues = broken((h) => {
      L(h, 0).openings.push({ id: 'd-x', kind: 'door', host: { between: ['hall', 'stair1'] }, at: 'center', width: 900, height: 2100, sill: 0 });
    });
    expect(codes(issues)).toEqual(['error:opening-no-wall']);
  });

  it('opening-not-adjacent', () => {
    const issues = broken((h) => {
      L(h, 0).openings.push({ id: 'd-x', kind: 'door', host: { between: ['living', 'stair1'] }, at: 'center', width: 900, height: 2100, sill: 0 });
    });
    expect(codes(issues)).toEqual(['error:opening-not-adjacent']);
  });

  it('opening-too-tall (warning)', () => {
    const issues = broken((h) => { L(h, 0).openings.find((o) => o.id === 'w-bed')!.height = 2500; });
    expect(codes(issues)).toEqual(['warning:opening-too-tall']);
  });

  it('opening-too-tall: under a pitched roof the limit is the roof underside', () => {
    // r-top falls S from y = 8000 over 4000 mm at 10 deg: 705 mm above the level at the N wall.
    const ok = broken((h) => { const w = L(h, 1).openings.find((o) => o.id === 'w-bed2')!; w.sill = 900; w.height = 2700; });
    expect(ok).toEqual([]);
    const tall = broken((h) => { const w = L(h, 1).openings.find((o) => o.id === 'w-bed2')!; w.sill = 900; w.height = 2900; });
    expect(codes(tall)).toEqual(['warning:opening-too-tall']);
  });

  it('stair-misaligned: no stair space above', () => {
    const issues = broken((h) => {
      L(h, 1).spaces.find((s) => s.id === 'stair2')!.type = 'hall';
    });
    expect(codes(issues)).toContain('error:stair-misaligned');
  });

  it('stair-misaligned: stair on the top level', () => {
    const issues = broken((h) => { L(h, 1).stairs.push({ id: 's2', space: 'stair2', kind: 'straight', up: 'N' }); });
    expect(codes(issues)).toContain('error:stair-misaligned');
  });

  it('stair-space-type', () => {
    const issues = broken((h) => { L(h, 0).stairs[0]!.space = 'hall'; });
    expect(codes(issues)).toContain('error:stair-space-type');
  });

  it('unsupported (warning): upper interior space over nothing', () => {
    const issues = broken((h) => {
      L(h, 1).spaces.find((s) => s.id === 'bed2')!.cells.push(c('a', 'b', '3', '4'));
      h.roofs[1]!.cells.push(c('a', 'b', '3', '4'));
    });
    expect(codes(issues)).toEqual(['warning:unsupported']);
  });

  it('roof-gap (warning)', () => {
    const issues = broken((h) => { h.roofs = h.roofs.filter((r) => r.id !== 'r-top'); });
    expect(codes(issues)).toEqual(['warning:roof-gap', 'warning:roof-gap']);
  });

  it('roof-params', () => {
    const issues = broken((h) => {
      delete h.roofs[1]!.fall;
      h.roofs.push({ id: 'r-g', kind: 'gable', cells: [c('a', 'b', '1', '2')], onLevel: 'L1', overhang: 0 });
      h.roofs[0]!.skylights = [{ at: [11000, 1000], width: 1000, length: 1000 }];
    });
    expect(codes(issues).filter((x) => x === 'error:roof-params')).toHaveLength(4);
  });

  it('min-size: bedroom, bathroom, stair, door', () => {
    const issues = broken((h) => {
      h.grid.x.push({ id: 'b2', pos: 6000 });
      const l = L(h, 0);
      l.spaces.find((s) => s.id === 'bed')!.cells = [c('b', 'b2', '1', '2')];
      l.spaces.push({ id: 'wc', name: 'WC', type: 'bathroom', cells: [c('b2', 'c', '1', '2')] });
      h.grid.y.push({ id: '1a', pos: 1000 });
      l.spaces.find((s) => s.id === 'wc')!.cells = [c('b2', 'c', '1', '1a')];
      l.spaces.push({ id: 'store', name: 'Store', type: 'storage', cells: [c('b2', 'c', '1a', '2')] });
      l.openings.find((o) => o.id === 'd-bed')!.width = 600;
      l.stairs[0]!.kind = 'straight';
      l.stairs[0]!.up = 'E';
    });
    const sizes = issues.filter((i) => i.code === 'min-size');
    expect(sizes.map((i) => i.where.space ?? i.where.stair ?? i.where.opening).sort()).toEqual(['bed', 'd-bed', 'wc'].sort());
    const stair = broken((h) => {
      h.grid.x.push({ id: 'c0', pos: 7200 });
      L(h, 0).spaces.find((s) => s.id === 'stair1')!.cells = [c('c0', 'c', '2', '3')];
      L(h, 0).spaces.find((s) => s.id === 'hall')!.cells = [c('a', 'c0', '2', '3')];
      L(h, 1).spaces.find((s) => s.id === 'stair2')!.cells = [c('c0', 'c', '2', '3')];
      L(h, 1).spaces.find((s) => s.id === 'bed2')!.cells = [c('a', 'c0', '2', '3')];
      L(h, 0).stairs[0]!.kind = 'straight';
    });
    expect(codes(stair)).toContain('error:min-size');
    expect(stair.find((i) => i.code === 'min-size')!.where.stair).toBe('s1');
  });

  it('gate-off-fence', () => {
    const issues = broken((h) => { h.site.fence = { height: 1500, gates: [{ id: 'g', side: 'S', at: { from: 'end', offset: 11500 }, width: 1000 }] }; });
    expect(codes(issues)).toEqual(['error:gate-off-fence']);
  });
});

describe('validate: canopies and door swings (task 003)', () => {
  it('roof-params: canopy higher than its level', () => {
    const issues = broken((h) => { h.roofs.push({ id: 'cp', kind: 'canopy', cells: [c('a', 'c', '3', '4')], onLevel: 'L1', height: 3500, overhang: 0 }); });
    expect(codes(issues)).toEqual(['error:roof-params']);
  });

  it('canopies need no pitch and do not count as roof cover', () => {
    expect(validate({ ...smallHouse(), roofs: [...smallHouse().roofs, { id: 'cp', kind: 'canopy', cells: [c('a', 'c', '3', '4')], onLevel: 'L1', overhang: 300 }] })).toEqual([]);
    const issues = broken((h) => { h.roofs[1] = { id: 'r-top', kind: 'canopy', cells: [c('a', 'c', '2', '3')], onLevel: 'L2', overhang: 0 }; });
    expect(codes(issues)).toEqual(['warning:roof-gap', 'warning:roof-gap']);
  });

  it('swing: into must be a side of the door; windows ignore it', () => {
    const bad = broken((h) => { L(h, 0).openings.find((o) => o.id === 'd-living')!.swing = { into: 'bed', hinge: 'start' }; });
    expect(codes(bad)).toEqual(['error:swing']);
    const win = broken((h) => { L(h, 0).openings.find((o) => o.id === 'w-bed')!.swing = { into: 'bed', hinge: 'start' }; });
    expect(codes(win)).toEqual(['warning:swing']);
    const ok = broken((h) => { L(h, 0).openings.find((o) => o.id === 'd-living')!.swing = { into: 'hall', hinge: 'end' }; });
    expect(ok).toEqual([]);
  });
});

describe('validate: opening spacing, canopies, panels, surfaces', () => {
  it('opening-spacing: openings on one wall closer than 200 mm', () => {
    const issues = broken((h) => {
      L(h, 0).openings.push({ id: 'w-bed-2', kind: 'window', host: { space: 'bed', side: 'S' }, at: { from: 'start', offset: 2600 }, width: 600, height: 1500, sill: 900 });
    });
    expect(codes(issues)).toEqual(['error:opening-spacing']);
    expect(issues[0]!.message).toMatch(/only 100 mm apart.*at least 200 mm.*merge them/);
    const ok = broken((h) => {
      L(h, 0).openings.push({ id: 'w-bed-2', kind: 'window', host: { space: 'bed', side: 'S' }, at: { from: 'start', offset: 2700 }, width: 600, height: 1500, sill: 900 });
    });
    expect(ok).toEqual([]);
  });

  it('canopy on a window and panel on a void are ignored with a warning; surface is outdoor-only', () => {
    const issues = broken((h) => {
      L(h, 0).openings.find((o) => o.id === 'w-bed')!.canopy = { depth: 800 };
      L(h, 0).spaces.find((s) => s.id === 'living')!.surface = 'deck';
    });
    expect(codes(issues).sort()).toEqual(['warning:outdoor-only', 'warning:unsupported-attribute']);
    expect(broken((h) => { L(h, 0).openings.find((o) => o.id === 'entry')!.canopy = { depth: 900, above: 100 }; })).toEqual([]);
  });

  it('openings may run to the end of their edge (corner windows)', () => {
    const issues = broken((h) => {
      const w = L(h, 0).openings.find((o) => o.id === 'w-living')!;
      w.at = { from: 'start', offset: 0 };
      L(h, 0).openings.push({ id: 'w-living-w', kind: 'window', host: { space: 'living', side: 'W' }, at: { from: 'start', offset: 0 }, width: 1200, height: 1500, sill: 900 });
    });
    expect(issues).toEqual([]);
  });
});

describe('golden sample facts', () => {
  it('has the dimensioned grid and three levels', () => {
    const xs = golden.grid.x.map((g) => g.pos);
    for (const p of [0, 3100, 3700, 5500, 9100, 13800, 15000]) expect(xs).toContain(p);
    const ys = golden.grid.y.map((g) => g.pos);
    for (const p of [0, 300, 1800, 5300, 6900, 9200, 10500, 12000]) expect(ys).toContain(p);
    expect(golden.levels.map((l) => l.id)).toEqual(['L1', 'L2', 'L3']);
  });
});
