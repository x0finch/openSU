// T2 "平顶现代". Our own design.
//
// Plot 10 m x 12 m, road to the south. A three-storey flat-roofed house that
// steps back towards the north: the second floor is set back 1.5 m behind
// the ground floor (a terrace along the whole south front that also roofs
// the entrance porch), and the top floor keeps only its west half on the
// south side, leaving a roof terrace in front of the tea room. A U stair
// runs east-west along the north wall with a top-lit landing hall in front
// of it on every floor; bathrooms stack in the west column, kitchen, study
// and tea room in the east one. Front garden with a large tree, a paved
// forecourt, bamboo along the side paths.
//
//   X: 0=0  1=900  1c=3000  2=4800  2c=6600  3=9000  9=10000
//   Y: A=0  B=3000  Ba=4500  C=7500  Cc=8700  D=11400  Z=12000
import { c, gridLines, start } from './helpers';

export const T2_COMMANDS: readonly unknown[] = [
  { op: 'rename_house', name: '平顶现代' },
  { op: 'set_style', style: 'modern-flat' },
  { op: 'update_site', fence: { height: 1500, gates: [
    { id: 'gate-s', side: 'S', at: start(6900), width: 1500, kind: 'swing' },
  ] } },
  ...gridLines('x', [['1', 900], ['1c', 3000], ['2', 4800], ['2c', 6600], ['3', 9000]]),
  ...gridLines('y', [['B', 3000], ['Ba', 4500], ['C', 7500], ['Cc', 8700], ['D', 11400]]),
  { op: 'update_level', level: 'L1', name: '一层', height: 3300 },
  { op: 'add_level', id: 'L2', name: '二层', height: 3000 },
  { op: 'add_level', id: 'L3', name: '三层', height: 3000 },

  // Ground floor: living and dining open to each other and to the stair hall.
  { op: 'add_space', level: 'L1', id: 'l1-living', name: '客厅', nameEn: 'Living', type: 'living', cells: [c('1', '2', 'B', 'C')], openTo: ['l1-dining', 'l1-hall'] },
  { op: 'add_space', level: 'L1', id: 'l1-dining', name: '餐厅', nameEn: 'Dining', type: 'dining', cells: [c('2', '3', 'Ba', 'C')], openTo: ['l1-living', 'l1-hall'] },
  { op: 'add_space', level: 'L1', id: 'l1-hall', name: '过厅', nameEn: 'Hall', type: 'hall', cells: [c('1c', '2c', 'C', 'Cc')], openTo: ['l1-living', 'l1-dining', 'l1-stair'] },
  { op: 'add_space', level: 'L1', id: 'l1-stair', name: '楼梯', nameEn: 'Stair', type: 'stair', cells: [c('1c', '2c', 'Cc', 'D')], openTo: ['l1-hall'] },
  { op: 'add_space', level: 'L1', id: 'l1-porch', name: '入户', nameEn: 'Porch', type: 'porch', cells: [c('2', '3', 'B', 'Ba')], edge: 'none' },
  { op: 'add_space', level: 'L1', id: 'l1-bath', name: '卫生间', nameEn: 'Bathroom', type: 'bathroom', cells: [c('1', '1c', 'C', 'D')] },
  { op: 'add_space', level: 'L1', id: 'l1-kitchen', name: '厨房', nameEn: 'Kitchen', type: 'kitchen', cells: [c('2c', '3', 'C', 'D')] },
  { op: 'add_space', level: 'L1', id: 'l1-garden', name: '前院', nameEn: 'Front garden', type: 'garden', cells: [c('0', '2c', 'A', 'B')], edge: 'none', surface: 'lawn' },
  { op: 'add_space', level: 'L1', id: 'l1-forecourt', name: '前庭', nameEn: 'Forecourt', type: 'courtyard', cells: [c('2c', '9', 'A', 'B')], edge: 'none' },
  { op: 'add_space', level: 'L1', id: 'l1-side', name: '侧院', nameEn: 'Side garden', type: 'garden', cells: [c('0', '1', 'B', 'Z'), c('1', '3', 'D', 'Z'), c('3', '9', 'B', 'Z')], edge: 'none' },

  { op: 'add_opening', id: 'l1-sd-living', kind: 'sliding-door', host: { space: 'l1-living', side: 'S' }, at: 'center', width: 3000, height: 2400, sill: 0 },
  { op: 'add_opening', id: 'l1-w-living', kind: 'window', host: { space: 'l1-living', side: 'W' }, at: 'center', width: 1500, height: 1500, sill: 900 },
  { op: 'add_opening', id: 'l1-d-entry', kind: 'door', host: { space: 'l1-dining', side: 'S' }, at: start(2700), width: 1100, height: 2400, sill: 0, panel: 'start' },
  { op: 'add_opening', id: 'l1-w-dining', kind: 'window', host: { space: 'l1-dining', side: 'S' }, at: start(300), width: 1500, height: 1500, sill: 900 },
  { op: 'add_opening', id: 'l1-w-dining-e', kind: 'window', host: { space: 'l1-dining', side: 'E' }, at: 'center', width: 1500, height: 1500, sill: 900 },
  { op: 'add_opening', id: 'l1-sd-kitchen', kind: 'sliding-door', host: { between: ['l1-kitchen', 'l1-hall'] }, at: start(150), width: 900, height: 2100, sill: 0 },
  { op: 'add_opening', id: 'l1-w-kitchen', kind: 'window', host: { space: 'l1-kitchen', side: 'E' }, at: start(1800), width: 1500, height: 1200, sill: 1000 },
  { op: 'add_opening', id: 'l1-w-kitchen-n', kind: 'window', host: { space: 'l1-kitchen', side: 'N' }, at: 'center', width: 900, height: 1200, sill: 1000 },
  { op: 'add_opening', id: 'l1-d-kitchen', kind: 'door', host: { between: ['l1-kitchen', 'l1-dining'] }, at: start(600), width: 900, height: 2100, sill: 0 },
  { op: 'add_opening', id: 'l1-d-bath', kind: 'door', host: { between: ['l1-bath', 'l1-hall'] }, at: 'center', width: 800, height: 2100, sill: 0 },
  { op: 'add_opening', id: 'l1-w-bath', kind: 'window', host: { space: 'l1-bath', side: 'W' }, at: 'center', width: 900, height: 600, sill: 1600 },
  { op: 'add_opening', id: 'l1-w-stair', kind: 'window', host: { space: 'l1-stair', side: 'N' }, at: 'center', width: 1200, height: 7800, sill: 900, spanLevels: 3, insert: 'wood-panel' },
  { op: 'add_stair', id: 'stair-l1', space: 'l1-stair', kind: 'u', up: 'E' },

  // Second floor: two south bedrooms onto the long terrace, a study to the north.
  { op: 'add_space', level: 'L2', id: 'l2-bed-w', name: '次卧', nameEn: 'Bedroom', type: 'bedroom', cells: [c('1', '2', 'Ba', 'C')] },
  { op: 'add_space', level: 'L2', id: 'l2-bed-e', name: '儿童房', nameEn: 'Bedroom', type: 'bedroom', cells: [c('2', '3', 'Ba', 'C')] },
  { op: 'add_space', level: 'L2', id: 'l2-hall', name: '过厅', nameEn: 'Landing', type: 'hall', cells: [c('1c', '2c', 'C', 'Cc')], openTo: ['l2-stair'] },
  { op: 'add_space', level: 'L2', id: 'l2-stair', name: '楼梯', nameEn: 'Stair', type: 'stair', cells: [c('1c', '2c', 'Cc', 'D')], openTo: ['l2-hall'] },
  { op: 'add_space', level: 'L2', id: 'l2-bath', name: '卫生间', nameEn: 'Bathroom', type: 'bathroom', cells: [c('1', '1c', 'C', 'D')] },
  { op: 'add_space', level: 'L2', id: 'l2-study', name: '书房', nameEn: 'Study', type: 'study', cells: [c('2c', '3', 'C', 'D')] },
  { op: 'add_space', level: 'L2', id: 'l2-terrace', name: '露台', nameEn: 'Terrace', type: 'terrace', cells: [c('1', '3', 'B', 'Ba')], edge: 'glass-rail' },

  { op: 'add_opening', id: 'l2-sd-bed-w', kind: 'sliding-door', host: { space: 'l2-bed-w', side: 'S' }, at: start(600), width: 2400, height: 2300, sill: 0 },
  { op: 'add_opening', id: 'l2-w-bed-w', kind: 'window', host: { space: 'l2-bed-w', side: 'W' }, at: 'center', width: 1200, height: 1500, sill: 900, panel: 'start' },
  { op: 'add_opening', id: 'l2-d-bed-w', kind: 'door', host: { between: ['l2-bed-w', 'l2-hall'] }, at: start(600), width: 900, height: 2100, sill: 0 },
  { op: 'add_opening', id: 'l2-sd-bed-e', kind: 'sliding-door', host: { space: 'l2-bed-e', side: 'S' }, at: start(1200), width: 2400, height: 2300, sill: 0 },
  { op: 'add_opening', id: 'l2-w-bed-e', kind: 'window', host: { space: 'l2-bed-e', side: 'E' }, at: 'center', width: 1200, height: 1500, sill: 900 },
  { op: 'add_opening', id: 'l2-d-bed-e', kind: 'door', host: { between: ['l2-bed-e', 'l2-hall'] }, at: start(300), width: 900, height: 2100, sill: 0 },
  { op: 'add_opening', id: 'l2-d-bath', kind: 'door', host: { between: ['l2-bath', 'l2-hall'] }, at: 'center', width: 800, height: 2100, sill: 0 },
  { op: 'add_opening', id: 'l2-w-bath', kind: 'window', host: { space: 'l2-bath', side: 'W' }, at: 'center', width: 900, height: 600, sill: 1600 },
  { op: 'add_opening', id: 'l2-d-study', kind: 'door', host: { between: ['l2-study', 'l2-hall'] }, at: 'center', width: 900, height: 2100, sill: 0 },
  { op: 'add_opening', id: 'l2-w-study', kind: 'window', host: { space: 'l2-study', side: 'N' }, at: 'center', width: 1200, height: 1500, sill: 900 },
  { op: 'add_opening', id: 'l2-w-study-e', kind: 'window', host: { space: 'l2-study', side: 'E' }, at: 'center', width: 1800, height: 1500, sill: 900 },
  { op: 'add_stair', id: 'stair-l2', space: 'l2-stair', kind: 'u', up: 'E' },

  // Top floor: master suite to the south-west, tea room onto the roof terrace.
  { op: 'add_space', level: 'L3', id: 'l3-master', name: '主卧', nameEn: 'Master bedroom', type: 'bedroom', cells: [c('1', '2', 'Ba', 'C')] },
  { op: 'add_space', level: 'L3', id: 'l3-hall', name: '过厅', nameEn: 'Landing', type: 'hall', cells: [c('1c', '2c', 'C', 'Cc')], openTo: ['l3-stair'] },
  { op: 'add_space', level: 'L3', id: 'l3-stair', name: '楼梯', nameEn: 'Stair', type: 'stair', cells: [c('1c', '2c', 'Cc', 'D')], openTo: ['l3-hall'] },
  { op: 'add_space', level: 'L3', id: 'l3-mbath', name: '主卫', nameEn: 'Master bath', type: 'bathroom', cells: [c('1', '1c', 'C', 'D')] },
  { op: 'add_space', level: 'L3', id: 'l3-tea', name: '茶室', nameEn: 'Tea room', type: 'study', cells: [c('2c', '3', 'C', 'D')] },
  { op: 'add_space', level: 'L3', id: 'l3-terrace', name: '屋顶露台', nameEn: 'Roof terrace', type: 'terrace', cells: [c('2', '3', 'Ba', 'C')], edge: 'parapet' },

  { op: 'add_opening', id: 'l3-w-master', kind: 'window', host: { space: 'l3-master', side: 'S' }, at: 'center', width: 2400, height: 1800, sill: 600 },
  { op: 'add_opening', id: 'l3-w-master-w', kind: 'window', host: { space: 'l3-master', side: 'W' }, at: 'center', width: 1200, height: 1500, sill: 900, panel: 'end' },
  { op: 'add_opening', id: 'l3-sd-master', kind: 'sliding-door', host: { between: ['l3-master', 'l3-terrace'] }, at: 'center', width: 1500, height: 2300, sill: 0 },
  { op: 'add_opening', id: 'l3-d-master', kind: 'door', host: { between: ['l3-master', 'l3-hall'] }, at: start(600), width: 900, height: 2100, sill: 0 },
  { op: 'add_opening', id: 'l3-d-mbath', kind: 'door', host: { between: ['l3-mbath', 'l3-hall'] }, at: 'center', width: 800, height: 2100, sill: 0 },
  { op: 'add_opening', id: 'l3-w-mbath', kind: 'window', host: { space: 'l3-mbath', side: 'W' }, at: start(1500), width: 1200, height: 900, sill: 1300 },
  { op: 'add_opening', id: 'l3-sd-hall', kind: 'sliding-door', host: { between: ['l3-hall', 'l3-terrace'] }, at: 'center', width: 1200, height: 2300, sill: 0 },
  { op: 'add_opening', id: 'l3-sd-tea', kind: 'sliding-door', host: { between: ['l3-tea', 'l3-terrace'] }, at: 'center', width: 1800, height: 2300, sill: 0 },
  { op: 'add_opening', id: 'l3-d-tea', kind: 'door', host: { between: ['l3-tea', 'l3-hall'] }, at: 'center', width: 900, height: 2100, sill: 0 },
  { op: 'add_opening', id: 'l3-w-tea-e', kind: 'window', host: { space: 'l3-tea', side: 'E' }, at: 'center', width: 1500, height: 1500, sill: 900, panel: 'start' },
  { op: 'add_opening', id: 'l3-w-tea-n', kind: 'window', host: { space: 'l3-tea', side: 'N' }, at: 'center', width: 900, height: 900, sill: 1300 },

  // A flat roof over the top floor.
  { op: 'add_roof', id: 'roof-top', kind: 'flat', cells: [c('1', '2', 'Ba', 'C'), c('1', '3', 'C', 'D')], onLevel: 'L3', overhang: 300 },
];
