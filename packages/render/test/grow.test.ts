import { describe, expect, it } from 'vitest';
import { growHeight } from '../src/grow';

const levels = [
  { elevation: 0, top: 3.3 },
  { elevation: 3.3, top: 6.3 },
];

describe('growHeight', () => {
  it('starts at the floor of the first growing level and ends at the ceiling', () => {
    expect(growHeight(levels, 8, 0)).toBe(0);
    expect(growHeight(levels, 8, 1)).toBe(8);
    expect(growHeight(levels, 8, 0, 1)).toBe(3.3);
  });
  it('reaches each floor line at the end of its slot and never goes down', () => {
    expect(growHeight(levels, 8, 0.5)).toBeCloseTo(3.3);
    let prev = -1;
    for (let t = 0; t <= 1.0001; t += 0.01) {
      const h = growHeight(levels, 8, t);
      expect(h).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = h;
    }
  });
});
