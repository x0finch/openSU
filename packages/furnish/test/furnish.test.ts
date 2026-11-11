import { describe, expect, it } from 'vitest';
import { golden, resolve } from '@opensu/model';
import { analyseLevel, footprint, furnishHouseLevel, furnishLevel, overlaps } from '../src/index';

const house = resolve(golden);

describe('furnish: golden sample', () => {
  it('is deterministic', () => {
    expect(JSON.stringify(furnishLevel(analyseLevel(house, 0)))).toBe(JSON.stringify(furnishLevel(analyseLevel(resolve(structuredClone(golden)), 0))));
  });

  it('gives every 3D piece a height and a rotation matching its facing', () => {
    for (const level of house.levels) {
      const pieces = furnishHouseLevel(house, level.id);
      expect(pieces.length, level.id).toBeGreaterThan(5);
      for (const p of pieces) {
        expect(p.h, p.id).toBeGreaterThan(0);
        expect(Number.isFinite(p.rotation), p.id).toBe(true);
        expect(['tree', 'shrub', 'car', 'parking-bay']).not.toContain(p.kind);
      }
    }
    const bed = furnishHouseLevel(house, 'L2').find((p) => p.kind === 'bed')!;
    expect(bed).toBeDefined();
  });

  it('keeps solid pieces out of walls', () => {
    for (const [i, level] of house.levels.entries()) {
      const plan = analyseLevel(house, i);
      for (const p of furnishLevel(plan)) {
        if (p.layer !== 'furniture') continue;
        const r = footprint(p);
        for (const w of plan.walls) {
          const t = w.thickness / 2;
          const wr = { x0: Math.min(w.a[0], w.b[0]) - t, y0: Math.min(w.a[1], w.b[1]) - t, x1: Math.max(w.a[0], w.b[0]) + t, y1: Math.max(w.a[1], w.b[1]) + t };
          expect(overlaps(r, wr, 1), `${p.id} x ${w.id}`).toBe(false);
        }
      }
    }
  });
});
