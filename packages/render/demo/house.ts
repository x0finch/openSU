/**
 * Throwaway demo scene: approximation of the reference 12 m x 15 m modern
 * mono-pitch house. Model mm, origin = SW corner of the plot, X east,
 * Y north, Z up.
 */
import type { Group } from 'three';
import { createBamboo, createCar, createGrassTuft, createGinkgo, createMaple, createPerson, type Palette } from '../src/index.js';
import { bars, Builder, face, fenceWall, glassBalustrade, monoRoof, P, roofUnderside, type RoofSpec, skylight, slatGate } from './helpers.js';

const H = 3300;
const T20 = Math.tan((20 * Math.PI) / 180);

export function buildHouse(pal: Palette): Group {
  const b = new Builder(pal);

  // ---------------------------------------------------------------- roofs
  const roofS: RoofSpec = { x0: 3100, y0: 1800, x1: 9100, y1: 6900, fall: 'S', zHigh: 8100 + 5100 * T20, slopeDeg: 20, overhang: { n: 0, s: 600, e: 600, w: 600 } };
  const roofN: RoofSpec = { x0: 0, y0: 6900, x1: 9100, y1: 10500, fall: 'N', zHigh: 11000, slopeDeg: 20, overhang: { n: 600, s: 600, e: 0, w: 0 } };
  const sTop = (y: number) => roofUnderside(roofS, 0, y);
  const nTop = (y: number) => roofUnderside(roofN, 0, y);

  // ------------------------------------------------------------- block N
  // x 0..9100, y 6900..10500, high edge on the south wall.
  face(b, {
    // South face (above block S and the west part).
    origin: [0, 6900], dir: [1, 0],
    outline: [[0, 0], [9100, 0], [9100, nTop(6900)], [0, nTop(6900)]],
    floorLevels: [H, 2 * H],
    openings: [
      { u0: 1300, u1: 2800, z0: 700, z1: 2700, cols: 2 },
      { u0: 1300, u1: 2800, z0: 4000, z1: 6000, cells: [
        { u0: 0, u1: 1050, z0: 0, z1: 2000, type: 'glass' },
        { u0: 1050, u1: 1500, z0: 0, z1: 2000, type: 'wood' },
      ] },
      // Corner window with a timber insert (level 3).
      { u0: 160, u1: 2500, z0: 7000, z1: 9300, cells: [
        { u0: 0, u1: 520, z0: 0, z1: 2300, type: 'wood' },
        { u0: 520, u1: 1430, z0: 0, z1: 2300, type: 'glass' },
        { u0: 1430, u1: 2340, z0: 0, z1: 2300, type: 'glass' },
      ] },
    ],
  });
  face(b, {
    // West face (on the plot boundary).
    origin: [0, 10500], dir: [0, -1],
    outline: [[0, 0], [3600, 0], [3600, nTop(6900)], [0, nTop(10500)]],
    floorLevels: [H, 2 * H],
    openings: [
      { u0: 700, u1: 1900, z0: 900, z1: 2500 },
      { u0: 900, u1: 1900, z0: 4200, z1: 5900, cells: [
        { u0: 0, u1: 650, z0: 0, z1: 1700, type: 'glass' },
        { u0: 650, u1: 1000, z0: 0, z1: 1700, type: 'wood' },
      ] },
      { u0: 1300, u1: 3440, z0: 7000, z1: 9300, cols: 2 },
    ],
  });
  face(b, {
    // North face.
    origin: [9100, 10500], dir: [-1, 0],
    outline: [[0, 0], [9100, 0], [9100, nTop(10500)], [0, nTop(10500)]],
    floorLevels: [H, 2 * H],
    openings: [
      { u0: 5300, u1: 7000, z0: 900, z1: 2500, cols: 2 },
      { u0: 700, u1: 3000, z0: H, z1: H + 2500, cells: [
        { u0: 0, u1: 1150, z0: 0, z1: 2500, type: 'door' },
        { u0: 1150, u1: 2300, z0: 0, z1: 2500, type: 'glass' },
      ] },
      { u0: 5800, u1: 7300, z0: 4200, z1: 5900 },
      { u0: 1000, u1: 2300, z0: 7200, z1: 9300 },
      { u0: 5600, u1: 7100, z0: 7300, z1: 9000, cols: 2 },
    ],
  });
  face(b, {
    // East face (entrance side, facing the car court).
    origin: [9100, 6900], dir: [0, 1],
    outline: [[0, 0], [3600, 0], [3600, nTop(10500)], [0, nTop(6900)]],
    floorLevels: [H, 2 * H],
    openings: [
      { u0: 500, u1: 2100, z0: 0, z1: 2700, cells: [
        { u0: 0, u1: 900, z0: 0, z1: 2700, type: 'wood' },
        { u0: 900, u1: 1600, z0: 0, z1: 2700, type: 'glass' },
      ] },
      { u0: 1000, u1: 2600, z0: 4000, z1: 6100, cols: 2 },
      { u0: 2500, u1: 3100, z0: 7000, z1: 9400 },
    ],
  });
  monoRoof(b, roofN);

  // ------------------------------------------------------------- block S
  // x 3100..9100, y 1800..6900, roof falls south.
  face(b, {
    origin: [3100, 1800], dir: [1, 0],
    outline: [[0, 0], [6000, 0], [6000, sTop(1800)], [0, sTop(1800)]],
    floorLevels: [H, 2 * H],
    openings: [
      { u0: 700, u1: 1700, z0: 4300, z1: 5900 },
      ...[2900, 4300].map((u) => ({ u0: u, u1: u + 800, z0: 0, z1: 6300, cells: [
        { u0: 0, u1: 800, z0: 0, z1: 2750, type: 'glass' as const },
        { u0: 0, u1: 800, z0: 2750, z1: 3900, type: 'wood' as const },
        { u0: 0, u1: 800, z0: 3900, z1: 6300, type: 'glass' as const },
      ] })),
      // Wide horizontal strip on level 3 with a timber insert.
      { u0: 1000, u1: 5100, z0: 6900, z1: 7800, cells: [
        { u0: 0, u1: 1100, z0: 0, z1: 900, type: 'glass' },
        { u0: 1100, u1: 1450, z0: 0, z1: 900, type: 'wood' },
        { u0: 1450, u1: 2800, z0: 0, z1: 900, type: 'glass' },
        { u0: 2800, u1: 4100, z0: 0, z1: 900, type: 'glass' },
      ] },
    ],
  });
  face(b, {
    // West face, onto the SW court.
    origin: [3100, 6900], dir: [0, -1],
    outline: [[0, 0], [5100, 0], [5100, sTop(1800)], [0, sTop(6900)]],
    floorLevels: [H, 2 * H],
    openings: [
      { u0: 1300, u1: 4300, z0: 0, z1: 2700, cols: 3 },
      { u0: 1700, u1: 3500, z0: 4100, z1: 5900, cols: 2 },
      { u0: 1700, u1: 3100, z0: 7000, z1: 8000 },
    ],
  });
  face(b, {
    // East face, above block E (door to the roof terrace).
    origin: [9100, 1800], dir: [0, 1],
    outline: [[0, 0], [5100, 0], [5100, sTop(6900)], [0, sTop(1800)]],
    floorLevels: [2 * H],
    openings: [
      { u0: 2100, u1: 3100, z0: 2 * H + 30, z1: 8600 },
      { u0: 3700, u1: 4400, z0: 7400, z1: 8800 },
    ],
  });
  const sRoof = monoRoof(b, roofS);
  skylight(b, 6100, 4200, 1900, 1100, 3, sRoof.topAt);

  // ------------------------------------------------------------- block E
  // x 9100..13800, y 1800..6900, two storeys, roof terrace.
  const eTop = 2 * H;
  face(b, {
    origin: [9100, 1800], dir: [1, 0],
    outline: [[0, 0], [4700, 0], [4700, eTop], [0, eTop]],
    floorLevels: [H],
    openings: [
      { u0: 500, u1: 4200, z0: 0, z1: 2800, cols: 3 },
      { u0: 500, u1: 4200, z0: H + 150, z1: H + 2750, cols: 3 },
    ],
  });
  face(b, {
    origin: [13800, 1800], dir: [0, 1],
    outline: [[0, 0], [5100, 0], [5100, eTop], [0, eTop]],
    floorLevels: [H],
    openings: [
      { u0: 2300, u1: 3100, z0: 900, z1: 2600 },
      { u0: 1300, u1: 2000, z0: 4000, z1: 6000 },
    ],
  });
  face(b, {
    origin: [13800, 6900], dir: [-1, 0],
    outline: [[0, 0], [4700, 0], [4700, eTop], [0, eTop]],
    floorLevels: [H],
    openings: [
      { u0: 1000, u1: 2600, z0: 0, z1: 2700, cols: 2 },
      { u0: 1300, u1: 2900, z0: 4100, z1: 5800, cols: 2 },
    ],
  });
  // Terrace: deck, dark edge band, glass balustrade.
  b.box(9100, 1880, eTop, 13720, 6820, eTop + 30, pal.deck, { edges: true });
  b.box(9100, 1720, eTop - 150, 13880, 1880, eTop + 90, pal.slab);
  b.box(13720, 1880, eTop - 150, 13880, 6820, eTop + 90, pal.slab);
  b.box(9100, 6820, eTop - 150, 13880, 6980, eTop + 90, pal.slab);
  glassBalustrade(b, 9100, 1800, 13800, 1800, eTop + 90);
  glassBalustrade(b, 13800, 1800, 13800, 6900, eTop + 90);
  glassBalustrade(b, 9100, 6900, 13800, 6900, eTop + 90);
  // Planter with a small tree on the terrace.
  b.box(12500, 5800, eTop + 30, 13500, 6600, eTop + 450, pal.planter);

  // Level-2 south balcony with canopy above.
  b.box(9100, 300, H - 160, 13800, 1800, H, pal.slab);
  b.box(9100, 380, H, 13720, 1800, H + 30, pal.deck);
  glassBalustrade(b, 9100, 340, 13800, 340, H);
  glassBalustrade(b, 13760, 340, 13760, 1800, H);
  b.box(9000, 200, eTop - 380, 13900, 1800, eTop - 260, pal.slab);

  // ------------------------------------------------ kitchen bump (1 storey)
  face(b, { origin: [9100, 12000], dir: [-1, 0], outline: [[0, 0], [3600, 0], [3600, H], [0, H]], openings: [{ u0: 900, u1: 2700, z0: 900, z1: 2300, cols: 2 }] });
  face(b, { origin: [9100, 10500], dir: [0, 1], outline: [[0, 0], [1500, 0], [1500, H], [0, H]], openings: [{ u0: 400, u1: 1100, z0: 800, z1: 2400 }] });
  face(b, { origin: [5500, 12000], dir: [0, -1], outline: [[0, 0], [1500, 0], [1500, H], [0, H]] });
  b.box(5450, 10500, H - 120, 9150, 12050, H + 40, pal.slab);
  bars(b, 5500, 12000, 9100, 12000, H + 40, H + 1050, 110, 20, pal.metal);
  bars(b, 9100, 10520, 9100, 12000, H + 40, H + 1050, 110, 20, pal.metal);
  bars(b, 5500, 10520, 5500, 12000, H + 40, H + 1050, 110, 20, pal.metal);

  // ------------------------------------------------------------ canopies
  b.box(9100, 7000, 2950, 10900, 9300, 3070, pal.slab);
  b.box(1900, 2300, 2900, 3100, 5800, 3020, pal.slab);
  // Carport in the NE corner.
  b.box(11000, 9400, 2550, 14750, 11750, 2700, pal.slab);
  for (const [x, y] of [[11100, 9500], [14650, 9500], [11100, 11650], [14650, 11650]] as const) b.box(x - 50, y - 50, 0, x + 50, y + 50, 2550, pal.metal);

  // ---------------------------------------------------------------- site
  // Paving and deck.
  b.box(9100, 6980, 0, 14800, 11800, 25, pal.paving);
  b.box(3100, 200, 0, 9100, 1300, 25, pal.gravel);
  b.box(200, 4300, 0, 2900, 6900, 140, pal.deck);

  // Perimeter fence (1300 high, 200 thick, dark coping).
  const FH = 1300;
  const sq = (a: number) => ({ a0: a, a1: a + 320, z0: 650, z1: 970 });
  // Corners belong to the west and east runs; south/north runs join them.
  fenceWall(b, 200, 0, 3300, 0, FH, 200, [], [false, true], [200, 0]);
  fenceWall(b, 5300, 0, 14800, 0, FH, 200, [sq(6700), sq(7400), sq(8100)], [true, false], [0, 200]);
  fenceWall(b, 15000, 0, 15000, 12000, FH, 200, [sq(7200), sq(7900), sq(8600)], [false, false], [0, 0], [200, 200]);
  fenceWall(b, 14800, 12000, 13800, 12000, FH, 200, [], [false, true], [200, 0]);
  fenceWall(b, 9500, 12000, 9100, 12000, FH, 200, [], [false, false]);
  fenceWall(b, 5500, 12000, 200, 12000, FH, 200, [], [false, false], [0, 200]);
  fenceWall(b, 0, 12000, 0, 10500, FH, 200, [], [false, false], [0, 0], [200, 0]);
  fenceWall(b, 0, 6900, 0, 0, FH, 200, [], [false, false], [0, 0], [0, 200]);
  // Entrance pier and vehicle gate.
  b.box(9500, 11550, 0, 10100, 12000, 3000, pal.wall);
  b.box(9800 - 260, 12000, 1500, 9800 + 260, 12030, 1700, pal.wood);
  bars(b, 10100, 11900, 13800, 11900, 30, 1750, 95, 40, pal.metal);
  // Timber slat gate in the south fence.
  slatGate(b, 3300, 0, 5300, 0, 1650);

  // --------------------------------------------------------- entourage
  const treeMats = { trunk: pal.trunk, leaves: pal.leaves, stalk: pal.stalk };
  const place = (g: Group, x: number, y: number, z = 0, rot = 0) => {
    g.position.copy(P(x, y, z));
    g.rotation.y = rot;
    b.root.add(g);
    return g;
  };
  place(createGinkgo(treeMats, { height: 7.6, seed: 11 }), 1400, 2500);
  place(createGinkgo(treeMats, { height: 2.6, seed: 4, density: 1.1 }), 13000, 6200, eTop + 450);
  place(createMaple(treeMats, { height: 2.9, seed: 8, color: 'red' }), 10300, 950);
  place(createMaple(treeMats, { height: 3.6, seed: 21, color: 'green' }), 10200, 10500);
  place(createBamboo(treeMats, { height: 3.6, seed: 2, stalks: 18, spread: 0.45 }), 14350, 3200);
  place(createBamboo(treeMats, { height: 3.4, seed: 9, stalks: 16, spread: 0.45 }), 14350, 5200);
  place(createBamboo(treeMats, { height: 3.2, seed: 13, stalks: 16, spread: 0.45 }), 700, 11150);
  // Low planting along the gravel strip and the court.
  const tufts: [number, number, number][] = [[3500, 800, 0.55], [4300, 650, 0.45], [6400, 900, 0.6], [7300, 700, 0.5], [8600, 850, 0.55], [12300, 900, 0.5], [13300, 700, 0.6], [2500, 3600, 0.5], [600, 1000, 0.6], [14400, 7000, 0.5]];
  tufts.forEach(([x, y, h], i) => place(createGrassTuft(treeMats, { height: h, seed: 40 + i }), x, y, 25));
  place(createCar({ body: pal.carBody, glass: pal.carGlass, tyre: pal.tyre }), 12900, 9380, 25, Math.PI / 2);
  place(createPerson(pal.person, 'run', 1.72), 11300, 4300, eTop + 30);
  place(createPerson(pal.person, 'walk', 1.7, true), 9900, 7700, 25);

  return b.root;
}
