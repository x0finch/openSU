import type { CellRect, House } from '../src/index';

export const c = (x0: string, x1: string, y0: string, y1: string): CellRect => ({ x0, x1, y0, y1 });

/**
 * Small valid two-level house used as the base for "deliberately broken"
 * variants. Plot 12 x 10 m.
 *
 *   y 10000 +---------------------------+------+
 *           | yard (courtyard)          |      |
 *   y  8000 +-------------+-------------+      |
 *           | hall        | stair       |garden|
 *   y  4000 +-------------+-------------+      |
 *           | living      | bedroom     |      |
 *   y     0 +-------------+-------------+------+
 *           x 0         4000          8000  12000
 *
 * Level 2: bedroom over the hall, stair over the stair.
 */
export function smallHouse(): House {
  return {
    version: 1,
    name: 'Small test house',
    site: { width: 12000, depth: 10000, northDeg: 0, latitude: 30, longitude: 120 },
    grid: {
      x: [{ id: 'a', pos: 0 }, { id: 'b', pos: 4000 }, { id: 'c', pos: 8000 }, { id: 'd', pos: 12000 }],
      y: [{ id: '1', pos: 0 }, { id: '2', pos: 4000 }, { id: '3', pos: 8000 }, { id: '4', pos: 10000 }],
    },
    levels: [
      {
        id: 'L1', name: 'Ground', height: 3000,
        spaces: [
          { id: 'living', name: 'Living', type: 'living', cells: [c('a', 'b', '1', '2')] },
          { id: 'bed', name: 'Bedroom', type: 'bedroom', cells: [c('b', 'c', '1', '2')] },
          { id: 'hall', name: 'Hall', type: 'hall', cells: [c('a', 'b', '2', '3')] },
          { id: 'stair1', name: 'Stair', type: 'stair', cells: [c('b', 'c', '2', '3')], openTo: ['hall'] },
          { id: 'yard', name: 'Yard', type: 'courtyard', cells: [c('a', 'c', '3', '4')] },
          { id: 'garden', name: 'Garden', type: 'garden', cells: [c('c', 'd', '1', '4')] },
        ],
        openings: [
          { id: 'entry', kind: 'door', host: { space: 'hall', side: 'N' }, at: 'center', width: 1000, height: 2100, sill: 0 },
          { id: 'd-living', kind: 'door', host: { between: ['hall', 'living'] }, at: { from: 'start', offset: 500 }, width: 900, height: 2100, sill: 0 },
          { id: 'd-bed', kind: 'door', host: { between: ['living', 'bed'] }, at: { from: 'start', offset: 500 }, width: 900, height: 2100, sill: 0 },
          { id: 'w-living', kind: 'window', host: { space: 'living', side: 'S' }, at: 'center', width: 2000, height: 1500, sill: 900 },
          { id: 'w-bed', kind: 'window', host: { space: 'bed', side: 'S' }, at: { from: 'start', offset: 1000 }, width: 1500, height: 1500, sill: 900 },
        ],
        stairs: [{ id: 's1', space: 'stair1', kind: 'u', up: 'N' }],
      },
      {
        id: 'L2', name: 'Upper', height: 3000,
        spaces: [
          { id: 'bed2', name: 'Bedroom 2', type: 'bedroom', cells: [c('a', 'b', '2', '3')] },
          { id: 'stair2', name: 'Stair', type: 'stair', cells: [c('b', 'c', '2', '3')] },
        ],
        openings: [
          { id: 'd-bed2', kind: 'door', host: { between: ['bed2', 'stair2'] }, at: 'center', width: 900, height: 2100, sill: 0 },
          { id: 'w-bed2', kind: 'window', host: { space: 'bed2', side: 'N' }, at: 'center', width: 1500, height: 1500, sill: 900 },
        ],
        stairs: [],
      },
    ],
    roofs: [
      { id: 'r-low', kind: 'flat', cells: [c('a', 'c', '1', '2')], onLevel: 'L1', overhang: 300 },
      { id: 'r-top', kind: 'mono', cells: [c('a', 'c', '2', '3')], onLevel: 'L2', pitchDeg: 10, fall: 'S', overhang: 500 },
    ],
    style: 'modern-pitched',
  };
}

export function clone<T>(v: T): T {
  return structuredClone(v);
}
