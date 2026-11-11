import { describe, expect, it } from 'vitest';
import { golden, resolve } from '@opensu/model';
import { metres, sheetFacts } from '../src/facts.js';
import { hitsKeepout, inkMask, placeDrawing } from '../src/layout.js';

/** RGBA white image with black rectangles. */
function image(w: number, h: number, rects: [number, number, number, number][]): Uint8ClampedArray {
  const d = new Uint8ClampedArray(w * h * 4).fill(255);
  for (const [x0, y0, x1, y1] of rects) {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) d.fill(0, (y * w + x) * 4, (y * w + x) * 4 + 3);
  }
  return d;
}

describe('facts', () => {
  it('formats the golden sample header', () => {
    const facts = sheetFacts(resolve(golden));
    expect(facts[0]).toBe('宅基地：12x15M');
    expect(facts[1]).toMatch(/^总面积：\d+㎡$/);
    expect(facts[2]).toBe('现代坡顶');
  });
  it('rounds metres to one decimal', () => {
    expect(metres(12000)).toBe('12');
    expect(metres(12500)).toBe('12.5');
    expect(metres(9960)).toBe('10');
  });
});

describe('inkMask', () => {
  it('finds the bounding box and border contact', () => {
    const m = inkMask(image(20, 10, [[3, 2, 8, 6]]), 20, 10, 250);
    expect(m.bbox).toEqual({ x0: 3, y0: 2, x1: 8, y1: 6 });
    expect(m.touchesBorder).toBe(false);
    expect(inkMask(image(20, 10, [[0, 2, 8, 6]]), 20, 10, 250).touchesBorder).toBe(true);
  });
});

describe('placeDrawing', () => {
  // An L-shaped drawing: a tall block on the right, a low wing on the left.
  const mask = inkMask(image(100, 100, [[50, 0, 100, 100], [0, 60, 50, 100]]), 100, 100, 250);
  const region = { x0: 0, y0: 0, x1: 300, y1: 200 };

  it('fills the region, centred and bottom-aligned, without a keepout', () => {
    const p = placeDrawing(mask, region, { centerX: 150, alignY: 'bottom' });
    expect(p.scale).toBeCloseTo(2);
    expect(p.x).toBeCloseTo(50);
    expect(p.y).toBeCloseTo(0);
  });

  it('keeps ink out of the header block, letting the low wing pass under it', () => {
    const keepout = { x0: 0, y0: 0, x1: 120, y1: 100 };
    const p = placeDrawing(mask, region, { centerX: 150, alignY: 'bottom', keepout: [keepout] });
    expect(hitsKeepout(mask, p, keepout)).toBe(false);
    // Full size still fits: the tall block moves right of the header, the wing sits under it.
    expect(p.scale).toBeCloseTo(2);
    expect(p.x + 50 * p.scale).toBeGreaterThanOrEqual(120);
  });

  it('shrinks only when no position clears the keepout', () => {
    const keepout = { x0: 0, y0: 0, x1: 260, y1: 60 };
    const p = placeDrawing(mask, region, { centerX: 150, alignY: 'bottom', keepout: [keepout] });
    expect(hitsKeepout(mask, p, keepout)).toBe(false);
    expect(p.scale).toBeLessThan(2);
  });

  it('respects a maximum scale', () => {
    const p = placeDrawing(mask, region, { centerX: 150, alignY: 'center', maxScale: 1 });
    expect(p.scale).toBe(1);
    expect(p.y).toBeCloseTo(50);
  });
});

describe('staircase keepout', () => {
  it('lets ink pass under a wide title line but beside the narrow fact lines', () => {
    // A drawing that is tall everywhere except a notch at its top-left.
    const mask = inkMask(image(100, 100, [[40, 0, 100, 100], [0, 30, 40, 100]]), 100, 100, 250);
    const title = { x0: 0, y0: 0, x1: 200, y1: 20 };
    const facts = { x0: 0, y0: 0, x1: 60, y1: 70 };
    const p = placeDrawing(mask, { x0: 0, y0: 0, x1: 300, y1: 120 }, { centerX: 150, alignY: 'bottom', keepout: [title, facts] });
    expect(hitsKeepout(mask, p, title) || hitsKeepout(mask, p, facts)).toBe(false);
  });
});
