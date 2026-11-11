// Golden sample: the reference 12 m x 15 m modern pitched-roof house
// (internal benchmark, see docs/DECISIONS.md). Transcribed from the three
// dimensioned plans (ground floor, level 2, attic) and the 3D views.
//
// Grid. Dimensioned lines are the union of the chains printed on the three
// plans. A few lines are not dimensioned on any drawing; their positions
// were scaled from the plans (wall centre lines, rounded to 100 mm) and are
// marked "scaled".
//
//   X (west -> east)                     Y (south -> north)
//   1   0      plot / west wall          A  0      plot south edge
//   2   3100   S chain                   B  300    L2 south balcony edge (1500)
//   3   3700   N chain                   C  1800   S wall of the house
//   4   4300   scaled: stair flights     D  4000   scaled: ground-floor stair cut
//   5   4800   scaled: vanity nook       E  5300   1600 on the L2/attic E chain
//   6   5500   both chains               F  6900   main E-W wall
//   7   9100   both chains               G  8500   scaled: entry porch depth
//   8   10900  scaled: L2 bathroom       H  8700   scaled: bathroom / nook
//   9   11200  scaled: entry porch       J  9200   2800 carport on the GF E chain
//   10  13800  both chains (house E)     K  10500  N wall of the house
//   11  15000  plot east edge (1200)     L  12000  plot north edge
//
// Ambiguities and how they were read (see also the package README):
// - Wall centre lines sit on the dimension lines; the west house wall is on
//   the plot edge (ground-floor plan shows a single wall there).
// - Ground-floor stair: the plan shows only the first flight (east half,
//   climbing south) with the storeroom under the rest of the U stair. The
//   stair space is that first flight; the stair's footprint is the stairwell
//   on level 2 (see `Stair` in the README).
// - The tall window with a timber band on the east face (3D views) is the
//   level-2 bedroom / attic study east window, modelled as one window with
//   spanLevels 2.
// - The south facade of the middle bay: the plans show a door + window on
//   the ground floor and one 2600 window on level 2; the 3D views show two
//   tall slot windows spanning both floors with timber bands at the level-2
//   floor, and a wide strip window (with a timber insert) on level 3. The
//   3D views win (task 003): we are compared against them.
// - Canopies: a flat canopy roof over the entry porch and one over the
//   level-2 south balcony; the small canopy over the west courtyard door is
//   an opening canopy. The carport is open (ref-1).
// - West block (ref-2, ref-4): timber side panels, a level-3 corner window
//   wrapping the south-west corner, small windows on the west face, a deck
//   in the south-west courtyard.
// - Roof split between the two mono-pitch roofs is taken on grid line F
//   (main wall); pitches and eave offsets are estimated from the elevations.
//   The attic (level 3) is 1.8 m to the eaves; openings there are checked
//   against the roof underside, not the level height.
// - Site latitude/longitude are not given; a generic east-China location is
//   assumed.
import type { CellRect, House } from '../schema';

const c = (x0: string, x1: string, y0: string, y1: string): CellRect => ({ x0, x1, y0, y1 });
const start = (offset: number) => ({ from: 'start' as const, offset });

export const golden: House = {
  version: 1,
  name: 'Golden sample: 12 x 15 m modern pitched-roof house',
  site: {
    width: 15000,
    depth: 12000,
    northDeg: 0,
    latitude: 30.3,
    longitude: 120.2,
    fence: {
      height: 1500,
      gates: [
        // Vehicle gate in front of the carport (dashed line on the GF plan).
        { id: 'gate-car', side: 'E', at: start(7100), width: 4500, kind: 'sliding' },
        // Timber slat garden gate on the south fence (south elevation; position approximate).
        { id: 'gate-garden', side: 'S', at: start(3700), width: 1200, kind: 'swing' },
      ],
    },
  },
  grid: {
    x: [
      { id: '1', pos: 0 },
      { id: '2', pos: 3100 },
      { id: '3', pos: 3700 },
      { id: '4', pos: 4300 },
      { id: '5', pos: 4800 },
      { id: '6', pos: 5500 },
      { id: '7', pos: 9100 },
      { id: '8', pos: 10900 },
      { id: '9', pos: 11200 },
      { id: '10', pos: 13800 },
      { id: '11', pos: 15000 },
    ],
    y: [
      { id: 'A', pos: 0 },
      { id: 'B', pos: 300 },
      { id: 'C', pos: 1800 },
      { id: 'D', pos: 4000 },
      { id: 'E', pos: 5300 },
      { id: 'F', pos: 6900 },
      { id: 'G', pos: 8500 },
      { id: 'H', pos: 8700 },
      { id: 'J', pos: 9200 },
      { id: 'K', pos: 10500 },
      { id: 'L', pos: 12000 },
    ],
  },
  levels: [
    {
      id: 'L1',
      name: '一层',
      height: 3300,
      spaces: [
        { id: 'gf-senior', name: '老人房', nameEn: 'Senior citizen\'s room', type: 'bedroom', cells: [c('1', '3', 'F', 'K')] },
        { id: 'gf-bath', name: '卫生间', nameEn: 'Bathroom', type: 'bathroom', cells: [c('3', '6', 'H', 'K')] },
        { id: 'gf-nook', name: '洗衣台', nameEn: 'Vanity / laundry nook', type: 'laundry', cells: [c('5', '6', 'F', 'H')] },
        {
          id: 'gf-hall', name: '过厅', nameEn: 'Hall', type: 'hall',
          cells: [c('2', '6', 'E', 'F'), c('3', '5', 'F', 'H')],
          openTo: ['gf-nook', 'gf-stair', 'gf-dining'],
        },
        { id: 'gf-stair', name: '楼梯', nameEn: 'Stair', type: 'stair', cells: [c('4', '6', 'D', 'E')] },
        { id: 'gf-store', name: '储藏室', nameEn: 'Storeroom', type: 'storage', cells: [c('2', '4', 'C', 'E'), c('4', '6', 'C', 'D')] },
        { id: 'gf-dining', name: '餐厅', nameEn: 'Dining room', type: 'dining', cells: [c('6', '7', 'C', 'F')], openTo: ['gf-living', 'gf-wkitchen'] },
        { id: 'gf-living', name: '客厅', nameEn: 'Living room', type: 'living', cells: [c('7', '10', 'C', 'F')] },
        { id: 'gf-wkitchen', name: '西厨', nameEn: 'Western kitchen', type: 'kitchen', cells: [c('6', '7', 'F', 'J')] },
        { id: 'gf-ckitchen', name: '中厨', nameEn: 'Chinese kitchen', type: 'kitchen', cells: [c('6', '7', 'J', 'L')] },
        // Outdoor, inside the plot fence.
        { id: 'gf-patio', name: '小院', nameEn: 'Senior room patio', type: 'courtyard', cells: [c('1', '2', 'K', 'L')], edge: 'none' },
        { id: 'gf-planter-n', name: '花池', nameEn: 'Planter', type: 'garden', cells: [c('2', '6', 'K', 'L')], edge: 'none' },
        { id: 'gf-court-w', name: '庭院', nameEn: 'Courtyard', type: 'courtyard', cells: [c('1', '2', 'C', 'F')], edge: 'none', surface: 'deck' },
        { id: 'gf-garden-s', name: '花园', nameEn: 'South garden', type: 'garden', cells: [c('1', '6', 'A', 'C')], edge: 'none' },
        { id: 'gf-court-s', name: '庭院', nameEn: 'Courtyard', type: 'courtyard', cells: [c('6', '7', 'A', 'C')], edge: 'none' },
        { id: 'gf-planter-s', name: '花池', nameEn: 'Planter', type: 'garden', cells: [c('7', '10', 'A', 'C')], edge: 'none' },
        { id: 'gf-planter-e', name: '花池', nameEn: 'Planter', type: 'garden', cells: [c('7', '9', 'F', 'G')], edge: 'none' },
        // Entry porch under the flat canopy (the tree grows through the void over the planter).
        { id: 'gf-porch', name: '入户', nameEn: 'Entry porch', type: 'porch', cells: [c('9', '10', 'F', 'G')], edge: 'none' },
        // Paved entry yard: the 1200 strip along the east fence plus the strip in front of the porch.
        { id: 'gf-yard', name: '入户庭院', nameEn: 'Entry yard', type: 'courtyard', cells: [c('10', '11', 'A', 'L'), c('7', '10', 'G', 'J')], edge: 'none' },
        // 5300 x 2400 parking bay, open to the sky (ref-1 shows the car in the open).
        { id: 'gf-carport', name: '车位', nameEn: 'Carport', type: 'carport', cells: [c('7', '10', 'J', 'L')], edge: 'none' },
      ],
      openings: [
        { id: 'gf-d-patio', kind: 'door', host: { space: 'gf-senior', side: 'N' }, at: start(2150), width: 800, height: 2100, sill: 0 },
        { id: 'gf-d-senior', kind: 'door', host: { space: 'gf-senior', side: 'E' }, at: start(200), width: 900, height: 2100, sill: 0 },
        { id: 'gf-w-senior', kind: 'window', host: { space: 'gf-senior', side: 'S' }, at: start(500), width: 1800, height: 1500, sill: 900 },
        // Small high window on the west face (3D views).
        { id: 'gf-w-senior-w', kind: 'window', host: { space: 'gf-senior', side: 'W' }, at: start(1600), width: 600, height: 900, sill: 1300 },
        { id: 'gf-d-bath', kind: 'door', host: { space: 'gf-bath', side: 'S' }, at: start(200), width: 800, height: 2100, sill: 0 },
        { id: 'gf-w-bath', kind: 'window', host: { space: 'gf-bath', side: 'N' }, at: start(200), width: 600, height: 600, sill: 1500 },
        // Courtyard door with a small canopy over it (south elevation).
        { id: 'gf-d-court', kind: 'door', host: { space: 'gf-hall', side: 'W' }, at: start(600), width: 800, height: 2100, sill: 0, canopy: { depth: 900 } },
        { id: 'gf-d-store', kind: 'door', host: { between: ['gf-hall', 'gf-store'] }, at: start(200), width: 800, height: 2100, sill: 0 },
        // Two tall slot windows through the ground floor and level 2 (3D views),
        // with timber bands across the level-2 floor.
        { id: 'gf-w-slot-w', kind: 'window', host: { space: 'gf-dining', side: 'S' }, at: start(600), width: 750, height: 5600, sill: 0, spanLevels: 2, insert: 'wood-panel' },
        { id: 'gf-w-slot-e', kind: 'window', host: { space: 'gf-dining', side: 'S' }, at: start(1950), width: 750, height: 5600, sill: 0, spanLevels: 2, insert: 'wood-panel' },
        { id: 'gf-sd-living', kind: 'sliding-door', host: { space: 'gf-living', side: 'S' }, at: start(300), width: 3600, height: 2400, sill: 0 },
        { id: 'gf-w-living', kind: 'window', host: { space: 'gf-living', side: 'N' }, at: start(700), width: 900, height: 1500, sill: 900 },
        // Main entrance, from the porch.
        { id: 'gf-d-entry', kind: 'door', host: { space: 'gf-living', side: 'N' }, at: start(2550), width: 1000, height: 2400, sill: 0 },
        { id: 'gf-w-wkitchen', kind: 'window', host: { space: 'gf-wkitchen', side: 'E' }, at: start(800), width: 800, height: 1200, sill: 1000 },
        { id: 'gf-w-ckitchen-e', kind: 'window', host: { space: 'gf-ckitchen', side: 'E' }, at: start(600), width: 1500, height: 1200, sill: 1000 },
        { id: 'gf-w-ckitchen-w', kind: 'window', host: { space: 'gf-ckitchen', side: 'W' }, at: start(1750), width: 600, height: 1200, sill: 1000 },
        // Glazed partition with sliding doors between the two kitchens.
        { id: 'gf-sd-kitchen', kind: 'sliding-door', host: { between: ['gf-wkitchen', 'gf-ckitchen'] }, at: start(700), width: 2100, height: 2400, sill: 0 },
      ],
      stairs: [
        // U stair: first flight climbs south from the hall, returns north over the storeroom.
        { id: 'stair-1', space: 'gf-stair', kind: 'u', up: 'S' },
      ],
    },
    {
      id: 'L2',
      name: '二层',
      height: 3000,
      spaces: [
        { id: 'l2-bed-w', name: '次卧', nameEn: 'Second bedroom', type: 'bedroom', cells: [c('1', '3', 'F', 'K')] },
        { id: 'l2-bath', name: '卫生间', nameEn: 'Bathroom', type: 'bathroom', cells: [c('3', '6', 'H', 'K')] },
        { id: 'l2-nook', name: '洗衣台', nameEn: 'Vanity / laundry nook', type: 'laundry', cells: [c('5', '6', 'F', 'H')] },
        { id: 'l2-bed-n', name: '次卧', nameEn: 'Second bedroom', type: 'bedroom', cells: [c('6', '7', 'F', 'K')] },
        {
          id: 'l2-hall', name: '过道', nameEn: 'Corridor', type: 'hall',
          cells: [c('2', '8', 'E', 'F'), c('3', '5', 'F', 'H')],
          openTo: ['l2-nook', 'l2-stair', 'l2-family'],
        },
        { id: 'l2-stair', name: '楼梯', nameEn: 'Stair', type: 'stair', cells: [c('2', '6', 'C', 'E')] },
        { id: 'l2-family', name: '起居室', nameEn: 'Family room', type: 'family', cells: [c('6', '7', 'C', 'E')] },
        { id: 'l2-master', name: '主卧', nameEn: 'Master bedroom', type: 'bedroom', cells: [c('7', '10', 'C', 'E')] },
        { id: 'l2-mbath', name: '卫生间', nameEn: 'Master bathroom', type: 'bathroom', cells: [c('8', '10', 'E', 'F')] },
        { id: 'l2-balcony-n', name: '观景阳台', nameEn: 'Living balcony', type: 'balcony', cells: [c('6', '7', 'K', 'L')], edge: 'metal-rail' },
        { id: 'l2-balcony-s', name: '观景阳台', nameEn: 'Living balcony', type: 'balcony', cells: [c('7', '10', 'B', 'C')], edge: 'glass-rail' },
      ],
      openings: [
        { id: 'l2-d-bed-w', kind: 'door', host: { space: 'l2-bed-w', side: 'E' }, at: start(200), width: 900, height: 2100, sill: 0 },
        { id: 'l2-w-bed-w', kind: 'window', host: { space: 'l2-bed-w', side: 'S' }, at: start(500), width: 1800, height: 1500, sill: 900, panel: 'start' },
        { id: 'l2-w-bed-w-w', kind: 'window', host: { space: 'l2-bed-w', side: 'W' }, at: start(1400), width: 1000, height: 900, sill: 1100, panel: 'start' },
        { id: 'l2-d-bath', kind: 'door', host: { space: 'l2-bath', side: 'S' }, at: start(200), width: 800, height: 2100, sill: 0 },
        { id: 'l2-w-bath', kind: 'window', host: { space: 'l2-bath', side: 'N' }, at: start(200), width: 600, height: 600, sill: 1500 },
        { id: 'l2-d-bed-n', kind: 'door', host: { space: 'l2-bed-n', side: 'S' }, at: start(200), width: 850, height: 2100, sill: 0 },
        // One glazed unit onto the north balcony (window + door, ref-1).
        { id: 'l2-sd-balcony-n', kind: 'sliding-door', host: { space: 'l2-bed-n', side: 'N' }, at: start(900), width: 1800, height: 2400, sill: 0 },
        // Tall slot window with a timber band at the attic floor (east face, 3D views).
        { id: 'l2-w-east-tall', kind: 'window', host: { space: 'l2-bed-n', side: 'E' }, at: start(800), width: 800, height: 4800, sill: 600, spanLevels: 2, insert: 'wood-panel' },
        // Tall slot on the west face of the middle bay with a timber band at the attic floor (ref-2).
        { id: 'l2-w-hall-w', kind: 'window', host: { space: 'l2-hall', side: 'W' }, at: start(600), width: 800, height: 3900, sill: 600, spanLevels: 2, insert: 'wood-panel' },
        { id: 'l2-w-hall-n', kind: 'window', host: { space: 'l2-hall', side: 'N' }, at: start(6700), width: 800, height: 1500, sill: 900 },
        { id: 'l2-d-master', kind: 'door', host: { space: 'l2-master', side: 'N' }, at: start(760), width: 900, height: 2100, sill: 0 },
        { id: 'l2-d-mbath', kind: 'door', host: { space: 'l2-master', side: 'N' }, at: start(1830), width: 850, height: 2100, sill: 0 },
        { id: 'l2-w-mbath', kind: 'window', host: { space: 'l2-mbath', side: 'E' }, at: start(450), width: 850, height: 900, sill: 1200 },
        // One glazed unit onto the south balcony; its head stays below the balcony canopy.
        { id: 'l2-sd-master', kind: 'sliding-door', host: { space: 'l2-master', side: 'S' }, at: start(700), width: 3200, height: 2300, sill: 0 },
      ],
      stairs: [
        { id: 'stair-2', space: 'l2-stair', kind: 'u', up: 'S' },
      ],
    },
    {
      id: 'L3',
      name: '阁楼',
      // Attic: wall height at the eaves (the elevations put both eaves about
      // 1.8 m above the attic floor); walls rise to the roofs above that.
      height: 1800,
      spaces: [
        { id: 'l3-bed', name: '次卧', nameEn: 'Second bedroom', type: 'bedroom', cells: [c('1', '3', 'F', 'K')] },
        { id: 'l3-bath', name: '卫生间', nameEn: 'Bathroom', type: 'bathroom', cells: [c('3', '6', 'H', 'K')] },
        { id: 'l3-nook', name: '洗衣台', nameEn: 'Vanity / laundry nook', type: 'laundry', cells: [c('5', '6', 'F', 'H')] },
        { id: 'l3-study', name: '书房', nameEn: 'Study', type: 'study', cells: [c('6', '7', 'F', 'K')] },
        {
          id: 'l3-hall', name: '过道', nameEn: 'Corridor', type: 'hall',
          cells: [c('2', '7', 'E', 'F'), c('3', '5', 'F', 'H')],
          openTo: ['l3-nook', 'l3-stair', 'l3-family'],
        },
        { id: 'l3-stair', name: '楼梯', nameEn: 'Stair', type: 'stair', cells: [c('2', '6', 'C', 'E')] },
        { id: 'l3-family', name: '家庭活动室', nameEn: 'Family room', type: 'family', cells: [c('6', '7', 'C', 'E')] },
        // Roof terrace on top of the level-2 east wing.
        { id: 'l3-terrace', name: '露台', nameEn: 'Terrace', type: 'terrace', cells: [c('7', '10', 'C', 'F')], edge: 'glass-rail' },
      ],
      openings: [
        { id: 'l3-d-bed', kind: 'door', host: { space: 'l3-bed', side: 'E' }, at: start(200), width: 900, height: 2100, sill: 0 },
        // Corner window wrapping the south-west corner (both parts run to the
        // corner), timber side panel at the north end of the west part.
        { id: 'l3-w-bed', kind: 'window', host: { space: 'l3-bed', side: 'S' }, at: start(0), width: 1800, height: 1600, sill: 600 },
        { id: 'l3-w-bed-w', kind: 'window', host: { space: 'l3-bed', side: 'W' }, at: start(0), width: 1300, height: 1600, sill: 600, panel: 'end' },
        { id: 'l3-d-bath', kind: 'door', host: { space: 'l3-bath', side: 'S' }, at: start(200), width: 800, height: 2100, sill: 0 },
        { id: 'l3-w-bath', kind: 'window', host: { space: 'l3-bath', side: 'N' }, at: start(200), width: 600, height: 600, sill: 1000 },
        { id: 'l3-d-study', kind: 'door', host: { space: 'l3-study', side: 'S' }, at: start(200), width: 850, height: 2100, sill: 0 },
        { id: 'l3-w-study', kind: 'window', host: { space: 'l3-study', side: 'N' }, at: start(900), width: 1800, height: 1300, sill: 300 },
        { id: 'l3-d-terrace', kind: 'door', host: { space: 'l3-hall', side: 'E' }, at: start(500), width: 850, height: 2100, sill: 0 },
        // Wide strip under the south eave: one part over the stair, one over the
        // family room with a timber insert at its west end (3D views).
        { id: 'l3-w-stair', kind: 'window', host: { space: 'l3-stair', side: 'S' }, at: start(1000), width: 1200, height: 900, sill: 350 },
        { id: 'l3-w-family', kind: 'window', host: { space: 'l3-family', side: 'S' }, at: start(200), width: 3200, height: 900, sill: 350, insert: 'wood-panel' },
      ],
      stairs: [],
    },
  ],
  roofs: [
    // North mono-pitch roof: high edge on line F, falls north; the higher one.
    { id: 'roof-n', kind: 'mono', cells: [c('1', '7', 'F', 'K')], onLevel: 'L3', pitchDeg: 25, fall: 'N', eaveOffset: 300, overhang: 600, vergeOverhang: 100 },
    // South mono-pitch roof: falls south, lower, leaving a clerestory strip
    // under the north roof's high edge. Three-pane skylight over the family room.
    {
      id: 'roof-s', kind: 'mono', cells: [c('2', '7', 'C', 'F')], onLevel: 'L3', pitchDeg: 15, fall: 'S', eaveOffset: 0, overhang: 600,
      skylights: [{ at: [7300, 4300], width: 1800, length: 900 }],
    },
    // Entry canopy over the porch only (the planter beside it holds a tree).
    { id: 'canopy-entry', kind: 'canopy', cells: [c('9', '10', 'F', 'G')], onLevel: 'L1', height: 3000, overhang: 150 },
    // Cover over the level-2 south balcony.
    // Low enough that a white wall band shows under the terrace slab (ref-4).
    { id: 'canopy-balcony', kind: 'canopy', cells: [c('7', '10', 'B', 'C')], onLevel: 'L2', height: 2500, overhang: 200 },
  ],
  style: 'modern-pitched',
};
