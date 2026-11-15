// Screenshots for task 021 (the house stays still; the pinned conversation
// hangs under the name): each floating panel open in 3D and plan, the
// pinned conversation in 3D and plan, the project menu open while pinned
// (desktop 1440x900 and 1280x720), and the phone sheet at each detent
// (390x844). The assertions are in shots.mjs (stillHouseChecks).
//
//   node scripts/still-shots.mjs                     -> artifacts/task021/<viewport>-<state>.png
//   node scripts/still-shots.mjs --only 1280x720-plan  some runs (prefixes of <viewport>-<mode>)
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
const outDir = resolve(appRoot, '../../artifacts/task021');
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

const onlyArg = process.argv.indexOf('--only');
const only = onlyArg > 0 ? process.argv[onlyArg + 1].split(',') : null;
const wanted = (name) => !only || only.some((o) => name.startsWith(o));

const browser = await playwright.chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const errors = [];
const settle = (page, ms = 900) => page.evaluate((m) => new Promise((r) => setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(r)), m)), ms);
const store = (page, fn) => page.evaluate(fn);

async function session(vp, opts, path, run) {
  const ctx = await browser.newContext(opts);
  await ctx.addInitScript(() => localStorage.setItem('opensu.hints.v1', 'done'));
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${vp} ${path}: ${e.message}`));
  await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
  if (path.includes('mode=plan')) await page.waitForSelector('[data-testid=plan] svg', { timeout: 60000 });
  else await page.waitForFunction(() => window.__studio?.ready3d === true, null, { timeout: 180000 });
  await settle(page);
  const shot = async (state) => {
    const file = resolve(outDir, `${vp}-${state}.png`);
    await page.screenshot({ path: file, timeout: 180000 });
    console.log(`  -> ${file}`);
  };
  await run(page, shot);
  await ctx.close();
}

/** Each floating panel open, then the pinned conversation, its menu, and a panel while pinned. */
async function desktop(vp, opts, mode) {
  const plan = mode === 'plan';
  await session(vp, opts, plan ? '/studio?mode=plan' : '/studio?sun=winter&time=10:00', async (page, shot) => {
    await shot(`${mode}-idle`);
    for (const tool of plan ? ['levels'] : ['views', 'levels', 'sun']) {
      await page.getByTestId(`bar-${tool}`).click();
      await settle(page);
      await shot(`${mode}-${tool}`);
      await page.keyboard.press('Escape');
      await settle(page, 600);
    }
    await store(page, () => window.__studio.store.getState().setSitePanel({ kind: 'location' }));
    await settle(page);
    await shot(`${mode}-site`);
    await page.keyboard.press('Escape');
    await settle(page, 600);
    await page.getByTestId('project-menu').click();
    await settle(page, 600);
    await shot(`${mode}-menu`);
    await page.keyboard.press('Escape');
    await settle(page, 600);
    await store(page, () => window.__studio.store.getState().setRecent(true));
    await settle(page);
    await shot(`${mode}-recent`);
    await store(page, () => window.__studio.store.getState().setRecent(false));
    await settle(page, 600);
    await store(page, () => window.__studio.account.setState({ open: true, origin: 'menu', anchor: null }));
    await settle(page);
    await shot(`${mode}-signin`);
    await store(page, () => window.__studio.account.setState({ open: false }));
    await settle(page, 600);
    await store(page, () => window.__studio.store.getState().setPinned(true));
    await settle(page, 1500);
    await shot(`${mode}-pinned`);
    await page.getByTestId(plan ? 'bar-levels' : 'bar-views').click();
    await settle(page);
    await shot(`${mode}-pinned-${plan ? 'levels' : 'views'}`);
    await page.keyboard.press('Escape');
    await settle(page, 600);
    await page.getByTestId('project-menu').click();
    await settle(page, 600);
    await shot(`${mode}-pinned-menu`);
    await page.keyboard.press('Escape');
    await settle(page, 600);
    await store(page, () => window.__studio.store.getState().setPinned(false));
    await settle(page, 1200);
  });
}

/** Phone: the sheet at the fit and large detents, in 3D and plan. */
async function phone(vp, opts, mode) {
  const plan = mode === 'plan';
  await session(vp, opts, plan ? '/studio?mode=plan' : '/studio', async (page, shot) => {
    await shot(`${mode}-idle`);
    const tool = plan ? 'levels' : 'views';
    await page.getByTestId(`bar-${tool}`).click();
    await settle(page, 1200);
    await shot(`${mode}-${tool}-fit`);
    const g = await page.getByTestId('sheet-grab').boundingBox();
    const x = g.x + g.width / 2;
    await page.mouse.move(x, g.y + 8);
    await page.mouse.down();
    for (let i = 1; i <= 12; i++) await page.mouse.move(x, g.y + 8 - i * 50);
    await page.mouse.up();
    await settle(page, 1200);
    await shot(`${mode}-${tool}-large`);
    await page.getByTestId(`bar-${tool}`).click();
    await settle(page, 1200);
    await shot(`${mode}-closed`);
    if (!plan) {
      await store(page, () => window.__studio.store.getState().setPinned(true));
      await settle(page, 1200);
      await shot(`${mode}-pinned`);
    }
  });
}

const DESK = (w, h) => ({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
try {
  for (const [w, h] of [[1440, 900], [1280, 720]]) for (const m of ['3d', 'plan']) if (wanted(`${w}x${h}-${m}`)) await desktop(`${w}x${h}`, DESK(w, h), m);
  for (const m of ['3d', 'plan']) if (wanted(`390x844-${m}`)) await phone('390x844', PHONE, m);
} finally {
  await browser.close();
}
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
