import { describe, expect, it } from 'vitest';
import { applyCommands, describeHouse, golden, resolve, validate } from '@opensu/model';
import { blankHouse, describeDiff, starterHouse } from '../src/index';

describe('starter house', () => {
  it('is authored with commands and validates without errors or warnings', () => {
    const h = starterHouse();
    expect(validate(h)).toEqual([]);
    expect(h.levels.map((l) => l.id)).toEqual(['L1', 'L2']);
    expect(resolve(h).interiorArea / 1e6).toBeCloseTo(244.8, 1);
  });

  it('is our own design, not the golden sample', () => {
    const h = starterHouse();
    expect(h.site).not.toEqual(golden.site);
    expect(h.grid).not.toEqual(golden.grid);
  });

  it('blank plot validates; sizes round to 100 mm', () => {
    const b = blankHouse({ width: 12100, depth: 20000 });
    expect(validate(b).filter((i) => i.severity === 'error')).toEqual([]);
    expect(b.site.width).toBe(12100);
    expect(b.site.depth).toBe(20000);
  });
});

describe('describeDiff', () => {
  it('reports only the changed lines, by section', () => {
    const h = starterHouse();
    const r = applyCommands(h, [{ op: 'update_space', space: 'l2-study', name: '茶室' }]);
    const d = describeDiff(describeHouse(h), describeHouse(r.house));
    expect(d).toContain('[LEVEL L2]');
    expect(d).toContain('+ - l2-study study 3-4/D-E');
    expect(d).toContain('"茶室"');
    expect(d).not.toContain('l1-living');
    expect(describeDiff(describeHouse(h), describeHouse(h))).toBe('no change');
  });
});
