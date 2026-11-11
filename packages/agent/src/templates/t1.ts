// T1 "白墙坡顶小院" (default house). Our own design.
//
// Plot 12 m x 14 m, road to the south. An L-shaped white house: a two-storey
// main block across the north of the plot (12 x 6.6 m less a 0.9 m garden
// path on the west) and a single-storey wing to the south-west whose flat
// roof is the master bedroom's terrace. The L holds a sunny south courtyard
// with a timber deck in front of the living room; a carport under a canopy
// takes the south-east corner and shelters the front door.
//
//   X: 0=0  1=900  2=4500  2h=5700  3=9000  9=12000
//   Y: A=0  Bc=1500  B=2700  C=3900  Ca=5100  D=6300  Da=8100  E=10200  F=12900  Z=14000
import { c, gridLines, span, start } from './helpers';

export const T1_COMMANDS: readonly unknown[] = [
  { op: 'rename_house', name: '白墙坡顶小院' },
  { op: 'update_site', fence: { height: 1500, gates: [
    { id: 'gate-car', side: 'S', at: start(9150), width: 2700, kind: 'sliding' },
    { id: 'gate-garden', side: 'S', at: start(5400), width: 1200, kind: 'swing' },
  ] } },
  ...gridLines('x', [['1', 900], ['2', 4500], ['2h', 5700], ['3', 9000]]),
  ...gridLines('y', [['Bc', 1500], ['B', 2700], ['C', 3900], ['Ca', 5100], ['D', 6300], ['Da', 8100], ['E', 10200], ['F', 12900]]),
  { op: 'update_level', level: 'L1', name: '一层', height: 3300 },
  { op: 'add_level', id: 'L2', name: '二层', height: 3000 },

  // Ground floor.
  { op: 'add_space', level: 'L1', id: 'l1-elder', name: '老人房', nameEn: 'Bedroom', type: 'bedroom', cells: [c('1', '2', 'B', 'D')] },
  { op: 'add_space', level: 'L1', id: 'l1-dining', name: '餐厅', nameEn: 'Dining', type: 'dining', cells: [c('1', '2', 'D', 'E')], openTo: ['l1-living'] },
  { op: 'add_space', level: 'L1', id: 'l1-kitchen', name: '厨房', nameEn: 'Kitchen', type: 'kitchen', cells: [c('1', '2', 'E', 'F')] },
  { op: 'add_space', level: 'L1', id: 'l1-living', name: '客厅', nameEn: 'Living', type: 'living', cells: [c('2', '3', 'D', 'E'), c('2', '2h', 'E', 'F')], openTo: ['l1-dining', 'l1-stair', 'l1-entry'] },
  { op: 'add_space', level: 'L1', id: 'l1-stair', name: '楼梯', nameEn: 'Stair', type: 'stair', cells: [c('2h', '3', 'E', 'F')], openTo: ['l1-living'] },
  { op: 'add_space', level: 'L1', id: 'l1-entry', name: '门厅', nameEn: 'Entry hall', type: 'hall', cells: [c('3', '9', 'D', 'Da')], openTo: ['l1-living'] },
  { op: 'add_space', level: 'L1', id: 'l1-bath', name: '卫生间', nameEn: 'Bathroom', type: 'bathroom', cells: [c('3', '9', 'Da', 'E')] },
  { op: 'add_space', level: 'L1', id: 'l1-laundry', name: '洗衣房', nameEn: 'Laundry', type: 'laundry', cells: [c('3', '9', 'E', 'F')] },
  { op: 'add_space', level: 'L1', id: 'l1-deck', name: '平台', nameEn: 'Deck', type: 'courtyard', cells: [c('2', '3', 'C', 'D')], edge: 'none', surface: 'deck' },
  { op: 'add_space', level: 'L1', id: 'l1-garden', name: '花园', nameEn: 'Garden', type: 'garden', cells: [c('2', '3', 'A', 'C'), c('1', '2', 'A', 'B')], edge: 'none', surface: 'lawn' },
  { op: 'add_space', level: 'L1', id: 'l1-carport', name: '车位', nameEn: 'Carport', type: 'carport', cells: [c('3', '9', 'A', 'D')], edge: 'none' },
  { op: 'add_space', level: 'L1', id: 'l1-path', name: '侧院', nameEn: 'Side garden', type: 'garden', cells: [c('0', '1', 'A', 'Z'), c('1', '9', 'F', 'Z')], edge: 'none' },

  { op: 'add_opening', id: 'l1-w-elder-s', kind: 'window', host: { space: 'l1-elder', side: 'S' }, at: 'center', width: 1800, height: 1500, sill: 900, panel: 'start' },
  { op: 'add_opening', id: 'l1-w-elder-e', kind: 'window', host: { space: 'l1-elder', side: 'E', span: span('C', 'D') }, at: 'center', width: 1500, height: 1500, sill: 900 },
  { op: 'add_opening', id: 'l1-w-elder-w', kind: 'window', host: { space: 'l1-elder', side: 'W' }, at: start(2400), width: 900, height: 900, sill: 1300 },
  { op: 'add_opening', id: 'l1-d-elder', kind: 'door', host: { between: ['l1-elder', 'l1-dining'] }, at: start(2400), width: 900, height: 2100, sill: 0 },
  { op: 'add_opening', id: 'l1-w-dining', kind: 'window', host: { space: 'l1-dining', side: 'W' }, at: 'center', width: 1800, height: 1500, sill: 900 },
  { op: 'add_opening', id: 'l1-sd-kitchen', kind: 'sliding-door', host: { between: ['l1-kitchen', 'l1-dining'] }, at: start(900), width: 1800, height: 2100, sill: 0 },
  { op: 'add_opening', id: 'l1-w-kitchen', kind: 'window', host: { space: 'l1-kitchen', side: 'N' }, at: start(1200), width: 1800, height: 1200, sill: 1000 },
  { op: 'add_opening', id: 'l1-d-kitchen', kind: 'door', host: { space: 'l1-kitchen', side: 'W' }, at: 'center', width: 900, height: 2100, sill: 0 },
  { op: 'add_opening', id: 'l1-sd-living', kind: 'sliding-door', host: { space: 'l1-living', side: 'S' }, at: 'center', width: 3300, height: 2400, sill: 0 },
  { op: 'add_opening', id: 'l1-d-entry', kind: 'door', host: { space: 'l1-entry', side: 'S' }, at: start(900), width: 1100, height: 2400, sill: 0, panel: 'end' },
  { op: 'add_opening', id: 'l1-d-bath', kind: 'door', host: { between: ['l1-bath', 'l1-entry'] }, at: start(1800), width: 800, height: 2100, sill: 0 },
  { op: 'add_opening', id: 'l1-w-bath', kind: 'window', host: { space: 'l1-bath', side: 'E' }, at: 'center', width: 900, height: 600, sill: 1600 },
  { op: 'add_opening', id: 'l1-d-back', kind: 'door', host: { space: 'l1-laundry', side: 'N' }, at: start(300), width: 900, height: 2100, sill: 0, canopy: { depth: 700 } },
  { op: 'add_opening', id: 'l1-w-laundry', kind: 'window', host: { space: 'l1-laundry', side: 'E' }, at: 'center', width: 900, height: 900, sill: 1300 },
  { op: 'add_opening', id: 'l1-w-stair', kind: 'window', host: { space: 'l1-stair', side: 'N' }, at: 'center', width: 900, height: 4500, sill: 900, spanLevels: 2, insert: 'wood-panel' },
  { op: 'add_stair', id: 'stair-l1', space: 'l1-stair', kind: 'u', up: 'E' },

  // Upper floor.
  { op: 'add_space', level: 'L2', id: 'l2-master', name: '主卧', nameEn: 'Master bedroom', type: 'bedroom', cells: [c('1', '2', 'D', 'E')] },
  { op: 'add_space', level: 'L2', id: 'l2-mbath', name: '主卫', nameEn: 'Master bath', type: 'bathroom', cells: [c('1', '2', 'E', 'F')] },
  { op: 'add_space', level: 'L2', id: 'l2-family', name: '起居室', nameEn: 'Family room', type: 'family', cells: [c('2', '3', 'D', 'E')], openTo: ['l2-stair', 'l2-hall'] },
  { op: 'add_space', level: 'L2', id: 'l2-hall', name: '过厅', nameEn: 'Landing', type: 'hall', cells: [c('2', '2h', 'E', 'F')], openTo: ['l2-family', 'l2-stair'] },
  { op: 'add_space', level: 'L2', id: 'l2-stair', name: '楼梯', nameEn: 'Stair', type: 'stair', cells: [c('2h', '3', 'E', 'F')], openTo: ['l2-family', 'l2-hall'] },
  { op: 'add_space', level: 'L2', id: 'l2-bedroom', name: '次卧', nameEn: 'Bedroom', type: 'bedroom', cells: [c('3', '9', 'D', 'E')] },
  { op: 'add_space', level: 'L2', id: 'l2-bath', name: '卫生间', nameEn: 'Bathroom', type: 'bathroom', cells: [c('3', '9', 'E', 'F')] },
  { op: 'add_space', level: 'L2', id: 'l2-terrace', name: '露台', nameEn: 'Terrace', type: 'terrace', cells: [c('1', '2', 'B', 'D')], edge: 'glass-rail' },
  { op: 'add_space', level: 'L2', id: 'l2-balcony', name: '阳台', nameEn: 'Balcony', type: 'balcony', cells: [c('2', '3', 'Ca', 'D')], edge: 'glass-rail' },

  { op: 'add_opening', id: 'l2-sd-master', kind: 'sliding-door', host: { space: 'l2-master', side: 'S' }, at: 'center', width: 2400, height: 2300, sill: 0 },
  { op: 'add_opening', id: 'l2-w-master-w', kind: 'window', host: { space: 'l2-master', side: 'W' }, at: 'center', width: 1500, height: 1500, sill: 900, panel: 'end' },
  { op: 'add_opening', id: 'l2-d-master', kind: 'door', host: { between: ['l2-master', 'l2-family'] }, at: start(2700), width: 900, height: 2100, sill: 0 },
  { op: 'add_opening', id: 'l2-d-mbath', kind: 'door', host: { between: ['l2-mbath', 'l2-master'] }, at: start(2400), width: 800, height: 2100, sill: 0 },
  { op: 'add_opening', id: 'l2-w-mbath', kind: 'window', host: { space: 'l2-mbath', side: 'W' }, at: 'center', width: 900, height: 900, sill: 1400 },
  { op: 'add_opening', id: 'l2-sd-family', kind: 'sliding-door', host: { space: 'l2-family', side: 'S' }, at: 'center', width: 2700, height: 2300, sill: 0 },
  { op: 'add_opening', id: 'l2-d-bedroom', kind: 'door', host: { between: ['l2-bedroom', 'l2-family'] }, at: start(2700), width: 900, height: 2100, sill: 0 },
  { op: 'add_opening', id: 'l2-w-bedroom', kind: 'window', host: { space: 'l2-bedroom', side: 'S' }, at: 'center', width: 1800, height: 1800, sill: 600, panel: 'start' },
  { op: 'add_opening', id: 'l2-w-bedroom-e', kind: 'window', host: { space: 'l2-bedroom', side: 'E' }, at: 'center', width: 900, height: 900, sill: 1300 },
  { op: 'add_opening', id: 'l2-d-bath', kind: 'door', host: { between: ['l2-bath', 'l2-bedroom'] }, at: start(300), width: 800, height: 2100, sill: 0 },
  { op: 'add_opening', id: 'l2-w-bath', kind: 'window', host: { space: 'l2-bath', side: 'N' }, at: 'center', width: 900, height: 900, sill: 1400 },

  // Roofs: an east-west gable over the west and middle bays, a north-south
  // gable over the east bay (its gable end faces the street), a canopy over
  // the carport and the front door.
  { op: 'add_roof', id: 'roof-main', kind: 'gable', cells: [c('1', '3', 'D', 'F')], onLevel: 'L2', ridge: 'EW', pitchDeg: 27, overhang: 500 },
  { op: 'add_roof', id: 'roof-east', kind: 'gable', cells: [c('3', '9', 'D', 'F')], onLevel: 'L2', ridge: 'NS', pitchDeg: 45, overhang: 400 },
  { op: 'add_roof', id: 'canopy-carport', kind: 'canopy', cells: [c('3', '9', 'Bc', 'D')], onLevel: 'L1', height: 2900, overhang: 150 },
];
