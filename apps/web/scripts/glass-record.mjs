// Task 017, section 2b: records the glass interactions frame by frame at a
// fixed 30 fps step (Playwright's fake clock drives requestAnimationFrame,
// so software GL speed does not matter) for the side-by-side comparison
// with Apple's footage. Frames go to artifacts/task017/compare/ours/<name>/.
//
//   node scripts/glass-record.mjs [--only press,segment,popover,slider]
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, '..');
const out = resolve(appRoot, '../../artifacts/task017/compare/ours');
const onlyArg = process.argv.indexOf('--only');
const only = onlyArg > 0 ? process.argv[onlyArg + 1].split(',') : null;
const wanted = (n) => !only || only.includes(n);
const STEP = 1000 / 30;

const require = createRequire(import.meta.url);
let playwright;
try {
  playwright = require('playwright');
} catch {
  playwright = require(require.resolve('playwright', { paths: [process.env.NODE_PATH ?? '', '/opt/node-tools/node_modules'] }));
}
const port = await new Promise((ok) => {
  const s = createServer();
  s.listen(0, '127.0.0.1', () => {
    const { port } = s.address();
    s.close(() => ok(port));
  });
});
const base = `http://localhost:${port}`;
const server = spawn(process.execPath, [resolve(appRoot, 'node_modules/vite/bin/vite.js'), 'preview', '--port', String(port), '--strictPort'], { cwd: appRoot, stdio: 'ignore', env: { ...process.env, CI: '1' } });
process.on('exit', () => server.kill('SIGTERM'));
for (let i = 0; i < 120; i++) {
  try {
    if ((await fetch(`${base}/api/health`)).ok) break;
  } catch {}
  await new Promise((r) => setTimeout(r, 250));
}
const browser = await playwright.chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });

async function open(path) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  await page.clock.install();
  await page.goto(`${base}${path}`);
  await page.waitForFunction(() => window.__studio?.ready3d === true, null, { timeout: 180000 });
  await page.waitForTimeout(1500);
  await page.clock.pauseAt(Date.now() + 1000);
  await page.clock.runFor(1500);
  return { ctx, page };
}

/** Runs `frames` steps of 1/30 s, screenshotting `clip` after each; `at` maps a frame index to an action. */
async function record(page, name, clip, frames, at = {}) {
  const dir = resolve(out, name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  for (let i = 0; i < frames; i++) {
    if (at[i]) await at[i]();
    await page.clock.runFor(STEP);
    await page.screenshot({ path: resolve(dir, `f${String(i + 1).padStart(3, '0')}.png`), clip });
  }
  console.log(`${name}: ${frames} frames`);
}

const box = async (page, sel) => page.locator(sel).first().boundingBox();

if (wanted('press')) {
  const { ctx, page } = await open('/studio?nohints');
  const b = await box(page, '[data-testid=bar-walk]');
  const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
  const clip = { x: b.x - 40, y: b.y - 30, width: b.width + 80, height: b.height + 60 };
  // Press and hold ~0.4 s, drag a little, release away (no click: the
  // walk stays off), as Apple's press-and-hold on the play button.
  await record(page, 'press', clip, 40, {
    2: () => page.mouse.move(cx, cy),
    3: () => page.mouse.down(),
    16: () => page.mouse.move(cx + 18, cy + 6),
    22: () => page.mouse.move(cx + 300, cy + 300),
    23: () => page.mouse.up(),
  });
  await ctx.close();
}
if (wanted('segment')) {
  const { ctx, page } = await open('/studio?nohints');
  const g = await box(page, '[data-testid=mode-switch]');
  const s3 = await box(page, '[data-seg="3d"]');
  const s2 = await box(page, '[data-seg="sheet"]');
  const clip = { x: g.x - 30, y: g.y - 20, width: g.width + 60, height: g.height + 40 };
  const y = s3.y + s3.height / 2;
  // Press on 3D, drag the lens to 图册 and back, release on 3D (stays in 3D).
  const steps = {};
  steps[2] = () => page.mouse.move(s3.x + s3.width / 2, y);
  steps[3] = () => page.mouse.down();
  const x0 = s3.x + s3.width / 2, x1 = s2.x + s2.width / 2;
  for (let i = 0; i < 16; i++) steps[8 + i] = () => page.mouse.move(x0 + ((x1 - x0) * (i + 1)) / 16, y);
  for (let i = 0; i < 16; i++) steps[30 + i] = () => page.mouse.move(x1 - ((x1 - x0) * (i + 1)) / 16, y);
  steps[50] = () => page.mouse.up();
  await record(page, 'segment-drag', clip, 66, steps);
  await ctx.close();
}
if (wanted('popover')) {
  const { ctx, page } = await open('/studio?nohints');
  const clip = { x: 1060, y: 0, width: 380, height: 480 };
  const sunBtn = await box(page, '[data-testid=bar-sun]');
  await record(page, 'popover-open', clip, 24, { 2: () => page.mouse.click(sunBtn.x + sunBtn.width / 2, sunBtn.y + sunBtn.height / 2) });
  for (let i = 0; i < 30; i++) {
    await page.clock.runFor(50);
    await page.screenshot({ clip: { x: 0, y: 0, width: 4, height: 4 } });
  }
  await record(page, 'popover-close', clip, 24, { 2: () => page.keyboard.press('Escape') });
  await ctx.close();
}
if (wanted('slider')) {
  const { ctx, page } = await open('/studio?nohints');
  const sunBtn = await box(page, '[data-testid=bar-sun]');
  await page.mouse.click(sunBtn.x + sunBtn.width / 2, sunBtn.y + sunBtn.height / 2);
  // Advance in small steps with a frame each (one long jump of the fake
  // clock leaves Chromium slow to produce the next screenshot).
  for (let i = 0; i < 40; i++) {
    await page.clock.runFor(50);
    await page.screenshot({ clip: { x: 0, y: 0, width: 4, height: 4 } });
  }
  const s = await box(page, '.lg-slider');
  const clip = { x: s.x - 20, y: s.y - 24, width: s.width + 40, height: s.height + 48 };
  const y = s.y + s.height / 2;
  const tx = await page.evaluate(() => {
    const L = document.querySelector('.lg-slider .lg-lens').getBoundingClientRect();
    return L.left + L.width / 2;
  });
  const steps = { 2: () => page.mouse.move(tx, y), 3: () => page.mouse.down() };
  for (let i = 0; i < 20; i++) steps[8 + i] = () => page.mouse.move(tx + ((s.x + s.width * 0.8 - tx) * (i + 1)) / 20, y);
  steps[34] = () => page.mouse.up();
  await record(page, 'slider-drag', clip, 50, steps);
  await ctx.close();
}
await browser.close();
server.kill('SIGTERM');
