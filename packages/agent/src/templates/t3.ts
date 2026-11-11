// T3 "三合院". Our own design.
//
// Plot 15 m x 15 m, road to the south. A U-shaped courtyard house: a
// two-storey main hall across the north under an east-west gable roof, and
// two single-storey wings (tea room and kitchen to the west, the elders'
// bedroom to the east) under mono-pitch roofs that fall towards the
// courtyard. A timber veranda under a canopy runs along the living room;
// the courtyard opens onto a south garden with the gate on the axis. A U
// stair behind the living room climbs to the family room, two bedrooms and
// a study upstairs.
//
//   X: 0=0  1=900  1m=2700  2=4500  2s=5700  3s=9300  3=10500  4=14100  9=15000
//   Y: A=0  C=1800  Cw=4500  Cd=5700  D=6900  Dq=9000  Da=11100  E=14100  Z=15000
import { c, end, gridLines, span, start } from './helpers';

export const T3_COMMANDS: readonly unknown[] = [
  { op: 'rename_house', name: '三合院' },
  { op: 'update_site', fence: { height: 1800, gates: [
    { id: 'gate-s', side: 'S', at: 'center', width: 1800, kind: 'swing' },
  ] } },
  ...gridLines('x', [['1', 900], ['1m', 2700], ['2', 4500], ['2s', 5700], ['3s', 9300], ['3', 10500], ['4', 14100]]),
  ...gridLines('y', [['C', 1800], ['Cw', 4500], ['Cd', 5700], ['D', 6900], ['Dq', 9000], ['Da', 11100], ['E', 14100]]),
  { op: 'update_level', level: 'L1', name: '一层', height: 3300 },
  { op: 'add_level', id: 'L2', name: '二层', height: 3000 },

  // Ground floor: the main hall.
  { op: 'add_space', level: 'L1', id: 'l1-living', name: '堂屋', nameEn: 'Living hall', type: 'living', cells: [c('2', '3', 'D', 'Da')], openTo: ['l1-dining', 'l1-hall', 'l1-stair'] },
  { op: 'add_space', level: 'L1', id: 'l1-dining', name: '餐厅', nameEn: 'Dining', type: 'dining', cells: [c('1', '2', 'D', 'Da')], openTo: ['l1-living'] },
  { op: 'add_space', level: 'L1', id: 'l1-hall', name: '过厅', nameEn: 'Hall', type: 'hall', cells: [c('2', '2s', 'Da', 'E')], openTo: ['l1-living', 'l1-stair'] },
  { op: 'add_space', level: 'L1', id: 'l1-stair', name: '楼梯', nameEn: 'Stair', type: 'stair', cells: [c('2s', '3s', 'Da', 'E')], openTo: ['l1-living', 'l1-hall'] },
  { op: 'add_space', level: 'L1', id: 'l1-store', name: '储藏', nameEn: 'Storage', type: 'storage', cells: [c('3s', '3', 'Da', 'E')] },
  { op: 'add_space', level: 'L1', id: 'l1-laundry', name: '洗衣房', nameEn: 'Laundry', type: 'laundry', cells: [c('1', '2', 'Da', 'E')] },
  { op: 'add_space', level: 'L1', id: 'l1-bath', name: '卫生间', nameEn: 'Bathroom', type: 'bathroom', cells: [c('3', '4', 'D', 'Dq')] },
  { op: 'add_space', level: 'L1', id: 'l1-guest', name: '客房', nameEn: 'Guest room', type: 'bedroom', cells: [c('3', '4', 'Dq', 'E')] },
  // The wings.
  { op: 'add_space', level: 'L1', id: 'l1-tea', name: '茶室', nameEn: 'Tea room', type: 'study', cells: [c('1', '2', 'C', 'Cw')] },
  { op: 'add_space', level: 'L1', id: 'l1-kitchen', name: '厨房', nameEn: 'Kitchen', type: 'kitchen', cells: [c('1', '2', 'Cw', 'D')] },
  { op: 'add_space', level: 'L1', id: 'l1-elder', name: '老人房', nameEn: 'Bedroom', type: 'bedroom', cells: [c('3', '4', 'C', 'D')] },
  // Outdoor: the courtyard with its veranda, the south garden, side and back paths.
  { op: 'add_space', level: 'L1', id: 'l1-veranda', name: '檐廊', nameEn: 'Veranda', type: 'courtyard', cells: [c('2', '3', 'Cd', 'D')], edge: 'none', surface: 'deck' },
  { op: 'add_space', level: 'L1', id: 'l1-court', name: '庭院', nameEn: 'Courtyard', type: 'courtyard', cells: [c('2', '3', 'C', 'Cd')], edge: 'none' },
  { op: 'add_space', level: 'L1', id: 'l1-garden', name: '前院', nameEn: 'Front garden', type: 'garden', cells: [c('0', '9', 'A', 'C')], edge: 'none', surface: 'lawn' },
  { op: 'add_space', level: 'L1', id: 'l1-side', name: '侧院', nameEn: 'Side garden', type: 'garden', cells: [c('0', '1', 'C', 'Z'), c('1', '4', 'E', 'Z'), c('4', '9', 'C', 'Z')], edge: 'none' },

  { op: 'add_opening', id: 'l1-sd-living', kind: 'sliding-door', host: { space: 'l1-living', side: 'S' }, at: 'center', width: 3000, height: 2600, sill: 0 },
  { op: 'add_opening', id: 'l1-w-living-w', kind: 'window', host: { space: 'l1-living', side: 'S' }, at: start(400), width: 900, height: 2600, sill: 0, insert: 'wood-panel' },
  { op: 'add_opening', id: 'l1-w-living-e', kind: 'window', host: { space: 'l1-living', side: 'S' }, at: end(400), width: 900, height: 2600, sill: 0, insert: 'wood-panel' },
  { op: 'add_opening', id: 'l1-w-dining', kind: 'window', host: { space: 'l1-dining', side: 'W' }, at: 'center', width: 1800, height: 1500, sill: 900 },
  { op: 'add_opening', id: 'l1-d-kitchen', kind: 'door', host: { between: ['l1-kitchen', 'l1-dining'] }, at: start(1500), width: 900, height: 2100, sill: 0 },
  { op: 'add_opening', id: 'l1-w-kitchen', kind: 'window', host: { space: 'l1-kitchen', side: 'E', span: span('Cw', 'Cd') }, at: 'center', width: 900, height: 1200, sill: 1000 },
  { op: 'add_opening', id: 'l1-w-kitchen-w', kind: 'window', host: { space: 'l1-kitchen', side: 'W' }, at: 'center', width: 1200, height: 1200, sill: 1000 },
  { op: 'add_opening', id: 'l1-sd-tea', kind: 'sliding-door', host: { space: 'l1-tea', side: 'E' }, at: 'center', width: 1800, height: 2400, sill: 0 },
  { op: 'add_opening', id: 'l1-w-tea', kind: 'window', host: { space: 'l1-tea', side: 'S' }, at: 'center', width: 2100, height: 1500, sill: 600, panel: 'start' },
  { op: 'add_opening', id: 'l1-d-elder', kind: 'door', host: { space: 'l1-elder', side: 'W', span: span('C', 'Cd') }, at: end(400), width: 1000, height: 2400, sill: 0 },
  { op: 'add_opening', id: 'l1-w-elder-w', kind: 'window', host: { space: 'l1-elder', side: 'W', span: span('C', 'Cd') }, at: start(500), width: 1500, height: 1500, sill: 900 },
  { op: 'add_opening', id: 'l1-w-elder-s', kind: 'window', host: { space: 'l1-elder', side: 'S' }, at: 'center', width: 1800, height: 1500, sill: 900, panel: 'end' },
  { op: 'add_opening', id: 'l1-d-elder-bath', kind: 'door', host: { between: ['l1-elder', 'l1-bath'] }, at: start(2400), width: 800, height: 2100, sill: 0 },
  { op: 'add_opening', id: 'l1-d-bath', kind: 'door', host: { between: ['l1-bath', 'l1-living'] }, at: start(1000), width: 800, height: 2100, sill: 0 },
  { op: 'add_opening', id: 'l1-w-bath', kind: 'window', host: { space: 'l1-bath', side: 'E' }, at: 'center', width: 900, height: 600, sill: 1600 },
  { op: 'add_opening', id: 'l1-d-guest', kind: 'door', host: { between: ['l1-guest', 'l1-living'] }, at: start(600), width: 900, height: 2100, sill: 0 },
  { op: 'add_opening', id: 'l1-w-guest', kind: 'window', host: { space: 'l1-guest', side: 'E' }, at: 'center', width: 1800, height: 1500, sill: 900 },
  { op: 'add_opening', id: 'l1-w-guest-n', kind: 'window', host: { space: 'l1-guest', side: 'N' }, at: 'center', width: 1200, height: 1200, sill: 1000 },
  { op: 'add_opening', id: 'l1-d-store', kind: 'door', host: { between: ['l1-store', 'l1-living'] }, at: 'center', width: 800, height: 2100, sill: 0 },
  { op: 'add_opening', id: 'l1-d-laundry', kind: 'door', host: { between: ['l1-laundry', 'l1-hall'] }, at: start(300), width: 900, height: 2100, sill: 0 },
  { op: 'add_opening', id: 'l1-d-back', kind: 'door', host: { space: 'l1-laundry', side: 'N' }, at: start(600), width: 900, height: 2100, sill: 0, canopy: { depth: 700 } },
  { op: 'add_opening', id: 'l1-w-laundry', kind: 'window', host: { space: 'l1-laundry', side: 'W' }, at: 'center', width: 900, height: 900, sill: 1300 },
  { op: 'add_opening', id: 'l1-w-stair', kind: 'window', host: { space: 'l1-stair', side: 'N' }, at: 'center', width: 1500, height: 1200, sill: 1000 },
  { op: 'add_stair', id: 'stair-l1', space: 'l1-stair', kind: 'u', up: 'E' },

  // Upper floor of the main hall.
  { op: 'add_space', level: 'L2', id: 'l2-master', name: '主卧', nameEn: 'Master bedroom', type: 'bedroom', cells: [c('1', '2', 'D', 'Da')] },
  { op: 'add_space', level: 'L2', id: 'l2-family', name: '起居室', nameEn: 'Family room', type: 'family', cells: [c('2', '3', 'D', 'Da')], openTo: ['l2-hall'] },
  { op: 'add_space', level: 'L2', id: 'l2-bedroom', name: '次卧', nameEn: 'Bedroom', type: 'bedroom', cells: [c('3', '4', 'D', 'Da')] },
  { op: 'add_space', level: 'L2', id: 'l2-mbath', name: '主卫', nameEn: 'Master bath', type: 'bathroom', cells: [c('1', '1m', 'Da', 'E')] },
  { op: 'add_space', level: 'L2', id: 'l2-bath', name: '卫生间', nameEn: 'Bathroom', type: 'bathroom', cells: [c('1m', '2', 'Da', 'E')] },
  { op: 'add_space', level: 'L2', id: 'l2-hall', name: '过厅', nameEn: 'Landing', type: 'hall', cells: [c('2', '2s', 'Da', 'E')], openTo: ['l2-family', 'l2-stair'] },
  { op: 'add_space', level: 'L2', id: 'l2-stair', name: '楼梯', nameEn: 'Stair', type: 'stair', cells: [c('2s', '3s', 'Da', 'E')], openTo: ['l2-hall'] },
  { op: 'add_space', level: 'L2', id: 'l2-study', name: '书房', nameEn: 'Study', type: 'study', cells: [c('3s', '4', 'Da', 'E')] },

  { op: 'add_opening', id: 'l2-w-master', kind: 'window', host: { space: 'l2-master', side: 'S' }, at: start(1500), width: 1800, height: 1500, sill: 900 },
  { op: 'add_opening', id: 'l2-w-master-w', kind: 'window', host: { space: 'l2-master', side: 'W' }, at: 'center', width: 1500, height: 1500, sill: 900, panel: 'start' },
  { op: 'add_opening', id: 'l2-d-master', kind: 'door', host: { between: ['l2-master', 'l2-family'] }, at: start(2900), width: 900, height: 2100, sill: 0 },
  { op: 'add_opening', id: 'l2-d-mbath', kind: 'door', host: { between: ['l2-mbath', 'l2-master'] }, at: start(500), width: 800, height: 2100, sill: 0 },
  { op: 'add_opening', id: 'l2-w-mbath', kind: 'window', host: { space: 'l2-mbath', side: 'W' }, at: 'center', width: 900, height: 900, sill: 1400 },
  { op: 'add_opening', id: 'l2-d-bath', kind: 'door', host: { between: ['l2-bath', 'l2-hall'] }, at: start(600), width: 800, height: 2100, sill: 0 },
  { op: 'add_opening', id: 'l2-w-bath', kind: 'window', host: { space: 'l2-bath', side: 'N' }, at: 'center', width: 900, height: 900, sill: 1400 },
  { op: 'add_opening', id: 'l2-sd-family', kind: 'sliding-door', host: { space: 'l2-family', side: 'S' }, at: 'center', width: 3000, height: 2300, sill: 0 },
  { op: 'add_opening', id: 'l2-d-bedroom', kind: 'door', host: { between: ['l2-bedroom', 'l2-family'] }, at: start(2900), width: 900, height: 2100, sill: 0 },
  { op: 'add_opening', id: 'l2-w-bedroom', kind: 'window', host: { space: 'l2-bedroom', side: 'S' }, at: start(300), width: 1800, height: 1500, sill: 900 },
  { op: 'add_opening', id: 'l2-w-bedroom-e', kind: 'window', host: { space: 'l2-bedroom', side: 'E' }, at: 'center', width: 1500, height: 1500, sill: 900, panel: 'end' },
  { op: 'add_opening', id: 'l2-d-study', kind: 'door', host: { between: ['l2-study', 'l2-family'] }, at: start(200), width: 900, height: 2100, sill: 0 },
  { op: 'add_opening', id: 'l2-w-study', kind: 'window', host: { space: 'l2-study', side: 'N' }, at: start(2400), width: 1800, height: 1500, sill: 900 },
  { op: 'add_opening', id: 'l2-w-study-e', kind: 'window', host: { space: 'l2-study', side: 'E' }, at: 'center', width: 900, height: 1500, sill: 900 },
  { op: 'add_opening', id: 'l2-w-stair', kind: 'window', host: { space: 'l2-stair', side: 'N' }, at: 'center', width: 1500, height: 1200, sill: 900 },
  { op: 'add_space', level: 'L2', id: 'l2-balcony', name: '阳台', nameEn: 'Balcony', type: 'balcony', cells: [c('2s', '3s', 'Cd', 'D')], edge: 'metal-rail' },

  // Roofs: an east-west gable over the main hall, mono-pitch wing roofs
  // falling into the courtyard, and the veranda canopy.
  { op: 'add_roof', id: 'roof-main', kind: 'gable', cells: [c('1', '4', 'D', 'E')], onLevel: 'L2', ridge: 'EW', pitchDeg: 26, overhang: 600 },
  { op: 'add_roof', id: 'roof-west', kind: 'mono', cells: [c('1', '2', 'C', 'D')], onLevel: 'L1', fall: 'E', pitchDeg: 18, overhang: 600 },
  { op: 'add_roof', id: 'roof-east', kind: 'mono', cells: [c('3', '4', 'C', 'D')], onLevel: 'L1', fall: 'W', pitchDeg: 18, overhang: 600 },
];

