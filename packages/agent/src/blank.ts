// An empty plot to build on with `edit_house`.
import type { House } from '@opensu/model';

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

/** Plot sizes are surveyed, not modular: round to 100 mm. */
const snap = (mm: number) => Math.max(3000, Math.round(mm / 100) * 100);
