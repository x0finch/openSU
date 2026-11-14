// Task 019: records the sign-in interactions frame by frame at a fixed
// 30 fps step (Playwright's fake clock drives requestAnimationFrame, as in
// glass-record.mjs) for the side-by-side comparison with Apple's footage.
// Frames go to artifacts/task019/compare/ours/<name>/. Uses a fresh local D1
// and the localhost-only code hook; no network.
//
//   node scripts/signin-record.mjs [--only open,close,phone,code]
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, '..');
const out = resolve(appRoot, '../../artifacts/task019/compare/ours');
const devVars = resolve(appRoot, 'dist/server/.dev.vars');
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
const state = mkdtempSync(join(tmpdir(), 'opensu-rec-'));
execFileSync(process.execPath, [resolve(appRoot, 'node_modules/wrangler/bin/wrangler.js'), 'd1', 'migrations', 'apply', 'DB', '--local', '--persist-to', state], { cwd: appRoot, stdio: 'pipe', env: { ...process.env, CI: '1' } });
// Fake values only: a key that is never called, a test secret, Google ids that only make the button appear.
writeFileSync(devVars, [`OPENROUTER_API_KEY='sk-not-real'`, `SITE_URL='${base}'`, `BETTER_AUTH_SECRET='record-secret-not-real-0123456789abcdef'`, `AUTH_TEST_HOOK='1'`, `GOOGLE_CLIENT_ID='not-real'`, `GOOGLE_CLIENT_SECRET='not-real'`].join('\n') + '\n');
const server = spawn(process.execPath, [resolve(appRoot, 'node_modules/vite/bin/vite.js'), 'preview', '--port', String(port), '--strictPort'], { cwd: appRoot, stdio: 'ignore', env: { ...process.env, CI: '1', OPENSU_STATE: state } });
process.on('exit', () => {
  server.kill('SIGTERM');
  rmSync(devVars, { force: true });
  rmSync(state, { recursive: true, force: true });
});
for (let i = 0; i < 120; i++) {
  try {
    if ((await fetch(`${base}/api/health`)).ok) break;
  } catch {}
  await new Promise((r) => setTimeout(r, 250));
}
const browser = await playwright.chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });

async function idle(page, ms) {
  for (let t = 0; t < ms; t += 50) {
    await page.clock.runFor(50);
    await page.screenshot({ clip: { x: 0, y: 0, width: 4, height: 4 } });
  }
}
async function open(phone = false) {
  const ctx = await browser.newContext(phone ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, timezoneId: 'Asia/Shanghai' } : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, timezoneId: 'Asia/Shanghai' });
  await ctx.addInitScript(() => localStorage.setItem('opensu.hints.v1', 'done'));
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  await page.clock.install();
  await page.goto(`${base}/studio`);
  await page.waitForFunction(() => window.__studio?.ready3d === true, null, { timeout: 180000 });
  await page.waitForTimeout(1500);
  await page.clock.pauseAt(Date.now() + 1000);
  await idle(page, 1500);
  return { ctx, page };
}
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
async function openMenu(page) {
  await page.getByTestId('project-menu').first().click();
  await idle(page, 900);
}

if (wanted('open') || wanted('close') || wanted('code')) {
  const { ctx, page } = await open();
  const clip = { x: 0, y: 0, width: 440, height: 440 };
  await openMenu(page);
  // The account entry flows into the sign-in panel (the menu flows back into the name).
  await record(page, 'signin-open', clip, 24, { 2: () => page.getByTestId('menu-signin').click() });
  await idle(page, 600);
  if (wanted('code')) {
    await page.getByTestId('signin-email-input').fill('record@example.com');
    await page.getByTestId('signin-email-input').press('Enter');
    await page.waitForSelector('[data-testid=otp-0]');
    await idle(page, 900);
    const right = (await (await fetch(`${base}/api/auth-test/code?email=record%40example.com`)).json()).code;
    const wrong = right === '000000' ? '111111' : '000000';
    const steps = {};
    for (let i = 0; i < 6; i++) steps[2 + i * 2] = () => page.keyboard.type(wrong[i]);
    await record(page, 'code-wrong-shake', clip, 40, steps);
  }
  await record(page, 'signin-close', clip, 24, { 2: () => page.keyboard.press('Escape') });
  await ctx.close();
}
if (wanted('phone')) {
  const { ctx, page } = await open(true);
  await openMenu(page);
  await record(page, 'phone-sheet-open', { x: 0, y: 0, width: 390, height: 844 }, 30, { 2: () => page.getByTestId('menu-signin').tap() });
  await ctx.close();
}
await browser.close();
process.exit(0);
