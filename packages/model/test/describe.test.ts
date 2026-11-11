// Task 009 part C: the plain-text description for LLM context.
import { describe, expect, it } from 'vitest';
import { applyCommands, describeHouse, golden, validate } from '../src/index';
import { clone, smallHouse } from './fixtures';

describe('describeHouse', () => {
  const text = describeHouse(golden);

  it('is deterministic and compact', () => {
    expect(describeHouse(clone(golden))).toBe(text);
    expect(text.length).toBeLessThan(9500);
  });

  it('lists the grid, spaces with their walls, openings with spans and positions, stairs, roofs and issues', () => {
    expect(text).toMatch(/^GRID X 1=0 2=3100 3=3700 4=4300 5=4800 6=5500 7=9100 8=10900 9=11200 10=13800 11=15000$/m);
    expect(text).toMatch(/^LEVEL L2 "二层" height 3000, floor \+3300, below L3$/m);
    expect(text).toMatch(/^- gf-senior bedroom 1-3\/F-K 3\.7x3\.6 13\.3 "老人房" \| N@K 1-2:gf-patio 2-3:gf-planter-n \| E@3 F-H:gf-hall H-K:gf-bath \| S@F 1-2:gf-court-w 2-3:gf-hall \| W@1 out$/m);
    expect(text).toMatch(/^- gf-d-store door gf-hall\|gf-store 2-4 start\+200 800 => 3300-4100$/m);
    expect(text).toMatch(/^- l2-w-east-tall window l2-bed-n:E F-K start\+800 800x4800 sill600 spanLevels 2, wood-panel => 7700-8500$/m);
    expect(text).toMatch(/^stair stair-1: u, in gf-stair, first flight up S, to L2$/m);
    expect(text).toMatch(/^- roof-n mono on L3 1-7\/F-K, pitch 25, fall N, eaveOffset 300, overhang 600, verge 100$/m);
    expect(text).toMatch(/^Interior floor area 243\.4 m²/m);
    expect(text).toMatch(/^ISSUES none$/m);
  });

  it('prints current issues, including for a house that does not pass the schema', () => {
    const h = smallHouse();
    h.levels[0]!.openings = h.levels[0]!.openings.filter((o) => o.id !== 'w-bed');
    expect(describeHouse(h)).toMatch(/ISSUES 1 errors, 0 warnings\n- error no-exterior-window: Bedroom "bed"/);
    const bad = { ...smallHouse(), style: '' };
    expect(describeHouse(bad as never)).toMatch(/error schema: Schema error at style/);
  });

  it('gives an LLM what it needs: every printed opening host round-trips through update_opening', () => {
    // Re-issue each opening's printed host / at: nothing moves, nothing breaks.
    const lines = text.split('\n').filter((l) => /^- \S+ (door|window|sliding-door|void) /.test(l));
    expect(lines).toHaveLength(41);
    const commands = lines.map((l) => {
      const [, id, , host, span, at] = l.match(/^- (\S+) (\S+) (\S+) (\S+-\S+) (\S+)/)!;
      const [from, to] = span!.split('-');
      const h = host!.includes('|')
        ? { between: host!.split('|') as [string, string], span: { from: from!, to: to! } }
        : { space: host!.split(':')[0]!, side: host!.split(':')[1] as 'N', span: { from: from!, to: to! } };
      const [f, off] = at!.split('+');
      return { op: 'update_opening', opening: id, host: h, at: { from: f, offset: Number(off) } };
    });
    const r = applyCommands(golden, commands);
    expect(r.ok).toBe(true);
    expect(describeHouse(r.house)).toBe(text);
    expect(validate(r.house)).toEqual([]);
  });
});
