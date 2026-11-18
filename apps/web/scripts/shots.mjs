// Smoke test + screenshots of the built app running in the local Cloudflare
// runtime (`vite preview` with @cloudflare/vite-plugin = workerd).
//
//   node scripts/shots.mjs           all screenshots -> artifacts/web/*.png
//   node scripts/shots.mjs --smoke   assertions only, a minimal set of shots
//
// Requires a build (`pnpm --filter @opensu/web build`).
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { countControls } from './controls.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, '..');
const repoRoot = resolve(appRoot, '../..');
const outDir = resolve(repoRoot, 'artifacts/web');
const smoke = process.argv.includes('--smoke');
// --only a,b: just these screenshots / checks (by name prefix), for iterating.
const onlyArg = process.argv.indexOf('--only');
const only = onlyArg > 0 ? process.argv[onlyArg + 1].split(',') : null;
const wanted = (name) => !only || only.some((o) => name.startsWith(o));
mkdirSync(outDir, { recursive: true });

if (!existsSync(resolve(appRoot, 'dist/client/studio.html'))) {
  console.error('No build found: run `pnpm --filter @opensu/web build` first.');
  process.exit(1);
}

const require = createRequire(import.meta.url);
let playwright;
try {
  playwright = require('playwright');
} catch {
  // Preinstalled globally in the dev container.
  playwright = require(require.resolve('playwright', { paths: [process.env.NODE_PATH ?? '', '/opt/node-tools/node_modules'] }));
}

const freePort = () =>
  new Promise((ok) => {
    const s = createServer();
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => ok(port));
    });
  });

const port = await freePort();
const base = `http://localhost:${port}`;
const server = spawn(process.execPath, [resolve(appRoot, 'node_modules/vite/bin/vite.js'), 'preview', '--port', String(port), '--strictPort'], {
  cwd: appRoot,
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, CI: '1' },
});
let serverLog = '';
server.stdout.on('data', (d) => (serverLog += d));
server.stderr.on('data', (d) => (serverLog += d));
const stopServer = () => server.kill('SIGTERM');
process.on('exit', stopServer);

async function waitForServer() {
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(`${base}/api/health`);
      if (r.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`preview did not start:\n${serverLog}`);
}

const failures = [];
const check = (cond, msg) => {
  if (!cond) failures.push(msg);
  console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${msg}`);
};

await waitForServer();
console.log(`preview (workerd) on ${base}`);

// --- Worker routes ---------------------------------------------------------
{
  const h = await fetch(`${base}/api/health`);
  const body = await h.json();
  check(h.ok && body.ok === true, '/api/health returns {ok: true}');
  const s = await fetch(`${base}/s/demo1234`);
  const html = await s.text();
  check(s.ok && /<meta property="og:title" content="[^"]+"/.test(html) && /og:image" content="http[^"]+"/.test(html), '/s/$id head carries og:title and absolute og:image');
  check(!/class="mx-auto flex min-h-dvh/.test(html), '/s/$id body is not server-rendered');
  const st = await fetch(`${base}/studio`);
  const sh = await st.text();
  check(st.status === 200 && /s:"pending",ssr:!1/.test(sh), '/studio is the static prerendered shell (route pending, ssr false)');
  const l = await fetch(`${base}/`);
  check(l.ok && (await l.text()).includes('<h1'), '/ is prerendered with content');
}

// --- Pages ----------------------------------------------------------------
const browser = await playwright.chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'],
});

const DESKTOP = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

async function open(ctxOpts, path) {
  const ctx = await browser.newContext(ctxOpts);
  // The first-visit hints are shot on their own (ui-shots.mjs); here they are dismissed.
  await ctx.addInitScript(() => localStorage.setItem('opensu.hints.v1', 'done'));
  const page = await ctx.newPage();
  page.on('pageerror', (e) => failures.push(`${path}: page error ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') failures.push(`${path}: console error ${m.text()}`);
  });
  await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
  return { ctx, page };
}

async function noHorizontalScroll(page, name) {
  const w = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  check(w[0] <= w[1], `${name}: no horizontal scroll (${w[0]} <= ${w[1]})`);
}

async function shot(page, name) {
  const file = resolve(outDir, `${name}.png`);
  // Software GL on a busy machine can take long for one frame.
  await page.screenshot({ path: file, timeout: 180000 });
  console.log(`  -> ${file}`);
}

async function studio3d(opts, name, query = '', after) {
  if (!wanted(name)) return;
  const { ctx, page } = await open(opts, `/studio${query}`);
  await page.waitForFunction(() => window.__studio?.ready3d === true, null, { timeout: 180000 });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const ink = await page.evaluate(() => window.__studio.engine.inkCoverage());
  check(ink > 0.02, `${name}: 3D canvas is not blank (${(ink * 100).toFixed(1)}% ink)`);
  if (after) await after(page);
  await noHorizontalScroll(page, name);
  await shot(page, name);
  await ctx.close();
}

async function studioPlan(opts, name, query = '', after) {
  if (!wanted(name)) return;
  const { ctx, page } = await open(opts, `/studio?mode=plan${query}`);
  await page.waitForSelector('[data-testid=plan] svg', { timeout: 60000 });
  const n = await page.evaluate(() => document.querySelector('[data-testid=plan] svg')?.querySelectorAll('path, rect, text').length ?? 0);
  check(n > 50, `${name}: plan SVG present (${n} elements)`);
  if (after) await after(page);
  await page.waitForTimeout(350);
  await noHorizontalScroll(page, name);
  await shot(page, name);
  await ctx.close();
}

async function landing(opts, name) {
  if (!wanted(name)) return;
  const { ctx, page } = await open(opts, '/');
  check(await page.locator('h1').count() === 1, `${name}: heading present`);
  await noHorizontalScroll(page, name);
  await shot(page, name);
  if (!smoke) {
    await page.screenshot({ path: resolve(outDir, `${name}-full.png`), fullPage: true });
  }
  await ctx.close();
}

/**
 * The app's 3D view must match `pnpm shots` (packages/render) for the same
 * preset: same 1600x1200 frame at DPR 1, chrome hidden, compared pixel by
 * pixel in the page against artifacts/shots/<view>.png when that exists.
 */
async function compareWithRenderShots() {
  if (!wanted('compare')) return;
  const shotsDir = resolve(repoRoot, 'artifacts/shots');
  const views = ['axo-se', 'axo-ne', 'eye-sw', 'elev-south'].filter((v) => existsSync(resolve(shotsDir, `${v}.png`)));
  if (!views.length) {
    console.log('  (no artifacts/shots/*.png: run `pnpm shots` to compare the app with the renderer demo)');
    return;
  }
  const { ctx, page } = await open({ viewport: { width: 1600, height: 1200 }, deviceScaleFactor: 1 }, '/');
  for (const v of views) {
    // The renderer demo draws the golden reference house.
    await page.goto(`${base}/studio?sample=golden&frame=full&view=${v}`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__studio?.ready3d === true, null, { timeout: 180000 });
    const ref = `data:image/png;base64,${readFileSync(resolve(shotsDir, `${v}.png`)).toString('base64')}`;
    const diff = await page.evaluate(async (src) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const w = img.width, h = img.height;
      const a = document.createElement('canvas');
      a.width = w;
      a.height = h;
      const ca = a.getContext('2d');
      ca.drawImage(img, 0, 0);
      const ra = ca.getImageData(0, 0, w, h).data;
      const gl = window.__studio.engine.viewer;
      gl.renderNow();
      const b = document.createElement('canvas');
      b.width = w;
      b.height = h;
      const cb = b.getContext('2d');
      cb.drawImage(gl.renderer.domElement, 0, 0, w, h);
      const rb = cb.getImageData(0, 0, w, h).data;
      let off = 0;
      for (let i = 0; i < ra.length; i += 4) {
        if (Math.abs(ra[i] - rb[i]) + Math.abs(ra[i + 1] - rb[i + 1]) + Math.abs(ra[i + 2] - rb[i + 2]) > 24) off++;
      }
      return off / (w * h);
    }, ref);
    check(diff < 0.002, `3D ${v} matches packages/render shot (${(diff * 100).toFixed(3)}% pixels differ)`);
  }
  await ctx.close();
}

/** Waits until the 3D view has rendered the latest state (two frames). */
const settle = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

/** Canvas pixels of the 3D view (downsampled RGBA). */
const canvasPixels = (page) =>
  page.evaluate(() => {
    const v = window.__studio.engine.viewer;
    v.renderNow();
    const c = document.createElement('canvas');
    c.width = 400;
    c.height = 250;
    const g = c.getContext('2d');
    g.drawImage(v.renderer.domElement, 0, 0, c.width, c.height);
    return Array.from(g.getImageData(0, 0, c.width, c.height).data);
  });

/** Pixels of the roof tile colour (#4B4845 and its pattern) in the 3D view. */
const roofPixels = (px) => {
  let n = 0;
  for (let i = 0; i < px.length; i += 4) {
    const [r, g, b] = [px[i], px[i + 1], px[i + 2]];
    if (r >= 60 && r <= 100 && g >= 56 && g <= 94 && b >= 52 && b <= 88 && r - b >= 3 && r - b <= 14) n++;
  }
  return n;
};

/** Sets a React-controlled range input like a user drag would. */
const setRange = (page, minutes) =>
  page.evaluate((m) => {
    const el = [...document.querySelectorAll('input[type=range]')].find((x) => x.offsetParent !== null);
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    set.call(el, String(m));
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, minutes);

/** Sun study and cutaway in the app: the slider moves shadows, a cut hides the roof. */
async function sunAndCutChecks() {
  if (!wanted('check-sun')) return;
  const { ctx, page } = await open(DESKTOP, '/studio?sun=winter&time=10:00&cut=L1');
  await page.waitForFunction(() => window.__studio?.ready3d === true, null, { timeout: 180000 });
  await settle(page);
  const a = await canvasPixels(page);
  await page.getByTestId('bar-sun').click();
  await setRange(page, 15 * 60);
  await settle(page);
  const b = await canvasPixels(page);
  let diff = 0;
  for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 30) diff++;
  check(diff / (a.length / 4) > 0.01, `time slider moves the shadows (10:00 vs 15:00: ${((100 * diff) / (a.length / 4)).toFixed(1)}% pixels differ)`);
  const mode = await page.evaluate(() => window.__studio.engine.viewer.lightingMode);
  check(mode.mode === 'physical' && mode.minutes === 900, `slider drives the physical sun (${JSON.stringify(mode)})`);
  // Cutaway: the whole house shows its roof, a cut at L1 does not.
  check((await page.getByTestId('bar-levels').textContent()) === '一层', 'the levels button shows the current cut');
  await page.getByTestId('bar-levels').click();
  check((await page.getByTestId('tray-sun').count()) === 0, 'one panel at a time');
  await page.getByRole('radio', { name: '全部' }).click();
  await page.waitForTimeout(800);
  await settle(page);
  const whole = roofPixels(await canvasPixels(page));
  await page.getByRole('radio', { name: '一层' }).first().click();
  await page.waitForTimeout(800);
  await settle(page);
  const cut = roofPixels(await canvasPixels(page));
  // A few roof-like pixels remain: anti-aliased edges of dark furniture legs over timber.
  check(whole > 2000 && cut < whole * 0.05, `cutaway hides the roof (roof pixels ${whole} -> ${cut})`);
  check((await page.evaluate(() => window.__studio.engine.viewer.cutaway)) === 'L1', 'cutaway L1 is applied to the viewer');
  await page.keyboard.press('Escape');
  check((await page.getByTestId('tray-levels').count()) === 0, 'Escape closes the panel');
  check((await page.evaluate(() => window.__studio.engine.viewer.lightingMode.mode)) === 'physical', 'closing the sun panel keeps the sun on');
  check(/\d\d:\d\d/.test((await page.getByTestId('bar-sun').textContent()) ?? ''), 'the sun button shows the time while the sun is on');
  // Back to presentation light.
  await page.getByTestId('bar-sun').click();
  await page.getByRole('button', { name: '关闭日照' }).click();
  await settle(page);
  check((await page.evaluate(() => window.__studio.engine.viewer.lightingMode.mode)) === 'presentation', 'exit returns to presentation lighting');
  await ctx.close();
}

/**
 * Visible controls in the default state (task 015), desktop and phone alike:
 * the house name, 3D / 平面 / 图册, the four tools, and the input (history,
 * text, send): at most 9 widgets (a segmented control counts once, one tab
 * stop) and 11 elements (each segment counted).
 */
const CONTROL_LIMITS = { widgets: 9, elements: 11 };
async function controlChecks() {
  if (!wanted('check-controls')) return;
  for (const [name, opts] of [['desktop', DESKTOP], ['phone', PHONE]]) {
    const { ctx, page } = await open(opts, '/studio');
    await page.waitForFunction(() => window.__studio?.ready3d === true, null, { timeout: 180000 });
    await page.waitForTimeout(500);
    const c = await page.evaluate(countControls);
    check(c.widgets <= CONTROL_LIMITS.widgets && c.elements <= CONTROL_LIMITS.elements, `${name}: ${c.widgets} visible controls (${c.elements} counting each segment), max ${CONTROL_LIMITS.widgets} / ${CONTROL_LIMITS.elements}: ${c.list.join(' | ')}`);
    await ctx.close();
  }
}

/** The sun's elevation at solar noon of the site's winter solstice. */
async function noonElevation(page) {
  await page.evaluate(() => window.__studio.store.getState().setSun({ on: true, dateId: 'winter', minutes: 600 }));
  await settle(page);
  await page.evaluate(() => {
    const s = window.__studio.store.getState();
    s.setSun({ minutes: s.sunInfo.solarNoon });
  });
  await settle(page);
  return page.evaluate(() => window.__studio.store.getState().sunInfo);
}

/** Location and orientation: chosen in the UI, undoable, autosaved; the sun follows (task 013, part 2). */
async function siteChecks() {
  if (!wanted('check-site')) return;
  const { ctx, page } = await open(DESKTOP, '/studio');
  await page.waitForFunction(() => window.__studio?.ready3d === true, null, { timeout: 180000 });
  const hz = await noonElevation(page);
  check(Math.abs(hz.elevation - 36.3) < 0.3, `default site (near Hangzhou): winter-solstice noon sun ${hz.elevation.toFixed(1)} deg (~36.3)`);
  const pick = async (query, expect) => {
    if (!(await page.getByTestId('tray-sun').count())) await page.getByTestId('bar-sun').click();
    await page.getByTestId('sun-place').click();
    await page.getByTestId('loc-search').fill(query);
    await page.waitForSelector('[data-testid=loc-results] button', { timeout: 30000 });
    await page.locator('[data-testid=loc-results] button').first().click();
    await page.waitForFunction((e) => window.__studio.store.getState().house.site.placeName === e, expect, { timeout: 30000 });
    await settle(page);
  };
  // A new place refreshes the sun strip, the slider range and the shadows at
  // once, without touching the time (task 014): Urumqi's winter day starts
  // at 09:41 and solar noon is at 14:08 clock time (UTC+8).
  await page.evaluate(() => window.__studio.store.getState().setSun({ on: true, dateId: 'winter', minutes: 600 }));
  await settle(page);
  const pxHz = await canvasPixels(page);
  await pick('乌鲁木齐', '乌鲁木齐市');
  await page.waitForTimeout(400);
  await settle(page);
  const urumqi = await page.evaluate(() => {
    const s = window.__studio.store.getState();
    const truth = window.__studio.engine.sunAt(s.sunInfo.date, s.sun.minutes);
    const range = [...document.querySelectorAll('input[type=range]')].find((x) => x.offsetParent !== null);
    return {
      info: s.sunInfo, minutes: s.sun.minutes,
      truth: { sunrise: truth.times.sunrise, sunset: truth.times.sunset, noon: truth.times.solarNoon, el: truth.trueElevationDeg },
      light: window.__studio.engine.viewer.lightingMode,
      range: range && [Number(range.min), Number(range.max), Number(range.value)],
      noon: document.querySelector('[data-testid=sun-noon]')?.textContent ?? '',
    };
  });
  check(Math.abs(urumqi.info.sunrise - urumqi.truth.sunrise) < 0.5 && Math.abs(urumqi.info.solarNoon - urumqi.truth.noon) < 0.5 && Math.abs(urumqi.info.elevation - urumqi.truth.el) < 0.05,
    `a new place refreshes the sun at once (Urumqi: sunrise ${(urumqi.info.sunrise / 60).toFixed(2)} h, noon ${(urumqi.info.solarNoon / 60).toFixed(2)} h, sun ${urumqi.info.elevation.toFixed(1)} deg)`);
  check(urumqi.noon.includes('14:08'), `the strip shows the new solar noon (${urumqi.noon})`);
  check(urumqi.range && urumqi.range[0] === Math.round(urumqi.truth.sunrise) && urumqi.range[1] === Math.round(urumqi.truth.sunset) && urumqi.range[2] === 600 && urumqi.minutes === 600,
    `the slider takes the new day and keeps 10:00 (still daylight): ${JSON.stringify(urumqi.range)}`);
  const pxUq = await canvasPixels(page);
  let moved = 0;
  for (let i = 0; i < pxHz.length; i += 4) if (Math.abs(pxHz[i] - pxUq[i]) > 30) moved++;
  check(moved / (pxHz.length / 4) > 0.01, `the shadows follow the new place without moving the time (${((100 * moved) / (pxHz.length / 4)).toFixed(1)}% pixels differ)`);
  // 08:00 is before sunrise in Urumqi in winter: the time is clamped to the day.
  await page.evaluate(() => window.__studio.store.getState().setSun({ minutes: 480 }));
  await settle(page);
  const clamp = await page.evaluate(() => window.__studio.store.getState().sun.minutes);
  check(clamp === Math.round(urumqi.truth.sunrise), `a time before sunrise is clamped to sunrise, the minute the slider and the text show (${clamp})`);
  await pick('哈尔滨', '哈尔滨市');
  const hrb = await noonElevation(page);
  check(Math.abs(hrb.elevation - 20.8) < 0.3, `Harbin (searched in Chinese): noon sun ${hrb.elevation.toFixed(1)} deg (~20.8)`);
  await pick('guangzhou', '广州市');
  const gz = await noonElevation(page);
  check(Math.abs(gz.elevation - 43.4) < 0.3, `Guangzhou (searched in pinyin): noon sun ${gz.elevation.toFixed(1)} deg (~43.4)`);
  check((await page.getByTestId('sun-place').textContent())?.includes('广州'), 'the sun tray names the chosen place');
  await page.keyboard.press('Escape');
  // Undo from the recent strip (the last studio edits with undo).
  await page.getByTestId('chat-history').click();
  await page.getByTestId('recent-strip').getByRole('button', { name: '撤销' }).last().click();
  await page.waitForFunction(() => window.__studio.store.getState().house.site.placeName === '哈尔滨市', null, { timeout: 10000 });
  check(true, 'undo in the recent strip restores the previous place');
  await page.keyboard.press('Escape');
  // Orientation: the front facing due east = north turned by 90 deg; the sun and the shadows turn with it.
  await page.evaluate(() => window.__studio.store.getState().setSun({ on: true, dateId: 'winter', minutes: 600 }));
  await settle(page);
  const az0 = await page.evaluate(() => window.__studio.engine.viewer.sunStudy.azimuthDeg);
  const px0 = await canvasPixels(page);
  await page.getByTestId('project-menu').click();
  await page.getByTestId('menu-orientation').click();
  await page.getByRole('button', { name: '东（90°）' }).click();
  await page.waitForFunction(() => window.__studio.store.getState().house.site.northDeg === 90, null, { timeout: 10000 });
  await page.waitForTimeout(400);
  await settle(page);
  const az1 = await page.evaluate(() => window.__studio.engine.viewer.sunStudy.azimuthDeg);
  // The engine's sun and the strip agree right after the turn (no time change).
  const agree = await page.evaluate(() => {
    const s = window.__studio.store.getState();
    const t = window.__studio.engine.sunAt(s.sunInfo.date, s.sun.minutes);
    return Math.abs(t.trueAzimuthDeg - s.sunInfo.azimuth) < 1e-6 && Math.abs(t.trueElevationDeg - s.sunInfo.elevation) < 1e-6;
  });
  check(agree, 'after turning north the strip still matches the engine sun');
  const d = ((az1 - az0 + 540) % 360) - 180;
  check(Math.abs(d - 90) < 0.01, `turning north by 90 deg turns the sun in model axes by ${d.toFixed(2)} deg`);
  const px1 = await canvasPixels(page);
  let diff = 0;
  for (let i = 0; i < px0.length; i += 4) if (Math.abs(px0[i] - px1[i]) > 30) diff++;
  check(diff / (px0.length / 4) > 0.01, `the shadows move with the orientation (${((100 * diff) / (px0.length / 4)).toFixed(1)}% pixels differ)`);
  check((await page.getByTestId('ori-text').textContent())?.includes('东（90°）'), 'the dial describes the orientation by the compass');
  await shot(page, 'studio-orientation-east');
  await page.keyboard.press('Escape');
  // Southern hemisphere: Sydney's winter solstice is in June, the noon sun stands in the north.
  await pick('Sydney', '悉尼');
  const syd = await noonElevation(page);
  check(syd.date.endsWith('-06-21') && Math.abs(syd.elevation - (90 - 33.87 - 23.44)) < 0.4 && (syd.azimuth < 5 || syd.azimuth > 355), `Sydney: winter solstice ${syd.date}, noon sun ${syd.elevation.toFixed(1)} deg at bearing ${syd.azimuth.toFixed(0)}`);
  check(syd.utcOffsetHours === 10, `Sydney clock in June: UTC+${syd.utcOffsetHours}`);
  await page.waitForTimeout(900);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('opensu.autosave.v1') ?? '{}').house?.site ?? null);
  check(saved?.timeZone === 'Australia/Sydney' && saved?.northDeg === 90, `the site is autosaved (${JSON.stringify(saved && { placeName: saved.placeName, timeZone: saved.timeZone, northDeg: saved.northDeg })})`);
  // A template opened from the menu starts whole, in presentation light, at the default view (task 014).
  await page.evaluate(() => {
    const s = window.__studio.store.getState();
    s.setView('axo-nw');
    s.setCut('L1');
    s.setSun({ on: true, minutes: 600 });
  });
  await page.waitForTimeout(800);
  await page.getByTestId('project-menu').click();
  await page.getByRole('menuitem', { name: /换一个模板/ }).click();
  await page.getByRole('menuitem', { name: /三合院/ }).click();
  await page.waitForSelector('[data-testid=loc-skip]', { timeout: 60000 });
  await page.waitForFunction(() => !window.__studio?.growing, null, { timeout: 60000 });
  // Wait for the state, not a fixed time (software GL can be slow to finish the view change).
  await page
    .waitForFunction(() => {
      const s = window.__studio.store.getState();
      const v = window.__studio.engine.viewer;
      return s.view === 'axo-se' && !s.cut && !s.sun.on && !v.cutaway && v.lightingMode.mode === 'presentation' && v.currentView?.id === 'axo-se';
    }, null, { timeout: 15000 })
    .catch(() => {});
  const fresh = await page.evaluate(() => {
    const s = window.__studio.store.getState();
    const v = window.__studio.engine.viewer;
    return { view: s.view, cut: s.cut, sun: s.sun.on, viewerCut: v.cutaway, light: v.lightingMode.mode, preset: v.currentView?.id };
  });
  check(fresh.view === 'axo-se' && !fresh.cut && !fresh.sun && !fresh.viewerCut && fresh.light === 'presentation' && fresh.preset === 'axo-se', `a new template starts whole, in presentation light, at the default view (${JSON.stringify(fresh)})`);
  await ctx.close();
}

// --- Task 021: the house stays still ---------------------------------------

/**
 * Records, every animation frame, the 3D camera (world and projection
 * matrices) or the plan's transform; `take()` returns the distinct values
 * seen since the last take, in order.
 */
const recorder = {
  install: (page) =>
    page.evaluate(() => {
      const read = () => {
        const plan = document.querySelector('[data-testid=plan] > div');
        // Computed: the plan's animated re-fit is a CSS transition.
        if (plan) return `plan ${getComputedStyle(plan).transform}`;
        const c = window.__studio?.engine?.viewer?.camera;
        if (!c) return 'none';
        c.updateMatrixWorld();
        return [...c.matrixWorld.elements, ...c.projectionMatrix.elements].map((v) => v.toFixed(6)).join(',');
      };
      const rec = { seen: [read()], ticks: 0 };
      const tick = () => {
        rec.ticks++;
        const v = read();
        if (v !== rec.seen[rec.seen.length - 1]) rec.seen.push(v);
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      window.__rec = rec;
    }),
  take: (page) => recorder.takeTicks(page).then((r) => r.seen),
  /** The values and how many frames were drawn since the last take. */
  takeTicks: (page) =>
    page.evaluate(() => {
      const r = window.__rec;
      const out = { seen: r.seen, ticks: r.ticks };
      r.seen = [out.seen[out.seen.length - 1]];
      r.ticks = 0;
      return out;
    }),
};

/**
 * Waits until nothing has moved for 400 ms and at least 8 frames (software
 * GL can starve frames for a while; at most 15 s); returns every value
 * seen meanwhile.
 */
async function restAfter(page) {
  let all = await recorder.take(page);
  let quiet = 0;
  for (let i = 0; i < 40 && quiet < 8; i++) {
    await page.waitForTimeout(400);
    const v = await recorder.takeTicks(page);
    if (v.seen.length === 1) quiet += v.ticks;
    else quiet = 0;
    all = [...all, ...v.seen.slice(1)];
  }
  return all;
}

/** Screen position of the model origin on the level shown (the plan's registered frame) and the plan transform. */
const planOrigin = (page) =>
  page.evaluate(() => {
    const el = document.querySelector('[data-testid=plan] [data-level]');
    const r = el.getBoundingClientRect();
    const [ox, oy] = el.dataset.origin.split(',').map(Number);
    const k = r.width / el.offsetWidth;
    // Font sizes per kind of text (room names without the stair arrows, their English lines, dimension figures).
    const sizes = (fill, skip = /^$/) => [...new Set([...el.querySelectorAll(`text[fill="${fill}"]`)].filter((t) => !skip.test(t.textContent)).map((t) => t.getAttribute('font-size')))].join('/');
    const type = { names: sizes('#333333', /^[上下]$/), en: sizes('#7A7A7A'), dims: sizes('#3A3A3A') };
    return { level: el.dataset.level, x: Math.round((r.left + ox * k) * 100) / 100, y: Math.round((r.top + oy * k) * 100) / 100, xf: getComputedStyle(el.parentElement).transform, type: JSON.stringify(type) };
  });

/**
 * Task 023: floors stay registered. Switching level, with the levels panel
 * open and closed, keeps the plan transform and puts a model point (the
 * origin) on the same screen pixel on every level.
 */
async function levelsRegistered(page, label) {
  const ids = await page.evaluate(() => window.__studio.store.getState().house.levels.map((l) => l.id));
  if (ids.length < 2) return check(false, `${label}: the sample house has more than one level`);
  const setLevel = (id) => page.evaluate((i) => window.__studio.store.getState().setLevel(i), id);
  await setLevel(ids[0]);
  await page.waitForTimeout(400);
  const seen = [];
  for (const open of [false, true]) {
    if (open) {
      await page.getByTestId('bar-levels').click();
      await page.waitForTimeout(500);
    }
    for (const id of [...ids, ids[0]]) {
      await setLevel(id);
      await page.waitForFunction((i) => document.querySelector(`[data-testid=plan] [data-level="${i}"]`), id);
      await page.waitForTimeout(250);
      seen.push(await planOrigin(page));
    }
    if (open) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(400);
    }
  }
  const a = seen[0];
  const same = seen.every((o) => o.xf === a.xf && Math.abs(o.x - a.x) < 0.01 && Math.abs(o.y - a.y) < 0.01);
  check(same && new Set(seen.map((o) => o.level)).size === ids.length, `${label}: every level keeps the plan transform and the model origin on the same pixel, levels panel open and closed (${seen.map((o) => `${o.level} ${o.x},${o.y}`).join('; ')})`);
  // One typography for the house: per level one size for room names, one for their English lines, one for dimension figures; the same on every level.
  const t0 = JSON.parse(seen[0].type);
  const oneSize = seen.every((o) => o.type === seen[0].type) && Object.values(t0).every((v) => v && !v.includes('/'));
  check(oneSize, `${label}: on every level all room names share one font size, their English lines one, dimension figures one, and the levels share them (${[...new Set(seen.map((o) => `${o.level} ${o.type}`))].join('; ')})`);
}

/** The name block: its box, the menu trigger's box, and the name's ink. */
const nameBlock = (page) =>
  page.evaluate(() => {
    const b = (el) => {
      const r = el.getBoundingClientRect();
      return [r.x, r.y, r.width, r.height].map((v) => Math.round(v * 100) / 100);
    };
    const block = document.querySelector('[data-testid=title-block]');
    const trigger = document.querySelector('[data-testid=project-menu]');
    const name = trigger.querySelector('span');
    const cs = getComputedStyle(name);
    return JSON.stringify({ block: b(block), trigger: b(trigger), name: b(name), color: cs.color, size: cs.fontSize, weight: cs.fontWeight, opacity: getComputedStyle(block).opacity });
  });

/**
 * Opening, closing or switching a floating panel (tool panels, a site
 * panel, the project menu, sign-in, the recent strip, the phone sheet at
 * either detent) never moves the house, in 3D or in plan; pinning and
 * unpinning the conversation moves it once, smoothly, and back; the house
 * name stays exactly where it is, pinned or not (task 021).
 */
async function stillHouseChecks() {
  if (!wanted('check-still')) return;
  const ms = 750;
  const still = async (page, name, open, close) => {
    await recorder.take(page);
    await open();
    await page.waitForTimeout(ms);
    const during = await recorder.take(page);
    await close();
    await page.waitForTimeout(ms);
    const after = await restAfter(page);
    check(during.length === 1 && after.length === 1 && during[0] === after[0], `${name}: opening and closing does not move the house (${during.length - 1} + ${after.length - 1} changes)`);
  };
  const esc = (page) => async () => page.keyboard.press('Escape');
  const store = (page, fn) => () => page.evaluate(fn);
  const account = (page, open) => () => page.evaluate((o) => window.__studio.account.setState(o ? { open: true, origin: 'menu', anchor: null } : { open: false }), open);
  const framing = (page) => page.evaluate(() => JSON.stringify(window.__studio.engine?.viewer.framedInsets ?? null));
  const pinCycle = async (page, label) => {
    // From rest (a framing asked for just before may still be landing).
    const base = (await restAfter(page)).at(-1);
    page.__framing = await framing(page);
    const name0 = await nameBlock(page);
    const pin = async () => {
      await page.evaluate(() => window.__studio.store.getState().setPinned(true));
      await page.waitForTimeout(300);
      return restAfter(page);
    };
    let pinning = await pin();
    // As for unpinning below: moved, but software GL drew no frame between; one more cycle before judging.
    if (pinning.length < 3 && pinning[0] === base && pinning.at(-1) !== base) {
      await page.evaluate(() => window.__studio.store.getState().setPinned(false));
      await page.waitForTimeout(300);
      await restAfter(page);
      pinning = await pin();
    }
    const name1 = await nameBlock(page);
    // Smoothly: at least one frame between where it was and where it lands (software GL draws few frames).
    check(pinning.length >= 3 && pinning[0] === base && pinning.at(-1) !== base, `${label}: pinning moves the house, smoothly (${pinning.length - 2} frames between), then it rests`);
    check(name0 === name1, `${label}: the house name keeps its box and ink when pinned (${name1})`);
    return { base, name0 };
  };
  const unpinCycle = async (page, label, base, name0) => {
    const unpin = async () => {
      await page.evaluate(() => window.__studio.store.getState().setPinned(false));
      await page.waitForTimeout(300);
      return restAfter(page);
    };
    let back = await unpin();
    // Software GL can starve every frame of the 420 ms move when the column
    // leaves and the input bar arrives in the same frame (seen on the build
    // before task 023 too: 0 or 1 frames between). Landed exactly but with no
    // frame between: pin again and unpin once more before judging.
    if (back.length < 3 && back.at(-1) === base) {
      await page.evaluate(() => window.__studio.store.getState().setPinned(true));
      await page.waitForTimeout(300);
      await restAfter(page);
      back = await unpin();
    }
    check(back.length >= 3 && back.at(-1) === base, `${label}: unpinning moves it back, smoothly (${back.length - 2} frames between), to exactly where it was (${back.at(-1) === base}${back.at(-1) === base ? '' : `, max diff ${Math.max(...back.at(-1).split(',').map((v, i) => Math.abs(v - base.split(',')[i])))}, ${back.length} values`}; framed ${page.__framing} -> ${await framing(page)})`);
    check((await nameBlock(page)) === name0, `${label}: the house name is back unchanged after unpinning`);
  };

  // Desktop 3D, sun study on (opening the sun panel then does not switch it on, which re-frames by its own rule).
  // Half the pixels: software GL then draws frames often enough to see the re-frame animate.
  {
    const { ctx, page } = await open(DESKTOP, '/studio?sun=winter&time=10:00&dpr=0.5');
    await page.waitForFunction(() => window.__studio?.ready3d === true, null, { timeout: 180000 });
    await page.waitForTimeout(800);
    await recorder.install(page);
    for (const tool of ['views', 'levels', 'sun']) await still(page, `3D ${tool} panel`, () => page.getByTestId(`bar-${tool}`).click(), esc(page));
    // Switching from one panel to another.
    await still(page, '3D switching views -> sun panel', async () => {
      await page.getByTestId('bar-views').click();
      await page.waitForTimeout(300);
      await page.getByTestId('bar-sun').click();
    }, esc(page));
    await still(page, '3D site panel', store(page, () => window.__studio.store.getState().setSitePanel({ kind: 'location' })), esc(page));
    await still(page, '3D project menu', () => page.getByTestId('project-menu').click(), esc(page));
    await still(page, '3D sign-in', account(page, true), account(page, false));
    await still(page, '3D recent strip', store(page, () => window.__studio.store.getState().setRecent(true)), store(page, () => window.__studio.store.getState().setRecent(false)));
    // A framing asked for with a panel open keeps clear of it.
    await page.getByTestId('bar-views').click();
    await page.waitForTimeout(400);
    await recorder.take(page);
    await page.evaluate(() => window.__studio.store.getState().resetView());
    const asked = await restAfter(page);
    const framed = await page.evaluate(() => window.__studio.engine.viewer.framedInsets);
    check(asked.length > 1 && framed.right > 330, `3D: a framing asked for with a panel open frames clear of it (right inset ${framed.right})`);
    await page.keyboard.press('Escape');
    await page.evaluate(() => window.__studio.store.getState().resetView());
    await restAfter(page);
    // Pinned: the sidebar hangs under the name; the panel floats below its tool (task 029).
    const { base, name0 } = await pinCycle(page, '3D');
    await still(page, '3D pinned: views panel', () => page.getByTestId('bar-views').click(), esc(page));
    await page.getByTestId('bar-views').click();
    await page.waitForTimeout(600);
    const geo = await page.evaluate(() => {
      const r = (q) => document.querySelector(q).getBoundingClientRect();
      return { side: r('[data-testid=chat-panel]'), name: r('[data-testid=title-block]'), panel: r('[data-testid=tray-views]'), bar: r('[role=toolbar]'), mode: r('[data-testid=mode-switch]') };
    });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    const hang = geo.side.top - geo.name.bottom, panelHang = geo.panel.top - geo.bar.bottom;
    // Task 029: a toolbar panel floats at the module's gap below its tool; the sidebar keeps its 6 px under the
    // name (it is persistent layout: moving it would move the house).
    check(Math.abs(hang - 6) < 0.5 && Math.abs(panelHang - 8) < 0.5 && geo.panel.right <= 1440 - 12 + 0.5 && Math.abs(900 - geo.side.bottom - 12) < 0.5,
      `pinned sidebar: ${hang.toFixed(1)} px under the name (6), the panel ${panelHang.toFixed(1)} px below the toolbar (8), inside the screen inset (panel right ${geo.panel.right}), bottom inset ${900 - geo.side.bottom}`);
    // Task 023 (audit item 19): at the screen's centre, pinned or not (task 021 had it over the drawing).
    const modeCentre = geo.mode.left + geo.mode.width / 2;
    check(Math.abs(modeCentre - 720) < 1, `pinned: the mode switch stays at the screen centre (${modeCentre.toFixed(1)} vs 720)`);
    // The menu opens over the sidebar; the sidebar steps aside meanwhile.
    const sideState = (want) =>
      page
        .waitForFunction((w) => {
          const el = document.querySelector('[data-testid=chat-panel]');
          return `${getComputedStyle(el).opacity} ${el.hasAttribute('inert')}` === w;
        }, want, { timeout: 8000 })
        .then(() => true, () => false);
    await page.getByTestId('project-menu').click();
    check(await sideState('0 true'), 'pinned: the project menu opens over the sidebar, which steps aside (no glass on glass)');
    await page.keyboard.press('Escape');
    check(await sideState('1 false'), 'pinned: the sidebar returns when the menu closes');
    await recorder.take(page);
    await unpinCycle(page, '3D', base, name0);
    await ctx.close();
  }

  // Desktop plan.
  {
    const { ctx, page } = await open(DESKTOP, '/studio?mode=plan');
    await page.waitForSelector('[data-testid=plan] svg', { timeout: 60000 });
    await page.waitForTimeout(600);
    await recorder.install(page);
    await still(page, 'plan levels panel', () => page.getByTestId('bar-levels').click(), esc(page));
    await still(page, 'plan site panel', store(page, () => window.__studio.store.getState().setSitePanel({ kind: 'orientation' })), esc(page));
    await still(page, 'plan project menu', () => page.getByTestId('project-menu').click(), esc(page));
    await still(page, 'plan sign-in', account(page, true), account(page, false));
    await still(page, 'plan recent strip', store(page, () => window.__studio.store.getState().setRecent(true)), store(page, () => window.__studio.store.getState().setRecent(false)));
    await levelsRegistered(page, 'plan');
    const { base, name0 } = await pinCycle(page, 'plan');
    await still(page, 'plan pinned: levels panel', () => page.getByTestId('bar-levels').click(), esc(page));
    await levelsRegistered(page, 'plan pinned');
    await unpinCycle(page, 'plan', base, name0);
    await ctx.close();
  }

  // Phone: the sheet at both detents, in 3D and plan.
  for (const mode of ['3d', 'plan']) {
    const { ctx, page } = await open(PHONE, `/studio?sun=winter&time=10:00${mode === 'plan' ? '&mode=plan' : ''}`);
    if (mode === '3d') await page.waitForFunction(() => window.__studio?.ready3d === true, null, { timeout: 180000 });
    else await page.waitForSelector('[data-testid=plan] svg', { timeout: 60000 });
    await page.waitForTimeout(800);
    await recorder.install(page);
    const tool = mode === '3d' ? 'views' : 'levels';
    await still(page, `phone ${mode}: ${tool} sheet (fit, large, closed)`, async () => {
      await page.getByTestId(`bar-${tool}`).click();
      await page.waitForTimeout(900);
      const g = await page.getByTestId('sheet-grab').boundingBox();
      const x = g.x + g.width / 2;
      await page.mouse.move(x, g.y + 8);
      await page.mouse.down();
      for (let i = 1; i <= 12; i++) await page.mouse.move(x, g.y + 8 - i * 50);
      await page.mouse.up();
    }, () => page.getByTestId(`bar-${tool}`).click());
    if (mode === '3d') await still(page, 'phone 3d: switching sheets views -> sun', async () => {
      await page.getByTestId('bar-views').click();
      await page.waitForTimeout(600);
      await page.getByTestId('bar-sun').click();
    }, () => page.getByTestId('bar-sun').click());
    if (mode === '3d') {
      // The pinned conversation's sheet stays: the house moves above it once; a tool sheet over it does not move it.
      const base = (await restAfter(page)).at(-1);
      await page.evaluate(() => window.__studio.store.getState().setPinned(true));
      await page.waitForTimeout(300);
      const pinning = await restAfter(page);
      const framedBottom = await page.evaluate(() => window.__studio.engine.viewer.framedInsets.bottom);
      check(pinning.length >= 3 && pinning.at(-1) !== base && framedBottom > 844 * 0.47, `phone 3d: pinning moves the house above the conversation sheet, smoothly (${pinning.length - 2} frames between; bottom inset ${framedBottom})`);
      await still(page, 'phone 3d pinned: views sheet over the conversation', () => page.getByTestId('bar-views').click(), () => page.getByTestId('bar-views').click());
    }
    await ctx.close();
  }
}

/** The eye-level preset turns to the south-east when a tree hides the facade's centre from the south-west (task 014). */
async function eyeLevelChecks() {
  if (!wanted('check-eye')) return;
  const { ctx, page } = await open(DESKTOP, '/studio?view=eye-sw');
  await page.waitForFunction(() => window.__studio?.ready3d === true, null, { timeout: 180000 });
  await settle(page);
  const az = await page.evaluate(() => window.__studio.engine.viewer.currentView?.azimuthDeg);
  check(az === 140, `T1 eye level looks from the unobstructed south-east (azimuth ${az})`);
  await ctx.close();
}

/** Waits for walk mode (after its dissolve) and places the walker. */
async function walkTo(page, x, y, heading) {
  await page.waitForFunction(() => window.__studio?.engine?.viewer?.walking === true, null, { timeout: 60000 });
  await page.waitForTimeout(400);
  await page.evaluate(([px, py, h]) => {
    const v = window.__studio.engine.viewer;
    v.walk.teleport(px, py, 0, h);
  }, [x, y, heading]);
  await settle(page);
  await page.waitForTimeout(300);
}

/** Walk mode in the app: HUD, mini-map, moving, walls stop, doors let through. */
async function walkChecks() {
  if (!wanted('check-walk')) return;
  const { ctx, page } = await open(DESKTOP, '/studio?sample=golden&walk=1');
  await page.waitForFunction(() => window.__studio?.ready3d === true, null, { timeout: 180000 });
  await page.waitForFunction(() => window.__studio?.engine?.viewer?.walking === true, null, { timeout: 60000 });
  check(await page.locator('[data-testid=walk-hud]').count() === 1, 'walk HUD with mini-map is shown');
  const st0 = await page.evaluate(() => window.__studio.engine.viewer.walkState);
  check(st0 && st0.level === 'L1', `walk starts on the ground floor (${JSON.stringify(st0)})`);
  // Forward with the keyboard (W held for ~0.6 s).
  const camPos = () => page.evaluate(() => window.__studio.engine.viewer.camera.position.toArray());
  const a = await camPos();
  await page.locator('canvas').first().click({ position: { x: 700, y: 450 } });
  await page.evaluate(() => window.__studio.engine.viewer.walk.look(90, 0));
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(700);
  await page.keyboard.up('KeyW');
  await page.waitForTimeout(150);
  const b = await camPos();
  const moved = Math.hypot(b[0] - a[0], b[2] - a[2]);
  check(moved > 0.2, `walking forward (W) moves the camera (${moved.toFixed(2)} m)`);
  // A wall stops: walk east in the living room (north of the TV wall) towards the exterior wall at x = 13.8.
  const wall = await page.evaluate(() => {
    const w = window.__studio.engine.viewer.walk;
    w.teleport(12.6, 6.3, 0, 90);
    for (let i = 0; i < 80; i++) w.step(0.05);
    return w.state;
  });
  check(wall.x < 13.8 - 0.12 - 0.2 && wall.x > 13.2, `a wall stops the walker (x ${wall.x.toFixed(2)} m, wall face at 13.68 m)`);
  // A door lets through: from the living room north through the main entrance.
  const door = await page.evaluate(() => {
    const w = window.__studio.engine.viewer.walk;
    w.teleport(12.15, 6.1, 0, 0);
    for (let i = 0; i < 40; i++) w.step(0.05);
    return w.state;
  });
  check(door.y > 7.2, `the main door lets the walker through (y ${door.y.toFixed(2)} m, wall at 6.9 m)`);
  // Exit returns to the view.
  await page.getByRole('button', { name: '退出漫游' }).click();
  // The exit is a dissolve driven by frames: wait for the state, not a fixed time.
  await page.waitForFunction(() => window.__studio.engine.viewer.walking === false, null, { timeout: 15000 }).catch(() => {});
  check((await page.evaluate(() => window.__studio.engine.viewer.walking)) === false, 'exit leaves walk mode');
  await ctx.close();
}

/** 图册: the set renders in the page; thumbnails, preview, 4 PNGs of the right size. */
async function sheets(opts, name) {
  if (!wanted(name)) return;
  const { ctx, page } = await open(opts, '/studio?mode=sheet');
  const t0 = Date.now();
  await page.waitForSelector('[data-testid=sheets]', { timeout: 60000 });
  if (!smoke && name.includes('desktop')) {
    // Progress state while the set renders.
    await page.waitForTimeout(400);
    await shot(page, `${name}-progress`);
  }
  await page.waitForFunction(() => window.__sheets?.done === true, null, { timeout: 300000 });
  const res = await page.evaluate(() => ({
    error: window.__sheets.error,
    files: window.__sheets.files.map((f) => f && { w: f.width, h: f.height, bytes: f.blob.size, type: f.blob.type }),
    ms: window.__sheets.ms,
  }));
  console.log(`  sheet set rendered in ${(res.ms / 1000).toFixed(1)} s (page open to done ${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  check(!res.error, `${name}: no render error`);
  check(
    // One sheet per level plus the axonometric (starter: 3, golden: 4).
    res.files.length >= 3 && res.files.every((f) => f && f.w === 1500 && f.h === 2000 && f.type === 'image/png' && f.bytes > 100000),
    `${name}: ${res.files.length} PNG blobs of 1500x2000 (${res.files.map((f) => f && `${f.w}x${f.h} ${(f.bytes / 1e6).toFixed(2)} MB`).join(', ')})`,
  );
  await page.waitForTimeout(500);
  await noHorizontalScroll(page, name);
  await shot(page, name);
  if (!smoke) {
    await page.getByRole('button', { name: /查看大图/ }).first().click();
    await page.waitForTimeout(450);
    await shot(page, name.replace('sheets', 'sheet-preview'));
    if (name.includes('desktop')) {
      await page.getByRole('button', { name: '下一张' }).click();
      await page.waitForTimeout(400);
      await shot(page, `${name.replace('sheets', 'sheet-preview')}-2`);
    }
  }
  await ctx.close();
}

try {
  await landing(DESKTOP, 'landing-desktop');
  await landing(PHONE, 'landing-phone');
  await studio3d(DESKTOP, 'studio-3d-desktop');
  await studio3d(PHONE, 'studio-3d-phone');
  await studioPlan(DESKTOP, 'studio-plan-desktop');
  await studioPlan(PHONE, 'studio-plan-phone');
  if (!smoke) {
    await studio3d(DESKTOP, 'studio-3d-desktop-eye', '?view=eye-sw');
    await studio3d(DESKTOP, 'studio-3d-desktop-chat', '?view=elev-south', async (p) => {
      await p.getByTestId('chat-history').click();
      await p.waitForTimeout(300);
    });
    await studio3d(DESKTOP, 'studio-3d-desktop-en', '?lang=en&view=axo-ne');
    await studioPlan(DESKTOP, 'studio-plan-desktop-l2', '&level=L2');
    await studioPlan(PHONE, 'studio-plan-phone-attic', '&sample=golden&level=L3');
    await studio3d(DESKTOP, 'studio-golden-desktop', '?sample=golden');
    await studio3d(PHONE, 'studio-3d-phone-views', '', async (p) => {
      await p.getByTestId('bar-views').click();
      await p.waitForTimeout(450);
    });
    await studio3d(DESKTOP, 'studio-sun-cut-L1-desktop', '?sun=winter&time=10:00&cut=L1');
    await studio3d(PHONE, 'studio-sun-cut-L1-phone', '?sun=winter&time=10:00&cut=L1');
    await studio3d(DESKTOP, 'studio-cut-L2-desktop', '?cut=L2');
    await studio3d(PHONE, 'studio-cut-L2-phone-levels', '?cut=L2&sun=summer&time=16:00', async (p) => {
      await p.getByTestId('bar-levels').click();
      await p.waitForTimeout(450);
    });
    await studio3d(DESKTOP, 'studio-3d-desktop-views', '', async (p) => {
      await p.getByTestId('bar-views').click();
      await p.getByRole('button', { name: '东北轴测' }).click();
      await p.waitForTimeout(700);
    });
    await studio3d(PHONE, 'studio-3d-phone-chat', '', async (p) => {
      await p.getByTestId('chat-history').click();
      await p.waitForTimeout(300);
    });
    await studio3d(DESKTOP, 'studio-3d-desktop-pinned', '?panel=pin');
    await studio3d(PHONE, 'studio-3d-phone-pinned', '?panel=pin');
    await studio3d(DESKTOP, 'studio-walk-desktop', '?sample=golden&walk=1&sun=winter&time=10:00', (p) => walkTo(p, 13.2, 6.3, 212));
    await studio3d(PHONE, 'studio-walk-phone', '?sample=golden&walk=1&sun=winter&time=10:00', (p) => walkTo(p, 12.6, 2.4, 285));
    await studio3d(DESKTOP, 'studio-walk-desktop-en', '?sample=golden&walk=1&lang=en', (p) => walkTo(p, 7.3, 8.6, 180));
    // The starter house (the studio's default), from its own entrance.
    await studio3d(DESKTOP, 'studio-walk-starter-desktop', '?walk=1&sun=winter&time=10:00', async (p) => {
      await p.waitForFunction(() => window.__studio?.engine?.viewer?.walking === true, null, { timeout: 60000 });
      await p.waitForTimeout(500);
    });
    await compareWithRenderShots();
  }
  await controlChecks();
  await stillHouseChecks();
  await walkChecks();
  await sunAndCutChecks();
  await siteChecks();
  await eyeLevelChecks();
  await sheets(DESKTOP, 'studio-sheets-desktop');
  if (!smoke) await sheets(PHONE, 'studio-sheets-phone');
} finally {
  await browser.close();
  stopServer();
}

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('\nAll checks passed.');
