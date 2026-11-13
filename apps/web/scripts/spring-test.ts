// Unit tests of the shared glass spring (node --test, types stripped).
//   node --experimental-strip-types --no-warnings --test scripts/spring-test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Spring, SPRINGS, step, stiffnessOf } from '../src/glass/spring.ts';

/** Simulates a spring from 0 to 1 at 120 Hz; returns the samples. */
function run(preset: { response: number; damping: number }, seconds = 2): number[] {
  const { k, c } = stiffnessOf(preset);
  let x = -1, v = 0;
  const out: number[] = [];
  for (let t = 0; t < seconds; t += 1 / 120) {
    [x, v] = step(x, v, k, c, 1 / 120);
    out.push(1 + x);
  }
  return out;
}

test('every preset settles on its target', () => {
  for (const [name, p] of Object.entries(SPRINGS)) {
    const s = run(p);
    assert.ok(Math.abs(s[s.length - 1]! - 1) < 1e-3, `${name} settles`);
  }
});

test('morphs and lenses bounce a little, sheets do not bounce', () => {
  const peak = (p: { response: number; damping: number }) => Math.max(...run(p));
  for (const name of ['morph', 'slide', 'lift'] as const) {
    const over = peak(SPRINGS[name]) - 1;
    assert.ok(over > 0.001 && over < 0.08, `${name} overshoot ${over.toFixed(3)}`);
  }
  assert.ok(peak(SPRINGS.sheet) <= 1 + 1e-9, 'sheet has no overshoot');
  assert.ok(peak(SPRINGS.fade) <= 1 + 1e-9, 'fade has no overshoot');
});

test('response is Apple-like: mostly there within the response time', () => {
  for (const name of ['morph', 'slide', 'sheet'] as const) {
    const p = SPRINGS[name];
    assert.ok(p.response >= 0.3 && p.response <= 0.5, `${name} response ${p.response}`);
    const s = run(p);
    const at = s[Math.round(p.response * 120)]!;
    assert.ok(at > 0.9, `${name} reaches ${at.toFixed(2)} after one response`);
  }
});

test('the analytic step composes (frame rate does not change the motion)', () => {
  for (const p of [SPRINGS.morph, SPRINGS.sheet, { response: 0.4, damping: 1.4 }]) {
    const { k, c } = stiffnessOf(p);
    const [x1, v1] = step(-1, 0.5, k, c, 0.1);
    const [xa, va] = step(-1, 0.5, k, c, 0.05);
    const [x2, v2] = step(xa, va, k, c, 0.05);
    assert.ok(Math.abs(x1 - x2) < 1e-9 && Math.abs(v1 - v2) < 1e-9);
  }
});

test('reduced motion: a spring jumps to its target, unless asked to animate', () => {
  const g = globalThis as { matchMedia?: (q: string) => { matches: boolean } };
  const saved = g.matchMedia;
  g.matchMedia = () => ({ matches: true });
  try {
    const seen: number[] = [];
    const s = new Spring(0, SPRINGS.morph, (v) => seen.push(v));
    s.set(1);
    assert.equal(s.value, 1);
    assert.ok(s.reduced);
    assert.deepEqual(seen, [1]);
    // Advanced by hand: the fades that stand in for motion still animate.
    const f = new Spring(0, SPRINGS.fade);
    (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame ??= () => 0;
    f.set(1, { always: true });
    assert.equal(f.value, 0);
    f.advance(0.1);
    assert.ok(f.value > 0 && f.value < 1);
    f.stop();
  } finally {
    g.matchMedia = saved;
  }
});
