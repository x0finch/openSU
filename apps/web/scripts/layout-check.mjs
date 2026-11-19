// The studio layout of task 015, checked in the built app (local Workers
// runtime): every state of the approved boards as a screenshot, the house
// width and the free-canvas share per state (the boards' definitions), and
// the behaviour checks of the task.
//
//   node scripts/layout-check.mjs                     all states + checks -> artifacts/web/layout/
//   node scripts/layout-check.mjs --only desk-sun,checks
//   node scripts/layout-check.mjs --mockups <dir>     also side-by-side images (mockup | app) of the
//                                                     approved state images in <dir> (not in the repo)
//
// Definitions (as on the boards): free share = the largest rectangle of the
// viewport that touches no control (12 px clearance on desktop, 6 px on
// phones; the recent strip excepted) and shows the house largest, divided by
// the viewport; house width = width of the drawn picture (trees and shadows
// included), CSS px.
//
// Requires a build (`pnpm --filter @opensu/web build`).
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, '..');
const outDir = resolve(appRoot, '../../artifacts/web/layout');
mkdirSync(outDir, { recursive: true });
const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : null;
};
const only = arg('--only')?.split(',') ?? null;
const wanted = (s) => !only || only.some((o) => s.startsWith(o));
const mockups = arg('--mockups');

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

const failures = [];
const check = (cond, msg) => {
  if (!cond) failures.push(msg);
  console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${msg}`);
};

const vp = (w, h) => {
  const phone = w < 768 || h < 520;
  return { viewport: { width: w, height: h }, deviceScaleFactor: phone ? 2 : 1, isMobile: phone, hasTouch: phone };
};

/** The conversation shown on the boards (two exchanges, each with a changes card). */
const SEED = [
  { id: 'seed-u1', role: 'user', text: '客厅再亮一点' },
  { id: 'seed-a1', role: 'assistant', phase: 'done', text: '把客厅南窗从 2.4 m 加宽到 **3.6 m**，窗台降到 0.45 m。冬至中午阳光能照进客厅一半进深。', changes: [{ summary: '客厅南窗加宽 1200 mm', details: [] }], undo: 'can-undo' },
  { id: 'seed-u2', role: 'user', text: '把北侧房间加深 600' },
  { id: 'seed-a2', role: 'assistant', phase: 'done', text: '好的，北墙所在的轴线 F 外移 600 mm，厨房、楼梯、洗衣房和二楼主卫一起变深。厨房现在 **3.6 × 3.3 m**；建筑面积增加约 **13.3 m²**。', changes: [{ summary: '北侧房间加深 600 mm', details: [] }], undo: 'can-undo' },
];

const seed = (page, extra) => page.evaluate(([items, extra]) => {
  const c = window.__studio.chat;
  c.setState({ items: extra ? [...items, ...extra.items] : items, running: !!extra?.running });
}, [SEED, extra ?? null]);

const WORKING = { running: true, items: [{ id: 'seed-u3', role: 'user', text: '厨房的窗能再大一点吗？' }, { id: 'seed-a3', role: 'assistant', text: '', phase: 'working' }] };

const store = (page, fn, a) => page.evaluate(fn, a);

/**
 * States of the approved boards: [name, viewport, query, setup, mockup file].
 * The mockup's phone sun state is the variant the owner chose (input hidden).
 */
const STATES = [
  ['desk-idle', [1440, 900], '', null, 'desk-idle'],
  ['desk-hover', [1440, 900], '', async (p) => p.getByTestId('bar-sun').hover(), 'desk-hover'],
  ['desk-work', [1440, 900], '', async (p) => seed(p, WORKING), 'desk-work'],
  ['desk-hist', [1440, 900], '', async (p) => p.getByTestId('chat-history').click(), 'desk-hist'],
  ['desk-pin', [1440, 900], '', async (p) => store(p, () => window.__studio.store.getState().setPinned(true)), 'desk-pin'],
  ['desk-sun', [1440, 900], '?sun=winter&time=10:00&cut=L1', async (p) => p.getByTestId('bar-sun').click(), 'desk-sun'],
  ['desk-view', [1440, 900], '?view=axo-sw', async (p) => p.getByTestId('bar-views').click(), 'desk-view'],
  ['desk-level', [1440, 900], '?cut=L2', async (p) => p.getByTestId('bar-levels').click(), 'desk-level'],
  ['desk-walk', [1440, 900], '?walk=1', async (p) => p.waitForFunction(() => window.__studio?.engine?.viewer?.walking === true), 'desk-walk'],
  ['phone390-idle', [390, 844], '', null, 'phone390-idle'],
  ['phone390-work', [390, 844], '', async (p) => seed(p, WORKING), 'phone390-work'],
  ['phone390-hist', [390, 844], '', async (p) => p.getByTestId('chat-history').click(), 'phone390-hist'],
  ['phone390-pin', [390, 844], '', async (p) => store(p, () => window.__studio.store.getState().setPinned(true)), 'phone390-pin'],
  ['phone390-level', [390, 844], '?cut=L2', async (p) => p.getByTestId('bar-levels').click(), 'phone390-level'],
  ['phone390-view', [390, 844], '?view=axo-sw', async (p) => p.getByTestId('bar-views').click(), 'phone390-view'],
  ['phone390-sun', [390, 844], '?sun=winter&time=10:00&cut=L1', async (p) => p.getByTestId('bar-sun').click(), 'phone390-sunalt'],
  ['phone390-walk', [390, 844], '?walk=1', async (p) => p.waitForFunction(() => window.__studio?.engine?.viewer?.walking === true), 'phone390-walk'],
  ['phone360-idle', [360, 844], '', null, 'phone360-idle'],
  ['phone360-sun', [360, 844], '?sun=winter&time=10:00&cut=L1', async (p) => p.getByTestId('bar-sun').click(), 'phone360-sun'],
  ['phone320-idle', [320, 844], '', null, 'phone320-idle'],
  ['phone320-sun', [320, 844], '?sun=winter&time=10:00&cut=L1', async (p) => p.getByTestId('bar-sun').click(), 'phone320-sun'],
  // Further viewports (no mockup): the default and the sun states.
  ['d1024-idle', [1024, 700], '', null, null],
  ['d1024-sun', [1024, 700], '?sun=winter&time=10:00&cut=L1', async (p) => p.getByTestId('bar-sun').click(), null],
  ['t820-idle', [820, 1180], '', null, null],
  ['t820-sun', [820, 1180], '?sun=winter&time=10:00&cut=L1', async (p) => p.getByTestId('bar-sun').click(), null],
  ['land844-idle', [844, 390], '', null, null],
  ['land844-sun', [844, 390], '?sun=winter&time=10:00&cut=L1', async (p) => p.getByTestId('bar-sun').click(), null],
];

/**
 * In the page: obstacles (the controls), the free share and the house.
 * Runs against the WebGL canvas pixels (the drawing only, no UI).
 */
function measureInPage(gap) {
  const W = innerWidth, H = innerHeight;
  const sel = '[role=toolbar], [data-panel], [data-testid=phone-sheet][data-open], [data-testid=chat-panel], [data-testid=prompt], [data-testid=hints], [data-testid=change-toast], [data-testid=walk-hud], [data-testid=walk-pill], [data-testid=walk-joystick], [data-testid=project-menu], [data-testid=fact-area], [role=radiogroup][aria-label], [data-testid=input-wrap] [data-testid=prompt]';
  const obs = [...document.querySelectorAll(sel)].filter((el) => {
    if (el.closest('[data-testid=recent-strip]') || el.closest('[inert]') || el.closest('[data-testid=walk-landscape]')) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2 || r.right <= 0 || r.bottom <= 0 || r.left >= W || r.top >= H) return false;
    // A radiogroup inside a panel is covered by the panel itself.
    if (el.matches('[role=radiogroup]') && el.closest('[data-panel], [data-testid=phone-sheet]')) return false;
    return el.checkVisibility({ opacityProperty: true, visibilityProperty: true });
  }).map((el) => {
    const r = el.getBoundingClientRect();
    return [r.left, r.top, r.right, r.bottom, el.getAttribute('data-testid') || el.getAttribute('role') || el.tagName];
  });
  // The drawing: ink bounding box from the canvas.
  const v = window.__studio?.engine?.viewer;
  let house = null, inkUnder = [];
  if (v) {
    v.renderNow();
    const src = v.renderer.domElement;
    const cr = src.getBoundingClientRect();
    const c = document.createElement('canvas');
    const k = 0.5;
    c.width = Math.round(cr.width * k);
    c.height = Math.round(cr.height * k);
    const g = c.getContext('2d');
    g.drawImage(src, 0, 0, c.width, c.height);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    const ink = (x, y) => {
      const i = (y * c.width + x) * 4;
      return d[i] < 240 || d[i + 1] < 240 || d[i + 2] < 240;
    };
    let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (ink(x, y)) {
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
    if (x1 >= 0) house = { left: cr.left + x0 / k, top: cr.top + y0 / k, right: cr.left + (x1 + 1) / k, bottom: cr.top + (y1 + 1) / k };
    // Under each control: the house's lines and coloured parts (the light,
    // neutral grey of ground shadows may run on under the chrome).
    const drawn = (x, y) => {
      const i = (y * c.width + x) * 4;
      const [r, gg, bb] = [d[i], d[i + 1], d[i + 2]];
      const neutralLight = Math.max(r, gg, bb) - Math.min(r, gg, bb) < 8 && Math.min(r, gg, bb) > 150;
      return ink(x, y) && !neutralLight;
    };
    for (const [l, t, r, b, name] of obs) {
      let n = 0, m = 0;
      for (let y = Math.max(0, Math.floor((t - cr.top) * k)); y < Math.min(c.height, Math.ceil((b - cr.top) * k)); y++) {
        for (let x = Math.max(0, Math.floor((l - cr.left) * k)); x < Math.min(c.width, Math.ceil((r - cr.left) * k)); x++) {
          m++;
          if (drawn(x, y)) n++;
        }
      }
      if (m) inkUnder.push({ name, share: n / m });
    }
  }
  // Largest free rectangle that shows the house largest (the boards' definition).
  const aspect = house ? (house.right - house.left) / Math.max(1, house.bottom - house.top) : 1.37;
  const O = obs.map(([l, t, r, b]) => [l - gap, t - gap, r + gap, b + gap]);
  const xs = [...new Set([0, W, ...O.flatMap((o) => [o[0], o[2]])])].filter((x) => x >= 0 && x <= W).sort((a, b) => a - b);
  const ys = [...new Set([0, H, ...O.flatMap((o) => [o[1], o[3]])])].filter((y) => y >= 0 && y <= H).sort((a, b) => a - b);
  let best = { s: 0, w: 0, h: 0 };
  for (let a = 0; a < xs.length; a++) for (let b = a + 1; b < xs.length; b++) for (let c = 0; c < ys.length; c++) for (let e = c + 1; e < ys.length; e++) {
    const r = [xs[a], ys[c], xs[b], ys[e]];
    if (O.some((o) => o[0] < r[2] && o[2] > r[0] && o[1] < r[3] && o[3] > r[1])) continue;
    const w = r[2] - r[0], h = r[3] - r[1], s = Math.min(w / aspect, h);
    if (s > best.s + 1e-6 || (Math.abs(s - best.s) < 1e-6 && w * h > best.w * best.h)) best = { s, w, h };
  }
  const strip = document.querySelector('[data-testid=recent-strip]')?.getBoundingClientRect();
  let cover = 0;
  if (strip && house) {
    const ow = Math.max(0, Math.min(strip.right, house.right) - Math.max(strip.left, house.left));
    const oh = Math.max(0, Math.min(strip.bottom, house.bottom) - Math.max(strip.top, house.top));
    cover = (ow * oh) / ((house.right - house.left) * (house.bottom - house.top));
  }
  return {
    free: (best.w * best.h) / (W * H),
    houseW: house ? Math.round(house.right - house.left) : 0,
    houseH: house ? Math.round(house.bottom - house.top) : 0,
    cover,
    inkUnder: inkUnder.filter((x) => x.share > 0.004).map((x) => `${x.name} ${(x.share * 100).toFixed(1)}%`),
  };
}

/** Mockup numbers from the boards (free share, house width). */
const BOARD = {
  'desk-idle': [0.61, 951], 'desk-hover': [0.59, 951], 'desk-work': [0.61, 951], 'desk-hist': [0.61, 951], 'desk-pin': [0.68, 1020],
  'desk-sun': [0.53, 873], 'desk-view': [0.53, 811], 'desk-level': [0.53, 872], 'desk-walk': [1, 1440],
  'phone390-idle': [0.77, 374], 'phone390-work': [0.77, 374], 'phone390-hist': [0.77, 374], 'phone390-pin': [0.34, 374], 'phone390-level': [0.5, 374],
  'phone390-view': [0.44, 374], 'phone390-sun': [0.4, 374], 'phone390-walk': [1, null],
  'phone360-idle': [null, null], 'phone360-sun': [null, null], 'phone320-idle': [0.77, 304], 'phone320-sun': [0.33, 304],
};

const browser = await playwright.chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });

async function open(opts, path, { hints = false, ctxOpts = {} } = {}) {
  const ctx = await browser.newContext({ ...opts, ...ctxOpts });
  if (!hints) await ctx.addInitScript(() => {
    localStorage.setItem('opensu.hints.v1', 'done');
    localStorage.setItem('opensu.toolnames.v1', 'done');
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => failures.push(`${path}: page error ${e.message}`));
  await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
  if (!path.includes('mode=')) await page.waitForFunction(() => window.__studio?.ready3d === true, null, { timeout: 180000 });
  return { ctx, page };
}

/** Lets transitions finish and the 3D view render its latest state (software GL is slow). */
const settle = (page, ms = 900) => page.evaluate((m) => new Promise((r) => setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(r)), m)), ms);

const table = [];
const composeQueue = [];

for (const [name, [w, h], query, setup, mock] of STATES) {
  if (!wanted(name) && !wanted('states')) continue;
  const { ctx, page } = await open(vp(w, h), `/studio${query}`);
  await seed(page);
  await settle(page, 300);
  if (setup) await setup(page);
  await settle(page, 1400);
  const phone = w < 768 || h < 520;
  const m = await page.evaluate(measureInPage, phone ? 6 : 12);
  const file = resolve(outDir, `${name}.png`);
  await page.screenshot({ path: file, timeout: 180000 });
  const b = BOARD[name];
  table.push({ name, free: m.free, houseW: m.houseW, boardFree: b?.[0] ?? null, boardW: b?.[1] ?? null, cover: m.cover });
  console.log(`${name}: free ${(m.free * 100).toFixed(0)}%, house ${m.houseW} px${m.cover ? `, strip covers ${(m.cover * 100).toFixed(0)}%` : ''}${b?.[0] ? ` (board ${(b[0] * 100).toFixed(0)}%, ${b[1]} px)` : ''}`);
  if (!name.endsWith('walk')) check(!m.inkUnder.length, `${name}: no control lies over the house${m.inkUnder.length ? ` (${m.inkUnder.join(', ')})` : ''}`);
  if (mock) composeQueue.push([name, mock, file]);
  await ctx.close();
}
writeFileSync(resolve(outDir, 'measurements.json'), JSON.stringify(table, null, 2));

/* ------------------------------------------------------------------ */
/* Behaviour checks                                                    */
/* ------------------------------------------------------------------ */

if (wanted('checks')) {
  const D = vp(1440, 900), P = vp(390, 844);
  // Desktop (task 017): icons only; hover shows the name as a tooltip
  // below after a delay; nothing changes width; a panel floats below its
  // own tool at the module's gap (task 029: one attachment).
  {
    const { ctx, page } = await open(D, '/studio');
    const box = () => page.getByTestId('toolbar').boundingBox();
    const tip = (id) => page.getByTestId(id).locator('xpath=..').locator('.lg-tip').evaluate((el) => +getComputedStyle(el).opacity);
    const a = await box();
    await page.getByTestId('bar-views').hover();
    await page.waitForTimeout(800);
    const b = await box();
    check((await tip('bar-views')) > 0.9, 'hover shows the tool name as a tooltip');
    check(Math.abs(a.width - b.width) < 0.5 && Math.abs(a.x - b.x) < 0.5, `hover changes no width (${a.width.toFixed(1)} / ${b.width.toFixed(1)})`);
    const others = await Promise.all(['bar-levels', 'bar-sun'].map(tip));
    check(others.every((x) => x < 0.1), 'only the hovered tool shows its name');
    await page.mouse.move(700, 450);
    await page.waitForTimeout(400);
    // Keyboard focus.
    await page.getByTestId('bar-sun').focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await page.waitForTimeout(400);
    check((await tip('bar-sun')) > 0.9, 'keyboard focus shows the name');
    // Opening a panel moves neither the input nor the canvas, nor the group.
    const before = await page.evaluate(() => ({ input: document.querySelector('[data-testid=prompt]').getBoundingClientRect().toJSON(), canvas: [document.querySelector('canvas').clientWidth, document.querySelector('canvas').clientHeight] }));
    await page.getByTestId('bar-views').click();
    await settle(page, 900);
    const after = await page.evaluate(() => ({ input: document.querySelector('[data-testid=prompt]').getBoundingClientRect().toJSON(), canvas: [document.querySelector('canvas').clientWidth, document.querySelector('canvas').clientHeight] }));
    const c = await box();
    const pan = await page.getByTestId('tray-views').boundingBox();
    check(await page.getByTestId('tray-views').count() === 1, 'the view panel opens');
    const tool = await page.getByTestId('bar-views').boundingBox();
    check(Math.abs(pan.y - (c.y + c.height) - 8) < 1 && pan.x <= tool.x + tool.width && pan.x + pan.width >= tool.x, `the panel floats below its tool at the module's gap (${(pan.y - c.y - c.height).toFixed(1)} px)`);
    check(Math.abs(c.width - a.width) < 0.5, 'the group keeps its width while a panel is open');
    check(JSON.stringify(before) === JSON.stringify(after), `opening a panel moves neither the input nor the canvas (${JSON.stringify(after.canvas)})`);
    check(await page.getByTestId('bar-views').getAttribute('data-on') === '', 'the active tool is selected');
    await page.keyboard.press('Escape');
    await settle(page, 700);
    check(await page.getByTestId('tray-views').count() === 0, 'Escape closes the panel');
    check(await page.evaluate(() => document.activeElement?.dataset.testid) === 'bar-views', 'focus returns to the tool');
    await page.getByTestId('bar-levels').click();
    await page.mouse.click(700, 450);
    await settle(page, 700);
    check(await page.getByTestId('tray-levels').count() === 0, 'a click on the drawing closes the panel');
    await page.getByTestId('bar-sun').click();
    await settle(page, 300);
    await page.getByTestId('bar-sun').click();
    await settle(page, 700);
    check(await page.getByTestId('tray-sun').count() === 0 && (await page.evaluate(() => window.__studio.store.getState().sun.on)), 'clicking the active tool closes its panel; the sun stays on');
    check(/\d\d:\d\d/.test(await page.getByTestId('bar-sun').textContent()), 'the sun tool shows the time in its icon place');
    // Walk: "漫游 ×" exits, Escape too.
    await page.getByTestId('bar-walk').click();
    await page.waitForFunction(() => window.__studio.engine.viewer.walking === true, null, { timeout: 60000 });
    check((await page.getByTestId('bar-walk').textContent()).includes('漫游 ×') && (await page.getByTestId('bar-walk').getAttribute('data-on')) === '', 'walking: the tool reads "漫游 ×", selected');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => window.__studio.engine.viewer.walking === false, null, { timeout: 60000 });
    check(true, 'Escape leaves walk mode');
    await ctx.close();
  }
  // First visit: the tool names show until the first tool use (remembered).
  {
    const { ctx, page } = await open(D, '/studio', { hints: true });
    const named = () => page.getByTestId('toolbar').evaluate((el) => {
      const t = [...el.querySelectorAll('button')].map((b) => b.textContent).join(' ');
      return t.includes('视角') && t.includes('漫游');
    });
    check(await named(), 'first visit: the tools show their names');
    await page.getByTestId('bar-views').click();
    await settle(page, 400);
    check(!(await named()), 'the first tool use collapses them to icons');
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__studio?.ready3d === true, null, { timeout: 180000 });
    check(!(await named()), 'icons only after a reload');
    await ctx.close();
  }
  // Pin persists across a reload.
  {
    const { ctx, page } = await open(D, '/studio');
    await page.getByTestId('chat-history').click();
    check(await page.getByTestId('recent-strip').count() === 1, 'the history button opens the recent strip');
    const glass = await page.getByTestId('recent-strip').evaluate((el) => el.classList.contains('lg') && el.dataset.kind);
    check(glass === 'text', `the latest exchange is a glass text surface (${glass})`);
    await page.keyboard.press('Escape');
    check(await page.getByTestId('recent-strip').count() === 0, 'Escape closes the strip');
    await page.getByTestId('chat-history').click();
    await page.getByTestId('chat-pin').click();
    await settle(page, 500);
    const cw = await page.evaluate(() => document.querySelector('canvas').clientWidth);
    const side = await page.getByTestId('chat-panel').boundingBox();
    check(await page.getByTestId('chat-panel').count() === 1 && side.x === 18 && side.width === 360 && cw === 1440, `pinned: a floating, inset glass sidebar under the name (task 021); the canvas runs edge to edge (${side.x}, ${side.width} px; canvas ${cw} px)`);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__studio?.ready3d === true, null, { timeout: 180000 });
    check(await page.getByTestId('chat-panel').count() === 1, 'the pin survives a reload');
    await page.getByTestId('chat-unpin').click();
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__studio?.ready3d === true, null, { timeout: 180000 });
    check(await page.getByTestId('chat-panel').count() === 0, 'unpinning survives a reload too');
    await ctx.close();
  }
  // The working phrase follows the phases; reduced motion stops the light.
  for (const reduced of [false, true]) {
    const { ctx, page } = await open(D, '/studio', { ctxOpts: reduced ? { reducedMotion: 'reduce' } : {} });
    const phases = [];
    for (const phase of ['thinking', 'working', 'writing']) {
      await page.evaluate((ph) => window.__studio.chat.setState({ running: true, items: [{ id: 'u', role: 'user', text: '厨房的窗能再大一点吗？' }, { id: 'a', role: 'assistant', text: '', phase: ph }] }), phase);
      // Each phrase is held at least 1.1 s (MIN_PHASE_MS), so a quick phase can still be read.
      await page.waitForTimeout(1300);
      phases.push(await page.getByTestId('chat-status').textContent());
    }
    const anim = await page.evaluate(() => getComputedStyle(document.querySelector('.lg-glow > i')).animationName);
    const lit = await page.evaluate(() => getComputedStyle(document.querySelector('.lg-glow')).opacity);
    if (!reduced) {
      check(phases[0].startsWith('正在思考') && phases[1].startsWith('正在修改房子') && phases[2].startsWith('正在回复'), `the status phrase follows the phases (${phases.join(' / ')})`);
      check(anim === 'lg-spin', `working: the light travels round the input (${anim})`);
    } else check(anim === 'none' && lit === '1', `reduced motion: a still highlight, no travelling light (${anim}, opacity ${lit})`);
    await page.evaluate(() => window.__studio.chat.setState({ running: false, items: [] }));
    await ctx.close();
  }
  // Phone (task 017): an inset glass sheet with detents, the tool bar riding on it, switching, drag and flick to close, the input hidden meanwhile.
  {
    const { ctx, page } = await open(P, '/studio');
    const rect = (id) => page.getByTestId(id).evaluate((el) => el.getBoundingClientRect().toJSON());
    const inputShown = () => page.getByTestId('input-wrap').evaluate((el) => getComputedStyle(el).opacity === '1' && !el.closest('[inert]') && !el.hasAttribute('inert'));
    const tb0 = await rect('toolbar');
    check(await inputShown(), 'phone: the input shows by default');
    await page.getByTestId('bar-sun').click();
    await settle(page, 1200);
    const sheet = await rect('phone-sheet');
    const tb1 = await rect('toolbar');
    check(await page.locator('[data-testid=phone-sheet][data-open]').count() === 1 && Math.abs(sheet.left - 8) < 0.5 && Math.abs(844 - 8 - sheet.bottom) < 0.5, `phone: the sun panel is an inset sheet (left ${sheet.left}, bottom ${sheet.bottom.toFixed(1)})`);
    check(Math.abs(tb1.bottom + 8 - sheet.top) < 1.5 && tb1.top < tb0.top, `phone: the tool bar rides on the sheet's top edge (${tb1.bottom.toFixed(1)} + 8 = ${sheet.top.toFixed(1)})`);
    check(!(await inputShown()), 'phone: the input is hidden while the sheet is open');
    await page.getByTestId('bar-views').click();
    await settle(page, 1000);
    check(await page.locator('[data-testid=phone-sheet]').count() === 1 && (await page.locator('[data-testid=phone-sheet]').getByRole('button', { name: '西南轴测' }).count()) === 1, 'phone: another tool swaps the sheet content');
    const tb2 = await rect('toolbar');
    const sheet2 = await rect('phone-sheet');
    check(Math.abs(tb2.bottom + 8 - sheet2.top) < 1.5, 'phone: the tool bar follows the new sheet height');
    // Drag up to the large detent, past it (rubber band), release.
    const g = await rect('sheet-grab');
    const gx = g.left + g.width / 2;
    await page.mouse.move(gx, g.top + 8);
    await page.mouse.down();
    for (let i = 1; i <= 12; i++) await page.mouse.move(gx, g.top + 8 - i * 50);
    await page.waitForTimeout(100);
    const stretched = await rect('phone-sheet');
    await page.mouse.up();
    await settle(page, 1200);
    const big = await rect('phone-sheet');
    check(big.height > sheet2.height + 100 && stretched.height > big.height && stretched.height - big.height < 80, `phone: dragging up reaches the large detent, a little rubber band past it (${sheet2.height.toFixed(0)} -> ${big.height.toFixed(0)}, pulled ${stretched.height.toFixed(0)})`);
    // Drag down slowly: back to fit, then down past half: closes.
    const g2 = await rect('sheet-grab');
    await page.mouse.move(gx, g2.top + 8);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) {
      await page.mouse.move(gx, g2.top + 8 + i * 30);
      await page.waitForTimeout(40);
    }
    await page.waitForTimeout(150);
    await page.mouse.up();
    await settle(page, 1200);
    const back = await rect('phone-sheet');
    check(Math.abs(back.height - sheet2.height) < 2, `phone: a slow drag down settles on the fit detent (${back.height.toFixed(0)} px)`);
    // A quick flick down dismisses.
    const g3 = await rect('sheet-grab');
    await page.mouse.move(gx, g3.top + 8);
    await page.mouse.down();
    for (let i = 1; i <= 4; i++) await page.mouse.move(gx, g3.top + 8 + i * 25);
    await page.mouse.up();
    await settle(page, 1200);
    check(await page.locator('[data-testid=phone-sheet]').count() === 0, 'phone: a flick down dismisses the sheet');
    check(await inputShown(), 'phone: the input is back after the sheet closes');
    const tb3 = await rect('toolbar');
    check(Math.abs(tb3.top - tb0.top) < 1, 'phone: the tool bar is back at the bottom');
    // The house re-frames above the sheet.
    await page.getByTestId('bar-levels').click();
    await settle(page, 1500);
    const m = await page.evaluate(measureInPage, 6);
    check(!m.inkUnder.length, `phone: with a sheet open nothing lies over the house${m.inkUnder.length ? ` (${m.inkUnder.join(', ')})` : ''}`);
    await page.getByTestId('bar-levels').click();
    await settle(page, 700);
    check(await page.locator('[data-testid=phone-sheet]').count() === 0, 'phone: tapping the active tool closes the sheet');
    // Pinned on phone: a half-height sheet with the input inside; a tool swaps it, closing brings it back.
    await page.evaluate(() => window.__studio.store.getState().setPinned(true));
    await settle(page, 900);
    const ps = await rect('phone-sheet');
    check(ps.height > 844 * 0.44 && ps.height < 844 * 0.5 && (await page.getByTestId('phone-sheet').getByTestId('prompt-bar').count()) === 1, `phone pinned: an about half-height sheet with the input inside (${ps.height.toFixed(0)} px)`);
    await page.getByTestId('bar-sun').click();
    await settle(page, 900);
    check(await page.getByTestId('phone-sheet').getAttribute('data-sheet') === 'tool', 'phone pinned: a tool swaps the sheet');
    await page.getByTestId('bar-sun').click();
    await settle(page, 900);
    check(await page.getByTestId('phone-sheet').getAttribute('data-sheet') === 'chat', 'phone pinned: closing the tool brings the conversation back');
    // Touch targets.
    // The text field's target is the whole input face (a tap anywhere on it focuses the field).
    const small = await page.evaluate(() => [...document.querySelectorAll('button, [role=radio], textarea')].filter((el) => el.checkVisibility() && !el.closest('[inert]')).map((el) => {
      const r = (el.matches('textarea') ? el.closest('[data-testid=prompt]') ?? el : el).getBoundingClientRect();
      const after = getComputedStyle(el, '::after');
      const hw = after.content !== 'none' && after.content !== 'normal' ? Math.max(r.width, parseFloat(after.width) || 0) : r.width;
      const hh = after.content !== 'none' && after.content !== 'normal' ? Math.max(r.height, parseFloat(after.height) || 0) : r.height;
      return { name: el.getAttribute('aria-label') || el.textContent.trim().slice(0, 12), w: hw, h: hh };
    }).filter((x) => x.w < 43.5 || x.h < 43.5));
    check(!small.length, `phone: 44 px touch targets in the default + pinned + sun state${small.length ? ` (smaller: ${small.map((x) => `${x.name} ${x.w.toFixed(0)}x${x.h.toFixed(0)}`).join(', ')})` : ''}`);
    await ctx.close();
  }
  // Hints: just above the input, gone after the first interaction.
  for (const [n, o] of [['desktop', D], ['phone', P]]) {
    const { ctx, page } = await open(o, '/studio', { hints: true });
    await settle(page, 400);
    const hints = await page.getByTestId('hints').boundingBox();
    const input = await page.getByTestId('prompt').boundingBox();
    check(hints && hints.y + hints.height <= input.y && input.y - (hints.y + hints.height) < 16, `${n}: the hints sit just above the input`);
    // The hint "漫游" must not stand over the tool of that name.
    const walkChip = await page.getByTestId('hints').getByRole('button', { name: '漫游' }).boundingBox();
    const walkTool = await page.getByTestId('bar-walk').boundingBox();
    const overX = Math.min(walkChip.x + walkChip.width, walkTool.x + walkTool.width) - Math.max(walkChip.x, walkTool.x);
    check(overX <= 0, `${n}: the 漫游 hint is not stacked over the 漫游 tool`);
    await page.getByTestId('bar-views').click();
    await settle(page, 300);
    await page.keyboard.press('Escape');
    await settle(page, 300);
    check(await page.getByTestId('hints').count() === 0 && (await page.evaluate(() => localStorage.getItem('opensu.hints.v1'))) === 'done', `${n}: the first interaction dismisses the hints for good`);
    await ctx.close();
  }
  // backdrop-filter only in the glass module's material (task 017; one CSS material since task 035).
  {
    const dir = resolve(appRoot, 'dist/client/assets');
    const css = readdirSync(dir).filter((f) => f.endsWith('.css')).map((f) => readFileSync(resolve(dir, f), 'utf8')).join('\n');
    const rules = [...css.matchAll(/([^{}]*)\{[^{}]*backdrop-filter:(?!\s*none)[^{}]*\}/g)].map((m) => m[1].trim());
    check(css.length > 1000 && rules.every((sel) => sel.split(',').every((x) => /^\.lg(\[[\w-]+\])*$/.test(x.trim()))), `backdrop-filter only in the glass material (${rules.length} rules: ${rules.join(' | ')})`);
  }
}

/* ------------------------------------------------------------------ */
/* Side by side with the approved states                               */
/* ------------------------------------------------------------------ */

if (mockups && composeQueue.length) {
  const sideDir = resolve(outDir, 'side-by-side');
  mkdirSync(sideDir, { recursive: true });
  const ctx = await browser.newContext({ viewport: { width: 400, height: 300 } });
  const page = await ctx.newPage();
  for (const [name, mock, file] of composeQueue) {
    const mf = resolve(mockups, `${mock}.png`);
    if (!existsSync(mf)) continue;
    const a = `data:image/png;base64,${readFileSync(mf).toString('base64')}`;
    const b = `data:image/png;base64,${readFileSync(file).toString('base64')}`;
    const png = await page.evaluate(async ([a, b, title]) => {
      const load = (s) => new Promise((ok) => {
        const i = new Image();
        i.onload = () => ok(i);
        i.src = s;
      });
      const [ia, ib] = await Promise.all([load(a), load(b)]);
      const h = Math.max(ia.height, ib.height);
      const kb = ia.height / ib.height;
      const wa = ia.width, wb = Math.round(ib.width * kb);
      const pad = 24, head = 44;
      const c = document.createElement('canvas');
      c.width = wa + wb + pad * 3;
      c.height = h + pad * 2 + head;
      const g = c.getContext('2d');
      g.fillStyle = '#f1f1ef';
      g.fillRect(0, 0, c.width, c.height);
      g.fillStyle = '#2a2a2a';
      g.font = '600 22px sans-serif';
      g.fillText(`${title} — approved mockup`, pad, pad + 20);
      g.fillText('real app', pad * 2 + wa, pad + 20);
      g.drawImage(ia, pad, pad + head);
      g.drawImage(ib, pad * 2 + wa, pad + head, wb, ia.height);
      return c.toDataURL('image/png');
    }, [a, b, name]);
    writeFileSync(resolve(sideDir, `${name}.png`), Buffer.from(png.split(',')[1], 'base64'));
    console.log(`  side by side -> ${resolve(sideDir, `${name}.png`)}`);
  }
  await ctx.close();
}

await browser.close();
server.kill('SIGTERM');
if (table.length) {
  console.log('\nstate              free (app / board)   house width (app / board)');
  for (const r of table) console.log(`${r.name.padEnd(18)} ${`${(r.free * 100).toFixed(0)}%`.padStart(5)} / ${r.boardFree ? `${(r.boardFree * 100).toFixed(0)}%` : '  - '}        ${String(r.houseW).padStart(5)} / ${r.boardW ?? '-'}`);
}
if (failures.length) {
  console.error(`\n${failures.length} check(s) failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('\nAll layout checks passed.');
