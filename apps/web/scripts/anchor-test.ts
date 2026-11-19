// Unit tests of where an anchored surface stands (task 025, packages/ui/src/anchor.ts).
//   node --experimental-strip-types --no-warnings --import ./scripts/ts-resolve.mjs --test scripts/anchor-test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { place } from '../../../packages/ui/src/anchor.ts';
import { GLASS } from '../../../packages/ui/src/material.ts';

const view = { w: 1440, h: 900 };
const gap = GLASS.anchorGap;

test('a menu opens at its anchor, aligned to its leading edge, the gap below it', () => {
  const p = place({ x: 24, y: 18, width: 180, height: 36 }, { w: 300, h: 420 }, 'below-start', view);
  assert.equal(p.x, 24);
  assert.equal(p.y, 18 + 36 + gap);
  assert.equal(p.side, 'below');
});

test('a toolbar panel floats below its own button, centred, shifted to stay on screen (task 029)', () => {
  const p = place({ x: 1370, y: 22, width: 48, height: 40 }, { w: 330, h: 300 }, 'below-center', view);
  assert.equal(p.y, 62 + gap);
  assert.equal(p.x + 330, 1440 - GLASS.screenInset);
  const q = place({ x: 1100, y: 22, width: 48, height: 40 }, { w: 330, h: 300 }, 'below-center', view);
  assert.equal(q.x + 165, 1124);
});

test('a menu in the pinned field opens above its button and stays inside the column', () => {
  const column = { x: 18, y: 84, width: 360, height: 804 };
  const p = place({ x: 30, y: 840, width: 70, height: 28 }, { w: 300, h: 140 }, 'above-start', view, column);
  assert.equal(p.x, 30);
  assert.equal(p.y + 140, 840 - gap);
  // Near the column's right end it shifts left to stay inside.
  const q = place({ x: 300, y: 840, width: 70, height: 28 }, { w: 300, h: 140 }, 'above-start', view, column);
  assert.equal(q.x + 300, 378);
});

test('flips only when it does not fit, and never leaves the screen', () => {
  const p = place({ x: 1400, y: 820, width: 30, height: 30 }, { w: 300, h: 200 }, 'below-start', view);
  assert.equal(p.side, 'above');
  assert.equal(p.y + 200, 820 - gap);
  assert.equal(p.x, 1440 - GLASS.screenInset - 300);
});

test('centred above an input', () => {
  const p = place({ x: 430, y: 822, width: 580, height: 56 }, { w: 380, h: 300 }, 'above-center', view);
  assert.equal(p.x, 430 + 290 - 190);
  assert.equal(p.y, 822 - gap - 300);
});
