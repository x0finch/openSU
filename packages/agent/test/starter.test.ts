import { describe, expect, it } from 'vitest';
import { applyCommands, describeHouse, golden, resolve, validate } from '@opensu/model';
import { blankHouse, describeDiff, starterHouse, TEMPLATE_IDS, TEMPLATES, templateHouse } from '../src/index';

describe('template houses', () => {
  it.each(TEMPLATE_IDS)('%s is authored with commands and validates without errors or warnings', (id) => {
    const h = templateHouse(id);
    expect(validate(h)).toEqual([]);
    const t = TEMPLATES.find((x) => x.id === id)!;
    expect(h.name).toBe(t.name);
    expect([h.site.width, h.site.depth]).toEqual([t.plot.width, t.plot.depth]);
  });

  it('have the briefs of task 012 (plots, storeys, roofs, outdoor rooms)', () => {
    const [t1, t2, t3] = TEMPLATE_IDS.map(templateHouse);
    const kinds = (h: NonNullable<typeof t1>) => new Set(h.roofs.map((r) => r.kind));
    const types = (h: NonNullable<typeof t1>) => new Set(h.levels.flatMap((l) => l.spaces.map((s) => s.type)));
    // T1: two storeys, pitched roofs, a terrace on a single-storey wing, a deck, a carport.
    expect(t1!.levels.length).toBe(2);
    expect(kinds(t1!).has('gable')).toBe(true);
    expect(types(t1!).has('terrace') && types(t1!).has('carport')).toBe(true);
    expect(t1!.levels[0]!.spaces.some((s) => s.surface === 'deck')).toBe(true);
    // T2: three storeys, flat roofs only, two terraces.
    expect(t2!.levels.length).toBe(3);
    expect([...kinds(t2!)]).toEqual(['flat']);
    expect(t2!.levels.flatMap((l) => l.spaces).filter((s) => s.type === 'terrace').length).toBe(2);
    // T3: pitched roofs over a U around a courtyard.
    expect(kinds(t3!).has('gable') && kinds(t3!).has('mono')).toBe(true);
    expect(types(t3!).has('courtyard')).toBe(true);
  });

  it('are our own designs, not the golden sample', () => {
    for (const id of TEMPLATE_IDS) {
      const h = templateHouse(id);
      expect([h.site.width, h.site.depth]).not.toEqual([golden.site.width, golden.site.depth]);
      expect(h.grid).not.toEqual(golden.grid);
    }
  });

  it('the starter (default house) is T1', () => {
    expect(starterHouse()).toEqual(templateHouse('t1'));
    expect(resolve(starterHouse()).interiorArea / 1e6).toBeCloseTo(159.5, 1);
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
    const r = applyCommands(h, [{ op: 'update_space', space: 'l2-bedroom', name: '茶室' }]);
    const d = describeDiff(describeHouse(h), describeHouse(r.house));
    expect(d).toContain('[LEVEL L2]');
    expect(d).toContain('+ - l2-bedroom bedroom 3-9/D-E');
    expect(d).toContain('"茶室"');
    expect(d).not.toContain('l1-living');
    expect(describeDiff(describeHouse(h), describeHouse(h))).toBe('no change');
  });
});
