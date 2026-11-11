// Task 009 part D: realistic edit sequences on the golden sample validate,
// resolve, and fail with actionable errors when they should.
import { describe, expect, it } from 'vitest';
import { applyCommands, golden, resolve, validate, type ApplyResult, type House } from '../src/index';
import { SCENARIOS } from './scenarios';

const codes = (r: ApplyResult) => r.issues.map((i) => `${i.severity}:${i.code}`);
const accepted = (r: ApplyResult): House => {
  if (!r.ok) throw new Error(r.issues.map((i) => `${i.code}: ${i.message}`).join('\n'));
  expect(validate(r.house).filter((i) => i.severity === 'error')).toEqual([]);
  return r.house;
};
const apply = (cmds: readonly unknown[]) => applyCommands(golden, cmds);
const resolvedSpace = (h: House, level: string, id: string) =>
  resolve(h).levels.find((l) => l.id === level)!.spaces.find((s) => s.id === id)!;

describe('edit scenarios on the golden sample', () => {
  it('widen the living room by 600 mm (move a grid line)', () => {
    const r = apply(SCENARIOS.widenLiving);
    const h = accepted(r);
    expect(r.issues).toEqual([]);
    expect(resolvedSpace(h, 'L1', 'gf-living').area).toBe(5300 * 5100);
    expect(resolvedSpace(h, 'L2', 'l2-master').area).toBe(5300 * 3500);
    // Openings measured from line 7 stay put; the east wall moved.
    const res = resolve(h);
    expect(res.levels[0]!.openings.find((o) => o.id === 'gf-sd-living')!.a).toEqual([9400, 1800]);
    expect(res.levels[0]!.walls.some((w) => w.line === '10' && w.a[0] === 14400)).toBe(true);
    expect(r.applied[0]!.summary).toMatch(/gf-living 23\.97->27\.03/);
  });

  it('add a bedroom with a window on level 2 in free cells', () => {
    const r = apply(SCENARIOS.bedroomL2);
    const h = accepted(r);
    expect(codes(r)).toEqual(['warning:unsupported']);
    expect(r.issues[0]!.message).toMatch(/no interior space below it on "L1" \(there: "gf-court-w" \(courtyard\)\)/);
    expect(resolvedSpace(h, 'L2', 'l2-bedroom').area).toBe(3100 * 5100);
    expect(r.applied.flatMap((a) => a.created)).toEqual(['l2-bedroom', 'l2-bedroom-w', 'l2-bedroom-d', 'roof-l2']);
    // Just the room and roof: rejected (no door, no window), with warnings about
    // the two windows that the new room puts inside the house.
    const lazy = apply(SCENARIOS.bedroomL2.filter((cmd) => cmd.op !== 'remove_opening' && cmd.op !== 'add_opening'));
    expect(lazy.ok).toBe(false);
    expect(codes(lazy)).toEqual(['error:unreachable', 'error:no-exterior-window', 'warning:interior-window', 'warning:interior-window', 'warning:unsupported', 'error:rolled-back']);
  });

  it('move the kitchen window 300 mm east (refused: it is in a north-south wall) and then 300 mm north', () => {
    const east = apply(SCENARIOS.kitchenWindowEast);
    expect(east.ok).toBe(false);
    expect(east.house).toBe(golden);
    expect(east.issues[0]!.message).toMatch(/"gf-w-ckitchen-e" is in a wall running south-north \(grid line 7\), so it can only move N or S/);
    const r = apply(SCENARIOS.kitchenWindowNorth);
    const h = accepted(r);
    expect(resolve(h).levels[0]!.openings.find((o) => o.id === 'gf-w-ckitchen-e')!.a).toEqual([9100, 10100]);
    // The other kitchen window cannot move north: the wall splits where the planter ends.
    const wk = apply([{ op: 'update_opening', opening: 'gf-w-wkitchen', move: { dir: 'N', by: 300 } }]);
    expect(wk.issues[0]!.message).toMatch(/crosses 2 wall segments: F-G 6900\.\.8500 \(gf-wkitchen \| gf-planter-e\), G-J 8500\.\.9200 \(gf-wkitchen \| gf-yard\)/);
  });

  it('turn the study into a bedroom with an ensuite (split with a new grid line, add a door)', () => {
    const r = apply(SCENARIOS.studyToBedroom);
    const h = accepted(r);
    expect(r.issues).toEqual([]);
    expect(h.grid.x.find((g) => g.id === '6a')!.pos).toBe(7500);
    expect(resolvedSpace(h, 'L3', 'l3-bathroom').area).toBe(1600 * 1600);
    const door = resolve(h).levels[2]!.openings.find((o) => o.id === 'l3-study-d')!;
    expect(door.sides).toEqual(['l3-bathroom', 'l3-study']);
    // Forgetting the terrace door: it would silently jump into the new bathroom wall.
    const forgot = apply(SCENARIOS.studyToBedroom.slice(0, -1));
    expect(forgot.ok).toBe(false);
    expect(forgot.issues[0]!.code).toBe('opening-moved');
    expect(forgot.issues[0]!.message).toMatch(/"l3-d-terrace" was not edited in this batch, but it would jump from the wall on grid line 7 to grid line 6a/);
  });

  it('add a third full storey (copy the level 2 layout)', () => {
    const r = apply(SCENARIOS.thirdStorey);
    const h = accepted(r);
    expect(r.issues).toEqual([]);
    expect(h.levels.map((l) => l.id)).toEqual(['L1', 'L2', 'L2b', 'L3']);
    const res = resolve(h);
    expect(res.levels.map((l) => l.elevation)).toEqual([0, 3300, 6300, 9300]);
    expect(res.levels[2]!.slabOpenings.map((s) => s.stair)).toEqual(['stair-2']);
    expect(res.levels[3]!.slabOpenings.map((s) => s.stair)).toEqual(['l2b-stair-2']);
    expect(res.interiorArea).toBeGreaterThan(resolve(golden).interiorArea + 80e6);
    // Copying alone: the copied tall windows collide with the originals spanning up.
    const naive = apply(SCENARIOS.thirdStorey.slice(0, 1));
    expect(naive.issues.filter((i) => i.code === 'opening-overlap').map((i) => i.message)).toEqual([
      expect.stringMatching(/"l2-w-east-tall" \(from level "L2", spanLevels 2\) and "l2b-w-east-tall" overlap on level "L2b".*or reduce spanLevels/),
      expect.stringMatching(/"l2-w-hall-w" \(from level "L2", spanLevels 2\) and "l2b-w-hall-w" overlap/),
    ]);
  });

  it('a bad batch (bedroom without window + door wider than its wall) rolls back with actionable errors', () => {
    const r = apply(SCENARIOS.badBatch);
    expect(r.ok).toBe(false);
    expect(r.house).toBe(golden);
    const errs = r.issues.filter((i) => i.severity === 'error');
    expect(errs.map((i) => i.code)).toEqual(['opening-off-edge', 'no-exterior-window', 'rolled-back']);
    expect(errs[0]!.message).toMatch(/Opening "l2-bedroom-d" \(5100\.\.7100\) runs past its span E-F on the wall between "l2-bedroom" and "l2-hall" \(5300\.\.6900, 1600 mm long\)\. The span is shorter than the opening; make it at most 1600 mm wide/);
    expect(errs[1]!.message).toMatch(/Bedroom "l2-bedroom" has no window on an exterior wall/);
    expect(errs[2]!.message).toMatch(/No changes were kept/);
  });
});
