// Screenshots of the studio chrome in every state at five viewports, and the
// count of visible interactive controls (task 013). The built app runs in
// the local Workers runtime (`vite preview` = workerd).
//
//   node scripts/ui-shots.mjs                        -> artifacts/web/ui/<viewport>-<state>.png
//   node scripts/ui-shots.mjs --vp 1440x900,390x844  some viewports
//   node scripts/ui-shots.mjs --only default,sun     some states (name prefixes)
//
// Requires a build (`pnpm --filter @opensu/web build`).
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { countControls } from './controls.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, '..');
const outDir = resolve(appRoot, '../../artifacts/web/ui');
mkdirSync(outDir, { recursive: true });
const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1].split(',') : null;
};
const onlyStates = arg('--only');
const onlyVps = arg('--vp');
const wanted = (s) => !onlyStates || onlyStates.some((o) => s.startsWith(o));

if (!existsSync(resolve(appRoot, 'dist/client/studio.html'))) {
  console.error('No build found: run `pnpm --filter @opensu/web build` first.');
  process.exit(1);
}
const require = createRequire(import.meta.url);
let playwright;
try {
  playwright = require('playwright');
} catch {
  playwright = require(require.resolve('playwright', { paths: [process.env.NODE_PATH ?? '', '/opt/node-tools/node_modules'] }));
}
const freePort = () => new Promise((ok) => {
  const s = createServer();
  s.listen(0, '127.0.0.1', () => {
    const { port } = s.address();
    s.close(() => ok(port));
  });
});
const port = await freePort();
const base = `http://localhost:${port}`;
const server = spawn(process.execPath, [resolve(appRoot, 'node_modules/vite/bin/vite.js'), 'preview', '--port', String(port), '--strictPort'], { cwd: appRoot, stdio: 'ignore', env: { ...process.env, CI: '1' } });
process.on('exit', () => server.kill('SIGTERM'));
for (let i = 0; i < 120; i++) {
  try {
    if ((await fetch(`${base}/api/health`)).ok) break;
  } catch {
    /* not up yet */
  }
  await new Promise((r) => setTimeout(r, 250));
}

const VPS = [
  ['1440x900', { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 }],
  ['1024x700', { viewport: { width: 1024, height: 700 }, deviceScaleFactor: 1 }],
  ['820x1180', { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 1, hasTouch: true }],
  ['390x844', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
  ['844x390', { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
].filter(([n]) => !onlyVps || onlyVps.includes(n));

const browser = await playwright.chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const counts = {};
const errors = [];
const settle = (page, ms = 450) => page.evaluate((m) => new Promise((r) => setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(r)), m)), ms);
const store = (page, fn) => page.evaluate(fn);

for (const [vp, opts] of VPS) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${vp}: ${e.message}`));
  const shot = async (state) => {
    if (!wanted(state)) return;
    await settle(page);
    const file = resolve(outDir, `${vp}-${state}.png`);
    await page.screenshot({ path: file, timeout: 180000 });
    console.log(`  ${vp} ${state}`);
  };
  const reset = async () => {
    await page.keyboard.press('Escape');
    await store(page, () => {
      const s = window.__studio.store.getState();
      s.setTray(null);
      s.setSitePanel(null);
      s.setChatOpen(false);
      s.setWalk(false);
      s.setMode('3d');
      s.setSun({ on: false, playing: false });
    });
    await settle(page, 600);
  };
  await page.goto(`${base}/studio`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__studio?.ready3d === true, null, { timeout: 180000 });
  await settle(page, 900);
  counts[vp] = { hints: await page.evaluate(countControls) };
  await shot('hints');
  await page.getByRole('button', { name: /不再提示|Dismiss tips/ }).click();
  await settle(page, 600);
  counts[vp].default = await page.evaluate(countControls);
  console.log(vp, 'default', counts[vp].default.elements, counts[vp].default.widgets, counts[vp].default.list.join(' | '));
  await shot('default');

  if (wanted('menu')) {
    await page.getByTestId('project-menu').click();
    await shot('menu');
    await reset();
  }
  for (const [state, testId] of [['views', 'bar-views'], ['levels', 'bar-levels'], ['sun', 'bar-sun']]) {
    if (!wanted(state)) continue;
    await page.getByTestId(testId).click();
    if (state === 'sun') await page.evaluate(() => window.__studio.store.getState().setSun({ minutes: 10 * 60 }));
    await shot(state);
    if (state === 'sun' && wanted('sun-closed')) {
      await page.keyboard.press('Escape');
      await shot('sun-closed');
    }
    await reset();
  }
  if (wanted('location')) {
    await store(page, () => window.__studio.store.getState().setSitePanel({ kind: 'location' }));
    await settle(page);
    await page.getByTestId('loc-search').fill('成都');
    await page.waitForSelector('[data-testid=loc-results] button', { timeout: 30000 });
    await shot('location');
    await page.getByTestId('loc-search').fill('berl');
    await page.waitForSelector('[data-testid=loc-results] button', { timeout: 30000 });
    await shot('location-world');
    await reset();
  }
  if (wanted('orientation')) {
    await store(page, () => window.__studio.store.getState().setSitePanel({ kind: 'orientation' }));
    await shot('orientation');
    await reset();
  }
  if (wanted('chat')) {
    await page.getByTestId('prompt-bar').click();
    await settle(page, 700);
    await shot('chat');
    await reset();
  }
  if (wanted('walk')) {
    await store(page, () => window.__studio.store.getState().setWalk(true));
    await page.waitForFunction(() => window.__studio?.engine?.viewer?.walking === true, null, { timeout: 60000 });
    await settle(page, 700);
    await shot('walk');
    await reset();
  }
  if (wanted('plan')) {
    await store(page, () => window.__studio.store.getState().setMode('plan'));
    await page.waitForSelector('[data-testid=plan] svg', { timeout: 60000 });
    await shot('plan');
    if (wanted('plan-zoomed')) {
      await page.getByRole('button', { name: /放大|Zoom in/ }).click();
      await page.getByRole('button', { name: /放大|Zoom in/ }).click();
      await shot('plan-zoomed');
    }
    await reset();
  }
  if (wanted('sheets')) {
    await store(page, () => window.__studio.store.getState().setMode('sheet'));
    await page.waitForFunction(() => window.__sheets?.done === true, null, { timeout: 300000 });
    await settle(page, 600);
    await shot('sheets');
    await reset();
  }
  await ctx.close();
}
await browser.close();
server.kill('SIGTERM');
writeFileSync(resolve(outDir, 'counts.json'), JSON.stringify(counts, null, 2));
if (errors.length) {
  console.error(`page errors:\n- ${errors.join('\n- ')}`);
  process.exit(1);
}
console.log(`-> ${outDir}`);
