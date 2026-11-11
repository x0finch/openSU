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

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, '..');
const repoRoot = resolve(appRoot, '../..');
const outDir = resolve(repoRoot, 'artifacts/web');
const smoke = process.argv.includes('--smoke');
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
  await page.screenshot({ path: file });
  console.log(`  -> ${file}`);
}

async function studio3d(opts, name, query = '', after) {
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
  const shotsDir = resolve(repoRoot, 'artifacts/shots');
  const views = ['axo-se', 'axo-ne', 'eye-sw', 'elev-south'].filter((v) => existsSync(resolve(shotsDir, `${v}.png`)));
  if (!views.length) {
    console.log('  (no artifacts/shots/*.png: run `pnpm shots` to compare the app with the renderer demo)');
    return;
  }
  const { ctx, page } = await open({ viewport: { width: 1600, height: 1200 }, deviceScaleFactor: 1 }, '/');
  for (const v of views) {
    await page.goto(`${base}/studio?view=${v}`, { waitUntil: 'networkidle' });
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
      await p.getByRole('button', { name: '打开 AI 助手' }).click();
      await p.waitForTimeout(200);
    });
    await studio3d(DESKTOP, 'studio-3d-desktop-en', '?lang=en&view=axo-ne');
    await studioPlan(DESKTOP, 'studio-plan-desktop-l2', '&level=L2');
    await studioPlan(PHONE, 'studio-plan-phone-attic', '&level=L3');
    await studio3d(PHONE, 'studio-3d-phone-collapsed', '', async (p) => {
      await p.getByRole('button', { name: '收起控制面板' }).click();
      await p.waitForTimeout(450);
    });
    await studio3d(PHONE, 'studio-3d-phone-chat', '', async (p) => {
      await p.getByRole('button', { name: '打开 AI 助手' }).click();
      await p.waitForTimeout(250);
    });
    await compareWithRenderShots();
  }
} finally {
  await browser.close();
  stopServer();
}

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('\nAll checks passed.');
