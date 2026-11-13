// Task 017 (liquid glass) screenshots and checks. Starts `vite preview`
// on a build, drives the studio in Chromium (software GL) and writes PNGs
// to artifacts/task017/ (not committed).
//
//   node scripts/glass-shots.mjs            all shots
//   node scripts/glass-shots.mjs --only a,b just these (name prefix)
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, '..');
const out = resolve(appRoot, '../../artifacts/task017');
mkdirSync(out, { recursive: true });
const onlyArg = process.argv.indexOf('--only');
const only = onlyArg > 0 ? process.argv[onlyArg + 1].split(',') : null;
const wanted = (n) => !only || only.some((o) => n.startsWith(o));

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
const report = {};

async function open(path, viewport = { width: 1440, height: 900 }, opts = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, ...opts });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  page.on('console', (m) => m.type() === 'error' && console.log('console', m.text()));
  await page.goto(`${base}${path}`);
  await page.waitForFunction(() => window.__studio?.ready3d === true, null, { timeout: 180000 });
  await page.waitForTimeout(1500);
  return { ctx, page };
}
const shot = (page, name) => page.screenshot({ path: resolve(out, `${name}.png`) });
const counts = (page) => page.evaluate(() => ({ ...window.__studio.engine.viewer.frameCounts, pushes: window.__studio.glass.pushes }));

if (wanted('desktop')) {
  const { ctx, page } = await open('/studio?nohints');
  await shot(page, 'desktop-idle');
  // The sun popover morphing out of its button.
  const before = await counts(page);
  await page.click('[data-testid=bar-sun]');
  await page.waitForTimeout(110);
  await shot(page, 'desktop-sun-midmorph');
  await page.waitForTimeout(1200);
  const after = await counts(page);
  report.sunOpen = { scene: after.scene - before.scene, glass: after.glass - before.glass, pushes: after.pushes - before.pushes };
  await shot(page, 'desktop-sun-open');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(900);
  await shot(page, 'desktop-sun-closed');
  await ctx.close();
}
if (wanted('chat')) {
  const { ctx, page } = await open('/studio?nohints&panel=open');
  await page.evaluate(() => {
    const c = window.__studio.chat;
    c.setState({ items: [
      { id: 'u1', role: 'user', text: '把北侧房间加深 600' },
      { id: 'a1', role: 'assistant', text: '北墙外移 600 mm，厨房、楼梯和洗衣房一起变深。建筑面积 **+7.2 m²**。', phase: 'done' },
    ] });
  });
  await page.waitForTimeout(800);
  await shot(page, 'desktop-chat');
  await ctx.close();
}
if (wanted('phone')) {
  const { ctx, page } = await open('/studio?nohints', { width: 390, height: 844 }, { isMobile: true, hasTouch: true });
  await shot(page, 'phone-390-idle');
  await ctx.close();
  const p2 = await open('/studio?nohints&panel=open', { width: 390, height: 844 }, { isMobile: true, hasTouch: true });
  await p2.page.click('[data-testid=chat-history]').catch(() => {});
  await p2.ctx.close();
}
if (wanted('light')) {
  // Secondary reference: light glass (smoky glass is the default).
  const { ctx, page } = await open('/studio?nohints&glass=light');
  await page.click('[data-testid=bar-sun]');
  await page.waitForTimeout(1200);
  await shot(page, 'desktop-light-sun');
  await ctx.close();
}
if (wanted('css')) {
  const { ctx, page } = await open('/studio?nohints&glass=css');
  await page.click('[data-testid=bar-sun]');
  await page.waitForTimeout(1200);
  await shot(page, 'desktop-css-sun');
  await ctx.close();
}
if (wanted('frames')) {
  // Scene renders while only glass moves (frame=full: the house does not
  // re-frame around the panel, so nothing but the glass changes).
  const { ctx, page } = await open('/studio?nohints&frame=full');
  await page.waitForTimeout(1500);
  let a = await counts(page);
  await page.click('[data-testid=bar-views]');
  await page.waitForTimeout(1500);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1500);
  let b = await counts(page);
  report.viewsPanelOpenClose = { sceneRenders: b.scene - a.scene, glassOnlyFrames: b.glass - a.glass, pushes: b.pushes - a.pushes };
  const w = await page.locator('[data-testid=bar-walk]').boundingBox();
  a = await counts(page);
  await page.mouse.move(w.x + 20, w.y + 20);
  await page.mouse.down();
  await page.waitForTimeout(700);
  await page.mouse.move(w.x + 300, w.y + 300);
  await page.mouse.up();
  await page.waitForTimeout(900);
  b = await counts(page);
  report.pressAndRelease = { sceneRenders: b.scene - a.scene, glassOnlyFrames: b.glass - a.glass, pushes: b.pushes - a.pushes };
  // Frame cost, software GL (relative numbers only).
  report.frameMs = await page.evaluate(() => window.__studio.engine.viewer.measureGlass(10));
  await ctx.close();
  const c = await open('/studio?nohints&frame=full&glass=css');
  report.frameMs.sceneWithoutGlass = (await c.page.evaluate(() => window.__studio.engine.viewer.measureShadowUpdate(10))).withoutShadows;
  await c.ctx.close();
}
console.log(JSON.stringify(report, null, 2));
writeFileSync(resolve(out, 'report.json'), JSON.stringify(report, null, 2));
await browser.close();
server.kill('SIGTERM');
