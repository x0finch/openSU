// Built-in starting points. The starter is our own design (not the golden
// reference house): a two-storey 12 m x 10 m house on a 300 mm module,
// authored with the same commands the assistant uses, so it doubles as a
// worked example and as a regression check of the command layer.
import { applyCommands, type CellRect, type House } from '@opensu/model';

export interface BlankOptions {
  /** Plot size along X (west-east), mm. */
  width?: number;
  /** Plot size along Y (south-north), mm. */
  depth?: number;
  name?: string;
  /** Storey height of the single empty level, mm. */
  levelHeight?: number;
}

/**
 * An empty plot: the site, a grid with the plot's corner lines (X "0" / "9",
 * Y "A" / "Z") and one empty ground level. The assistant builds on it with
 * `edit_house`.
 */
export function blankHouse(opts: BlankOptions = {}): House {
  const width = snap(opts.width ?? 16800);
  const depth = snap(opts.depth ?? 18000);
  return {
    version: 1,
    name: opts.name ?? 'New house',
    site: { width, depth, northDeg: 0, latitude: 30.3, longitude: 120.2 },
    grid: {
      x: [{ id: '0', pos: 0 }, { id: '9', pos: width }],
      y: [{ id: 'A', pos: 0 }, { id: 'Z', pos: depth }],
    },
    levels: [{ id: 'L1', name: '一层', height: opts.levelHeight ?? 3300, spaces: [], openings: [], stairs: [] }],
    roofs: [],
    style: 'modern-pitched',
  };
}

const snap = (mm: number) => Math.max(3000, Math.round(mm / 300) * 300);

const c = (x0: string, x1: string, y0: string, y1: string): CellRect => ({ x0, x1, y0, y1 });
const start = (offset: number) => ({ from: 'start' as const, offset });

/**
 * The starter: plot 16.8 m x 18 m, house 12 m (three bays 4.8 / 2.7 / 4.5)
 * x 10.2 m (south rooms 4.8, two north rows 2.7) with a south garden.
 * Living room, front hall and an elder's bedroom face south on the ground
 * floor; dining, kitchen, bathroom and a study behind; the U stair is in the
 * middle bay. Upstairs: three bedrooms, a family room opening onto a
 * balcony that shelters the front door, two bathrooms stacked over the
 * ground-floor one, a gable roof running east-west.
 *
 *   X: 0=0  1=2400  1a=4800  2=7200  3=9900  3a=12300  4=14400  9=16800
 *   Y: A=0  Ba=3300 B=4800   C=9600  D=12300 E=15000   Z=18000
 */
export const STARTER_COMMANDS: readonly unknown[] = [
  { op: 'rename_house', name: '南向两层小楼' },
  { op: 'update_site', fence: { height: 1500, gates: [{ id: 'gate-s', side: 'S', at: start(7650), width: 1500, kind: 'swing' }] } },
  // Grid (west -> east, south -> north).
  ...([['1', 2400], ['1a', 4800], ['2', 7200], ['3', 9900], ['3a', 12300], ['4', 14400]] as const).map(([id, pos]) => ({ op: 'add_grid_line', axis: 'x', id, pos })),
  ...([['Ba', 3300], ['B', 4800], ['C', 9600], ['D', 12300], ['E', 15000]] as const).map(([id, pos]) => ({ op: 'add_grid_line', axis: 'y', id, pos })),
  { op: 'update_level', level: 'L1', name: '一层', height: 3300 },
  { op: 'add_level', id: 'L2', name: '二层', height: 3000 },

  // Ground floor.
  { op: 'add_space', level: 'L1', id: 'l1-living', name: '客厅', nameEn: 'Living', type: 'living', cells: [c('1', '2', 'B', 'C')], openTo: ['l1-hall', 'l1-dining'] },
  { op: 'add_space', level: 'L1', id: 'l1-hall', name: '门厅', nameEn: 'Entry hall', type: 'hall', cells: [c('2', '3', 'B', 'C')], openTo: ['l1-living', 'l1-stair'] },
  { op: 'add_space', level: 'L1', id: 'l1-bedroom', name: '老人房', nameEn: 'Bedroom', type: 'bedroom', cells: [c('3', '4', 'B', 'C')] },
  { op: 'add_space', level: 'L1', id: 'l1-dining', name: '餐厅', nameEn: 'Dining', type: 'dining', cells: [c('1', '2', 'C', 'D')], openTo: ['l1-living'] },
  { op: 'add_space', level: 'L1', id: 'l1-kitchen', name: '厨房', nameEn: 'Kitchen', type: 'kitchen', cells: [c('1', '2', 'D', 'E')] },
  { op: 'add_space', level: 'L1', id: 'l1-stair', name: '楼梯', nameEn: 'Stair', type: 'stair', cells: [c('2', '3', 'C', 'E')], openTo: ['l1-hall', 'l1-hall-e'] },
  { op: 'add_space', level: 'L1', id: 'l1-hall-e', name: '过厅', nameEn: 'Lobby', type: 'hall', cells: [c('3', '3a', 'C', 'D')], openTo: ['l1-stair'] },
  { op: 'add_space', level: 'L1', id: 'l1-bath', name: '卫生间', nameEn: 'Bathroom', type: 'bathroom', cells: [c('3a', '4', 'C', 'D')] },
  { op: 'add_space', level: 'L1', id: 'l1-study', name: '书房', nameEn: 'Study', type: 'study', cells: [c('3', '4', 'D', 'E')] },
  { op: 'add_space', level: 'L1', id: 'l1-garden', name: '前院', nameEn: 'Front garden', type: 'garden', cells: [c('0', '9', 'A', 'B')], edge: 'none', surface: 'lawn' },
  { op: 'add_space', level: 'L1', id: 'l1-yard', name: '后院', nameEn: 'Back yard', type: 'courtyard', cells: [c('0', '9', 'E', 'Z'), c('0', '1', 'B', 'E'), c('4', '9', 'B', 'E')], edge: 'none' },
  { op: 'add_opening', id: 'l1-d-entry', kind: 'door', host: { space: 'l1-hall', side: 'S' }, at: 'center', width: 1200, height: 2400 },
  { op: 'add_opening', id: 'l1-sd-living', kind: 'sliding-door', host: { space: 'l1-living', side: 'S' }, at: start(900), width: 3000, height: 2400 },
  { op: 'add_opening', id: 'l1-w-living', kind: 'window', host: { space: 'l1-living', side: 'W' }, at: 'center', width: 1500 },
  { op: 'add_opening', id: 'l1-w-dining', kind: 'window', host: { space: 'l1-dining', side: 'W' }, at: 'center', width: 1200 },
  { op: 'add_opening', id: 'l1-sd-kitchen', kind: 'sliding-door', host: { between: ['l1-kitchen', 'l1-dining'] }, at: start(600), width: 1800, height: 2100 },
  { op: 'add_opening', id: 'l1-w-kitchen', kind: 'window', host: { space: 'l1-kitchen', side: 'N' }, at: start(900), width: 1800, height: 1200, sill: 1000 },
  { op: 'add_opening', id: 'l1-d-kitchen', kind: 'door', host: { space: 'l1-kitchen', side: 'W' }, at: 'center', width: 900 },
  { op: 'add_opening', id: 'l1-d-bedroom', kind: 'door', host: { between: ['l1-bedroom', 'l1-hall-e'] }, at: start(600), width: 900 },
  { op: 'add_opening', id: 'l1-w-bedroom', kind: 'window', host: { space: 'l1-bedroom', side: 'S' }, at: 'center', width: 2100 },
  { op: 'add_opening', id: 'l1-w-bedroom-e', kind: 'window', host: { space: 'l1-bedroom', side: 'E' }, at: 'center', width: 900 },
  { op: 'add_opening', id: 'l1-d-bath', kind: 'door', host: { between: ['l1-bath', 'l1-hall-e'] }, at: 'center', width: 800 },
  { op: 'add_opening', id: 'l1-w-bath', kind: 'window', host: { space: 'l1-bath', side: 'E' }, at: 'center', width: 900, height: 900, sill: 1500 },
  { op: 'add_opening', id: 'l1-d-study', kind: 'door', host: { between: ['l1-study', 'l1-hall-e'] }, at: start(600), width: 900 },
  { op: 'add_opening', id: 'l1-w-study', kind: 'window', host: { space: 'l1-study', side: 'N' }, at: 'center', width: 1800 },
  { op: 'add_stair', id: 'stair-l1', space: 'l1-stair', kind: 'u', up: 'N' },

  // Upper floor.
  { op: 'add_space', level: 'L2', id: 'l2-master', name: '主卧', nameEn: 'Master bedroom', type: 'bedroom', cells: [c('1', '2', 'B', 'C')] },
  { op: 'add_space', level: 'L2', id: 'l2-family', name: '起居室', nameEn: 'Family room', type: 'family', cells: [c('2', '3', 'B', 'C')], openTo: ['l2-stair'] },
  { op: 'add_space', level: 'L2', id: 'l2-bedroom', name: '次卧', nameEn: 'Bedroom', type: 'bedroom', cells: [c('3', '4', 'B', 'C')] },
  { op: 'add_space', level: 'L2', id: 'l2-bath', name: '卫生间', nameEn: 'Bathroom', type: 'bathroom', cells: [c('1', '1a', 'C', 'D')] },
  { op: 'add_space', level: 'L2', id: 'l2-hall-w', name: '过厅', nameEn: 'Lobby', type: 'hall', cells: [c('1a', '2', 'C', 'D')], openTo: ['l2-stair'] },
  { op: 'add_space', level: 'L2', id: 'l2-kids', name: '儿童房', nameEn: 'Bedroom', type: 'bedroom', cells: [c('1', '2', 'D', 'E')] },
  { op: 'add_space', level: 'L2', id: 'l2-stair', name: '楼梯', nameEn: 'Stair', type: 'stair', cells: [c('2', '3', 'C', 'E')], openTo: ['l2-family', 'l2-hall-w', 'l2-hall-e'] },
  { op: 'add_space', level: 'L2', id: 'l2-hall-e', name: '过厅', nameEn: 'Lobby', type: 'hall', cells: [c('3', '3a', 'C', 'D')], openTo: ['l2-stair'] },
  { op: 'add_space', level: 'L2', id: 'l2-bath-e', name: '卫生间', nameEn: 'Bathroom', type: 'bathroom', cells: [c('3a', '4', 'C', 'D')] },
  { op: 'add_space', level: 'L2', id: 'l2-study', name: '书房', nameEn: 'Study', type: 'study', cells: [c('3', '4', 'D', 'E')] },
  { op: 'add_space', level: 'L2', id: 'l2-balcony', name: '阳台', nameEn: 'Balcony', type: 'balcony', cells: [c('2', '3', 'Ba', 'B')], edge: 'glass-rail' },
  { op: 'add_opening', id: 'l2-sd-family', kind: 'sliding-door', host: { space: 'l2-family', side: 'S' }, at: 'center', width: 2100, height: 2400 },
  { op: 'add_opening', id: 'l2-w-master', kind: 'window', host: { space: 'l2-master', side: 'S' }, at: 'center', width: 2400 },
  { op: 'add_opening', id: 'l2-w-master-w', kind: 'window', host: { space: 'l2-master', side: 'W' }, at: 'center', width: 900 },
  { op: 'add_opening', id: 'l2-d-master', kind: 'door', host: { between: ['l2-master', 'l2-hall-w'] }, at: start(600), width: 900 },
  { op: 'add_opening', id: 'l2-w-bedroom', kind: 'window', host: { space: 'l2-bedroom', side: 'S' }, at: 'center', width: 2100 },
  { op: 'add_opening', id: 'l2-d-bedroom', kind: 'door', host: { between: ['l2-bedroom', 'l2-hall-e'] }, at: start(600), width: 900 },
  { op: 'add_opening', id: 'l2-d-bath', kind: 'door', host: { between: ['l2-bath', 'l2-hall-w'] }, at: 'center', width: 800 },
  { op: 'add_opening', id: 'l2-w-bath', kind: 'window', host: { space: 'l2-bath', side: 'W' }, at: 'center', width: 900, height: 900, sill: 1500 },
  { op: 'add_opening', id: 'l2-d-kids', kind: 'door', host: { between: ['l2-kids', 'l2-hall-w'] }, at: start(600), width: 900 },
  { op: 'add_opening', id: 'l2-w-kids', kind: 'window', host: { space: 'l2-kids', side: 'N' }, at: 'center', width: 1800 },
  { op: 'add_opening', id: 'l2-w-kids-w', kind: 'window', host: { space: 'l2-kids', side: 'W' }, at: 'center', width: 900 },
  { op: 'add_opening', id: 'l2-d-bath-e', kind: 'door', host: { between: ['l2-bath-e', 'l2-hall-e'] }, at: 'center', width: 800 },
  { op: 'add_opening', id: 'l2-w-bath-e', kind: 'window', host: { space: 'l2-bath-e', side: 'E' }, at: 'center', width: 900, height: 900, sill: 1500 },
  { op: 'add_opening', id: 'l2-d-study', kind: 'door', host: { between: ['l2-study', 'l2-hall-e'] }, at: start(600), width: 900 },
  { op: 'add_opening', id: 'l2-w-study', kind: 'window', host: { space: 'l2-study', side: 'N' }, at: 'center', width: 1800 },
  { op: 'add_opening', id: 'l2-w-stair', kind: 'window', host: { space: 'l2-stair', side: 'N' }, at: 'center', width: 1200 },
  { op: 'add_roof', id: 'roof-main', kind: 'gable', cells: [c('1', '4', 'B', 'E')], onLevel: 'L2', ridge: 'EW', pitchDeg: 26, overhang: 600 },
];

/** The starter house, built from `blankHouse()` with `STARTER_COMMANDS`. */
export function starterHouse(): House {
  const r = applyCommands(blankHouse({ width: 16800, depth: 18000, name: 'Starter' }), STARTER_COMMANDS);
  if (!r.ok) {
    const msg = r.issues.filter((i) => i.severity === 'error').map((i) => `${i.code}: ${i.message}`).join('\n');
    throw new Error(`starter house does not validate:\n${msg}`);
  }
  return r.house;
}
