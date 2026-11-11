// Quality checks of the template houses across the pipeline: every main
// room is furnished, plans are free of overlaps, and the plan and the 3D
// scene show the same planting (task 012, B1/B3/B4).
import { describe, expect, it } from 'vitest';
import { golden, resolve, type House } from '@opensu/model';
import { analyseLevel, crownRadius, frontSide, furnishLevel, isEntryHall, plantSite, pointInRings } from '@opensu/furnish';
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

// Task 016, item 1: the planting is decided by the house, never by where it
// stands or which way it is turned, and it keeps clear of the house.
describe('planting follows the house', () => {
  const places = [
    { latitude: 30.3, longitude: 120.2, northDeg: 0 },
    { latitude: -33.87, longitude: 151.21, northDeg: 0 },
    { latitude: 69.65, longitude: 18.96, northDeg: 0 },
    { latitude: 0.5, longitude: 32.6, northDeg: 0 },
    { latitude: 30.3, longitude: 120.2, northDeg: 90 },
    { latitude: -33.87, longitude: 151.21, northDeg: -135 },
  ];
  const key = (e: { kind: string; position: number[]; scale: number; rotation: number }) =>
    `${e.kind}@${e.position.map((v) => v.toFixed(3)).join(',')}x${e.scale.toFixed(3)}r${e.rotation.toFixed(3)}`;

  it.each(houses)('%s: location and orientation never move plants or people', (_id, house) => {
    const ref = buildHouse(resolve(house)).entourage.map(key);
    for (const p of places) {
      const moved = buildHouse(resolve({ ...house, site: { ...house.site, ...p } })).entourage.map(key);
      expect(moved, JSON.stringify(p)).toEqual(ref);
    }
  });

  it.each(houses)('%s: trees stand clear of the main glazing, balconies and terraces', (_id, house) => {
    const r = resolve(house);
    const side = frontSide(r);
    const upperOutdoor = (x: number, y: number) =>
      r.levels.slice(1).some((lv) => lv.spaces.some((s) => s.outdoor && pointInRings(s.rings, x, y)));
    const covered = (x: number, y: number) => r.levels.slice(1).some((lv) => lv.spaces.some((s) => pointInRings(s.rings, x, y)));
    for (const p of plantSite(r)) {
      if (p.level !== r.levels[0]!.id || (p.kind !== 'ginkgo' && p.kind !== 'maple-red' && p.kind !== 'maple-green')) continue;
      // Only crowns that reach the upper floors (low maples may stand under a balcony).
      if (!r.levels.slice(1).some((lv) => p.height * 1000 > lv.elevation + 500)) continue;
      expect(covered(p.x, p.y), `${p.kind} at ${p.x},${p.y} under an upper floor`).toBe(false);
      const R = crownRadius(p) * 0.75;
      for (let k = 0; k < 8; k++) {
        const a = (k * Math.PI) / 4;
        expect(upperOutdoor(p.x + Math.cos(a) * R, p.y + Math.sin(a) * R), `${p.kind} at ${p.x},${p.y}: crown in a balcony / terrace`).toBe(false);
      }
      if (p.kind !== 'ginkgo') continue;
      // Not in front of the middle of a large window or sliding door of the front.
      for (const lv of r.levels) {
        for (const o of lv.openings) {
          if (o.kind === 'void' || !(o.kind === 'sliding-door' || o.width >= 1500)) continue;
          const ew = o.orient === 'EW';
          if (ew ? side === 'E' || side === 'W' : side === 'N' || side === 'S') continue;
          const c = ew ? o.center[0] : o.center[1];
          const along = ew ? p.x : p.y;
          const out = side === 'S' ? o.center[1] - p.y : side === 'N' ? p.y - o.center[1] : side === 'W' ? o.center[0] - p.x : p.x - o.center[0];
          expect(out > 0 && out < 6000 && Math.abs(along - c) < o.width * 0.3, `ginkgo at ${p.x},${p.y} in front of ${o.id}`).toBe(false);
        }
      }
    }
  });

  it.each(houses)('%s: people stand on walkable outdoor floor, clear of furniture and rails', (_id, house) => {
    const r = resolve(house);
    const geo = buildHouse(r);
    for (const e of geo.entourage.filter((x) => x.kind.startsWith('person'))) {
      const [x, y, z] = e.position.map((v) => v * 1000) as [number, number, number];
      const lv = [...r.levels].reverse().find((l) => z >= l.elevation - 50)!;
      const space = lv.spaces.find((s) => pointInRings(s.rings, x, y));
      expect(space?.outdoor, `${e.kind} at ${x},${y} on ${lv.id}`).toBe(true);
      // Nearly half a metre of the same floor all round: no rail, wall or fence within reach.
      for (const [dx, dy] of [[450, 0], [-450, 0], [0, 450], [0, -450]] as const) {
        expect(lv.spaces.find((s) => pointInRings(s.rings, x + dx, y + dy))?.outdoor, `${e.kind} at ${x},${y}: wall, fence or rail within 0.45 m`).toBe(true);
      }
      for (const f of geo.furniture.filter((q) => q.level === lv.id)) {
        const inside = e.position[0] > f.min[0] - 0.3 && e.position[0] < f.max[0] + 0.3 && e.position[1] > f.min[1] - 0.3 && e.position[1] < f.max[1] + 0.3;
        expect(inside, `${e.kind} at ${x},${y} in ${f.id}`).toBe(false);
      }
    }
  });
});
