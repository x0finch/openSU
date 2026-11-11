// Task 009 part A: openings anchored to a named edge (span), clearer
// cross-level messages, no cascading errors after overlaps.
import { describe, expect, it } from 'vitest';
import { resolve, validate, type House, type Issue } from '../src/index';
import { c, clone, smallHouse } from './fixtures';

const codes = (issues: Issue[]) => issues.map((i) => `${i.severity}:${i.code}`);
const edit = (mutate: (h: House) => void): House => {
  const h = clone(smallHouse());
  mutate(h);
  return h;
};
const L = (h: House, i: number) => h.levels[i]!;
const opening = (h: House, li: number, id: string) => L(h, li).openings.find((o) => o.id === id)!;
const space = (h: House, li: number, id: string) => L(h, li).spaces.find((s) => s.id === id)!;
const placed = (h: House, li: number, id: string) => resolve(h).levels[li]!.openings.find((o) => o.id === id);

/** Level 2 bedroom made L-shaped: it has two N-facing edges (line 3 a-b
 *  and line 2 b-c, south of the stair). */
const lShaped = (h: House) => {
  space(h, 1, 'bed2').cells = [c('a', 'b', '2', '3'), c('a', 'c', '1', '2')];
  h.roofs.push({ id: 'r-bed2', kind: 'flat', cells: [c('a', 'c', '1', '2')], onLevel: 'L2', overhang: 0 });
  h.roofs[0]!.onLevel = 'L2';
};

describe('opening hosts with spans', () => {
  it('ambiguous-host: a side with several edges needs a span, and the error lists them', () => {
    const issues = validate(edit(lShaped));
    // Only the two ambiguous openings: no "unreachable" / "no window" follow-ons.
    expect(codes(issues)).toEqual(['error:ambiguous-host', 'error:ambiguous-host']);
    const w = issues.find((i) => i.where.opening === 'w-bed2')!;
    expect(w.message).toMatch(/the N side of "bed2", which has 2 separate edges/);
    expect(w.message).toMatch(/b-c on line 2 \(4000 mm\); a-b on line 3 \(4000 mm\)/);
    expect(w.message).toMatch(/"span": \{"from": "b", "to": "c"\}/);
    // The door between bed2 and the stair: they now share two boundaries.
    const d = issues.find((i) => i.where.opening === 'd-bed2')!;
    expect(d.message).toMatch(/the wall between "bed2" and "stair2", which has 2 separate edges.*2-3 on line b \(4000 mm\); b-c on line 2/);
  });

  it('a span picks the edge; offsets and center are measured on the span', () => {
    const h = edit((x) => {
      lShaped(x);
      opening(x, 1, 'w-bed2').host = { space: 'bed2', side: 'N', span: { from: 'a', to: 'b' } };
      opening(x, 1, 'd-bed2').host = { between: ['bed2', 'stair2'], span: { from: '3', to: '2' } };
    });
    expect(codes(validate(h))).toEqual([]);
    expect(placed(h, 1, 'w-bed2')!.a).toEqual([1250, 8000]);
    expect(placed(h, 1, 'd-bed2')!.orient).toBe('NS');
    // A span may be part of an edge.
    const sub = edit((x) => {
      x.grid.x.push({ id: 'b1', pos: 6000 });
      const d = opening(x, 0, 'w-bed');
      d.host = { space: 'bed', side: 'S', span: { from: 'c', to: 'b1' } };
      d.at = { from: 'start', offset: 300 };
    });
    expect(codes(validate(sub))).toEqual([]);
    expect(placed(sub, 0, 'w-bed')!.a).toEqual([6300, 0]);
  });

  it('opening-span: a span that is not on that side lists the valid spans', () => {
    const issues = validate(edit((x) => { opening(x, 0, 'w-bed').host = { space: 'bed', side: 'S', span: { from: 'a', to: 'b' } }; }));
    expect(codes(issues)).toEqual(['error:opening-span']);
    expect(issues[0]!.message).toMatch(/span a-b, which is not \(entirely\) on the S side of "bed". Edges of the S side of "bed": b-c on line 1 \(4000 mm\)/);
  });

  it('span on the wrong axis or unknown lines are reference errors with the valid ids', () => {
    const wrongAxis = validate(edit((x) => { opening(x, 0, 'w-bed').host = { space: 'bed', side: 'S', span: { from: '1', to: '2' } }; }));
    expect(codes(wrongAxis)).toContain('error:unknown-grid-line');
    expect(wrongAxis[0]!.message).toMatch(/"1" is a Y grid line\. The S side of a space runs west-east, so its span is between two X lines \(a, b, c, d\)/);
    const between = validate(edit((x) => { opening(x, 0, 'd-living').host = { between: ['hall', 'living'], span: { from: 'a', to: '2' } }; }));
    expect(between[0]!.message).toMatch(/both ends must be X grid lines/);
  });

  it('editing cells does not move openings whose span still exists', () => {
    const base = edit((x) => { opening(x, 0, 'w-bed').host = { space: 'bed', side: 'S', span: { from: 'b', to: 'c' } }; });
    const before = placed(base, 0, 'w-bed')!;
    const wider = clone(base);
    space(wider, 0, 'bed').cells = [c('b', 'd', '1', '2')];
    space(wider, 0, 'garden').cells = [c('c', 'd', '2', '4')];
    expect(placed(wider, 0, 'w-bed')!.a).toEqual(before.a);
    expect(placed(wider, 0, 'w-bed')!.b).toEqual(before.b);
  });

  it('if the span no longer exists on that side the opening is an error naming the valid spans', () => {
    const h = edit((x) => {
      opening(x, 0, 'w-bed').host = { space: 'bed', side: 'S', span: { from: 'b', to: 'c' } };
      space(x, 0, 'bed').cells = [c('c', 'd', '1', '2')];
      space(x, 0, 'garden').cells = [c('c', 'd', '2', '4'), c('b', 'c', '1', '2')];
    });
    const i = validate(h).find((x) => x.code === 'opening-span')!;
    expect(i.where.opening).toBe('w-bed');
    expect(i.message).toMatch(/Opening "w-bed" has span b-c.*Edges of the S side of "bed": c-d on line 1 \(4000 mm\)/);
  });
});

describe('no cascading noise after overlaps', () => {
  it('reports the overlap and not the follow-on wall / opening / reachability errors', () => {
    const h = edit((x) => { space(x, 0, 'living').cells = [c('a', 'c', '1', '2')]; });
    const issues = validate(h);
    expect(codes(issues)).toEqual(['error:space-overlap']);
    expect(issues[0]!.message).toMatch(/"living" and "bed" overlap on level "L1" in cells b-c\/1-2 \(16\.00 m²\)/);
    expect(issues[0]!.message).toMatch(/skipped until this is fixed/);
  });
});

describe('outdoor-only (warning)', () => {
  it('edge, cover or surface on an interior space is ignored with a warning', () => {
    for (const patch of [{ edge: 'glass-rail' as const }, { cover: 'canopy' as const }, { surface: 'deck' as const }]) {
      const issues = validate(edit((x) => { Object.assign(space(x, 0, 'living'), patch); }));
      expect(codes(issues)).toEqual(['warning:outdoor-only']);
      expect(issues[0]!.message).toMatch(/"living" is living \(interior\) but sets edge\/cover\/surface/);
    }
    // On an outdoor space they are fine.
    expect(validate(edit((x) => { Object.assign(space(x, 0, 'yard'), { edge: 'glass-rail', surface: 'deck' }); }))).toEqual([]);
  });
});

describe('cross-level messages name both levels and the fix', () => {
  it('stair-misaligned', () => {
    const issues = validate(edit((x) => { space(x, 1, 'stair2').type = 'hall'; }));
    const i = issues.find((x) => x.code === 'stair-misaligned')!;
    expect(i.message).toMatch(/Stair "s1" in "stair1" on level "L1" \(cells b-c\/2-3\) climbs to level "L2", but on "L2" cells b-c\/2-3 above it are "stair2" \(hall\), not a space of type "stair"/);
    expect(i.message).toMatch(/Fix it on "L2".*or move "stair1" on "L1" under a stair space of "L2" \(it has none\)/);
  });

  it('stair on the top level', () => {
    const issues = validate(edit((x) => { L(x, 1).stairs.push({ id: 's2', space: 'stair2', kind: 'straight', up: 'N' }); }));
    expect(issues.find((x) => x.code === 'stair-misaligned')!.message).toMatch(/"L2", the top level, so it leads nowhere/);
  });

  it('span-no-wall names the level above and what is there', () => {
    const issues = validate(edit((x) => { const w = opening(x, 0, 'w-living'); w.spanLevels = 2; w.height = 4500; }));
    expect(codes(issues)).toEqual(['error:span-no-wall']);
    expect(issues[0]!.message).toMatch(/"w-living" on level "L1" has spanLevels 2, so it continues up through level "L2" in the same wall \(line 1, 1000\.\.3000\)\. But on "L2" there is no wall or boundary there at all\. Set spanLevels to 1/);
    const tooHigh = validate(edit((x) => { const w = opening(x, 1, 'w-bed2'); w.spanLevels = 3; }));
    expect(tooHigh.find((x) => x.code === 'span-no-wall')!.message).toMatch(/spanLevels 3, but only 0 level\(s\) exist above "L2". Set spanLevels to 1 or less/);
  });

  it('interior-window (warning): a window that ends up between two rooms', () => {
    const issues = validate(edit((x) => {
      L(x, 0).openings.push({ id: 'w-in', kind: 'window', host: { between: ['bed', 'stair1'] }, at: 'center', width: 800, height: 800, sill: 1200 });
    }));
    expect(codes(issues)).toEqual(['warning:interior-window']);
    expect(issues[0]!.message).toMatch(/between "bed" and "stair1", so it gets no daylight/);
  });
});
