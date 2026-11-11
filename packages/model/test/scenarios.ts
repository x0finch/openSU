// Scripted edit scenarios on the golden sample (task 009 part D): realistic
// command batches, written the way an LLM author would after reading
// `describeHouse(golden)`. Shared by the tests and the visual-check scripts.
import type { CellRect } from '../src/index';

const c = (x0: string, x1: string, y0: string, y1: string): CellRect => ({ x0, x1, y0, y1 });

export const SCENARIOS = {
  /** "Widen the living room by 600 mm": move its east line; the yard strip
   *  shrinks, and the master bedroom / terrace above follow. */
  widenLiving: [
    { op: 'move_grid_line', line: '10', by: 600 },
  ],

  /** "Add a bedroom with a window on level 2" in the free cells over the west
   *  courtyard. Two windows end up between rooms (the batch's warnings say
   *  so), so they are removed; the door replaces the hall's west window. */
  bedroomL2: [
    { op: 'add_space', level: 'L2', name: '卧室', nameEn: 'Bedroom', type: 'bedroom', cells: [c('1', '2', 'C', 'F')] },
    { op: 'add_opening', kind: 'window', host: { space: 'l2-bedroom', side: 'W' }, width: 1800 },
    { op: 'remove_opening', opening: 'l2-w-hall-w' },
    { op: 'remove_opening', opening: 'l2-w-bed-w' },
    { op: 'add_opening', kind: 'door', host: { between: ['l2-bedroom', 'l2-hall'] }, width: 900 },
    { op: 'add_roof', kind: 'flat', cells: [c('1', '2', 'C', 'F')], onLevel: 'L2' },
  ],

  /** "Move the kitchen window 300 mm east": the kitchen windows are in
   *  north-south walls, so "east" is refused with a hint; the follow-up
   *  moves the Chinese kitchen's east window 300 mm north. */
  kitchenWindowEast: [
    { op: 'update_opening', opening: 'gf-w-ckitchen-e', move: { dir: 'E', by: 300 } },
  ],
  kitchenWindowNorth: [
    { op: 'update_opening', opening: 'gf-w-ckitchen-e', move: { dir: 'N', by: 300 } },
  ],

  /** "Turn the study into a bedroom with an ensuite": a new X line splits off
   *  the east end of the attic corridor as the ensuite; the terrace door that
   *  was in that corridor's east wall moves to the family room. */
  studyToBedroom: [
    { op: 'add_grid_line', axis: 'x', relativeTo: { line: '6', offset: 2000 } },
    { op: 'update_space', space: 'l3-study', type: 'bedroom', name: '卧室', nameEn: 'Bedroom' },
    { op: 'update_space', space: 'l3-hall', cells: [c('2', '6a', 'E', 'F'), c('3', '5', 'F', 'H')] },
    { op: 'add_space', level: 'L3', name: '卫生间', nameEn: 'Ensuite', type: 'bathroom', cells: [c('6a', '7', 'E', 'F')] },
    { op: 'add_opening', kind: 'door', host: { between: ['l3-study', 'l3-bathroom'] }, width: 700 },
    { op: 'update_opening', opening: 'l3-d-terrace', host: { space: 'l3-family', side: 'E' }, at: { from: 'end', offset: 200 } },
  ],

  /** "Add a third full storey": copy level 2 above itself (the attic moves
   *  up). The copied tall windows now continue into the attic, so the
   *  originals on level 2 become ordinary windows. */
  thirdStorey: [
    { op: 'add_level', id: 'L2b', name: '三层', after: 'L2', copyFrom: 'L2' },
    { op: 'update_opening', opening: 'l2-w-east-tall', spanLevels: 1, height: 1500, sill: 900, insert: null },
    { op: 'update_opening', opening: 'l2-w-hall-w', spanLevels: 1, height: 1500, sill: 900, insert: null },
  ],

  /** Deliberately bad: a bedroom without a window and a door wider than its wall. */
  badBatch: [
    { op: 'add_space', level: 'L2', name: '卧室', type: 'bedroom', cells: [c('1', '2', 'C', 'F')] },
    { op: 'add_opening', kind: 'door', host: { between: ['l2-bedroom', 'l2-hall'] }, width: 2000 },
    { op: 'add_roof', kind: 'flat', cells: [c('1', '2', 'C', 'F')], onLevel: 'L2' },
  ],
} as const;
