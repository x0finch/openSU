// Quality checks of the template houses across the pipeline: every main
// room is furnished, plans are free of overlaps, and the plan and the 3D
// scene show the same planting (task 012, B1/B3/B4).
import { describe, expect, it } from 'vitest';
import { golden, resolve, type House } from '@opensu/model';
import { analyseLevel, furnishLevel, isEntryHall, plantSite } from '@opensu/furnish';
import { checkPlan, renderPlanDetailed } from '@opensu/plan';
import { buildHouse } from '@opensu/kernel';
import { TEMPLATE_IDS, templateHouse } from '../src/index';

const houses: [string, House][] = [...TEMPLATE_IDS.map((id) => [id, templateHouse(id)] as [string, House]), ['golden', golden]];

/** What a room of each type must at least contain. */
const NEEDS: Partial<Record<string, string[]>> = {
  living: ['sofa'], family: ['sofa'], bedroom: ['bed'], dining: ['dining-table', 'dining-table-round'], kitchen: ['counter'], bathroom: ['toilet'], study: ['desk'],
};

describe.each(houses)('%s', (_id, house) => {
  const r = resolve(house);

  it('furnishes every main room (living rooms, entry halls and family rooms included)', () => {
    r.levels.forEach((lv, i) => {
      const plan = analyseLevel(r, i);
      const items = furnishLevel(plan);
      for (const sp of plan.spaces) {
        const kinds = new Set(items.filter((p) => p.space === sp.id).map((p) => p.kind));
        const need = NEEDS[sp.type];
        if (need) expect(need.some((k) => kinds.has(k as never)), `${sp.id} (${sp.type}) has a ${need.join(' or ')}`).toBe(true);
        if (isEntryHall(plan, sp.id)) expect(kinds.size, `${sp.id} (entry hall) is furnished`).toBeGreaterThan(0);
      }
    });
  });

  it('plans have no overlaps at screen and sheet text sizes', () => {
    for (const lv of r.levels) {
      for (const textScale of [1, 1.7]) {
        const p = renderPlanDetailed(r, lv.id, { textScale });
        expect(checkPlan(p), `${lv.id} @${textScale}`).toEqual([]);
        expect(p.missingLabels, `${lv.id} @${textScale}`).toEqual([]);
      }
      // Phone plans (no dimension chains), at the text sizes the app picks there.
      for (const textScale of [1.5, 1.75]) {
        const p = renderPlanDetailed(r, lv.id, { textScale, compact: true });
        expect(checkPlan(p), `${lv.id} compact @${textScale}`).toEqual([]);
        expect(p.missingLabels, `${lv.id} compact @${textScale}`).toEqual([]);
      }
    }
  });

  it('plan and 3D show the same planting', () => {
    const plants = plantSite(r);
    const geo = buildHouse(r);
    const plantKinds = new Set(['ginkgo', 'maple-red', 'maple-green', 'bamboo', 'grass']);
    // Potted plants carry a grass tuft of their own (furniture, not planting).
    const pots = geo.furniture.filter((f) => f.kind === 'pot-plant');
    const inPot = (x: number, y: number) => pots.some((f) => x >= f.min[0] && x <= f.max[0] && y >= f.min[1] && y <= f.max[1]);
    const ent = geo.entourage.filter((e) => plantKinds.has(e.kind) && !(e.kind === 'grass' && inPot(e.position[0], e.position[1])));
    expect(ent.map((e) => `${e.kind}@${Math.round(e.position[0] * 1000)},${Math.round(e.position[1] * 1000)}`).sort())
      .toEqual(plants.map((p) => `${p.kind}@${Math.round(p.x)},${Math.round(p.y)}`).sort());
    // Every plant is drawn on its level's plan.
    for (const lv of r.levels) {
      const drawn = furnishLevel(analyseLevel(r, lv.index)).filter((p) => p.layer === 'plant' && p.kind !== 'pot-plant' && p.kind !== 'planter');
      expect(drawn.length, lv.id).toBe(plants.filter((p) => p.level === lv.id).length);
    }
    expect(geo.stats.triangles).toBeLessThan(150000);
  });
});

describe('roof junctions', () => {
  it('T1: the main gable runs on into the east gable and meets it in valleys', () => {
    const geo = buildHouse(resolve(templateHouse('t1')));
    const xs = (id: string) => {
      const p = geo.parts.find((q) => q.id === id)!;
      const out: number[] = [];
      for (let i = 0; i < p.positions.length; i += 3) out.push(p.positions[i]!);
      return out;
    };
    // Main roof tiles reach past the shared wall (x = 9.0 m) up to near the east ridge (10.5 m)...
    expect(Math.max(...xs('roof-main:tile'))).toBeGreaterThan(10);
    expect(Math.max(...xs('roof-main:tile'))).toBeLessThan(10.5);
    // ...and the east roof has no overhang back over the main block.
    expect(Math.min(...xs('roof-east:tile'))).toBeGreaterThanOrEqual(9 - 1e-6);
  });
});

describe('planting', () => {
  it('the templates are planted: a large tree, and people and a car where there is a carport', () => {
    for (const id of TEMPLATE_IDS) {
      const h = templateHouse(id);
      const geo = buildHouse(resolve(h));
      const kinds = geo.entourage.map((e) => e.kind);
      expect(kinds, id).toContain('ginkgo');
      expect(kinds.some((k) => k.startsWith('person')), id).toBe(true);
      const carport = h.levels[0]!.spaces.some((s) => s.type === 'carport');
      expect(kinds.includes('car'), id).toBe(carport);
    }
  });
});
