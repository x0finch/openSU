import { golden, resolve, type ResolvedHouse } from '@opensu/model';
import { describe, expect, it } from 'vitest';
import { analyseLevel, chainPositions, checkPlan, furnishLevel, renderPlanDetailed, tokens } from '../src/index';

const house: ResolvedHouse = resolve(golden);
const reports = house.levels.map((l) => ({ level: l, r: renderPlanDetailed(house, l.id) }));

describe('golden floor plans', () => {
  for (const { level, r } of reports) {
    describe(`${level.id} ${level.name}`, () => {
      it('has no text, wall, door-swing or furniture overlaps', () => {
        expect(checkPlan(r)).toEqual([]);
        expect(r.missingLabels).toEqual([]);
      });

      it('is a compact vector SVG', () => {
        expect(r.svg.startsWith('<svg')).toBe(true);
        expect(r.svg.length).toBeLessThan(400 * 1024);
        expect(r.svg).not.toMatch(/<image|data:image/);
      });

      it('labels every room and shows stair direction', () => {
        const labelled = new Set(r.texts.filter((t) => t.kind === 'label').map((t) => t.space));
        for (const s of level.spaces) {
          if (!s.outdoor && s.type !== 'stair') expect(labelled, s.id).toContain(s.id);
        }
        const hasStair = level.spaces.some((s) => s.type === 'stair');
        if (hasStair) expect(r.texts.some((t) => t.kind === 'stair' && (t.text === '上' || t.text === '下'))).toBe(true);
      });

      it('draws a swing arc for every door and every window in its wall', () => {
        const doors = level.openings.filter((o) => o.kind === 'door');
        expect(r.swings).toHaveLength(doors.length);
        const arcs = r.svg.split(`fill="none" stroke="${tokens.color.doorArc}"`).length - 1;
        expect(arcs).toBeGreaterThanOrEqual(doors.length);
        const windows = level.openings.filter((o) => o.kind === 'window' && o.wall);
        // Each window is a white gap with two face lines and two glass lines.
        const glass = r.svg.split(`stroke="${tokens.color.glassLine}" stroke-width="${tokens.stroke.glass}"`).length - 1;
        expect(glass).toBeGreaterThanOrEqual(windows.length * 2);
      });

      it('dimensions grid distances only', () => {
        const xs = new Set([...house.grid.x.map((g) => g.pos), 0, house.site.width]);
        const ys = new Set([...house.grid.y.map((g) => g.pos), 0, house.site.depth]);
        const plan = analyseLevel(house, level.index);
        const numbers = new Set(r.texts.filter((t) => t.kind === 'dim').map((t) => Number(t.text)));
        for (const side of ['N', 'S', 'E', 'W'] as const) {
          const pts = chainPositions(plan, side);
          for (const p of pts) expect(side === 'N' || side === 'S' ? xs : ys).toContain(p);
          for (let i = 1; i < pts.length; i++) expect(numbers).toContain(pts[i]! - pts[i - 1]!);
          if (pts.length > 2) expect(numbers).toContain(pts[pts.length - 1]! - pts[0]!);
        }
      });
    });
  }

  it('matches the reference dimension chains where the drawings are unambiguous', () => {
    const gf = analyseLevel(house, 0);
    expect(chainPositions(gf, 'N')).toEqual([0, 3700, 5500, 9100, 13800, 15000]);
    expect(chainPositions(gf, 'S')).toEqual([0, 3100, 5500, 13800, 15000]);
    expect(chainPositions(gf, 'E')).toEqual([0, 1800, 6900, 9200, 12000]);
    const l2 = analyseLevel(house, 1);
    expect(chainPositions(l2, 'E')).toEqual([300, 1800, 5300, 6900, 10500, 12000]);
    expect(chainPositions(l2, 'W')).toEqual([300, 1800, 6900, 10500, 12000]);
    expect(chainPositions(l2, 'S')).toEqual([0, 3100, 5500, 9100, 13800]);
  });

  it('places furniture deterministically', () => {
    const a = furnishLevel(analyseLevel(house, 0));
    const b = furnishLevel(analyseLevel(house, 0));
    expect(a).toEqual(b);
    expect(a.some((p) => p.kind === 'bed')).toBe(true);
    expect(a.some((p) => p.kind === 'dining-table-round' || p.kind === 'dining-table')).toBe(true);
    expect(a.some((p) => p.kind === 'toilet')).toBe(true);
    expect(a.some((p) => p.kind === 'car')).toBe(true);
  });

  it('renders without furniture and with a custom title', () => {
    const svg = renderPlanDetailed(house, 'L2', { furniture: false, title: 'Test', subtitle: false }).svg;
    expect(svg).toContain('>Test<');
    expect(svg).not.toContain('url(#soft)');
  });
});
