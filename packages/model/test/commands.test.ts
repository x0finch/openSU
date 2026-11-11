// Task 009 part B: every command succeeds on a good input and fails with an
// actionable message on a bad one; batches are atomic.
import { describe, expect, it } from 'vitest';
import {
  applyCommands, COMMAND_OPS, commandsJsonSchema, editHouseTool, History, resolve, validate,
  type ApplyResult, type House,
} from '../src/index';
import { c, clone, smallHouse } from './fixtures';

const run = (commands: unknown[], house: House = smallHouse()) => applyCommands(house, commands);
const errors = (r: ApplyResult) => r.issues.filter((i) => i.severity === 'error' && i.code !== 'rolled-back');
const errorCodes = (r: ApplyResult) => errors(r).map((i) => i.code);
const ok = (r: ApplyResult) => {
  if (!r.ok) throw new Error(r.issues.map((i) => `${i.code}: ${i.message}`).join('\n'));
  return r.house;
};
const level = (h: House, id: string) => h.levels.find((l) => l.id === id)!;
const space = (h: House, id: string) => h.levels.flatMap((l) => l.spaces).find((s) => s.id === id);
const opening = (h: House, id: string) => h.levels.flatMap((l) => l.openings).find((o) => o.id === id);

describe('applyCommands: atomicity and purity', () => {
  it('does not mutate its input and returns a new house on success', () => {
    const h = smallHouse();
    const snapshot = JSON.stringify(h);
    const r = run([{ op: 'rename_house', name: 'Renamed' }], h);
    expect(r.ok).toBe(true);
    expect(r.house).not.toBe(h);
    expect(r.house.name).toBe('Renamed');
    expect(JSON.stringify(h)).toBe(snapshot);
  });

  it('rolls back the whole batch when the result has an error (returns the original object)', () => {
    const h = smallHouse();
    const r = run([{ op: 'rename_house', name: 'Renamed' }, { op: 'remove_opening', opening: 'w-bed' }], h);
    expect(r.ok).toBe(false);
    expect(r.house).toBe(h);
    expect(errorCodes(r)).toEqual(['no-exterior-window']);
    expect(r.issues.at(-1)!.code).toBe('rolled-back');
    expect(r.applied.map((a) => a.op)).toEqual(['rename_house', 'remove_opening']);
  });

  it('a failing command rolls back and the other failures are still reported', () => {
    const r = run([{ op: 'update_space', space: 'bedd', name: 'x' }, { op: 'remove_roof', roof: 'r-lo' }]);
    expect(errorCodes(r)).toEqual(['unknown-id', 'unknown-id']);
    expect(errors(r)[0]!.message).toMatch(/Command 0 \(update_space\): Unknown space "bedd". Nearest space ids: bed, bed2/);
    expect(errors(r)[0]!.where.command).toBe(0);
    expect(errors(r)[1]!.message).toMatch(/Unknown roof "r-lo". Nearest roof ids: r-low, r-top/);
  });

  it('malformed commands name the op and the field; unknown ops suggest the right one', () => {
    const r = run([{ op: 'add_space', level: 'L1', name: 'x', type: 'ballroom', cells: [] }, { op: 'move_grid', line: 'a' }, { op: 'rename_house', name: 'x', extra: 1 }]);
    const msgs = errors(r).map((i) => i.message);
    expect(msgs[0]).toMatch(/Command 0 \(add_space\) is malformed: type: .*; cells: /);
    expect(msgs[1]).toMatch(/unknown op "move_grid" \(did you mean move_grid_line/);
    expect(msgs[2]).toMatch(/Command 2 \(rename_house\) is malformed: .*extra/);
    expect(run([]).ok).toBe(false);
  });

  it('warnings do not block, and errors the original house already had do not block either', () => {
    const r = run([{ op: 'remove_roof', roof: 'r-top' }]);
    expect(r.ok).toBe(true);
    expect(r.issues.map((i) => i.code)).toEqual(['roof-gap', 'roof-gap']);
    const broken = smallHouse();
    broken.levels[0]!.openings = broken.levels[0]!.openings.filter((o) => o.id !== 'w-bed');
    const r2 = run([{ op: 'rename_house', name: 'Still broken' }], broken);
    expect(r2.ok).toBe(true);
    expect(r2.issues.map((i) => i.code)).toEqual(['no-exterior-window']);
    // ...and a batch that fixes it is accepted with no issues.
    const r3 = run([{ op: 'add_opening', kind: 'window', host: { space: 'bed', side: 'S' }, width: 1500 }], broken);
    expect(r3.ok).toBe(true);
    expect(r3.issues).toEqual([]);
  });
});

describe('grid commands', () => {
  it('add_grid_line: generated id from the line to the west, relative position', () => {
    const r = run([{ op: 'add_grid_line', axis: 'x', relativeTo: { line: 'b', offset: 2000 } }]);
    const h = ok(r);
    expect(h.grid.x.map((g) => `${g.id}=${g.pos}`)).toEqual(['a=0', 'b=4000', 'ba=6000', 'c=8000', 'd=12000']);
    expect(r.applied[0]!.created).toEqual(['ba']);
    expect(r.applied[0]!.summary).toMatch(/Added X line "ba" at x=6000 \(2000 east of "b", 2000 west of "c"\)/);
    // Adding a line changes no space.
    expect(resolve(h).levels[0]!.spaces.map((s) => s.area)).toEqual(resolve(smallHouse()).levels[0]!.spaces.map((s) => s.area));
  });

  it('add_grid_line: failures', () => {
    expect(errors(run([{ op: 'add_grid_line', axis: 'x', pos: 4000 }]))[0]!.message).toMatch(/X line "b" is already at x=4000; use it/);
    expect(errorCodes(run([{ op: 'add_grid_line', axis: 'x', pos: 1, relativeTo: { line: 'a', offset: 1 } }]))).toEqual(['bad-args']);
    expect(errors(run([{ op: 'add_grid_line', axis: 'y', id: 'a', pos: 500 }]))[0]!.message).toMatch(/"a" is already used/);
    expect(errors(run([{ op: 'add_grid_line', axis: 'x', relativeTo: { line: '2', offset: 10 } }]))[0]!.message).toMatch(/Unknown X grid line "2"/);
  });

  it('move_grid_line: everything on the line follows on all levels; points inside cells stretch', () => {
    const h0 = smallHouse();
    h0.entourage = [{ kind: 'tree', at: [10000, 5000] }];
    const r = run([{ op: 'move_grid_line', line: 'c', by: 500 }], h0);
    const h = ok(r);
    const res = resolve(h);
    expect(res.levels[0]!.spaces.find((s) => s.id === 'bed')!.area).toBe(4500 * 4000);
    expect(res.levels[1]!.spaces.find((s) => s.id === 'stair2')!.area).toBe(4500 * 4000);
    expect(h.entourage![0]!.at).toEqual([10250, 5000]);
    expect(r.applied[0]!.summary).toMatch(/Moved X line "c" 500 mm east to 8500\. Bands: "b"-"c" now 4500 \(was 4000\); "c"-"d" now 3500 \(was 4000\)\. Spaces resized \(m²\): bed 16\.00->18\.00/);
  });

  it('move_grid_line: cannot cross a neighbour', () => {
    const r = run([{ op: 'move_grid_line', line: 'c', to: 12500 }]);
    expect(errors(r)[0]!.message).toMatch(/Line "c" \(x=8000\) can only move strictly between "b" at 4000 and "d" at 12000/);
  });

  it('remove_grid_line: only unused lines; the error lists the users', () => {
    const h = ok(run([{ op: 'add_grid_line', axis: 'y', id: 'y9', pos: 9000 }, { op: 'remove_grid_line', line: 'y9' }]));
    expect(h.grid.y.map((g) => g.id)).toEqual(['1', '2', '3', '4']);
    const r = run([{ op: 'remove_grid_line', line: 'b' }]);
    expect(errors(r)[0]!.message).toMatch(/Grid line "b" is still used by space "living" \(cells\), space "bed" \(cells\).*space "stair2" \(cells\)\. Change those first/);
  });
});

describe('level commands', () => {
  it('add_level copies a layout with re-prefixed ids and remapped references', () => {
    const r = run([
      { op: 'add_level', name: 'Top', copyFrom: 'L2' },
      { op: 'add_stair', space: 'stair2', kind: 'u', up: 'N' },
      { op: 'add_roof', kind: 'flat', cells: [c('a', 'c', '2', '3')], onLevel: 'L3' },
      { op: 'update_roof', roof: 'r-top', kind: 'flat', fall: null, pitchDeg: null },
    ]);
    const h = ok(r);
    expect(h.levels.map((l) => l.id)).toEqual(['L1', 'L2', 'L3']);
    expect(level(h, 'L3').spaces.map((s) => s.id)).toEqual(['l3-bed2', 'l3-stair2']);
    expect(opening(h, 'l3-d-bed2')!.host).toEqual({ between: ['l3-bed2', 'l3-stair2'] });
    expect(r.applied[0]!.created).toEqual(['L3', 'l3-bed2', 'l3-stair2', 'l3-d-bed2', 'l3-w-bed2']);
  });

  it('add_level: unknown references and stairs that now lead nowhere', () => {
    expect(errors(run([{ op: 'add_level', name: 'x', after: 'L3' }]))[0]!.message).toMatch(/Unknown level "L3". Nearest level ids: L1, L2.*Levels bottom to top: L1, L2/);
    // A copy of L1 on top: its stair climbs to nothing.
    const r = run([{ op: 'add_level', name: 'x', copyFrom: 'L1' }]);
    expect(errorCodes(r)).toContain('stair-misaligned');
  });

  it('remove_level drops its roofs; update_level changes height', () => {
    const r = run([{ op: 'remove_stair', stair: 's1' }, { op: 'remove_level', level: 'L2' }, { op: 'update_level', level: 'L1', height: 3200, name: 'Only' }]);
    const h = ok(r);
    expect(h.levels.map((l) => `${l.id}:${l.height}:${l.name}`)).toEqual(['L1:3200:Only']);
    expect(h.roofs.map((x) => x.id)).toEqual(['r-low']);
    expect(r.applied[1]!.removed).toEqual(['L2', 'bed2', 'stair2', 'd-bed2', 'w-bed2', 'r-top']);
  });

  it('remove_level / update_level failures', () => {
    expect(errorCodes(run([{ op: 'remove_level', level: 'L2' }]))).toContain('stair-misaligned');
    expect(errorCodes(run([{ op: 'update_level', level: 'L1' }]))).toEqual(['bad-args']);
    expect(errorCodes(run([{ op: 'update_level', level: 'L1', height: -1 }]))).toEqual(['command-schema']);
  });
});

describe('space commands', () => {
  const free = [c('a', 'b', '3', '4')];
  it('add_space: generated id; a door makes it reachable', () => {
    const r = run([
      { op: 'add_space', level: 'L2', name: 'Study', type: 'study', cells: [c('a', 'b', '1', '2')] },
      { op: 'add_opening', kind: 'door', host: { between: ['l2-study', 'bed2'] }, width: 800 },
      { op: 'add_roof', kind: 'flat', cells: [c('a', 'b', '1', '2')], onLevel: 'L2' },
    ]);
    const h = ok(r);
    expect(space(h, 'l2-study')!.type).toBe('study');
    expect(r.applied[0]!.summary).toMatch(/Added study "l2-study" on "L2": cells a-b\/1-2 \(4\.00 x 4\.00 m, 16\.00 m²\)/);
    expect(opening(h, 'l2-study-d')!.host).toEqual({ between: ['l2-study', 'bed2'], span: { from: 'a', to: 'b' } });
    expect(r.applied[2]!.created).toEqual(['roof-l2']);
  });

  it('add_space: overlapping cells, duplicate ids', () => {
    const r = run([{ op: 'add_space', level: 'L1', name: 'x', type: 'study', cells: [c('a', 'b', '1', '2')] }]);
    expect(errorCodes(r)).toEqual(['space-overlap']);
    expect(errorCodes(run([{ op: 'add_space', level: 'L1', id: 'bed', name: 'x', type: 'study', cells: free }]))).toEqual(['duplicate-id']);
  });

  it('update_space: fields change, null clears, openings keep their place', () => {
    const r = run([
      { op: 'update_space', space: 'bed', name: 'Master', nameEn: 'Master bedroom', cells: [c('b', 'd', '1', '2')] },
      { op: 'update_space', space: 'garden', cells: [c('c', 'd', '2', '4')] },
      { op: 'update_space', space: 'bed', nameEn: null },
    ]);
    const h = ok(r);
    expect(space(h, 'bed')).toEqual({ id: 'bed', name: 'Master', type: 'bedroom', cells: [c('b', 'd', '1', '2')] });
    expect(resolve(h).levels[0]!.openings.find((o) => o.id === 'w-bed')!.a).toEqual([5000, 0]);
  });

  it('update_space: an untouched opening that would jump to another wall blocks the batch', () => {
    // Shrinking the hall north wall... the entry door is on hall:N (line 3); make the hall half as deep.
    const h0 = smallHouse();
    h0.grid.y.push({ id: '2a', pos: 6000 });
    const r = run([
      { op: 'update_space', space: 'hall', cells: [c('a', 'b', '2', '2a')] },
      { op: 'add_space', level: 'L1', name: 'Store', type: 'storage', cells: [c('a', 'b', '2a', '3')], openTo: ['hall'] },
    ], h0);
    expect(errorCodes(r)).toEqual(['opening-moved']);
    expect(errors(r)[0]!.message).toMatch(/Opening "entry" was not edited in this batch, but it would jump from the wall on grid line 3 to grid line 2a.*Re-host it with update_opening/);
  });

  it('remove_space removes its openings and stairs and reports them', () => {
    const r = run([{ op: 'remove_space', space: 'bed2' }, { op: 'update_roof', roof: 'r-top', cells: [c('b', 'c', '2', '3')] }]);
    const h = ok(r);
    expect(r.applied[0]!.removed).toEqual(['bed2', 'd-bed2', 'w-bed2']);
    expect(level(h, 'L2').openings).toEqual([]);
    // Removing the only way into the bedroom fails validation.
    const bad = run([{ op: 'remove_space', space: 'living' }]);
    expect(bad.ok).toBe(false);
    expect(errorCodes(bad)).toContain('unreachable');
  });
});

describe('opening commands', () => {
  it('add_opening: span filled in when unambiguous, level from the host, defaults by kind', () => {
    const r = run([{ op: 'add_opening', kind: 'window', host: { space: 'stair2', side: 'E' }, width: 1200 }]);
    const h = ok(r);
    const o = opening(h, 'stair2-w')!;
    expect(o).toEqual({ id: 'stair2-w', kind: 'window', host: { space: 'stair2', side: 'E', span: { from: '2', to: '3' } }, at: 'center', width: 1200, height: 1500, sill: 900 });
    expect(level(h, 'L2').openings.map((x) => x.id)).toContain('stair2-w');
    expect(r.applied[0]!.summary).toMatch(/It sits at 5400\.\.6600 on grid line c \(exterior wall\)/);
  });

  it('add_opening: ambiguous host fails at command time with the spans', () => {
    const h0 = smallHouse();
    h0.levels[1]!.spaces[0]!.cells = [c('a', 'b', '2', '3'), c('a', 'c', '1', '2')];
    const r = run([{ op: 'add_opening', kind: 'window', host: { space: 'bed2', side: 'N' }, width: 1000 }], h0);
    expect(errorCodes(r)).toEqual(['ambiguous-host']);
    expect(errors(r)[0]!.message).toMatch(/the N side of "bed2" has 2 separate edges; add span.*b-c on line 2 \(4000 mm\); a-b on line 3/);
    const nb = run([{ op: 'add_opening', kind: 'door', host: { between: ['living', 'stair1'] }, width: 900 }]);
    expect(errors(nb)[0]!.message).toMatch(/"living" and "stair1" share no wall on level "L1". Spaces touching "living": bed, hall/);
    const lv = run([{ op: 'add_opening', kind: 'door', host: { between: ['living', 'bed2'] }, width: 900 }]);
    expect(errors(lv)[0]!.message).toMatch(/"living" is on level "L1" but "bed2" is on "L2"/);
  });

  it('update_opening: move along the wall, resize, re-host', () => {
    const r = run([
      { op: 'update_opening', opening: 'w-bed', move: { dir: 'E', by: 300 } },
      { op: 'update_opening', opening: 'w-living', width: 1800, canopy: null },
      { op: 'update_opening', opening: 'd-bed', host: { between: ['bed', 'stair1'] }, at: 'center' },
      { op: 'update_opening', opening: 'entry', swing: { into: 'hall', hinge: 'start' } },
    ]);
    const h = ok(r);
    const res = resolve(h).levels[0]!;
    expect(res.openings.find((o) => o.id === 'w-bed')!.a).toEqual([5300, 0]);
    expect(opening(h, 'w-bed')!.at).toEqual({ from: 'start', offset: 1300 });
    expect(res.openings.find((o) => o.id === 'd-bed')!.sides).toEqual(['bed', 'stair1']);
  });

  it('update_opening: wrong direction, too far, both move and at', () => {
    expect(errors(run([{ op: 'update_opening', opening: 'w-bed', move: { dir: 'N', by: 300 } }]))[0]!.message)
      .toMatch(/"w-bed" is in a wall running west-east \(grid line 1\), so it can only move E or W/);
    expect(errors(run([{ op: 'update_opening', opening: 'w-bed', move: { dir: 'E', by: 2000 } }]))[0]!.message)
      .toMatch(/past its span b-c \(4000\.\.8000\); it can move at most 1500 mm E or 1000 mm W/);
    expect(errorCodes(run([{ op: 'update_opening', opening: 'w-bed', move: { dir: 'E', by: 1 }, at: 'center' }]))).toEqual(['bad-args']);
  });

  it('remove_opening', () => {
    const h = ok(run([{ op: 'remove_opening', opening: 'w-living' }, { op: 'add_opening', kind: 'sliding-door', host: { space: 'living', side: 'S' }, width: 2400 }]));
    expect(opening(h, 'w-living')).toBeUndefined();
    expect(opening(h, 'living-sd')!.height).toBe(2400);
    expect(errorCodes(run([{ op: 'remove_opening', opening: 'entry' }]))).toContain('unreachable');
  });
});

describe('stair commands', () => {
  it('add_stair / remove_stair', () => {
    const r = run([{ op: 'remove_stair', stair: 's1' }, { op: 'add_stair', space: 'stair1', kind: 'straight', up: 'E' }]);
    const h = ok(r);
    expect(level(h, 'L1').stairs).toEqual([{ id: 'stair-l1', space: 'stair1', kind: 'straight', up: 'E' }]);
    expect(r.applied[1]!.summary).toMatch(/climbing E to "L2"/);
  });

  it('stair failures name both levels', () => {
    const top = run([{ op: 'add_stair', space: 'stair2', kind: 'u', up: 'N' }]);
    expect(errors(top)[0]!.message).toMatch(/"L2", the top level, so it leads nowhere/);
    expect(errorCodes(run([{ op: 'remove_stair', stair: 's1' }]))).toContain('unreachable');
    expect(errorCodes(run([{ op: 'add_stair', space: 'hall', kind: 'u', up: 'N' }]))).toContain('stair-space-type');
  });
});

describe('roof commands', () => {
  it('add_roof / update_roof / remove_roof', () => {
    const r = run([
      { op: 'add_roof', kind: 'canopy', cells: [c('a', 'b', '3', '4')], onLevel: 'L1' },
      { op: 'update_roof', roof: 'r-top', pitchDeg: 12, vergeOverhang: 200 },
      { op: 'remove_roof', roof: 'canopy-l1' },
      { op: 'add_roof', id: 'porch', kind: 'canopy', cells: [c('a', 'b', '3', '4')], onLevel: 'L1', height: 2600 },
    ]);
    const h = ok(r);
    expect(h.roofs.map((x) => x.id)).toEqual(['r-low', 'r-top', 'porch']);
    expect(h.roofs[1]!.pitchDeg).toBe(12);
    expect(r.applied[0]!.created).toEqual(['canopy-l1']);
  });

  it('roof failures', () => {
    expect(errors(run([{ op: 'add_roof', kind: 'mono', cells: [c('a', 'b', '3', '4')], onLevel: 'L5' }]))[0]!.message).toMatch(/Unknown level "L5"/);
    expect(errors(run([{ op: 'update_roof', roof: 'r-top', fall: null }]))[0]!.message).toMatch(/needs fall/);
    expect(errorCodes(run([{ op: 'remove_roof', roof: 'nope' }]))).toEqual(['unknown-id']);
  });
});

describe('site, style and name', () => {
  it('update_site / set_style / rename_house', () => {
    const h = ok(run([
      { op: 'update_site', latitude: 22.5, northDeg: 10, fence: { height: 1200, gates: [] } },
      { op: 'set_style', style: 'modern-flat' },
      { op: 'rename_house', name: 'Holiday house' },
      { op: 'update_site', fence: null, utcOffsetHours: 9 },
    ]));
    expect(h.site).toEqual({ width: 12000, depth: 10000, northDeg: 10, latitude: 22.5, longitude: 120, utcOffsetHours: 9 });
    expect(h.style).toBe('modern-flat');
    expect(h.name).toBe('Holiday house');
  });

  it('failures', () => {
    expect(errorCodes(run([{ op: 'update_site', width: 6000 }]))).toContain('outside-plot');
    expect(errorCodes(run([{ op: 'update_site', latitude: 100 }]))).toEqual(['command-schema']);
    expect(errorCodes(run([{ op: 'set_style', style: '' }]))).toEqual(['command-schema']);
    expect(errorCodes(run([{ op: 'rename_house' }]))).toEqual(['command-schema']);
  });
});

describe('JSON Schema for the edit_house tool', () => {
  it('covers every op with descriptions and no refs', () => {
    const schema = commandsJsonSchema() as { properties: { commands: { items: { oneOf: { properties: { op: { const: string } }; description?: string }[] } } } };
    const variants = schema.properties.commands.items.oneOf;
    expect(variants.map((v) => v.properties.op.const)).toEqual(COMMAND_OPS);
    expect(COMMAND_OPS).toHaveLength(20);
    for (const v of variants) expect(v.description?.length).toBeGreaterThan(10);
    expect(JSON.stringify(schema)).not.toMatch(/\$ref/);
    const tool = editHouseTool();
    expect(tool.name).toBe('edit_house');
    expect(tool.description).toMatch(/atomic/);
  });
});

describe('History', () => {
  it('undo / redo with a bounded stack', () => {
    const h0 = smallHouse();
    const hist = new History(h0, 2);
    expect(hist.apply([{ op: 'rename_house', name: 'A' }]).ok).toBe(true);
    expect(hist.apply([{ op: 'rename_house', name: 'B' }]).ok).toBe(true);
    expect(hist.apply([{ op: 'remove_opening', opening: 'w-bed' }]).ok).toBe(false);
    expect(hist.apply([{ op: 'rename_house', name: 'C' }]).ok).toBe(true);
    expect(hist.current.name).toBe('C');
    expect(hist.undoDepth).toBe(2);
    expect(hist.undo()!.name).toBe('B');
    expect(hist.undo()!.name).toBe('A');
    expect(hist.undo()).toBeNull();
    expect(hist.redo()!.name).toBe('B');
    hist.push(clone(h0));
    expect(hist.canRedo).toBe(false);
    expect(hist.current.name).toBe('Small test house');
    expect(validate(hist.current)).toEqual([]);
  });
});

describe('update_site: place and time zone', () => {
  it('sets and removes the place name and the IANA time zone; rejects unknown zones', () => {
    const r = run([{ op: 'update_site', latitude: 30.66, longitude: 104.06, northDeg: 15, placeName: '成都', timeZone: 'Asia/Shanghai' }]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.house.site).toMatchObject({ latitude: 30.66, longitude: 104.06, northDeg: 15, placeName: '成都', timeZone: 'Asia/Shanghai' });
    expect(resolve(r.house).site.timeZone).toBe('Asia/Shanghai');
    const back = run([{ op: 'update_site', placeName: null, timeZone: null }], r.house);
    expect(back.ok).toBe(true);
    if (back.ok) expect('placeName' in back.house.site || 'timeZone' in back.house.site).toBe(false);
    expect(run([{ op: 'update_site', timeZone: 'Mars/Olympus' }]).ok).toBe(false);
  });
});
