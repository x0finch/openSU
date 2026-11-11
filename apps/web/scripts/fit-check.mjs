// Task 016 checks in the built app (local Workers runtime):
//
//   frame  the subject (house + ground shadow + trees and people) lies inside
//          the free area the controls leave, with a margin, centred, for every
//          template and the golden sample at every supported viewport; also
//          with a panel open, pinned, in the sun study, after turning the
//          house, and at eye level. -> artifacts/web/fit/frame-*.png
//   text   no text in the toolbar, the panels, the menu or the input is cut
//          (ellipsis, clipped overflow), in Chinese and English, at every
//          supported width.
//   sun    the sun study at the edges of the world: polar night (no slider,
//          presentation light, a note), polar day (a whole-day slider), no
//          clock past 24:00, sunrise / sunset the same in the slider and the
//          text, slider labels never collide, the render at sunset has the
//          sun on the horizon.
//
//   node scripts/fit-check.mjs                    all
//   node scripts/fit-check.mjs --only frame       some sections (name prefixes; frame-t1, text-en, ...)
//
// Requires a build (`pnpm --filter @opensu/web build`).
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, '..');
const outDir = resolve(appRoot, '../../artifacts/web/fit');
mkdirSync(outDir, { recursive: true });
const onlyArg = process.argv.indexOf('--only');
const only = onlyArg > 0 ? process.argv[onlyArg + 1].split(',') : null;
/** An item (`frame-t1-1440x900`) is run when a name prefix asks for it; a section when any of its items may be. */
const wanted = (s) => !only || only.some((o) => s.startsWith(o));
const section = (s) => !only || only.some((o) => s.startsWith(o) || o.startsWith(s));

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
  return { viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: phone, hasTouch: phone };
};
const VIEWPORTS = [[1440, 900], [1024, 700], [820, 1180], [390, 844], [360, 800], [320, 700], [844, 390]];
const HOUSES = ['t1', 't2', 't3', 'golden'];

const browser = await playwright.chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });

async function open([w, h], path) {
  const ctx = await browser.newContext(vp(w, h));
  await ctx.addInitScript(() => localStorage.setItem('opensu.hints.v1', 'done'));
  const page = await ctx.newPage();
  page.on('pageerror', (e) => failures.push(`${path}: page error ${e.message}`));
  await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
  if (!path.includes('mode=')) await page.waitForFunction(() => window.__studio?.ready3d === true, null, { timeout: 180000 });
  return { ctx, page };
}

/** Lets transitions finish and the 3D view render its latest state (software GL is slow). */
const settle = (page, ms = 1200) => page.evaluate((m) => new Promise((r) => setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(r)), m)), ms);

/* ------------------------------------------------------------------ */
/* frame: the subject inside the free area, centred                    */
/* ------------------------------------------------------------------ */

/**
 * In the page: the drawn picture's box (any non-white pixel of the 3D
 * canvas: house, shadow, trees, people) and the free area the house was
 * framed into, CSS px relative to the canvas.
 */
function measureFrame() {
  const v = window.__studio.engine.viewer;
  v.renderNow();
  const src = v.renderer.domElement;
  const W = src.clientWidth, H = src.clientHeight;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(src, 0, 0, W, H);
  const d = g.getImageData(0, 0, W, H).data;
  let x0 = W, x1 = -1, y0 = H, y1 = -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (d[i] < 246 || d[i + 1] < 246 || d[i + 2] < 246) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  const ins = v.framedInsets;
  return { W, H, box: { x0, x1, y0, y1 }, free: { x0: ins.left, x1: W - ins.right, y0: ins.top, y1: H - ins.bottom } };
}

/** The subject lies inside the free area with `margin` px to spare and is centred in it. */
function judgeFrame(name, m, { margin = 4, centred = true } = {}) {
  const { box: b, free: f } = m;
  const gaps = { l: b.x0 - f.x0, r: f.x1 - 1 - b.x1, t: b.y0 - f.y0, b: f.y1 - 1 - b.y1 };
  const inside = Math.min(gaps.l, gaps.r, gaps.t, gaps.b) >= margin;
  const tolX = Math.max(14, 0.08 * (f.x1 - f.x0));
  const tolY = Math.max(14, 0.08 * (f.y1 - f.y0));
  const evenX = Math.abs(gaps.l - gaps.r) <= tolX;
  const evenY = Math.abs(gaps.t - gaps.b) <= tolY;
  check(b.x1 > b.x0 && inside && (!centred || (evenX && evenY)),
    `${name}: subject ${b.x0}..${b.x1} x ${b.y0}..${b.y1} in free ${f.x0}..${f.x1} x ${f.y0}..${f.y1}; gaps l${gaps.l} r${gaps.r} t${gaps.t} b${gaps.b}`);
}

async function frameState(page, name, opts) {
  await settle(page, 1600);
  const m = await page.evaluate(measureFrame);
  await page.screenshot({ path: resolve(outDir, `frame-${name}.png`), timeout: 180000 });
  judgeFrame(name, m, opts);
}

if (section('frame')) {
  for (const house of HOUSES) {
    for (const [w, h] of VIEWPORTS) {
      const name = `${house}-${w}x${h}`;
      if (!wanted(`frame-${name}`)) continue;
      const { ctx, page } = await open([w, h], `/studio?sample=${house}`);
      await frameState(page, `${name}-idle`);
      const desktop = w >= 768 && h >= 520;
      if (house === 't1' || w === 1440) {
        // The sun panel open (desktop card / phone sheet) with the sun on.
        await page.evaluate(() => {
          const s = window.__studio.store.getState();
          s.setSun({ on: true });
          s.setTray('sun');
        });
        await frameState(page, `${name}-sun`);
        // Turned to face east with the sun on: re-framed, shadow included (item 10).
        await page.evaluate(() => {
          const s = window.__studio.store.getState();
          s.setHouse({ ...s.house, site: { ...s.house.site, northDeg: 90 } });
        });
        await frameState(page, `${name}-east`);
        await page.evaluate(() => window.__studio.store.getState().setTray(null));
        await frameState(page, `${name}-east-closed`);
      }
      await ctx.close();
      if (desktop && (house === 't1' || w === 1440)) {
        const p = await open([w, h], `/studio?sample=${house}&panel=pin`);
        await frameState(p.page, `${name}-pinned`);
        await p.ctx.close();
      }
    }
  }
  // Eye level: inside the plot, the building framed (it may be wide-angle; centring is the camera's, not checked).
  for (const house of HOUSES) {
    if (!wanted(`frame-eye-${house}`)) continue;
    const { ctx, page } = await open([1440, 900], `/studio?sample=${house}&view=eye-sw`);
    await settle(page, 1800);
    const eye = await page.evaluate(() => {
      const v = window.__studio.engine.viewer;
      const p = v.camera.position;
      return { x: p.x, z: p.z, preset: v.currentView };
    });
    await page.screenshot({ path: resolve(outDir, `eye-${house}.png`), timeout: 180000 });
    const site = await page.evaluate(() => window.__studio.store.getState().house.site);
    const inside = eye.x > 0 && eye.x < site.width / 1000 && -eye.z > 0 && -eye.z < site.depth / 1000;
    // T2 and the golden sample have only narrow strips of garden in front (no spot with a view
    // across open ground): their eye level stays outside the fence (reported, not failed).
    const must = house === 't1' || house === 't3';
    if (must || inside) check(!site.fence || inside, `eye level ${house}: stands inside the plot (${eye.x.toFixed(1)}, ${(-eye.z).toFixed(1)} m in ${site.width / 1000} x ${site.depth / 1000})`);
    else console.log(`  note eye level ${house}: outside the fence (no open ground with a view inside)`);
    await ctx.close();
  }
  // Walk start: room ahead, looking down a long sightline.
  for (const house of HOUSES) {
    if (!wanted(`frame-walk-${house}`)) continue;
    const { ctx, page } = await open([1440, 900], `/studio?sample=${house}&walk=1`);
    await page.waitForFunction(() => window.__studio?.engine?.viewer?.walking === true, null, { timeout: 60000 });
    await settle(page, 1200);
    const r = await page.evaluate(() => {
      const w = window.__studio.engine.viewer.walk;
      const st = w.state;
      return { st, ahead: w.world.clearance({ x: st.x, y: st.y, z: st.z }, st.headingDeg, 14) };
    }).catch((e) => ({ error: String(e) }));
    await page.screenshot({ path: resolve(outDir, `walk-${house}.png`), timeout: 180000 });
    check(r.ahead >= 1.5, `walk start ${house}: ${r.ahead?.toFixed?.(1) ?? r.error} m of clear floor ahead`);
    await ctx.close();
  }
}

/* ------------------------------------------------------------------ */
/* text: nothing cut                                                    */
/* ------------------------------------------------------------------ */

/** In the page: text elements inside the chrome that are cut (ellipsis or clipped overflow). */
function clippedTexts() {
  const roots = [...document.querySelectorAll('[data-panel], [data-testid=toolbar], [data-testid=prompt], [role=menu], [data-testid=phone-sheet], [data-testid=sun-ticks]')];
  const out = [];
  const seen = new Set();
  for (const root of roots) {
    for (const el of root.querySelectorAll('*')) {
      if (seen.has(el)) continue;
      seen.add(el);
      const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      if (!own) continue;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.opacity === '0') continue;
      const cut = el.scrollWidth > el.clientWidth + 1 && (cs.overflowX !== 'visible' || cs.textOverflow === 'ellipsis');
      // Or sticking out of the panel / toolbar it belongs to.
      const rr = root.getBoundingClientRect();
      const out1 = r.left < rr.left - 1 || r.right > rr.right + 1;
      if (cut || out1) out.push(`${el.textContent.trim().slice(0, 40)} (${cut ? 'cut' : 'outside'})`);
    }
  }
  // Labels under the slider must not touch each other.
  const ticks = [...document.querySelectorAll('[data-testid=sun-ticks] > span')].map((s) => s.getBoundingClientRect()).sort((a, b) => a.left - b.left);
  for (let i = 1; i < ticks.length; i++) if (ticks[i].left < ticks[i - 1].right + 2) out.push('slider labels collide');
  return out;
}

if (section('text')) {
  const PANELS = [
    ['sun', (s) => s.setTray('sun')],
    ['views', (s) => s.setTray('views')],
    ['levels', (s) => s.setTray('levels')],
    ['location', (s) => s.setSitePanel({ kind: 'location', fromSun: true })],
    ['orientation', (s) => s.setSitePanel({ kind: 'orientation', fromSun: true })],
  ];
  for (const lang of ['zh', 'en']) {
    if (!wanted(`text-${lang}`)) continue;
    for (const [w, h] of [[1440, 900], [1024, 700], [390, 844], [360, 800], [320, 700], [844, 390]]) {
      for (const house of ['t1', 't3']) {
        const { ctx, page } = await open([w, h], `/studio?sample=${house}&lang=${lang}`);
        // A place far away and a turned front: the longest texts.
        await page.evaluate(() => {
          const s = window.__studio.store.getState();
          s.setHouse({ ...s.house, site: { ...s.house.site, latitude: -33.87, longitude: 151.21, timeZone: 'Australia/Sydney', placeName: 'Sydney', northDeg: -25 } });
          s.setSun({ on: true });
        });
        await settle(page, 400);
        const bad = [];
        for (const [name, fn] of PANELS) {
          await page.evaluate(`(${fn.toString()})(window.__studio.store.getState())`);
          await settle(page, 500);
          for (const x of await page.evaluate(clippedTexts)) bad.push(`${name}: ${x}`);
          if (name === 'sun') await page.screenshot({ path: resolve(outDir, `text-${lang}-${w}x${h}-${house}-sun.png`), timeout: 180000 });
          await page.evaluate(() => {
            const s = window.__studio.store.getState();
            s.setSitePanel(null);
            s.setTray(null);
          });
        }
        // The project menu.
        const menu = page.getByTestId('project-menu');
        if (await menu.count()) {
          await menu.first().click();
          await settle(page, 300);
          for (const x of await page.evaluate(clippedTexts)) bad.push(`menu: ${x}`);
          await page.keyboard.press('Escape');
        }
        check(!bad.length, `text ${lang} ${w}x${h} ${house}: nothing cut${bad.length ? ` (${[...new Set(bad)].join('; ')})` : ''}`);
        await ctx.close();
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/* sun: the edges of the world                                          */
/* ------------------------------------------------------------------ */

/** In the page: what the sun panel shows. */
function sunPanel() {
  const q = (id) => document.querySelector(`[data-testid=${id}]`);
  const slider = document.querySelector('[data-panel] input[type=range]');
  const s = window.__studio.store.getState();
  return {
    clock: q('sun-clock')?.textContent ?? null,
    sub: q('sun-sub')?.textContent ?? null,
    span: q('sun-noon')?.textContent ?? null,
    note: q('sun-polar-note')?.textContent ?? null,
    ticks: [...document.querySelectorAll('[data-testid=sun-ticks] > span')].map((x) => x.textContent),
    min: slider ? Number(slider.min) : null,
    max: slider ? Number(slider.max) : null,
    info: s.sunInfo,
    minutes: s.sun.minutes,
    lighting: window.__studio.engine.viewer.lightingMode.mode,
    sunEl: window.__studio.engine.viewer.sun.elevationDeg,
    bar: document.querySelector('[data-testid=bar-sun]')?.textContent ?? null,
  };
}

if (wanted('sun')) {
  const PLACES = {
    tromso: { latitude: 69.65, longitude: 18.96, timeZone: 'Europe/Oslo', placeName: 'Tromsø' },
    london: { latitude: 51.51, longitude: -0.13, timeZone: 'Europe/London', placeName: 'London' },
    reykjavik: { latitude: 64.15, longitude: -21.94, timeZone: 'Atlantic/Reykjavik', placeName: 'Reykjavík' },
    hangzhou: { latitude: 30.3, longitude: 120.2, timeZone: 'Asia/Shanghai', placeName: '杭州' },
  };
  const { ctx, page } = await open([1440, 900], '/studio?sample=t1&sun=winter&time=15:00');
  const place = async (p, dateId, minutes) => {
    // The place first (as in the location panel), then the date and time.
    await page.evaluate((site) => {
      const s = window.__studio.store.getState();
      s.setHouse({ ...s.house, site: { ...s.house.site, ...site } });
    }, p);
    await settle(page, 600);
    await page.evaluate(([d, m]) => {
      const s = window.__studio.store.getState();
      s.setSun({ on: true, dateId: d, ...(m !== null ? { minutes: m } : {}) });
      s.setTray('sun');
    }, [dateId, minutes]);
    await settle(page, 900);
    return page.evaluate(sunPanel);
  };
  const clockOk = (t) => !!t && !/(^|\D)(2[4-9]|[3-9]\d):\d\d/.test(t);

  let r = await place(PLACES.tromso, 'winter', null);
  await page.screenshot({ path: resolve(outDir, 'sun-tromso-winter.png'), timeout: 180000 });
  check(r.info?.polar === 'night' && r.min === null && !!r.note && /极夜/.test(r.sub ?? '') && !/日出|日落/.test(r.span ?? ''), `polar night is said in words, no slider, no sunrise / sunset (${r.sub} | ${r.span})`);
  check(r.lighting === 'presentation', `polar night: the house in presentation light (${r.lighting})`);
  check(/极夜/.test(r.bar ?? ''), `polar night: the toolbar says so (${r.bar})`);

  r = await place(PLACES.tromso, 'summer', 600);
  await page.screenshot({ path: resolve(outDir, 'sun-tromso-summer.png'), timeout: 180000 });
  check(r.info?.polar === 'day' && r.min === 0 && r.max === 1439 && /极昼/.test(`${r.sub} ${r.span}`) && !/日出|日落/.test(r.span ?? ''), `polar day: a whole-day slider and the words (${r.min}..${r.max}, ${r.sub} | ${r.span})`);

  for (const [name, p, d] of [['london-winter', PLACES.london, 'winter'], ['reykjavik-summer', PLACES.reykjavik, 'summer'], ['hangzhou-summer', PLACES.hangzhou, 'summer']]) {
    // To sunset (the end of the slider).
    r = await place(p, d, 2000);
    await page.screenshot({ path: resolve(outDir, `sun-${name}-sunset.png`), timeout: 180000 });
    const texts = [r.clock, r.span, ...r.ticks, r.bar];
    check(texts.every((t) => clockOk(t ?? '00:00')), `${name}: no clock text past 24:00 (${texts.join(' | ')})`);
    const ends = [r.ticks[0], r.ticks[r.ticks.length - 1]];
    check(!!r.span && r.span.includes(ends[0]) && r.span.includes(ends[1]), `${name}: sunrise / sunset the same in the slider and the text (${ends.join(' / ')} in "${r.span}")`);
    check(r.max === r.info.sunset && r.minutes <= r.info.sunset, `${name}: time clamped to sunset (${r.minutes} <= ${r.info.sunset})`);
    check(/日落/.test(r.sub ?? '') && !/地平线下/.test(r.sub ?? ''), `${name}: at sunset the text says sunset, as drawn (${r.sub}; sun ${r.sunEl.toFixed(1)}° in the render)`);
    check(r.sunEl < 2, `${name}: the render's sun sits on the horizon at sunset (${r.sunEl.toFixed(2)}°)`);
    const bad = await page.evaluate(clippedTexts);
    check(!bad.some((x) => /collide/.test(x)), `${name}: slider labels do not collide (${r.ticks.join(' ')})`);
  }
  await ctx.close();
}

await browser.close();
server.kill('SIGTERM');
if (failures.length) {
  console.error(`\n${failures.length} check(s) failed:\n${failures.map((f) => `  - ${f}`).join('\n')}`);
  process.exit(1);
}
console.log('\nAll fit checks passed.');
