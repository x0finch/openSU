// End-to-end check of accounts and the daily quota (task 019), and of the
// saved conversation turns and the conversation export (task 020), against the
// SCRIPTED chat stub (no real model, no email, no network beyond
// localhost): the built app in workerd (`vite preview`) with a fresh local
// D1 (migrations applied with wrangler), sign-in codes read from the
// localhost-only test hook.
//
// And of API keys saved with the account (task 022): the stub stands in for
// OpenRouter, OpenAI and Anthropic (KEYS_TEST_UPSTREAM, localhost only).
//
//   node scripts/account-e2e.mjs            checks + screenshots -> artifacts/task019/*.png, artifacts/task020/*.png, artifacts/task022/*.png, artifacts/task029/*.png
//   node scripts/account-e2e.mjs --smoke    checks only
//   node scripts/account-e2e.mjs --only desktop,phone,limits,turns,keys,entry,canonical,projects,share
//
// `canonical` (task 026): the built app as production serves it (static
// pages first, `assets.run_worker_first` for the page routes) answers a
// request on another host with a 308 to SITE_URL, pages included.
//
// And of the studio header (task 029, `entry`; the account entry of task
// 026): the toolbar alone at the top right and steady on load; "分享" beside
// the house name (desktop) or first in the project menu (phones); the account
// in the project menu only; the sign-in invitation after the first change
// and its rules; view-only; nothing when sign-in is off; the landing's
// sign-in link; screenshots -> artifacts/task029/*.png.
//
// And of projects kept with the account (task 027, `projects`): first
// sign-in adoption, autosave, thumbnails, the address per project (back,
// reload, not found), new / rename / duplicate from the project menu, the
// /projects page (cards, menu, right click, rename, duplicate, delete with
// Undo, templates), a second browser, a conflict between two, the
// not-synced line, the limit, sign-out; screenshots -> artifacts/task027/*.png.
//
// And of share links (task 028, `share`): signed out the share button explains
// and offers sign-in (the house is adopted, the surface opens again); the
// switch, the link, "Copy link"; a signed-out viewer in another browser
// opens the link and uses every mode, finds nothing to edit, sees the
// owner's next version, keeps their own browser copy, makes a copy (asked
// once); a signed-in viewer's copy is a project of theirs; the projects
// page's mark and card menu; the link preview; turning sharing off kills the
// link and on again makes a new one; screenshots -> artifacts/task028/*.png.
//
// Requires a build (`pnpm --filter @opensu/web build`).
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { request as httpRequest } from 'node:http';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STUB_KEY, STUB_MODEL, startStub } from './chat-stub.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, '..');
const outDir = resolve(appRoot, '../../artifacts/task019');
const outDir20 = resolve(appRoot, '../../artifacts/task020');
const outDir22 = resolve(appRoot, '../../artifacts/task022');
const outDir27 = resolve(appRoot, '../../artifacts/task027');
const outDir28 = resolve(appRoot, '../../artifacts/task028');
const outDir29 = resolve(appRoot, '../../artifacts/task029');
const devVars = resolve(appRoot, 'dist/server/.dev.vars');
const smoke = process.argv.includes('--smoke');
const onlyArg = process.argv.indexOf('--only');
const only = onlyArg > 0 ? process.argv[onlyArg + 1].split(',') : null;
const wanted = (name) => !only || only.some((o) => name.startsWith(o));
mkdirSync(outDir, { recursive: true });
mkdirSync(outDir20, { recursive: true });
mkdirSync(outDir22, { recursive: true });
mkdirSync(outDir27, { recursive: true });
mkdirSync(outDir28, { recursive: true });
mkdirSync(outDir29, { recursive: true });

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

const failures = [];
const check = (cond, msg) => {
  if (!cond) failures.push(msg);
  console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${msg}`);
};
const freePort = () =>
  new Promise((ok) => {
    const s = createServer();
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => ok(port));
    });
  });

const SECRET = 'e2e-secret-not-real-0123456789abcdef';
const stub = await startStub();
console.log(`chat stub (scripted, not a model) on ${stub.url}`);

/** A preview with its own empty D1 (migrated) and these variables. */
async function startPreview(extra = {}) {
  const state = mkdtempSync(join(tmpdir(), 'opensu-e2e-'));
  execFileSync(process.execPath, [resolve(appRoot, 'node_modules/wrangler/bin/wrangler.js'), 'd1', 'migrations', 'apply', 'DB', '--local', '--persist-to', state], { cwd: appRoot, stdio: 'pipe', env: { ...process.env, CI: '1' } });
  const port = await freePort();
  const base = `http://localhost:${port}`;
  const vars = { OPENAI_API_KEY: STUB_KEY, OPENAI_BASE_URL: stub.url, OPENSU_MODEL: STUB_MODEL, SITE_URL: base, BETTER_AUTH_SECRET: SECRET, AUTH_TEST_HOOK: '1', ...extra };
  writeFileSync(devVars, Object.entries(vars).map(([k, v]) => `${k}='${v}'\n`).join(''));
  const proc = spawn(process.execPath, [resolve(appRoot, 'node_modules/vite/bin/vite.js'), 'preview', '--port', String(port), '--strictPort'], {
    cwd: appRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, CI: '1', OPENSU_STATE: state, OPENSU_ANY_HOST: '1' },
  });
  const p = { base, state, log: '', stop: () => (proc.kill('SIGTERM'), rmSync(state, { recursive: true, force: true })) };
  proc.stdout.on('data', (d) => (p.log += d));
  proc.stderr.on('data', (d) => (p.log += d));
  process.on('exit', () => proc.kill('SIGTERM'));
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(`${base}/api/health`)).ok) return p;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`preview did not start:\n${p.log}`);
}

// A visitor in China: the reset time reads as tomorrow 0:00.
const WHERE = { timezoneId: 'Asia/Shanghai', locale: 'zh-CN' };
const DESKTOP = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, ...WHERE };
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, ...WHERE };
const browser = await playwright.chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
// Every navigation may take up to 120 s (Playwright's default is 30 s). Leaving
// or reloading a studio page waits for its WebGL work, and on a CI runner a
// SwiftShader thumbnail took 18.7 s where it takes 0.3 s in the dev container
// (task 030). What a step needs is then awaited on the app's own signals
// (ready3d, the stores), each with its own timeout.
const NAV_MS = 120000;
async function newContext(opts) {
  const ctx = await browser.newContext(opts);
  ctx.setDefaultNavigationTimeout(NAV_MS);
  return ctx;
}

async function open(base, ctxOpts, path = '/studio') {
  const ctx = await newContext(ctxOpts);
  await ctx.addInitScript(() => localStorage.setItem('opensu.hints.v1', 'done'));
  const page = await ctx.newPage();
  page.on('pageerror', (e) => failures.push(`page error ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) failures.push(`console error ${m.text()}`);
  });
  await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__studio?.ready3d === true, null, { timeout: 180000 });
  return { ctx, page };
}

async function shot(page, name, dir = outDir) {
  if (smoke) return;
  const file = resolve(dir, `${name}.png`);
  await page.screenshot({ path: file, timeout: 180000 });
  console.log(`  -> ${file}`);
}

const assistantCount = (page) => page.locator('[data-testid=assistant-message]').count();
/** Sends a message and waits until its turn is done. */
async function turn(page, text) {
  const n = await assistantCount(page);
  const input = page.getByTestId('prompt-bar').first();
  await input.fill(text);
  await input.press('Enter');
  await page.waitForFunction((k) => window.__studio.chat.getState().items.filter((i) => i.role === 'assistant').length > k && window.__studio.chat.getState().items.at(-1).phase === 'done' && !window.__studio.chat.getState().running, n, { timeout: 60000 });
  // The credits are fetched again after a turn on the site's key.
  await page.waitForTimeout(400);
}
const lastError = (page) => page.evaluate(() => window.__studio.chat.getState().items.at(-1)?.error ?? null);
const quota = (page) => page.evaluate(() => window.__studio.chat.getState().server?.quota ?? null);
/**
 * The remaining-uses hint (task 023: on the free allowance's row of the key
 * menu, not in the input). Opens the recent strip and its key menu, reads
 * the hint, closes both.
 */
async function quotaHint(page) {
  await page.evaluate(() => window.__studio.store.getState().setRecent(true));
  await page.getByTestId('recent-strip').getByTestId('key-picker').click();
  await page.waitForSelector('[data-testid=key-menu] [data-testid=key-free]');
  const text = await page.locator('[data-testid=key-menu] [data-testid=quota-left]').textContent({ timeout: 3000 }).catch(() => null);
  const inInput = await page.getByTestId('prompt').getByTestId('quota-left').count();
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.__studio.store.getState().setRecent(false));
  await page.waitForTimeout(300);
  return { text: text ?? '', inInput };
}
const code = async (base, email) => (await (await fetch(`${base}/api/auth-test/code?email=${encodeURIComponent(email)}`)).json()).code;

async function closeMenu(page) {
  for (let i = 0; i < 4 && (await page.locator('[data-testid=project-menu-list]').count()); i++) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
  }
  await page.waitForTimeout(400);
}

async function openMenu(page) {
  await page.getByTestId('project-menu').first().click();
  await page.waitForSelector('[data-testid=project-menu-list]');
  await page.waitForTimeout(500);
}

/** Signs in through the sheet: email, a wrong code (shake), then the right one pasted. */
async function signInFlow(page, base, email, { shots, prefix }) {
  await page.waitForSelector('[data-testid=signin-email-input]');
  const focused = await page.waitForFunction(() => document.activeElement?.getAttribute('data-testid') === 'signin-email-input', null, { timeout: 3000 }).then(() => true, () => false);
  check(focused, 'sign-in: the email field is focused on arrival');
  await page.waitForTimeout(800);
  const attrs = await page.getByTestId('signin-email-input').evaluate((el) => [el.type, el.autocomplete].join(','));
  check(attrs === 'email,email', `email field: type=email, autocomplete=email (${attrs})`);
  if (shots) await shot(page, `${prefix}-signin-email`);
  await page.getByTestId('signin-email-input').fill(email);
  await page.getByTestId('signin-email-input').press('Enter');
  await page.waitForSelector('[data-testid=otp-0]');
  await page.waitForTimeout(1000);
  check(await page.evaluate(() => document.activeElement?.getAttribute('data-testid') === 'otp-0'), 'code step: the first box is focused');
  const boxAttrs = await page.getByTestId('otp-0').evaluate((el) => [el.inputMode, el.autocomplete].join(','));
  check(boxAttrs === 'numeric,one-time-code', `code boxes: inputmode=numeric, autocomplete=one-time-code (${boxAttrs})`);
  check(/\d+/.test((await page.getByTestId('signin-countdown').textContent()) ?? ''), 'resend shows a countdown');
  const right = await code(base, email);
  check(/^\d{6}$/.test(right ?? ''), 'the code reached the test hook (not emailed)');
  // Typing advances; backspace goes back.
  await page.keyboard.type('12');
  check(await page.evaluate(() => document.activeElement?.getAttribute('data-testid') === 'otp-2'), 'typing advances to the next box');
  await page.keyboard.press('Backspace');
  check(await page.evaluate(() => document.activeElement?.getAttribute('data-testid') === 'otp-1' && document.querySelector('[data-testid=otp-1]').value === ''), 'backspace goes back and clears');
  await page.keyboard.press('Backspace');
  if (shots) await shot(page, `${prefix}-signin-code`);
  // A wrong code: the row shakes and clears, a calm sentence says so.
  const wrong = right === '000000' ? '111111' : '000000';
  await page.keyboard.type(wrong);
  await page.waitForSelector('[data-testid=signin-error]');
  const shook = await page.evaluate(() => document.querySelector('[data-testid=otp-boxes]').classList.contains('otp-shake'));
  await page.waitForTimeout(600);
  const cleared = await page.evaluate(() => [...document.querySelectorAll('[data-testid^=otp-]')].filter((e) => e.tagName === 'INPUT').every((e) => e.value === ''));
  check(shook && cleared, `a wrong code shakes the row and clears it (${shook}, ${cleared})`);
  if (shots) await shot(page, `${prefix}-signin-wrong`);
  // Pasting the code fills every box and submits by itself.
  await page.getByTestId('otp-0').focus();
  await page.evaluate((c) => {
    const dt = new DataTransfer();
    dt.setData('text/plain', c);
    document.querySelector('[data-testid=otp-0]').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, right);
  await page.waitForFunction(() => !!window.__studio.chat.getState().server?.user, null, { timeout: 20000 });
  await page.waitForSelector('[data-testid=signin-sheet]', { state: 'detached', timeout: 10000 });
  check(true, 'a pasted code fills the boxes and signs in; the sheet flows back');
}

try {
  // --- Desktop: anonymous trial, sign in, 10 a day, own key ----------------
  if (wanted('desktop')) {
    const preview = await startPreview();
    console.log(`desktop: preview on ${preview.base}`);
    const st = await (await fetch(`${preview.base}/api/chat`)).json();
    check(st.auth?.email === true && st.auth?.google === false && st.quota?.remaining === 3, `status: email sign-in on, Google hidden (not configured), 3 trial credits (${JSON.stringify(st.quota)})`);
    const { ctx, page } = await open(preview.base, DESKTOP);
    const visitor = (await ctx.cookies()).find((c) => c.name === 'opensu_v');
    check(!!visitor && visitor.httpOnly, 'anonymous visitor cookie is http-only');
    // The project menu offers sign-in.
    await openMenu(page);
    check((await page.getByTestId('menu-signin').count()) === 1, 'the project menu has a sign-in entry');
    await shot(page, 'desktop-menu-signin');
    await closeMenu(page);

    const h3 = await quotaHint(page);
    check(h3.text.includes('3') && h3.inInput === 0, `the key menu's free row shows 3 left (3 or fewer), the input does not (${JSON.stringify(h3)})`);
    // Task 023 section 6: the hint follows each finished turn.
    await turn(page, '你好 1');
    const h2 = await quotaHint(page);
    check(h2.text.includes('2'), `after one turn the free row shows 2 left (${h2.text})`);
    await page.getByTestId('prompt-bar').fill('');
    await shot(page, 'desktop-remaining-3');
    for (let i = 2; i <= 3; i++) await turn(page, `你好 ${i}`);
    const q0 = await quota(page);
    check(q0?.remaining === 0 && q0?.kind === 'anon', `after 3 anonymous turns no credit is left (${JSON.stringify(q0)})`);
    const calls = stub.received.length;
    await turn(page, '你好 4');
    const e4 = await lastError(page);
    check(e4?.kind === 'quota' && stub.received.length === calls, 'the 4th message is refused with a calm note, without calling the model');
    await page.waitForSelector('[data-testid=quota-note]');
    const note = await page.getByTestId('quota-note').first().textContent();
    check(/登录可享更多免费额度/.test(note ?? '') && !/\d/.test(note ?? '') && (await page.getByTestId('quota-signin').count()) === 1, `anonymous: the note offers sign-in and the own key, no numbers (${note})`);
    await page.waitForTimeout(400);
    await shot(page, 'desktop-out-anon');
    // The server refuses too (a client that ignores the hint).
    const raw = await page.evaluate(async () => (await fetch('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json', 'x-opensu-turn': 'raw-turn-0001' }, body: '{"messages":[]}' })).status);
    check(raw === 429, `the relay refuses a 4th anonymous turn (${raw})`);

    // Sign in from the note, with a draft in the input that must survive.
    await page.getByTestId('prompt-bar').fill('草稿：南边加一个阳台');
    await page.getByTestId('quota-signin').click();
    await signInFlow(page, preview.base, 'reader@example.com', { shots: true, prefix: 'desktop' });
    check((await page.getByTestId('prompt-bar').inputValue()) === '草稿：南边加一个阳台', 'the message draft is kept through sign-in');
    const q1 = await quota(page);
    check(q1?.kind === 'user' && q1.remaining === 10, `signed in: 10 credits (${JSON.stringify(q1)})`);
    await openMenu(page);
    check(((await page.getByTestId('menu-account').textContent()) ?? '').includes('reader@example.com'), 'the project menu shows the account (its email) as its first row');
    await shot(page, 'desktop-menu-account');
    // Task 026: the row opens the account menu (the same surface as the account button).
    await page.getByTestId('menu-account').click();
    await page.waitForSelector('[data-testid=account-menu] [data-testid=account-signout]');
    check(true, 'the project menu row opens the account menu with sign out');
    await page.keyboard.press('Escape');
    await page.waitForSelector('[data-testid=account-menu]', { state: 'detached', timeout: 5000 });
    await page.getByTestId('prompt-bar').fill('');
    for (let i = 1; i <= 10; i++) {
      await turn(page, `你好 ${i}`);
      if (i === 7) {
        const left = (await quotaHint(page)).text;
        check(left.includes('3'), `the hint appears at 3 left (${left})`);
        await shot(page, 'desktop-remaining-hint');
      }
    }
    const q2 = await quota(page);
    check(q2?.remaining === 0 && q2.reason === 'user', `after 10 signed-in turns no credit is left (${JSON.stringify(q2)})`);
    await turn(page, '你好 11');
    await page.waitForSelector('[data-testid=quota-note]');
    const note2 = await page.getByTestId('quota-note').last().textContent();
    check(/今天的免费次数用完了/.test(note2 ?? '') && /恢复/.test(note2 ?? '') && (await page.getByTestId('quota-signin').count()) === 0, `signed in: come back at the reset time or use your own key (${note2})`);
    await page.waitForTimeout(400);
    await shot(page, 'desktop-out-user');
    // Own key: never limited (the relay forwards it; the upstream here is unreachable on purpose).
    const own = await page.evaluate(async () => {
      const r = await fetch('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json', 'x-opensu-key': 'sk-own-test', 'x-opensu-base-url': 'https://127.0.0.1:9/v1', 'x-opensu-turn': 'own-turn-0001' }, body: '{"messages":[]}' });
      return r.status;
    });
    check(own !== 429, `own key: not limited (relay answered ${own}, not 429)`);
    // Sign out: back to the anonymous trial, which is used up today.
    await openMenu(page);
    await page.getByTestId('menu-account').click();
    await page.getByTestId('account-signout').click();
    await page.waitForFunction(() => window.__studio.chat.getState().server?.user === null, null, { timeout: 10000 });
    check((await quota(page))?.kind === 'anon', 'signed out: anonymous again');
    await ctx.close();
    preview.stop();
  }

  // --- One canonical host (task 026) -----------------------------------------
  // --- Projects kept with the account (task 027) ---------------------------
  if (wanted('projects')) {
    const preview = await startPreview({ PROJECTS_MAX: '6' });
    console.log(`projects: preview on ${preview.base}`);
    const P = (page) => page.evaluate(() => { const s = window.__studio.projects.store.getState(); return { on: s.on, openId: s.openId, name: s.name, failed: s.failed, missing: s.missing, ids: s.projects.map((p) => p.id), names: s.projects.map((p) => p.name), thumbs: s.projects.map((p) => p.thumbAt) }; });
    const server = (page) => page.evaluate(async () => (await (await fetch('/api/projects')).json()).projects);
    const houseOf = async (page, id) => JSON.parse((await page.evaluate(async (x) => (await (await fetch(`/api/projects/${x}`)).text()).split('\n')[1], id)));
    const houseName = (page) => page.evaluate(() => window.__studio.store.getState().house?.name);
    const urlP = (page) => new URL(page.url()).searchParams.get('p');
    const title = (page) => page.getByTestId('title-name').first().textContent();
    /** An edit the way the studio makes one (the house in the store changes). */
    const edit = (page, name) => page.evaluate((n) => { const s = window.__studio.store.getState(); s.setHouse({ ...s.house, name: n }); }, name);
    const waitOpen = (page) => page.waitForFunction(() => !!window.__studio.projects?.store.getState().openId && !window.__studio.projects.store.getState().busy, null, { timeout: NAV_MS });
    // `load`, not `networkidle`: a thumbnail being rendered (SwiftShader takes seconds) may still hold the page that is left.
    const studio = async (page, path) => {
      await page.goto(`${preview.base}${path}`, { waitUntil: 'load', timeout: 120000 });
      await page.waitForFunction(() => window.__studio?.ready3d === true, null, { timeout: 180000 });
    };
    const projectsPage = async (page, q = '') => {
      await page.goto(`${preview.base}/projects${q}`, { waitUntil: 'load', timeout: 120000 });
      await page.waitForFunction(() => !!window.__studio?.chat?.getState().server, null, { timeout: 30000 });
      await page.waitForTimeout(700);
    };
    const signInDirect = async (page, email) => {
      await page.evaluate(async (e) => {
        const post = (p, b) => fetch(`/api/auth${p}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });
        await post('/email-otp/send-verification-otp', { email: e, type: 'sign-in' });
        const { code: c } = await (await fetch(`/api/auth-test/code?email=${encodeURIComponent(e)}`)).json();
        await post('/sign-in/email-otp', { email: e, otp: c });
      }, email);
    };
    /** More projects for the account, made the way the browser makes them (framed body). */
    const addProjects = (page, names) =>
      page.evaluate(async (list) => {
        const h = window.__studio?.store?.getState().house ?? { name: 'x', style: 'modern-pitched', site: { width: 12000, depth: 14000 } };
        for (const n of list) {
          const house = JSON.stringify({ ...h, name: n });
          const summary = JSON.stringify({ title: n, style: h.style, w: h.site.width, d: h.site.depth, area: 142.6, storeys: 2, attic: false });
          await fetch('/api/projects', { method: 'POST', headers: { 'content-type': 'application/x-opensu-project' }, body: `${JSON.stringify({ summary })}\n${house}\n{"conversation":"c-${n.length}","items":[]}` });
        }
      }, names);
    const cards = (page) => page.getByTestId('project-card').count();
    /** Polls `fn` in the page (it may be async: waitForFunction would take its promise as true) until it holds. */
    const until = async (page, fn, arg, timeout = 10000) => {
      const end = Date.now() + timeout;
      for (;;) {
        if (await page.evaluate(fn, arg)) return true;
        if (Date.now() > end) throw new Error(`timed out: ${String(fn).slice(0, 120)}`);
        await new Promise((r) => setTimeout(r, 400));
      }
    };
    const card = (page, id) => page.locator(`[data-testid=project-card][data-id="${id}"]`);

    // ---- Functional checks: desktop, zh ----
    const A = await open(preview.base, DESKTOP);
    const a = A.page;
    await openMenu(a);
    check((await a.getByTestId('menu-all-projects').count()) === 1 && ((await a.getByTestId('menu-saved').textContent()) ?? '').includes('浏览器'), 'signed out: the project menu has "所有项目"; edits are kept in this browser (as before)');
    await closeMenu(a);
    await edit(a, '本地画的房子');
    await a.waitForTimeout(900);
    await projectsPage(a);
    check((await cards(a)) === 1 && ((await a.getByTestId('project-name').first().textContent()) ?? '') === '本地画的房子' && (await a.getByTestId('projects-invite').count()) === 1, 'signed out, /projects: this browser\'s project as one card and one line inviting sign-in');
    // The page's account entry is the studio's: signed out the "登录" capsule; sign-in there adopts the edited local house.
    check((await a.getByTestId('account-button').getAttribute('data-state')) === 'signed-out' && (await a.getByTestId('projects-signin').count()) === 0, '/projects signed out: the studio\'s account button ("登录"), no second sign-in control');
    await a.getByTestId('account-button').click();
    await a.waitForSelector('[data-testid=signin-email-input]');
    await a.getByTestId('signin-email-input').fill('projects@example.com');
    await a.getByTestId('signin-email-input').press('Enter');
    await a.waitForSelector('[data-testid=otp-0]');
    await a.waitForTimeout(300);
    await a.getByTestId('otp-0').focus();
    await a.keyboard.type(await code(preview.base, 'projects@example.com'));
    await a.waitForFunction(() => !!window.__studio.chat.getState().server?.user, null, { timeout: 20000 });
    await a.waitForFunction(() => window.__studio.projects.store.getState().projects.length === 1, null, { timeout: 20000 });
    await a.waitForTimeout(600);
    check((await cards(a)) === 1 && ((await a.getByTestId('project-card').getByTestId('project-name').first().textContent()) ?? '') === '本地画的房子' && (await a.getByTestId('account-button').getAttribute('data-state')) === 'signed-in', '/projects: signing in there makes the edited local house the account\'s project; the button is the avatar');
    await a.getByTestId('account-button').click();
    await a.waitForSelector('[data-testid=account-menu]');
    check((await a.getByTestId('account-projects').count()) === 0 && (await a.getByTestId('account-signout').count()) === 1, 'the account menu on /projects: the same menu, without a row to the page it is on');
    await a.keyboard.press('Escape');
    // Card sizes: the page uses the window (cards of 240 px or more, the grid to the content's right edge).
    for (const w of [1280, 1440, 2000]) {
      await a.setViewportSize({ width: w, height: 900 });
      await a.waitForTimeout(400);
      const m = await a.evaluate(() => {
        const grid = document.querySelector('[data-testid=projects-grid]').getBoundingClientRect();
        const cs = getComputedStyle(document.querySelector('[data-testid=projects-grid]'));
        const card = document.querySelector('[data-testid=project-card]').getBoundingClientRect();
        const head = document.querySelector('header').getBoundingClientRect();
        return { cols: cs.gridTemplateColumns.split(' ').length, card: card.width, gridW: grid.width, gridR: grid.right, head: head.right };
      });
      check(m.card >= 240 && m.card <= 320 && m.gridW >= 1100 && Math.abs(m.head - m.gridR) <= 41, `/projects at ${w}: ${m.cols} columns of ${m.card.toFixed(0)} px over ${m.gridW.toFixed(0)} px`);
      if (!smoke) {
        await addProjects(a, []);
      }
    }
    await a.setViewportSize({ width: 1440, height: 900 });
    // The studio: the project open, its address.
    await studio(a, '/studio');
    await waitOpen(a);
    let srv = await server(a);
    const p1 = srv[0]?.id;
    check(srv.length === 1 && (await houseName(a)) === '本地画的房子' && urlP(a) === p1, `first sign-in: the local house became the project, stays open, and is in the address (?p=${urlP(a)})`);
    // Autosave: an edit reaches the account a few seconds later.
    await edit(a, '本地画的房子 改');
    await a.waitForTimeout(1200);
    check((await server(a))[0].revision === 1, 'not saved while editing (debounce)');
    await until(a, async () => (await (await fetch('/api/projects')).json()).projects[0].revision > 1);
    check(true, 'saved to the account a few seconds after the change');
    // A thumbnail follows a quiet moment after the last change (THUMB_QUIET, 15 s).
    await until(a, async () => (await (await fetch('/api/projects')).json()).projects[0].thumbAt > 0, null, 45000);
    const thumb = await a.evaluate(async (id) => { const p = (await (await fetch('/api/projects')).json()).projects.find((x) => x.id === id); const r = await fetch(`/api/projects/${id}/thumb?v=${p.thumbAt}`); const body = await r.arrayBuffer(); return { type: r.headers.get('content-type'), cache: r.headers.get('cache-control'), kb: body.byteLength / 1024, text: r.ok ? '' : new TextDecoder().decode(body) }; }, p1);
    check(/image\/(webp|jpeg)/.test(thumb.type) && thumb.kb < 60 && /private/.test(thumb.cache), `a thumbnail was drawn by the studio's viewer and stored (${thumb.type}, ${thumb.kb.toFixed(1)} KB, ${thumb.cache}${thumb.text}; ${JSON.stringify(await a.evaluate(() => globalThis.__thumb ?? null))})`);
    await openMenu(a);
    check(((await a.getByTestId('menu-saved').textContent()) ?? '') === '修改自动保存到账户', 'the menu line: saved with the account');
    check((await a.getByText('换一个模板').count()) === 0 && (await a.getByTestId('reset-house').count()) === 0 && (await a.getByTestId('menu-new-project').count()) === 1 && (await a.getByTestId('menu-rename').count()) === 1 && (await a.getByTestId('menu-duplicate').count()) === 1, 'signed in: new, rename, duplicate in the project menu; the rows that replaced the open house are gone');
    await closeMenu(a);
    await turn(a, '你好 项目一');
    const chat1 = await a.evaluate(() => window.__studio.chat.getState().items.length);
    // New project from the menu: a new address; back returns to the first, with its conversation.
    await openMenu(a);
    await a.getByTestId('menu-new-project').click();
    await a.waitForFunction((id) => { const s = window.__studio.projects.store.getState(); return s.openId && s.openId !== id && !s.busy; }, p1);
    await a.waitForTimeout(600);
    await a.keyboard.press('Escape');
    const p2 = (await P(a)).openId;
    check(urlP(a) === p2 && (await a.evaluate(() => window.__studio.chat.getState().items.length)) === 0 && (await houseName(a)) === '白墙坡顶小院', 'new project: opens with its own address and an empty conversation');
    await edit(a, '第二个 改');
    await a.goBack();
    await a.waitForFunction((id) => window.__studio.projects.store.getState().openId === id && !window.__studio.projects.store.getState().busy, p1, { timeout: 15000 });
    check((await houseName(a)) === '本地画的房子 改' && (await a.evaluate(() => window.__studio.chat.getState().items.length)) === chat1 && (await houseOf(a, p2)).name === '第二个 改', 'back: the first project with its conversation; the second\'s pending save went first');
    // Rename in place on the title.
    await openMenu(a);
    await a.getByTestId('menu-rename').click();
    await a.waitForSelector('[data-testid=title-rename-input]');
    await a.getByTestId('title-rename-input').fill('老家');
    await a.getByTestId('title-rename-input').press('Enter');
    await a.waitForFunction(() => window.__studio.projects.store.getState().name === '老家');
    check(((await title(a)) ?? '') === '老家' && (await server(a)).find((p) => p.id === p1)?.name === '老家', 'rename: inline on the title, Enter saves');
    await openMenu(a);
    await a.getByTestId('menu-rename').click();
    await a.getByTestId('title-rename-input').fill('不要了');
    await a.getByTestId('title-rename-input').press('Escape');
    await a.waitForTimeout(300);
    check(((await title(a)) ?? '') === '老家', 'rename: Escape cancels');
    // Duplicate from the menu: the copy opens.
    await openMenu(a);
    await a.getByTestId('menu-duplicate').click();
    await a.waitForFunction((id) => { const s = window.__studio.projects.store.getState(); return s.openId !== id && !s.busy && s.projects.length === 3; }, p1);
    check((await P(a)).name === '老家 副本' && urlP(a) === (await P(a)).openId, 'duplicate: "老家 副本" opens at its own address');
    // An address this account cannot open.
    await studio(a, '/studio?p=AAAAAAAAAAAAAAAAAAAAAA');
    await a.waitForSelector('[data-testid=project-missing]', { timeout: 20000 });
    check((await a.getByTestId('project-missing-home').getAttribute('href')) === '/projects', 'an address the account does not have: "not found" with the way home');
    // The projects page.
    await a.getByTestId('project-missing-home').click();
    await a.waitForURL('**/projects');
    await a.waitForFunction(() => window.__studio?.projects?.store.getState().projects.length === 3, null, { timeout: 15000 });
    await a.waitForTimeout(800);
    check((await cards(a)) === 3 && (await a.getByTestId('project-new-card').count()) === 1, '/projects: "新建项目" first, then three cards');
    check((await a.locator('[data-testid=project-card] [data-testid=project-thumb]').count()) >= 1, 'cards show the stored thumbnails');
    const firstCard = (await a.getByTestId('project-card').first().getAttribute('data-id'));
    check(firstCard === (await server(a))[0].id, 'most recently changed first');
    // Card menu: rename, duplicate; right click opens the same menu.
    await card(a, p1).click({ button: 'right', position: { x: 40, y: 40 } });
    await a.waitForSelector('[data-testid=project-menu-card]');
    check(true, 'right click on a card opens its menu');
    await a.getByTestId('card-rename').click();
    await a.getByTestId('project-name-input').fill('河边老家');
    await a.getByTestId('project-name-input').press('Enter');
    await a.waitForFunction((id) => window.__studio.projects.store.getState().projects.find((p) => p.id === id)?.name === '河边老家', p1);
    check(true, 'card rename: inline, Enter saves');
    await card(a, p1).getByTestId('project-more').click();
    await a.getByTestId('card-duplicate').click();
    await a.waitForFunction(() => window.__studio.projects.store.getState().projects.length === 4);
    check((await cards(a)) === 4, 'card duplicate');
    // Delete: asks once in place, then a toast with Undo; sent when the toast ends.
    const victim = (await P(a)).ids.find((id) => id !== p1);
    await card(a, victim).getByTestId('project-more').click();
    await a.getByTestId('card-delete').click();
    check((await card(a, victim).getByTestId('project-delete-ask').count()) === 1, 'delete asks once, in place on the card');
    await card(a, victim).getByTestId('project-delete-confirm').click();
    await a.waitForSelector('[data-testid=project-deleted-toast]');
    check((await card(a, victim).count()) === 0 && (await server(a)).length === 4, 'the card goes; nothing sent yet (the toast offers Undo)');
    await a.getByTestId('project-undo').click();
    check((await card(a, victim).count()) === 1, 'Undo brings it back');
    await card(a, victim).getByTestId('project-more').click();
    await a.getByTestId('card-delete').click();
    await card(a, victim).getByTestId('project-delete-confirm').click();
    await a.waitForSelector('[data-testid=project-deleted-toast]', { state: 'detached', timeout: 15000 });
    await until(a, async (id) => !(await (await fetch('/api/projects')).json()).projects.some((p) => p.id === id), victim);
    check((await server(a)).length === 3, 'the delete is sent when the toast ends');
    // New project from the page: the templates as cards, one opens in the studio.
    await a.getByTestId('project-new').click();
    await a.waitForSelector('[data-testid=project-templates]');
    await a.getByTestId('project-template-t2').click();
    await a.waitForURL('**/studio?**');
    await a.waitForFunction(() => window.__studio?.ready3d === true, null, { timeout: 180000 });
    await a.waitForFunction(() => new URL(location.href).searchParams.has('p') && !new URL(location.href).searchParams.has('new'), null, { timeout: NAV_MS });
    await waitOpen(a);
    check((await houseName(a)) === '平顶现代' && (await server(a)).length === 4, 'a template card makes a new project and opens it at its address');
    const p4 = urlP(a);
    // Reload: the same project.
    await a.reload({ waitUntil: 'networkidle' });
    await a.waitForFunction(() => window.__studio?.ready3d === true, null, { timeout: 180000 });
    await waitOpen(a);
    check((await P(a)).openId === p4 && (await server(a)).length === 4, 'reload: the same project at the same address; nothing added');

    // A second browser: the same projects; a conflict keeps both.
    const B = await open(preview.base, { ...DESKTOP, viewport: { width: 1280, height: 800 } });
    const b = B.page;
    await signInDirect(b, 'projects@example.com');
    await projectsPage(b);
    await b.waitForFunction(() => window.__studio.projects.store.getState().projects.length === 4, null, { timeout: 15000 });
    check((await cards(b)) === 4, 'second browser: the same four projects on /projects');
    await studio(b, `/studio?p=${p4}`);
    await waitOpen(b);
    check((await P(b)).openId === p4 && (await houseName(b)) === '平顶现代', 'second browser: the address opens the same project');
    await edit(a, '设备 A 的修改');
    await a.evaluate(() => window.__studio.projects.flush());
    await edit(b, '设备 B 的修改');
    await b.evaluate(() => window.__studio.projects.flush());
    // The toast's message (read from its store: under SwiftShader the thumbnail of the copy can hold the page past the toast's few seconds).
    await b.waitForFunction(() => window.__studio.toast.getState().testId === 'project-toast', null, { timeout: 15000 });
    const toastText = await b.evaluate(() => window.__studio.toast.getState().text);
    check((await P(b)).openId !== p4 && (await server(b)).length === 5 && (await houseOf(b, p4)).name === '设备 A 的修改' && (await houseName(b)) === '设备 B 的修改', 'conflict with local edits: A\'s version kept, B\'s saved as a copy that stays open');
    check(toastText === '另一台设备改过这个项目，你的修改已存为副本', `one toast says so (${toastText})`);
    await studio(b, `/studio?p=${p4}`);
    await waitOpen(b);
    await edit(a, '设备 A 再改');
    await a.evaluate(() => window.__studio.projects.flush());
    await b.evaluate(() => window.__studio.projects.check());
    check((await houseName(b)) === '设备 A 再改', 'no local edits: the newer version from the other device is loaded when the page shows again');
    await B.ctx.close();

    // Not synced: one quiet line, retried, nothing lost.
    await a.route('**/api/projects/*', (r) => (r.request().method() === 'PUT' ? r.abort() : r.continue()));
    await a.evaluate(() => window.__studio.projects.check());
    await edit(a, '离线时的修改');
    await a.waitForFunction(() => window.__studio.projects.store.getState().failed === 'retry', null, { timeout: 15000 });
    await openMenu(a);
    check(((await a.getByTestId('menu-saved').textContent()) ?? '') === '未同步，稍后自动重试', 'a failed save: "未同步，稍后自动重试" in the project menu');
    await closeMenu(a);
    await a.unroute('**/api/projects/*');
    await a.evaluate(() => window.dispatchEvent(new Event('online')));
    await a.waitForFunction(() => window.__studio.projects.store.getState().failed === null, null, { timeout: 15000 });
    check((await houseOf(a, p4)).name === '离线时的修改', 'back online: retried and saved, the line is gone');
    // The limit (6 here): "新建项目" says why, without a number.
    await addProjects(a, ['甲']);
    await projectsPage(a);
    await a.waitForFunction(() => window.__studio.projects.store.getState().projects.length === 6, null, { timeout: 15000 });
    const fullLine = ((await a.getByTestId('project-new-card').getByTestId('project-when').textContent()) ?? '');
    check((await a.getByTestId('project-new').isDisabled()) && fullLine.length > 0 && !/\d/.test(fullLine), `at the limit: "新建项目" is off and says why, no number (${fullLine})`);
    // Task 029: the studio's way to the page is the project menu's "所有项目" (the account menu, opened from the same menu, has no second one).
    await studio(a, `/studio?p=${p4}`);
    await waitOpen(a);
    await openMenu(a);
    await a.getByTestId('menu-account').click();
    await a.waitForSelector('[data-testid=account-menu] [data-testid=account-signout]');
    check((await a.getByTestId('account-projects').count()) === 0, 'the account menu in the studio has no row to the projects page (the project menu has it)');
    await a.keyboard.press('Escape');
    await a.waitForSelector('[data-testid=account-menu]', { state: 'detached', timeout: 5000 });
    await openMenu(a);
    await a.getByTestId('menu-all-projects').click();
    await a.waitForURL('**/projects');
    check(true, 'the project menu\'s "所有项目" goes to /projects');
    // Sign-out: the open house stays as this browser's.
    await studio(a, `/studio?p=${p4}`);
    await waitOpen(a);
    const kept = await houseName(a);
    await openMenu(a);
    await a.getByTestId('menu-account').click();
    await a.getByTestId('account-signout').click();
    await a.waitForFunction(() => !window.__studio.chat.getState().server?.user);
    await a.waitForTimeout(500);
    check((await houseName(a)) === kept && !(await P(a)).on, `sign-out: the open house stays on screen as the local project (${kept})`);
    await studio(a, '/studio');
    check((await houseName(a)) === kept, 'and after a reload, signed out');
    await A.ctx.close();

    // ---- Screenshots: 1440 x 900 and 390 x 844, zh and en ----
    const sets = smoke ? [] : [['desktop-1440', DESKTOP, false], ['phone-390', PHONE, true]].flatMap(([n, o, ph]) => ['zh', 'en'].map((l) => [`${n}-${l}`, o, ph, l]));
    let k = 0;
    for (const [tag, opts, phone, lang] of sets) {
      const { ctx, page } = await open(preview.base, opts, `/studio?lang=${lang}`);
      const snap = async (name) => {
        if (!phone) await page.mouse.move(2, opts.viewport.height - 2);
        await page.waitForTimeout(400);
        await shot(page, `${tag}-${name}`, outDir27);
      };
      await projectsPage(page, `?lang=${lang}`);
      await snap('page-signed-out');
      await signInDirect(page, `shots${++k}@example.com`);
      await studio(page, `/studio?lang=${lang}`);
      await waitOpen(page);
      await page.waitForFunction(() => window.__studio.projects.store.getState().projects[0]?.thumbAt > 0, null, { timeout: 45000 });
      await projectsPage(page, `?lang=${lang}`);
      await snap('page-first');
      await addProjects(page, lang === 'zh' ? ['王家老宅翻建', '河边的小院'] : ['Riverside cottage', 'Grandparents’ house']);
      await projectsPage(page, `?lang=${lang}`);
      await snap('page-few');
      if (!phone) {
        // The same page at 1280 and 2000 wide (the grid fills the content width).
        for (const [w, h] of [[1280, 800], [2000, 1100]]) {
          await page.setViewportSize({ width: w, height: h });
          await page.mouse.move(2, h - 2);
          await page.waitForTimeout(500);
          await shot(page, `${tag}-page-few-w${w}`, outDir27);
        }
        await page.setViewportSize(opts.viewport);
      }
      const cols = await page.getByTestId('project-card').evaluateAll((els) => new Set(els.map((e) => Math.round(e.getBoundingClientRect().left))).size);
      if (phone) check(cols === 2, `${tag}: two columns on the phone (${cols})`);
      await page.getByTestId('project-new').click();
      await page.waitForSelector('[data-testid=project-templates]');
      await page.waitForFunction(() => document.querySelectorAll('[data-testid=project-templates] [data-testid=project-thumb]').length === 3, null, { timeout: 30000 }).catch(() => {});
      await snap('page-new-project');
      await page.getByTestId('project-new').click();
      const second = page.getByTestId('project-card').nth(1);
      await second.getByTestId('project-more').click();
      await page.waitForSelector('[data-testid=project-menu-card]');
      await page.waitForTimeout(500);
      await snap('page-card-menu');
      await page.getByTestId('card-rename').click();
      await snap('page-rename');
      await page.keyboard.press('Escape');
      await second.getByTestId('project-more').click();
      await page.getByTestId('card-delete').click();
      await snap('page-delete-confirm');
      await second.getByTestId('project-delete-confirm').click();
      await page.waitForSelector('[data-testid=project-deleted-toast]');
      await snap('page-delete-toast');
      await page.getByTestId('project-undo').click();
      await addProjects(page, lang === 'zh' ? ['东边那块地', '方案二', '方案三'] : ['East plot', 'Option two', 'Option three']);
      await projectsPage(page, `?lang=${lang}`);
      await snap('page-limit');
      const w = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
      check(w[0] <= w[1], `${tag}: /projects has no horizontal scroll (${w[0]} <= ${w[1]})`);
      await studio(page, `/studio?lang=${lang}`);
      await waitOpen(page);
      await openMenu(page);
      await snap('studio-menu');
      await page.getByTestId('menu-rename').click();
      await snap('studio-rename');
      await page.keyboard.press('Escape');
      await page.route('**/api/projects/*', (r) => (r.request().method() === 'PUT' ? r.abort() : r.continue()));
      await edit(page, lang === 'zh' ? '离线修改' : 'Edited offline');
      await page.waitForFunction(() => window.__studio.projects.store.getState().failed === 'retry', null, { timeout: 15000 });
      await openMenu(page);
      await snap('studio-not-synced');
      await page.unroute('**/api/projects/*');
      await studio(page, `/studio?lang=${lang}&p=AAAAAAAAAAAAAAAAAAAAAA`);
      await page.waitForSelector('[data-testid=project-missing]', { timeout: 20000 });
      await snap('studio-not-found');
      await ctx.close();
    }
    preview.stop();
  }

  if (wanted('share')) {
    const preview = await startPreview();
    console.log(`share: preview on ${preview.base}`);
    const base = preview.base;
    const edit = (page, name) => page.evaluate((n) => { const s = window.__studio.store.getState(); s.setHouse({ ...s.house, name: n }); }, name);
    const openId = (page) => page.evaluate(() => window.__studio.projects.store.getState().openId);
    const waitOpen = (page) => page.waitForFunction(() => !!window.__studio.projects?.store.getState().openId && !window.__studio.projects.store.getState().busy, null, { timeout: NAV_MS });
    const studio = async (page, path) => {
      await page.goto(`${base}${path}`, { waitUntil: 'load', timeout: 120000 });
      await page.waitForFunction(() => window.__studio?.ready3d === true, null, { timeout: 180000 });
    };
    const settle = (page, ms = 900) => page.waitForTimeout(ms);
    const surfaceOpen = (page) => page.waitForSelector('[data-testid=share-surface] [data-testid=share-close]', { timeout: 20000 }).then(() => settle(page, 1500));
    const closeSurface = async (page) => {
      await page.keyboard.press('Escape');
      await page.waitForSelector('[data-testid=share-surface]', { state: 'detached', timeout: 10000 });
    };
    const signInDirect = async (page, email) => {
      await page.evaluate(async (e) => {
        const post = (p, b) => fetch(`/api/auth${p}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });
        await post('/email-otp/send-verification-otp', { email: e, type: 'sign-in' });
        const { code: c } = await (await fetch(`/api/auth-test/code?email=${encodeURIComponent(e)}`)).json();
        await post('/sign-in/email-otp', { email: e, otp: c });
      }, email);
    };
    const savedHouse = (page) => page.evaluate(() => localStorage.getItem('opensu.autosave.v1'));
    const OWNER = { ...DESKTOP, permissions: ['clipboard-read', 'clipboard-write'] };

    // ---- Owner, desktop zh: signed out, the button explains and offers sign-in ----
    const A = await open(base, OWNER);
    const a = A.page;
    // Task 029: "分享" beside the house name (its placement is checked in the `entry` section).
    check((await a.getByTestId('share-button').count()) === 1 && (await a.locator('[data-title-row] [data-testid=share-button]').count()) === 1, 'signed out: "分享" stands beside the house name (projects are kept with accounts here)');
    await edit(a, '东边的小院');
    await settle(a);
    await a.getByTestId('share-button').click();
    await surfaceOpen(a);
    check((await a.getByTestId('share-need-account').count()) === 1 && (await a.getByTestId('share-switch').count()) === 0, 'signed out: one line that sharing needs the account, and "登录"; no switch');
    await shot(a, 'd-zh-signed-out', outDir28);
    await a.getByTestId('share-signin').click();
    await a.waitForSelector('[data-testid=signin-email-input]');
    await a.getByTestId('signin-email-input').fill('owner@example.com');
    await a.getByTestId('signin-email-input').press('Enter');
    await a.waitForSelector('[data-testid=otp-0]');
    await a.waitForTimeout(300);
    await a.getByTestId('otp-0').focus();
    await a.keyboard.type(await code(base, 'owner@example.com'));
    await a.waitForFunction(() => !!window.__studio.chat.getState().server?.user, null, { timeout: 20000 });
    await waitOpen(a);
    await a.waitForSelector('[data-testid=share-surface-body]', { timeout: 20000 });
    await settle(a);
    const pid = await openId(a);
    check(!!pid && (await a.getByTestId('title-name').textContent()) === '东边的小院', 'after sign-in the local house is the account\'s project and the share surface opens again by itself');
    check((await a.getByTestId('share-switch').getAttribute('aria-checked')) === 'false' && (await a.getByTestId('share-link').count()) === 0, 'off by default: no link');
    await shot(a, 'd-zh-off', outDir28);
    await a.getByTestId('share-switch').click();
    await a.waitForSelector('[data-testid=share-link]', { timeout: 15000 });
    await settle(a);
    const link = await a.getByTestId('share-link').inputValue();
    const token = new URL(link).searchParams.get('s');
    check(link === `${base}/studio?s=${token}` && /^[A-Za-z0-9_-]{22}$/.test(token ?? '') && token !== pid, `on: the link /studio?s=<token> (not the project id): ${link}`);
    await shot(a, 'd-zh-on', outDir28);
    await a.getByTestId('share-copy').click();
    await a.waitForSelector('[data-testid=share-copied]', { timeout: 5000 });
    check((await a.evaluate(() => navigator.clipboard.readText())) === link, '"复制链接" puts the link on the clipboard; the toast says "已复制链接"');
    await shot(a, 'd-zh-copied', outDir28);
    await closeSurface(a);
    await a.getByTestId('share-button').click();
    await surfaceOpen(a);
    check((await a.getByTestId('share-link').inputValue()) === link, 'the address is stable while sharing is on');
    await closeSurface(a);

    // ---- The link preview (one indexed read on the Worker) ----
    const html = await (await fetch(link)).text();
    check(html.includes('<title>东边的小院 · openSU</title>') && html.includes('property="og:title" content="东边的小院 · openSU"') && html.includes('property="og:image"') && /og:description" content="[^"]*m²/.test(html), 'the shared page carries the title, description and og:image');
    const plain = await (await fetch(`${base}/studio`)).text();
    check(!plain.includes('og:title') && plain.includes('<title>工作室 · openSU</title>'), 'the plain studio page is unchanged');

    // ---- A signed-out viewer with their own edited house in another browser ----
    const V = await open(base, DESKTOP);
    const v = V.page;
    await edit(v, '我自己的房子');
    await settle(v, 1200);
    const mine = await savedHouse(v);
    const myLink = await v.evaluate(() => localStorage.getItem('opensu.project.v1'));
    check(!!mine && JSON.parse(mine).house.name === '我自己的房子', 'the viewer has a house of their own in this browser');
    await studio(v, `/studio?s=${token}`);
    await v.waitForFunction(() => window.__studio.shared?.getState().status === 'ready', null, { timeout: 30000 });
    await settle(v, 1200);
    check((await v.getByTestId('title-name').textContent()) === '东边的小院' && (await v.getByTestId('view-only-name').textContent()) === '东边的小院', 'the viewer sees the owner\'s project, its name in the title and the view-only bar');
    check((await v.getByTestId('prompt-bar').count()) === 0 && (await v.getByTestId('chat-history').count()) === 0 && (await v.getByTestId('share-button').count()) === 0, 'view only: no prompt, no conversation, no share button');
    check((await v.evaluate(() => window.__studio.chat.getState().items.length)) === 0, 'no conversation was sent to the viewer');
    await shot(v, 'd-zh-viewer', outDir28);
    await v.getByTestId('project-menu').click();
    await v.waitForSelector('[data-testid=project-menu-list]');
    await settle(v, 500);
    const rows = await v.evaluate(() => [...document.querySelectorAll('[data-testid=project-menu-list] [role=menuitem]')].map((e) => e.getAttribute('data-testid') ?? e.textContent.trim()));
    check(!rows.some((r) => ['menu-location', 'menu-orientation', 'reset-house', 'menu-export', 'menu-rename', 'menu-new-project', 'menu-duplicate'].includes(r)) && (await v.getByTestId('menu-saved').count()) === 0, `the project menu has nothing that edits (${rows.join(', ')})`);
    await shot(v, 'd-zh-viewer-menu', outDir28);
    await v.keyboard.press('Escape');
    await settle(v, 500);
    // Every viewing tool works.
    await v.getByTestId('bar-views').click();
    await v.waitForSelector('#tray-views, [data-testid=panel-views], [id^=tray]', { timeout: 10000 }).catch(() => {});
    await settle(v, 700);
    await v.getByTestId('bar-views').click();
    await settle(v, 400);
    await v.getByTestId('bar-sun').click();
    await v.waitForSelector('[data-testid=sun-clock]', { timeout: 10000 });
    await settle(v, 900);
    const placeTag = await v.getByTestId('sun-place').evaluate((e) => e.tagName);
    check(placeTag !== 'BUTTON', `the sun study works; its place row is a fact, not a button (${placeTag})`);
    await shot(v, 'd-zh-viewer-sun', outDir28);
    await v.getByTestId('bar-sun').click();
    await settle(v, 500);
    await v.getByTestId('bar-levels').click();
    await settle(v, 700);
    await v.getByTestId('bar-levels').click();
    await v.getByTestId('bar-walk').click();
    await v.waitForFunction(() => window.__studio.store.getState().walk === true, null, { timeout: 10000 });
    await settle(v, 1500);
    await shot(v, 'd-zh-viewer-walk', outDir28);
    await v.keyboard.press('Escape');
    await v.waitForFunction(() => window.__studio.store.getState().walk === false, null, { timeout: 10000 });
    await v.getByTestId('mode-switch').getByRole('radio', { name: '平面' }).click();
    await v.waitForFunction(() => window.__studio.planReady === true, null, { timeout: 30000 });
    await settle(v, 900);
    check((await v.getByTestId('view-only-bar').count()) === 1, 'plan: the view-only bar stays');
    await shot(v, 'd-zh-viewer-plan', outDir28);
    await v.getByTestId('mode-switch').getByRole('radio', { name: '图册' }).click();
    await v.waitForSelector('[data-testid=sheets]', { timeout: 60000 });
    await settle(v, 2500);
    await shot(v, 'd-zh-viewer-sheets', outDir28);
    await v.getByTestId('mode-switch').getByRole('radio', { name: '3D' }).click();
    await settle(v, 900);
    check((await savedHouse(v)) === mine && (await v.evaluate(() => localStorage.getItem('opensu.project.v1'))) === myLink, 'the viewer\'s own browser copy is untouched by viewing');
    check(!(await v.evaluate(() => location.search)).includes('p='), 'no project address was written');

    // ---- The owner's next version reaches the viewer ----
    await edit(a, '东边的小院 改');
    await a.waitForFunction(() => window.__studio.projects.store.getState().projects[0]?.revision >= 2 && !window.__studio.projects.debug().dirty, null, { timeout: 20000 });
    await v.evaluate(() => window.__studio.reloadShared());
    await v.waitForFunction(() => window.__studio.store.getState().house?.name === '东边的小院 改', null, { timeout: 15000 });
    check(true, 'the viewer sees the owner\'s current version (a link is to the file, not a snapshot)');

    // ---- Make my own copy, signed out: asked once, then it is this browser's house ----
    await v.getByTestId('view-only-copy').click();
    await v.waitForSelector('[data-testid=view-only-ask]', { timeout: 10000 });
    await settle(v, 400);
    await shot(v, 'd-zh-viewer-ask', outDir28);
    await v.getByTestId('view-only-cancel').click();
    await settle(v, 400);
    check((await savedHouse(v)) === mine && (await v.getByTestId('view-only-copy').count()) === 1, 'cancel: nothing replaced');
    await v.getByTestId('view-only-copy').click();
    await v.waitForSelector('[data-testid=view-only-ask]');
    await Promise.all([v.waitForURL((u) => u.pathname === '/studio' && !u.searchParams.has('s'), { waitUntil: 'commit', timeout: NAV_MS }), v.getByTestId('view-only-replace').click()]);
    await v.waitForFunction(() => window.__studio?.ready3d === true, null, { timeout: 180000 });
    await settle(v, 1200);
    check((await v.getByTestId('title-name').textContent()) === '东边的小院 改' && (await v.getByTestId('prompt-bar').count()) === 1, 'the copy opens as this browser\'s project, editable');
    await V.ctx.close();

    // ---- A signed-in viewer: the copy is a project of their account ----
    const W = await open(base, DESKTOP);
    const w = W.page;
    await signInDirect(w, 'viewer@example.com');
    await studio(w, `/studio?s=${token}`);
    await w.waitForFunction(() => window.__studio.shared?.getState().status === 'ready' && !!window.__studio.chat.getState().server?.user, null, { timeout: 30000 });
    check((await w.evaluate(() => window.__studio.projects.store.getState().on)) === false, 'signed in, viewing: the viewer\'s project sync does not start (nothing adopted)');
    await Promise.all([w.waitForURL((u) => u.searchParams.has('p'), { waitUntil: 'commit', timeout: NAV_MS }), w.getByTestId('view-only-copy').click()]);
    await w.waitForFunction(() => window.__studio?.ready3d === true, null, { timeout: 180000 });
    await waitOpen(w);
    const theirs = await w.evaluate(async () => (await (await fetch('/api/projects')).json()).projects.map((p) => p.name));
    check(theirs.includes('东边的小院 改 副本') && (await w.getByTestId('title-name').textContent()) === '东边的小院 改 副本', `signed in: "创建我的副本" makes a project of the viewer's account and opens it (${theirs.join(', ')})`);
    await W.ctx.close();

    // ---- The projects page: the mark and the card menu ----
    await a.goto(`${base}/projects`, { waitUntil: 'load' });
    await a.waitForFunction(() => (window.__studio?.projects?.store.getState().projects.length ?? 0) >= 1, null, { timeout: 30000 });
    await settle(a, 1200);
    const cardEl = a.locator(`[data-testid=project-card][data-id="${pid}"]`);
    check((await cardEl.getByTestId('project-shared').count()) === 1, '/projects: the shared card shows the mark');
    await shot(a, 'd-zh-projects', outDir28);
    await cardEl.getByTestId('project-more').click();
    await a.waitForSelector('[data-testid=card-share]');
    await settle(a, 500);
    await shot(a, 'd-zh-projects-menu', outDir28);
    await a.getByTestId('card-share').click();
    await surfaceOpen(a);
    check((await a.getByTestId('share-link').inputValue()) === link, 'the card menu\'s "分享" opens the same surface for that project');
    await shot(a, 'd-zh-projects-share', outDir28);
    // ---- Off from the browser page: the link dies at once; on again: a new one ----
    await a.getByTestId('share-switch').click();
    await a.waitForFunction(() => !document.querySelector('[data-testid=share-link]') && document.querySelector('[data-testid=share-switch]')?.getAttribute('aria-checked') === 'false', null, { timeout: 15000 });
    await closeSurface(a);
    await settle(a, 400);
    check((await cardEl.getByTestId('project-shared').count()) === 0, 'off: the mark goes');
    const G = await open(base, DESKTOP, `/studio?s=${token}`).catch(async () => null);
    let gonePage = G?.page;
    if (!gonePage) {
      const ctx = await newContext(DESKTOP);
      gonePage = await ctx.newPage();
      await gonePage.goto(`${base}/studio?s=${token}`, { waitUntil: 'load' });
    }
    await gonePage.waitForSelector('[data-testid=project-missing][data-share=gone]', { timeout: 30000 });
    check((await gonePage.getByTestId('project-missing').textContent()).includes('这个链接已不再分享'), 'off: the link shows "这个链接已不再分享"');
    await shot(gonePage, 'd-zh-gone', outDir28);
    await gonePage.context().close();
    const goneHtml = await (await fetch(link)).text();
    check(goneHtml.includes('<title>这个链接已不再分享 · openSU</title>'), 'off: the preview says so too');
    await studio(a, `/studio?p=${pid}`);
    await waitOpen(a);
    await a.getByTestId('share-button').click();
    await surfaceOpen(a);
    await a.getByTestId('share-switch').click();
    await a.waitForSelector('[data-testid=share-link]', { timeout: 15000 });
    const link2 = await a.getByTestId('share-link').inputValue();
    check(link2 !== link, 'on again: a new address');
    await closeSurface(a);
    await A.ctx.close();

    // ---- Screenshots: desktop en, phones zh and en ----
    if (!smoke) {
      for (const [tag, opts, lang] of [['d-en', OWNER, 'en'], ['p-zh', { ...PHONE, permissions: ['clipboard-read', 'clipboard-write'] }, 'zh'], ['p-en', { ...PHONE, permissions: ['clipboard-read', 'clipboard-write'] }, 'en']]) {
        const phone = tag.startsWith('p');
        const O = await open(base, opts, `/studio?lang=${lang}`);
        const o = O.page;
        // Task 029: phones open it from the project menu's first row.
        const openShareUi = async () => {
          if (!phone) return o.getByTestId('share-button').click();
          await o.getByTestId('project-menu').click();
          await o.waitForSelector('[data-testid=menu-share]');
          await o.waitForTimeout(500);
          await o.getByTestId('menu-share').click();
        };
        await openShareUi();
        await surfaceOpen(o);
        await shot(o, `${tag}-signed-out`, outDir28);
        await o.getByTestId('share-signin').click();
        await o.waitForSelector('[data-testid=signin-email-input]');
        const email = `owner-${tag}@example.com`;
        await o.getByTestId('signin-email-input').fill(email);
        await o.getByTestId('signin-email-input').press('Enter');
        await o.waitForSelector('[data-testid=otp-0]');
        await o.waitForTimeout(300);
        await o.getByTestId('otp-0').focus();
        await o.keyboard.type(await code(base, email));
        await o.waitForSelector('[data-testid=share-surface-body]', { timeout: 30000 });
        await settle(o, 1000);
        await shot(o, `${tag}-off`, outDir28);
        await o.getByTestId('share-switch').click();
        await o.waitForSelector('[data-testid=share-link]', { timeout: 15000 });
        await settle(o, 900);
        await shot(o, `${tag}-on`, outDir28);
        const tk = new URL(await o.getByTestId('share-link').inputValue()).searchParams.get('s');
        await o.getByTestId('share-copy').click();
        await settle(o, 600);
        if (!phone) await shot(o, `${tag}-copied`, outDir28);
        await closeSurface(o);
        await settle(o, 600);
        if (phone) {
          await shot(o, `${tag}-header`, outDir28);
          check((await o.getByTestId('share-button').count()) === 0 && (await o.getByTestId('account-button').count()) === 0, `${tag}: nothing but the name and the mode switch in the top row (task 029)`);
        }
        const VV = await open(base, opts, `/studio?s=${tk}&lang=${lang}`);
        const vv = VV.page;
        await vv.waitForFunction(() => window.__studio.shared?.getState().status === 'ready', null, { timeout: 30000 });
        await settle(vv, 1200);
        await shot(vv, `${tag}-viewer`, outDir28);
        await vv.getByTestId('bar-sun').click();
        await settle(vv, 1200);
        await shot(vv, `${tag}-viewer-sun`, outDir28);
        await vv.getByTestId('bar-sun').click();
        await settle(vv, 600);
        await vv.evaluate(() => window.__studio.store.getState().setMode('plan'));
        await vv.waitForFunction(() => window.__studio.planReady === true, null, { timeout: 30000 });
        await settle(vv, 900);
        await shot(vv, `${tag}-viewer-plan`, outDir28);
        await vv.evaluate(() => window.__studio.store.getState().setMode('3d'));
        await settle(vv, 600);
        await vv.evaluate(() => { const s = window.__studio.store.getState(); localStorage.setItem('opensu.autosave.v1', JSON.stringify({ v: 1, savedAt: Date.now(), house: { ...s.house, name: 'x' }, chat: [] })); });
        await vv.getByTestId('view-only-copy').click();
        await vv.waitForSelector('[data-testid=view-only-ask]');
        await settle(vv, 400);
        await shot(vv, `${tag}-viewer-ask`, outDir28);
        await vv.getByTestId('view-only-cancel').click();
        const w2 = await vv.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
        check(w2[0] <= w2[1], `${tag}: no horizontal scroll while viewing (${w2[0]} <= ${w2[1]})`);
        await VV.ctx.close();
        // Off: the link's page.
        await openShareUi();
        await surfaceOpen(o);
        await o.getByTestId('share-switch').click();
        await o.waitForFunction(() => !document.querySelector('[data-testid=share-link]'), null, { timeout: 15000 });
        const gctx = await newContext(opts);
        const gp = await gctx.newPage();
        await gp.goto(`${base}/studio?s=${tk}&lang=${lang}`, { waitUntil: 'load' });
        await gp.waitForSelector('[data-testid=project-missing][data-share=gone]', { timeout: 30000 });
        await settle(gp, 500);
        await shot(gp, `${tag}-gone`, outDir28);
        await gctx.close();
        // The projects page with a shared card and its menu.
        await o.getByTestId('share-switch').click();
        await o.waitForSelector('[data-testid=share-link]', { timeout: 15000 });
        await closeSurface(o);
        await o.goto(`${base}/projects?lang=${lang}`, { waitUntil: 'load' });
        await o.waitForFunction(() => (window.__studio?.projects?.store.getState().projects.length ?? 0) >= 1, null, { timeout: 30000 });
        await settle(o, 1200);
        await shot(o, `${tag}-projects`, outDir28);
        await o.getByTestId('project-more').first().click();
        await o.waitForSelector('[data-testid=card-share]');
        await settle(o, 500);
        await o.getByTestId('card-share').click();
        await surfaceOpen(o);
        await shot(o, `${tag}-projects-share`, outDir28);
        await O.ctx.close();
      }
    }
    preview.stop();
  }

  if (wanted('canonical')) {
    /** A request to the preview with another Host header (as the workers.dev address would arrive). */
    const get = (base, path, host) =>
      new Promise((ok, fail) => {
        const u = new URL(base);
        const req = httpRequest({ hostname: '127.0.0.1', port: u.port, path, method: 'GET', headers: host ? { host, accept: 'text/html' } : { accept: 'text/html' } }, (res) => {
          let body = '';
          res.on('data', (d) => (body += d));
          res.on('end', () => ok({ status: res.statusCode, location: res.headers.location ?? null, body }));
        });
        req.on('error', fail);
        req.end();
      });
    const SITE = 'https://opensu.example.com';
    const OTHER = 'opensu-web.someone.workers.dev';
    const on = await startPreview({ SITE_URL: SITE });
    console.log(`canonical: preview on ${on.base}`);
    for (const path of ['/', '/studio', '/studio?mode=plan&lang=en', '/auth-done', '/api/chat', '/s/abc?x=1', '/nope']) {
      const r = await get(on.base, path, OTHER);
      check(r.status === 308 && r.location === `${SITE}${path}`, `canonical: ${path} on another host -> 308 ${r.location}`);
    }
    // Scripts, styles and images stay static assets (no Worker request for them).
    const fav = await get(on.base, '/favicon.svg', OTHER);
    check(fav.status === 200, `canonical: a static file is still served as an asset (${fav.status})`);
    // The canonical host and localhost: the pages as before (the prerendered files).
    for (const [label, host] of [['canonical host', 'opensu.example.com'], ['localhost', null]]) {
      for (const path of ['/', '/studio']) {
        const r = await get(on.base, path, host);
        check(r.status === 200 && /<html/i.test(r.body) && /\/assets\//.test(r.body), `canonical: ${label} ${path} -> ${r.status}, the page`);
      }
    }
    on.stop();
    const offSwitch = await startPreview({ SITE_URL: SITE, CANONICAL_REDIRECT: 'false' });
    for (const path of ['/', '/studio', '/api/chat']) {
      const r = await get(offSwitch.base, path, OTHER);
      check(r.status === 200, `canonical: CANONICAL_REDIRECT=false: ${path} on another host is served (${r.status})`);
    }
    offSwitch.stop();
  }

  // --- The studio header (task 029; the account entry of task 026) ----------
  // The top right holds the toolbar only; "分享" stands beside the house name
  // (desktop) or is the project menu's first row (phones); the account is the
  // project menu's account row; the sign-in invitation after the first change.
  // Two parts, so CI can run them on separate runners (task 030): `--only entry`
  // runs both, `--only entry-views` or `--only entry-rules` one.
  if (wanted('entry') || wanted('entry-views') || wanted('entry-rules')) {
    const preview = await startPreview({ QUOTA_ANON_TRIAL: '40', QUOTA_IP_DAILY: '1000' });
    console.log(`entry: preview on ${preview.base}`);
    const box = (page, sel) => page.locator(sel).first().evaluate((e) => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; });
    const glassBox = (page, testId) => page.getByTestId(testId).first().evaluate((e) => { const r = (e.closest('.lg') ?? e).getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; });
    const framing = (page) => page.evaluate(() => JSON.stringify(window.__studio.engine?.viewer.framedInsets ?? null));
    const known = (page) => page.waitForFunction(() => !!window.__studio?.chat?.getState().server, null, { timeout: 20000 });
    const settle = (page, ms = 900) => page.waitForTimeout(ms);
    const invites = (page) => page.getByTestId('signin-invite').count();
    const seen = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('opensu.invite.v1') ?? 'null'));
    /** Signs in through the open sign-in surface (email, the code typed). */
    const quickSignIn = async (page, email) => {
      await page.waitForSelector('[data-testid=signin-email-input]');
      await page.getByTestId('signin-email-input').fill(email);
      await page.getByTestId('signin-email-input').press('Enter');
      await page.waitForSelector('[data-testid=otp-0]');
      await page.waitForTimeout(300);
      await page.getByTestId('otp-0').focus();
      await page.keyboard.type(await code(preview.base, email));
      await page.waitForFunction(() => !!window.__studio.chat.getState().server?.user, null, { timeout: 20000 });
      await page.waitForSelector('[data-testid=signin-sheet]', { state: 'detached', timeout: 10000 });
    };
    /** A change by the assistant; records whether the invitation was ever on screen while the turn ran. */
    const change = async (page, lang) => {
      await page.evaluate(() => {
        window.__inviteWhileRunning = false;
        const mo = new MutationObserver(() => {
          if (document.querySelector('[data-testid=signin-invite]') && window.__studio.chat.getState().running) window.__inviteWhileRunning = true;
        });
        mo.observe(document.body, { childList: true, subtree: true });
        window.__inviteMo?.disconnect();
        window.__inviteMo = mo;
      });
      await turn(page, lang === 'en' ? 'Make the upstairs family room a bedroom' : '二楼起居室改成卧室');
      await settle(page, 700);
      return page.evaluate(() => window.__inviteWhileRunning);
    };
    const openShareUi = async (page, phone) => {
      if (!phone) return page.getByTestId('share-button').click();
      await openMenu(page);
      await page.getByTestId('menu-share').click();
    };
    const closeShareUi = async (page) => {
      await page.keyboard.press('Escape');
      await page.waitForSelector('[data-testid=share-surface]', { state: 'detached', timeout: 10000 });
      await settle(page, 400);
    };
    /** Nothing that acts lies right of the toolbar's left edge in its band; its glass ends 18 px from the screen edge. */
    const toolbarLast = (page) => page.evaluate(() => {
      const bar = document.querySelector('[data-testid=toolbar]');
      const g = bar.closest('.lg').getBoundingClientRect();
      const others = [...document.querySelectorAll('button, a, [role=button], input')].filter((e) => {
        if (bar.contains(e)) return false;
        const r = e.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && r.right > g.left && r.top < g.bottom && getComputedStyle(e).visibility !== 'hidden';
      });
      return { right: g.right, others: others.map((e) => e.getAttribute('data-testid') ?? e.tagName) };
    });
    let n = 0;
    let link = null;
    const configs = smoke
      ? [[1440, 900, 'zh'], [390, 844, 'zh']]
      : [[1440, 900], [1280, 720], [390, 844], [360, 800], [844, 390]].flatMap(([w, h]) => ['zh', 'en'].map((lang) => [w, h, lang]));
    // The studio's entry per configuration, and nothing shifting on load.
    if (wanted('entry-views')) {
      for (const [w, h, lang] of configs) {
        const phone = w < 768 || h < 520;
        const tag = `${w}x${h}-${lang}`;
        const { ctx, page } = await open(preview.base, phone ? { ...PHONE, viewport: { width: w, height: h } } : { ...DESKTOP, viewport: { width: w, height: h } }, `/studio?lang=${lang}`);
        await known(page);
        await settle(page, 800);
        check((await page.getByTestId('account-button').count()) === 0 && (await page.getByTestId('account-avatar').count()) === 0, `${tag}: no account button or avatar in the studio`);
        if (phone) {
          const hb = await box(page, 'header');
          const want = w > h ? 56 : 60;
          check(Math.abs(hb.b - want) <= 0.5, `${tag}: the header is back to ${want} px (${hb.b.toFixed(1)})`);
          const name = await box(page, '[data-testid=project-menu]');
          const sw = await box(page, '[data-testid=mode-switch]');
          check((await page.locator('header [data-testid=share-button]').count()) === 0 && name.r < sw.l && Math.abs(w - 12 - sw.r) <= 1, `${tag}: the top row is the name left and the mode switch right, nothing else`);
          const sc = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
          check(sc[0] <= sc[1], `${tag}: no horizontal scroll`);
        } else {
          const tl = await toolbarLast(page);
          check(Math.abs(w - 18 - tl.right) <= 1 && tl.others.length === 0, `${tag}: the toolbar is the right-most control, 18 px from the edge (${tl.right.toFixed(1)}; others: ${tl.others.join(', ') || 'none'})`);
          const name = await box(page, '[data-testid=project-menu]');
          const sh = await glassBox(page, 'share-button');
          const gap = sh.l - name.r;
          const dc = (sh.t + sh.b) / 2 - (name.t + name.b) / 2;
          check(Math.abs(gap - 12) <= 1 && Math.abs(dc) <= 1 && Math.abs(sh.h - 36) <= 0.5, `${tag}: "分享" right of the name on its centre line, 36 px high (gap ${gap.toFixed(1)}, centre ${dc.toFixed(1)})`);
          const fits = await page.getByTestId('share-button').evaluate((e) => e.scrollWidth <= e.clientWidth + 0.5);
          check(fits, `${tag}: the share label is not cut`);
        }
        await shot(page, `${tag}-signed-out`, outDir29);
        const f0 = await framing(page);

        // Share, signed out: the same surface, explaining and offering sign-in.
        if (phone) {
          await openMenu(page);
          const first = await page.locator('[data-testid=project-menu-list] [role=menuitem]').first().getAttribute('data-testid');
          const second = await page.locator('[data-testid=project-menu-list] [role=menuitem]').nth(1).getAttribute('data-testid');
          check(first === 'menu-share' && second === 'menu-signin', `${tag}: "分享" is the project menu's first row, the account row next (${first}, ${second})`);
          await page.getByTestId('menu-share').click();
        } else await page.getByTestId('share-button').click();
        await page.waitForSelector('[data-testid=share-need-account] [data-testid=share-signin]', { timeout: 10000 });
        await settle(page, 1200);
        if (!phone) {
          const row = await box(page, '[data-title-row]');
          const sf = await box(page, '[data-testid=share-surface]');
          check(Math.abs(sf.t - row.b - 8) <= 1.5 && Math.abs(sf.l - row.l) <= 1.5, `${tag}: the share surface stands under the name's row, the module's gap (gap ${(sf.t - row.b).toFixed(1)}, left ${(sf.l - row.l).toFixed(1)})`);
        }
        check((await framing(page)) === f0, `${tag}: the house does not move when share opens`);
        await shot(page, `${tag}-share-signed-out`, outDir29);
        await closeShareUi(page);

        // The invitation: not on arrival, after the first change (never while the reply runs).
        check((await invites(page)) === 0, `${tag}: no invitation on arrival`);
        const during = await change(page, lang);
        await page.waitForSelector('[data-testid=signin-invite]', { timeout: 5000 }).catch(() => null);
        const text = ((await page.getByTestId('signin-invite-text').textContent().catch(() => '')) ?? '').trim();
        check(!during && text === (lang === 'zh' ? '登录后，项目随账户保存，可在其他设备打开，也能分享。' : 'Sign in to keep this project, open it on other devices and share it.'), `${tag}: after the first change the invitation shows, not while the reply ran (${text})`);
        check((await framing(page)) === f0, `${tag}: the invitation does not move the house`);
        const inv = await box(page, '[data-testid=signin-invite]');
        const prompt = await box(page, '[data-testid=prompt]');
        const clipped = await page.getByTestId('signin-invite-text').evaluate((e) => e.scrollHeight > e.clientHeight + 0.5 || e.scrollWidth > e.clientWidth + 0.5);
        check(inv.b <= prompt.t - 6 && !clipped && (phone ? inv.h >= 47.5 && inv.h <= 64.5 : Math.abs(inv.h - 48) <= 0.5), `${tag}: above the prompt, ${phone ? '48 px or more (up to three lines)' : '48 px'}, its text whole (${inv.h.toFixed(1)} px high, ${(prompt.t - inv.b).toFixed(1)} px above)`);
        await shot(page, `${tag}-invite`, outDir29);
        await page.getByTestId('signin-invite-close').click();
        await settle(page, 400);
        check((await invites(page)) === 0, `${tag}: closed, it leaves`);

        // Sign in from the project menu's account row.
        await openMenu(page);
        await page.getByTestId('menu-signin').click();
        await page.waitForSelector('[data-testid=signin-email-input]');
        await settle(page, 900);
        if (!phone) {
          const nm = await box(page, '[data-house-name]');
          const sp = await box(page, '[data-testid=signin-sheet]');
          check(Math.abs(sp.t - nm.b - 8) <= 1.5 && Math.abs(sp.l - nm.l) <= 1.5, `${tag}: sign-in stands under the house name (gap ${(sp.t - nm.b).toFixed(1)})`);
        }
        const email = `head${++n}@example.com`;
        await quickSignIn(page, email);
        await page.waitForSelector('[data-testid=account-toast]', { state: 'detached', timeout: 8000 }).catch(() => null);
        await page.waitForFunction(() => !!window.__studio.projects?.store.getState().openId && !window.__studio.projects.store.getState().busy, null, { timeout: 30000 });
        await settle(page, 600);
        check((await framing(page)) === f0 && (await page.getByTestId('account-button').count()) === 0 && (await invites(page)) === 0, `${tag}: signed in: no avatar appears, no invitation, the house stays`);
        await shot(page, `${tag}-signed-in`, outDir29);

        // The account menu from the project menu: who, allowance, keys, sign out; nothing else.
        await openMenu(page);
        const rowText = ((await page.getByTestId('menu-account').textContent()) ?? '').trim();
        check(rowText === email, `${tag}: the account row shows the account (${rowText})`);
        await page.getByTestId('menu-account').click();
        await page.waitForSelector('[data-testid=account-menu] [data-testid=account-signout]');
        await settle(page, 1000);
        const allowance = ((await page.getByTestId('account-allowance').textContent().catch(() => '')) ?? '').trim();
        check(allowance.length > 0 && (await page.getByTestId('account-keys').count()) === 1 && (await page.getByTestId('account-projects').count()) === 0, `${tag}: the account menu: allowance, my keys, sign out (${allowance})`);
        if (!phone) {
          const nm = await box(page, '[data-house-name]');
          const am = await box(page, '[data-testid=account-menu]');
          check(Math.abs(am.t - nm.b - 8) <= 1.5 && Math.abs(am.l - nm.l) <= 1.5, `${tag}: the account menu stands under the house name (gap ${(am.t - nm.b).toFixed(1)})`);
        }
        check((await framing(page)) === f0, `${tag}: the house does not move when the account menu opens`);
        await shot(page, `${tag}-account-menu`, outDir29);
        await page.keyboard.press('Escape');
        await page.waitForSelector('[data-testid=account-menu]', { state: 'detached', timeout: 5000 });
        await settle(page, 400);

        // Share, signed in: the switch; the first configuration makes the link the view-only shots use.
        await openShareUi(page, phone);
        await page.waitForSelector('[data-testid=share-surface-body]', { timeout: 15000 });
        if (!link) {
          await page.getByTestId('share-switch').click();
          await page.waitForSelector('[data-testid=share-link]', { timeout: 15000 });
          link = await page.getByTestId('share-link').inputValue();
        }
        await settle(page, 1200);
        await shot(page, `${tag}-share-open`, outDir29);
        await closeShareUi(page);
        await ctx.close();

        // View only: no share, no invitation, no prompt.
        const V = await open(preview.base, phone ? { ...PHONE, viewport: { width: w, height: h } } : { ...DESKTOP, viewport: { width: w, height: h } }, `${new URL(link).pathname}${new URL(link).search}&lang=${lang}`);
        await V.page.waitForFunction(() => window.__studio.shared?.getState().status === 'ready', null, { timeout: 30000 });
        await settle(V.page, 1200);
        check((await V.page.getByTestId('share-button').count()) === 0 && (await invites(V.page)) === 0 && (await V.page.getByTestId('view-only-bar').count()) === 1, `${tag}: view only: no share button, no invitation`);
        await openMenu(V.page);
        check((await V.page.getByTestId('menu-share').count()) === 0, `${tag}: view only: no share row in the project menu`);
        await closeMenu(V.page);
        if (!phone) {
          const tl = await toolbarLast(V.page);
          check(tl.others.length === 0, `${tag}: view only: the toolbar is still the right-most control`);
        }
        await shot(V.page, `${tag}-view-only`, outDir29);
        await V.ctx.close();
      }

      // The toolbar does not shift on load, first visit or not (nothing waits for the status at the top right).
      {
        const { ctx, page } = await open(preview.base, DESKTOP);
        for (const visit of ['first', 'second']) {
          if (visit === 'second') await page.evaluate(() => localStorage.clear());
          await page.route('**/api/chat', async (route) => {
            if (route.request().method() === 'GET') await new Promise((r) => setTimeout(r, 2500));
            await route.continue();
          });
          await page.goto(`${preview.base}/studio`);
          await page.waitForSelector('[data-testid=toolbar]', { timeout: 60000 });
          const early = await page.evaluate(() => ({ status: !!window.__studio?.chat?.getState().server, bar: document.querySelector('[data-testid=toolbar]').closest('.lg').getBoundingClientRect().toJSON(), name: document.querySelector('[data-testid=project-menu]').getBoundingClientRect().toJSON() }));
          await known(page);
          await page.waitForSelector('[data-testid=share-button]', { timeout: 10000 });
          await settle(page, 400);
          const late = await page.evaluate(() => ({ bar: document.querySelector('[data-testid=toolbar]').closest('.lg').getBoundingClientRect().toJSON(), name: document.querySelector('[data-testid=project-menu]').getBoundingClientRect().toJSON() }));
          const same = (a, b) => ['left', 'top', 'right', 'bottom'].every((k) => Math.abs(a[k] - b[k]) <= 0.5);
          check(!early.status && same(early.bar, late.bar) && same(early.name, late.name), `load (${visit} visit): the toolbar and the name stay where they are when the status arrives (${early.bar.right} -> ${late.bar.right})`);
          await page.unroute('**/api/chat');
        }
        await ctx.close();
      }
    }

    // The invitation's rules, the quota note, sign-in off, the landing's sign-in.
    if (wanted('entry-rules')) {
      // The invitation's rules (desktop zh): once; closed, not again for 14 days; walking, other surfaces; sign-in ends it.
      {
        const { ctx, page } = await open(preview.base, DESKTOP);
        await known(page);
        await change(page, 'zh');
        await page.waitForSelector('[data-testid=signin-invite]', { timeout: 5000 });
        const at0 = (await seen(page))?.at ?? 0;
        check(at0 > 0, 'rules: shown after the first change; this browser remembers when');
        await page.evaluate(() => window.__studio.store.getState().setWalk(true));
        await settle(page, 800);
        const walking = await invites(page);
        await page.evaluate(() => window.__studio.store.getState().setWalk(false));
        await settle(page, 800);
        await openMenu(page);
        const underMenu = await invites(page);
        await closeMenu(page);
        await page.getByTestId('bar-sun').click();
        await settle(page, 800);
        const underPanel = await invites(page);
        await page.getByTestId('bar-sun').click();
        await settle(page, 800);
        check(walking === 0 && underMenu === 0 && underPanel === 0 && (await invites(page)) === 1, `rules: hidden while walking, under a menu or a tool panel, back after (${walking}, ${underMenu}, ${underPanel})`);
        await page.getByTestId('signin-invite-close').click();
        await settle(page, 300);
        await change(page, 'zh');
        check((await invites(page)) === 0, 'rules: closed: a second change does not bring it back');
        await page.reload({ waitUntil: 'networkidle' });
        await page.waitForFunction(() => window.__studio?.ready3d === true, null, { timeout: 180000 });
        await known(page);
        await settle(page, 600);
        check((await invites(page)) === 0, 'rules: not on arrival after a reload');
        await change(page, 'zh');
        check((await invites(page)) === 0, 'rules: within 14 days of closing it, a change in a new page does not bring it back');
        // Closed 15 days ago: the next change brings it back once.
        await page.evaluate(() => localStorage.setItem('opensu.invite.v1', JSON.stringify({ at: Date.now() - 15 * 24 * 3600 * 1000 })));
        await page.reload({ waitUntil: 'networkidle' });
        await page.waitForFunction(() => window.__studio?.ready3d === true, null, { timeout: 180000 });
        await known(page);
        await settle(page, 600);
        check((await invites(page)) === 0, 'rules: 15 days after closing, still not on arrival');
        await change(page, 'zh');
        check((await invites(page)) === 1, 'rules: 15 days after closing, the next change shows it again');
        // "登录" opens sign-in above the input; the invitation steps away and ends once signed in.
        await page.getByTestId('signin-invite-signin').click();
        await page.waitForSelector('[data-testid=signin-email-input]');
        await settle(page, 900);
        const sp = await box(page, '[data-testid=signin-sheet]');
        const pr = await box(page, '[data-testid=prompt]');
        check((await invites(page)) === 0 && sp.b <= pr.t, `rules: "登录" opens sign-in above the input; the invitation steps away (${(pr.t - sp.b).toFixed(1)} px)`);
        await quickSignIn(page, `rules${++n}@example.com`);
        await settle(page, 600);
        check((await invites(page)) === 0 && (await seen(page))?.done === true, 'rules: signed in, it ends for this browser');
        await openMenu(page);
        await page.getByTestId('menu-account').click();
        await page.getByTestId('account-signout').click();
        await page.waitForFunction(() => !window.__studio.chat.getState().server?.user, null, { timeout: 10000 });
        await settle(page, 600);
        await change(page, 'zh');
        check((await invites(page)) === 0, 'rules: signed out again on this browser, a change does not bring it back');
        await ctx.close();
      }
    }
    preview.stop();

    if (wanted('entry-rules')) {
      // The quota-reached sign-in and the invitation never show together.
      {
        const q = await startPreview({ QUOTA_ANON_TRIAL: '1', QUOTA_IP_DAILY: '1000' });
        const { ctx, page } = await open(q.base, DESKTOP);
        await known(page);
        await change(page, 'zh');
        const up = await invites(page);
        await turn(page, '你好');
        const err = await lastError(page);
        await page.evaluate(() => window.__studio.store.getState().setRecent(true));
        await settle(page, 800);
        const quotaSignIn = await page.getByTestId('quota-signin').count();
        await page.evaluate(() => window.__studio.store.getState().setRecent(false));
        await settle(page, 600);
        check(up === 1 && err?.kind === 'quota' && quotaSignIn === 1 && (await invites(page)) === 0, `quota: the quota note with its sign-in stands alone; the invitation waits (${up}, ${err?.kind}, ${quotaSignIn})`);
        await shot(page, '1440x900-zh-quota-no-invite', outDir29);
        await ctx.close();
        q.stop();
      }

      // Sign-in off: nothing of it is shown (studio, menu, landing; ?signin=1 is dropped); no invitation.
      const off = await startPreview({ AUTH_ENABLED: 'false' });
      for (const [label, opts, path] of [['desktop', DESKTOP, '/studio?signin=1'], ['phone', PHONE, '/studio'], ['phone-sideways', { ...PHONE, viewport: { width: 844, height: 390 } }, '/studio']]) {
        const { ctx, page } = await open(off.base, opts, path);
        await known(page);
        await page.waitForTimeout(1500);
        check((await page.getByTestId('account-button').count()) === 0 && (await page.getByTestId('signin-sheet').count()) === 0 && (await page.getByTestId('share-button').count()) === 0, `sign-in off (${label}): no account, no share, ?signin=1 opens nothing`);
        const hb = await box(page, label === 'desktop' ? '[data-testid=title-block]' : 'header');
        console.log(`    sign-in off (${label}): header bottom ${hb.b.toFixed(0)} px, framing ${await framing(page)}`);
        if (label === 'desktop') {
          check(!/signin=/.test(page.url()), 'sign-in off: ?signin=1 leaves the address too');
          await change(page, 'zh');
          check((await invites(page)) === 0, 'sign-in off: no invitation after a change');
          await page.goto(`${off.base}/`, { waitUntil: 'networkidle' });
          await page.waitForTimeout(800);
          check((await page.getByTestId('landing-signin').count()) === 0, 'sign-in off: the landing has no sign-in link');
        } else await shot(page, `sign-in-off-${label}`, outDir29);
        await ctx.close();
      }
      off.stop();

      // The landing: "sign in" goes to /studio?signin=1, which opens sign-in under the house name once.
      {
        const p2 = await startPreview();
        const { ctx, page } = await open(p2.base, DESKTOP);
        await page.goto(`${p2.base}/`, { waitUntil: 'networkidle' });
        await page.waitForSelector('[data-testid=landing-signin]');
        await page.getByTestId('landing-signin').click();
        await page.waitForURL(/\/studio/);
        await page.waitForSelector('[data-testid=signin-sheet]', { timeout: 60000 });
        await settle(page, 900);
        const nm = await box(page, '[data-house-name]');
        const sp = await box(page, '[data-testid=signin-sheet]');
        check(!/signin=/.test(page.url()) && Math.abs(sp.t - nm.b - 8) <= 1.5, `?signin=1 opens sign-in under the house name and leaves the address (${page.url()})`);
        await page.keyboard.press('Escape');
        await page.waitForSelector('[data-testid=signin-sheet]', { state: 'detached', timeout: 5000 });
        await page.reload({ waitUntil: 'networkidle' });
        await page.waitForFunction(() => window.__studio?.ready3d === true, null, { timeout: 180000 });
        await page.waitForTimeout(1200);
        check((await page.getByTestId('signin-sheet').count()) === 0, '?signin=1: a reload does not open it again');
        await ctx.close();
        p2.stop();
      }
    }
  }

  // --- Limits: site and calls per turn --------------------------------------
  if (wanted('limits')) {
    const preview = await startPreview({ QUOTA_SITE_DAILY: '2', QUOTA_CALLS_PER_TURN: '2' });
    console.log(`limits: preview on ${preview.base}`);
    const a = await open(preview.base, DESKTOP);
    // The repair script makes three model calls in one turn: the third is over the cap.
    await turn(a.page, '二楼起居室改成卧室');
    const e = await lastError(a.page);
    check(e?.kind === 'quota' && e.code === 'quota_turn_limit', `QUOTA_CALLS_PER_TURN=2: the third call of a turn is refused (${e?.code})`);
    await turn(a.page, '你好');
    const b = await open(preview.base, DESKTOP);
    const qb = await quota(b.page);
    check(qb?.remaining === 0 && qb.reason === 'site', `site limit reached: the owner's key stops for a new visitor too (${JSON.stringify(qb)})`);
    await turn(b.page, '你好');
    const nb = await b.page.getByTestId('quota-note').first().textContent();
    check(/大家共用的免费额度/.test(nb ?? ''), `site limit: a calm note (${nb})`);
    await shot(b.page, 'desktop-out-site');
    const own = await b.page.evaluate(async () => (await fetch('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json', 'x-opensu-key': 'sk-own-test', 'x-opensu-base-url': 'https://127.0.0.1:9/v1' }, body: '{"messages":[]}' })).status);
    check(own !== 429, `site limit: own key continues (${own})`);
    await a.ctx.close();
    await b.ctx.close();
    preview.stop();
  }

  // --- Google configured (fake ids: the button shows, nothing is called) ------
  if (wanted('google')) {
    const preview = await startPreview({ GOOGLE_CLIENT_ID: 'not-a-real-id', GOOGLE_CLIENT_SECRET: 'not-a-real-secret' });
    console.log(`google: preview on ${preview.base}`);
    for (const [label, opts] of [['desktop', DESKTOP], ['phone', PHONE]]) {
      const { ctx, page } = await open(preview.base, opts);
      await openMenu(page);
      await page.getByTestId('menu-signin').click();
      await page.waitForSelector('[data-testid=signin-google]');
      await page.waitForTimeout(1500);
      const g = await page.getByTestId('signin-google').evaluate((b) => ({
        text: b.textContent.trim(),
        fills: [...b.querySelectorAll('svg path')].map((p) => p.getAttribute('fill')).join(','),
        bg: getComputedStyle(b).backgroundColor,
      }));
      check(g.text === '使用 Google 账号继续' && g.fills === '#EA4335,#4285F4,#FBBC05,#34A853' && g.bg === 'rgb(19, 19, 20)', `${label}: Google button: wording, standard four-colour G, Google's dark fill (${JSON.stringify(g)})`);
      check((await page.getByTestId('signin-email-input').count()) === 1, `${label}: email and Google in one sheet`);
      await shot(page, `${label}-signin-google`);
      await ctx.close();
    }
    preview.stop();
  }

  // --- Phone ------------------------------------------------------------------
  if (wanted('phone')) {
    const preview = await startPreview({ QUOTA_ANON_TRIAL: '1', QUOTA_USER_DAILY: '2' });
    console.log(`phone: preview on ${preview.base}`);
    const { ctx, page } = await open(preview.base, PHONE);
    const h1 = await quotaHint(page);
    check(h1.text.includes('1') && h1.inInput === 0, `phone: the key menu's free row shows 1 left (${h1.text})`);
    await shot(page, 'phone-remaining');
    await openMenu(page);
    await shot(page, 'phone-menu-signin');
    await closeMenu(page);
    await turn(page, '你好 1');
    await turn(page, '你好 2');
    await page.waitForSelector('[data-testid=quota-note]');
    await page.waitForTimeout(500);
    await shot(page, 'phone-out-anon');
    await page.getByTestId('quota-signin').tap();
    await page.waitForSelector('[data-testid=signin-sheet]');
    await page.waitForTimeout(800);
    await signInFlow(page, preview.base, 'phone@example.com', { shots: true, prefix: 'phone' });
    await page.waitForTimeout(500);
    await openMenu(page);
    await shot(page, 'phone-menu-account');
    await closeMenu(page);
    await turn(page, '你好 3');
    await turn(page, '你好 4');
    await turn(page, '你好 5');
    await page.waitForSelector('[data-testid=quota-note]');
    await page.waitForTimeout(500);
    await shot(page, 'phone-out-user');
    await ctx.close();
    preview.stop();
  }
  // --- Turn records and the conversation export (task 020) -------------------
  if (wanted('turns')) {
    const preview = await startPreview();
    console.log(`turns: preview on ${preview.base}`);
    const exportTurns = (...extra) => {
      const file = join(preview.state, `export-${Date.now()}.jsonl`);
      const out = execFileSync(process.execPath, [resolve(here, 'turns-export.mjs'), '--local', '--persist-to', preview.state, '--out', file, ...extra], { cwd: appRoot, encoding: 'utf8' });
      const text = readFileSync(file, 'utf8');
      return { out: out.trim(), rows: text ? text.trim().split('\n').map((l) => JSON.parse(l)) : [] };
    };
    const settle = (page) => page.waitForTimeout(1200);

    // Anonymous visitor: an edit (then undone), a plain answer.
    const a = await open(preview.base, DESKTOP);
    await openMenu(a.page);
    check(await a.page.getByTestId('menu-export').isDisabled(), 'export is disabled while the conversation is empty');
    await closeMenu(a.page);
    await turn(a.page, '北侧房间加深一点');
    await a.page.getByRole('button', { name: '撤销' }).first().click();
    await a.page.waitForFunction(() => window.__studio.chat.getState().items.some((i) => i.undo === 'can-redo'));
    await turn(a.page, '你好');
    await settle(a.page);
    await openMenu(a.page);
    check(!(await a.page.getByTestId('menu-export').isDisabled()), 'export is enabled once there is a conversation');
    await shot(a.page, 'desktop-menu-export', outDir20);
    const [dl] = await Promise.all([a.page.waitForEvent('download'), a.page.getByTestId('menu-export').click()]);
    const file = JSON.parse(readFileSync(await dl.path(), 'utf8'));
    const t0 = file.turns?.[0];
    const call = t0?.parts?.find((p) => p.type === 'call');
    check(file.turns?.length === 2 && !!file.house?.levels && /^\d+\.\d+\.\d+\+\w+$/.test(file.app ?? '') && typeof file.conversation === 'string', `export: ${file.turns?.length} turns, the current house, app ${file.app} (${dl.suggestedFilename()})`);
    check(t0?.user === '北侧房间加深一点' && t0.undone === true && call?.name === 'edit_house' && call.args?.commands?.[0]?.op === 'move_grid_line' && call.result?.ok === true && t0.parts.some((p) => p.type === 'change') && !!t0.final, 'export: the first turn with its message, the tool call (commands and result), the change, the final text, undone');
    await closeMenu(a.page);

    // A failing POST /api/turns changes nothing the user sees.
    await a.page.route('**/api/turns', (r) => r.abort());
    const errorsBefore = failures.length;
    await turn(a.page, '把北侧房间再加深');
    const last = await a.page.evaluate(() => window.__studio.chat.getState().items.at(-1));
    check(!last.error && last.phase === 'done' && last.changes?.length === 1 && failures.length === errorsBefore, 'a failed POST /api/turns: the turn reads as usual, no error shown, nothing thrown');
    check(/改好了/.test(last.text ?? ''), 'the reply is there as usual');
    await shot(a.page, 'desktop-after-failed-record', outDir20);
    await a.page.unroute('**/api/turns');

    // Signed in.
    await openMenu(a.page);
    await a.page.getByTestId('menu-signin').click();
    await signInFlow(a.page, preview.base, 'records@example.com', { shots: false, prefix: 'turns' });
    await turn(a.page, '你好，登录以后');
    await settle(a.page);
    await a.ctx.close();

    // Own key (the upstream is unreachable on purpose: the turn ends with an error, which is recorded too).
    const OWN = 'sk-own-e2e-not-a-real-key-123';
    const ownCtx = await newContext(DESKTOP);
    await ownCtx.addInitScript((k) => {
      localStorage.setItem('opensu.hints.v1', 'done');
      localStorage.setItem('opensu.ai', JSON.stringify({ useOwn: true, provider: 'custom', key: k, baseUrl: 'https://127.0.0.1:9/v1', model: 'my/own-model' }));
    }, OWN);
    const ownPage = await ownCtx.newPage();
    await ownPage.goto(`${preview.base}/studio`, { waitUntil: 'networkidle' });
    await ownPage.waitForFunction(() => window.__studio?.ready3d === true, null, { timeout: 180000 });
    await turn(ownPage, '你好，用我自己的 key');
    await settle(ownPage);
    await ownCtx.close();

    // The owner export script against the local database.
    const all = exportTurns();
    console.log(`  turns-export: ${all.out}`);
    const anonRows = all.rows.filter((r) => r.who.startsWith('v:') && !r.ownKey);
    const userRows = all.rows.filter((r) => r.who.startsWith('u:'));
    const ownRows = all.rows.filter((r) => r.ownKey);
    check(all.rows.length === 4 && anonRows.length === 2 && userRows.length === 1 && ownRows.length === 1, `stored: 2 anonymous, 1 signed in, 1 own key; the turn whose POST failed is absent (${all.rows.length} rows)`);
    const first = anonRows.find((r) => r.record.user === '北侧房间加深一点');
    check(first?.undone === true && anonRows.filter((r) => r.undone).length === 1, 'the undone turn is flagged, the other is not');
    check(first?.record.house?.levels?.length > 0 && first.record.parts.some((p) => p.type === 'call' && p.result) && first.record.status === 'ok' && first.model === STUB_MODEL && first.record.durationMs > 0, 'a record holds the house after the turn, the tool calls with results, status, model, duration');
    check(userRows[0]?.record.user === '你好，登录以后', 'the signed-in turn is recorded under the user');
    check(ownRows[0]?.record.status === 'error' && ownRows[0].model === 'my/own-model' && !JSON.stringify(ownRows[0]).includes(OWN), `own key: recorded (status ${ownRows[0]?.record.status}), the key is nowhere in it`);
    check(new Set(anonRows.map((r) => r.conversation)).size === 1, 'one conversation id for the anonymous chat');
    const undone = exportTurns('--only', 'undone');
    const errored = exportTurns('--only', 'error,gave-up');
    check(undone.rows.length === 1 && errored.rows.length === 1 && errored.rows[0].ownKey, `export --only undone: ${undone.rows.length}, --only error,gave-up: ${errored.rows.length}`);
    const sizes = all.rows.map((r) => Buffer.byteLength(JSON.stringify(r.record)));
    console.log(`  record sizes in the browser: ${sizes.map((n) => `${(n / 1024).toFixed(1)} KB`).join(', ')}`);

    // Phone: the menu entry; About (desktop and phone).
    const ph = await open(preview.base, PHONE);
    await turn(ph.page, '你好');
    await openMenu(ph.page);
    await shot(ph.page, 'phone-menu-export', outDir20);
    await closeMenu(ph.page);
    await ph.ctx.close();
    for (const [label, opts] of [['desktop', DESKTOP], ['phone', PHONE]]) {
      for (const lang of ['zh', 'en']) {
        const ctx = await newContext({ ...opts, locale: lang === 'zh' ? 'zh-CN' : 'en-US' });
        await ctx.addInitScript((l) => localStorage.setItem('opensu.lang', l), lang);
        const page = await ctx.newPage();
        await page.goto(`${preview.base}/`, { waitUntil: 'networkidle' });
        const about = await page.getByTestId('about-records').textContent();
        check(lang === 'zh' ? /保存在服务器上.*30 天/.test(about) : /saved on the server.*30 days/.test(about), `${label} About (${lang}): ${about}`);
        await page.getByTestId('about-records').scrollIntoViewIfNeeded();
        if (lang === 'zh') await shot(page, `${label}-about`, outDir20);
        else await shot(page, `${label}-about-en`, outDir20);
        await ctx.close();
      }
    }
    preview.stop();
  }
  // --- Keys saved with the account (task 022) -------------------------------
  if (wanted('keys')) {
    const KEYS_SECRET = 'e2e-keys-secret-not-real-0123456789abcdef';
    const OR = 'sk-or-v1-e2e-not-a-real-key-0r0r';
    const ANT = 'sk-ant-api03-e2e-not-a-real-key-a7a7';
    const OAI = 'sk-proj-e2e-not-a-real-key-0a10';
    stub.config.keys = [OR, ANT, OAI];
    const stubOrigin = stub.url.replace(/\/v1$/, '');
    const preview = await startPreview({ KEYS_SECRET, KEYS_TEST_UPSTREAM: stubOrigin });
    console.log(`keys: preview on ${preview.base}`);
    const st = await (await fetch(`${preview.base}/api/chat`)).json();
    check(st.keys === true, 'status: keys can be saved with an account here');
    const off = await startPreview({ KEYS_TEST_UPSTREAM: stubOrigin });
    const stOff = await (await fetch(`${off.base}/api/chat`)).json();
    const offList = await fetch(`${off.base}/api/keys`);
    check(stOff.keys === false && offList.status === 404, `no KEYS_SECRET: the feature is off (status keys=${stOff.keys}, /api/keys ${offList.status})`);
    off.stop();

    const label = (page) => page.getByTestId('key-picker-label').first().textContent();
    const openPicker = async (page) => {
      await page.getByTestId('key-picker').first().click();
      await page.waitForSelector('[data-testid=key-menu]');
      await page.waitForTimeout(700);
    };
    const closePicker = async (page) => {
      await page.keyboard.press('Escape');
      await page.waitForSelector('[data-testid=key-menu]', { state: 'detached' });
      await page.waitForTimeout(300);
    };
    const sheetGone = (page) => page.waitForSelector('[data-testid=keys-sheet]', { state: 'detached', timeout: 10000 });
    const lastCall = () => stub.received.at(-1);
    const withBrowserKey = async (opts, path) => {
      const ctx = await newContext(opts);
      await ctx.addInitScript((k) => {
        localStorage.setItem('opensu.hints.v1', 'done');
        if (!sessionStorage.getItem('e2e-key-set')) {
          sessionStorage.setItem('e2e-key-set', '1');
          localStorage.setItem('opensu.ai', JSON.stringify({ useOwn: true, provider: 'openrouter', key: k, baseUrl: '', model: '' }));
        }
      }, OR);
      const page = await ctx.newPage();
      page.on('pageerror', (e) => failures.push(`page error ${e.message}`));
      page.on('console', (m) => {
        if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) failures.push(`console error ${m.text()}`);
      });
      await page.goto(`${preview.base}${path}`, { waitUntil: 'networkidle' });
      await page.waitForFunction(() => window.__studio?.ready3d === true, null, { timeout: 180000 });
      return { ctx, page };
    };

    // Desktop: a visitor with a key in this browser, the conversation pinned.
    const { ctx, page } = await withBrowserKey(DESKTOP, '/studio?panel=pin');
    check((await label(page)) === 'OpenRouter', `signed out: the picker shows the browser's key in use (${await label(page)})`);
    await openPicker(page);
    const outItems = await page.locator('[data-testid=key-menu] [role=menuitemradio], [data-testid=key-menu] [role=menuitem]').allTextContents();
    check(outItems.length === 3 && (await page.getByTestId('key-own').count()) === 1 && (await page.getByTestId('key-add').count()) === 0, `signed out: free allowance, the browser's key, "use your own key" (${outItems.join(' | ')})`);
    await shot(page, 'desktop-signed-out-picker-open', outDir22);
    await closePicker(page);
    // The signed-out browser-key path is unchanged: the key goes in its header (intercepted; the relay would call openrouter.ai).
    const seen = [];
    await page.route('**/api/chat', (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      seen.push(route.request().headers());
      return route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: { message: 'Invalid API key (intercepted)' } }) });
    });
    await turn(page, '你好，浏览器里的密钥');
    check(seen.length === 1 && seen[0]['x-opensu-key'] === OR && seen[0]['x-opensu-base-url'] === 'https://openrouter.ai/api/v1' && !seen[0]['x-opensu-account-key'], 'signed out: the browser key goes in x-opensu-key as before');
    await page.unroute('**/api/chat');

    // Sign in: the browser's key is offered once, never uploaded silently.
    const before = (await (await fetch(`${preview.base}/api/keys`)).status);
    check(before === 401, `signed out: /api/keys refuses (${before})`);
    await openMenu(page);
    await page.getByTestId('menu-signin').click();
    await signInFlow(page, preview.base, 'keys@example.com', { shots: false, prefix: 'keys' });
    await page.waitForSelector('[data-testid=keys-offer]', { timeout: 10000 });
    await page.waitForTimeout(900);
    const offerText = await page.getByTestId('keys-sheet').textContent();
    check(/保存到账号，在其他设备也能用/.test(offerText) && /密钥加密保存在服务器上，只用于你的对话。/.test(offerText) && /0r0r/.test(offerText) && !offerText.includes(OR), `after sign-in: the offer, where the key is kept, the hint only (${offerText})`);
    const listed0 = await page.evaluate(async () => (await (await fetch('/api/keys')).json()).keys.length);
    check(listed0 === 0, 'nothing was saved before the user said so');
    await shot(page, 'desktop-offer-after-signin', outDir22);
    await page.getByTestId('keys-offer-save').click();
    await sheetGone(page);
    const ls = await page.evaluate(() => localStorage.getItem('opensu.ai') ?? '');
    const k1 = await page.evaluate(() => window.__studio.keys.getState());
    check(k1.keys.length === 1 && k1.keys[0].provider === 'openrouter' && k1.keys[0].hint === '0r0r' && k1.active === 'openrouter' && !ls.includes(OR), `saved with the account and in use; the browser copy removed (${JSON.stringify(k1.keys)}, active ${k1.active})`);
    check((await label(page)) === 'OpenRouter', 'the picker shows the saved key');

    // A turn goes out with the saved key and skips the quota.
    const q0 = await quota(page);
    await turn(page, '你好，账号里的 OpenRouter 密钥');
    const c1 = lastCall();
    check(c1?.provider === 'openrouter' && c1.authorization === `Bearer ${OR}` && c1.model === 'deepseek/deepseek-v4.1-flash', `the relay calls OpenRouter's stand-in with the saved key and the default model (${c1?.provider}, ${c1?.model})`);
    await page.evaluate(() => fetch('/api/chat').then((r) => r.json()).then((s) => window.__studio.chat.setState({ server: s })));
    const q1 = await quota(page);
    check(q1?.remaining === q0?.remaining && q1?.remaining === 10, `the quota is untouched (${q0?.remaining} -> ${q1?.remaining})`);
    const rec = await page.evaluate(() => window.__studio.chat.getState().items.at(-1).run);
    check(rec?.ownKey === true && rec.model === 'deepseek/deepseek-v4.1-flash', `the turn is recorded as ownKey: true (${JSON.stringify(rec)})`);

    // Add an Anthropic key in the sheet.
    await openPicker(page);
    await page.getByTestId('key-add').click();
    await page.waitForSelector('[data-testid=keys-add]');
    await page.waitForTimeout(900);
    await page.getByTestId('keys-provider').getByText('Anthropic').click();
    await page.getByTestId('keys-key').fill(ANT);
    await shot(page, 'desktop-add-key-sheet', outDir22);
    await page.getByTestId('keys-save').click();
    await sheetGone(page);
    check((await label(page)) === 'Anthropic', `a new key is in use at once (${await label(page)})`);
    await page.waitForTimeout(500);
    await shot(page, 'desktop-picker-closed', outDir22);
    await openPicker(page);
    const menuText = await page.getByTestId('key-menu').textContent();
    check(/免费额度/.test(menuText) && /OpenRouter/.test(menuText) && /Anthropic/.test(menuText) && /a7a7/.test(menuText) && /claude-opus-5-5/.test(menuText) && !menuText.includes(ANT), `the menu lists the free allowance and each key with its hint and model (${menuText})`);
    await shot(page, 'desktop-picker-open', outDir22);
    await closePicker(page);
    await turn(page, '把北侧房间加深');
    const c2 = lastCall();
    check(c2?.provider === 'anthropic' && c2.authorization === `Bearer ${ANT}` && c2.model === 'claude-opus-5-5' && c2.max_tokens === 32000, `Anthropic's stand-in: the saved key, claude-opus-5-5, an output cap (${c2?.provider}, ${c2?.model}, ${c2?.max_tokens})`);
    const edited = await page.evaluate(() => window.__studio.chat.getState().items.at(-1));
    check(!edited.error && edited.changes?.length === 1, 'the tool loop runs through the Anthropic path (an edit applied)');

    // Change the model (the saved key's sheet).
    await openPicker(page);
    await page.getByTestId('key-edit-anthropic').click();
    await page.waitForSelector('[data-testid=keys-edit]');
    await page.waitForTimeout(900);
    await shot(page, 'desktop-saved-key-sheet', outDir22);
    await page.getByTestId('keys-model').fill('claude-sonnet-5-5');
    await page.getByTestId('keys-save').click();
    await sheetGone(page);
    await turn(page, '你好，换了模型');
    check(lastCall()?.model === 'claude-sonnet-5-5' && lastCall()?.authorization === `Bearer ${ANT}`, `the changed model is used, the key kept (${lastCall()?.model})`);

    // The choice is remembered with the account.
    await openPicker(page);
    await page.getByTestId('key-free').click();
    await page.waitForTimeout(800);
    check((await label(page)) === '免费额度', 'choosing the free allowance switches at once');
    await page.reload({ waitUntil: 'commit' });
    await page.waitForFunction(() => window.__studio?.keys?.getState().ready === true, null, { timeout: NAV_MS });
    check((await label(page)) === '免费额度', 'after a reload: still the free allowance');
    await openPicker(page);
    await page.getByTestId('key-anthropic').click();
    await page.waitForTimeout(800);
    await page.reload({ waitUntil: 'commit' });
    await page.waitForFunction(() => window.__studio?.keys?.getState().ready === true, null, { timeout: NAV_MS });
    check((await label(page)) === 'Anthropic', 'after a reload: Anthropic again (remembered per account)');

    // Delete the key in use: the picker falls back to the free allowance, and turns are metered again.
    await openPicker(page);
    await page.getByTestId('key-edit-anthropic').click();
    await page.waitForSelector('[data-testid=keys-edit]');
    await page.waitForTimeout(600);
    await page.getByTestId('keys-delete').click();
    check(((await page.getByTestId('keys-delete').textContent()) ?? '').includes('确认删除'), 'delete asks once more');
    await page.getByTestId('keys-delete').click();
    await sheetGone(page);
    check((await label(page)) === '免费额度', `after deleting the key in use: the free allowance (${await label(page)})`);
    const q2 = (await quota(page))?.remaining;
    await turn(page, '你好，免费额度');
    const c3 = lastCall();
    const q3 = (await quota(page))?.remaining;
    check(c3?.provider === null && c3.authorization === `Bearer ${STUB_KEY}` && q3 === q2 - 1, `the site's key again, one credit taken (${q2} -> ${q3})`);

    // Another user cannot see or use them.
    const other = await newContext(DESKTOP);
    const op = await other.newPage();
    await op.goto(`${preview.base}/studio`);
    const otherList = await op.evaluate(async () => (await fetch('/api/keys')).status);
    check(otherList === 401, `another (signed-out) browser cannot list them (${otherList})`);
    await other.close();
    await ctx.close();

    // Phone: offered once; "not now" is remembered; the picker in the pinned sheet; the add sheet; a saved key.
    const ph = await withBrowserKey(PHONE, '/studio');
    await openMenu(ph.page);
    await ph.page.getByTestId('menu-signin').click();
    await ph.page.waitForSelector('[data-testid=signin-sheet]');
    await ph.page.waitForTimeout(800);
    await signInFlow(ph.page, preview.base, 'phone-keys@example.com', { shots: false, prefix: 'keys-phone' });
    await ph.page.waitForSelector('[data-testid=keys-offer]', { timeout: 10000 });
    await ph.page.waitForTimeout(900);
    await shot(ph.page, 'phone-offer-after-signin', outDir22);
    await ph.page.getByTestId('keys-offer-later').click();
    await sheetGone(ph.page);
    const kept = await ph.page.evaluate(() => localStorage.getItem('opensu.ai') ?? '');
    check(kept.includes(OR), '"not now": the key stays in this browser only');
    check((await ph.page.evaluate(async () => (await (await fetch('/api/keys')).json()).keys.length)) === 0, '"not now": nothing saved');
    await ph.page.goto(`${preview.base}/studio?panel=pin`, { waitUntil: 'networkidle' });
    await ph.page.waitForFunction(() => window.__studio?.keys?.getState().ready === true, null, { timeout: 30000 });
    await ph.page.waitForTimeout(1500);
    check((await ph.page.locator('[data-testid=keys-offer]').count()) === 0, 'the offer is made once');
    await shot(ph.page, 'phone-picker-closed', outDir22);
    await openPicker(ph.page);
    await shot(ph.page, 'phone-picker-open', outDir22);
    await ph.page.getByTestId('key-add').click();
    await ph.page.waitForSelector('[data-testid=keys-add]');
    await ph.page.waitForTimeout(900);
    await ph.page.getByTestId('keys-provider').getByText('OpenAI').click();
    await ph.page.getByTestId('keys-key').fill(OAI);
    await ph.page.getByTestId('keys-model').fill('gpt-6-luna');
    await ph.page.waitForTimeout(300);
    await shot(ph.page, 'phone-add-key-sheet', outDir22);
    await ph.page.getByTestId('keys-save').click();
    await sheetGone(ph.page);
    await ph.page.waitForTimeout(600);
    check((await label(ph.page)) === 'OpenAI', `phone: the new key is in use (${await label(ph.page)})`);
    await turn(ph.page, '你好，手机上的 OpenAI 密钥');
    check(lastCall()?.provider === 'openai' && lastCall()?.authorization === `Bearer ${OAI}` && lastCall()?.model === 'gpt-6-luna', `phone: OpenAI's stand-in with the saved key and model (${lastCall()?.model})`);
    await openPicker(ph.page);
    await ph.page.getByTestId('key-edit-openai').click();
    await ph.page.waitForSelector('[data-testid=keys-edit]');
    await ph.page.waitForTimeout(900);
    await shot(ph.page, 'phone-saved-key-sheet', outDir22);
    await ph.page.getByTestId('keys-close').click();
    await sheetGone(ph.page);
    const w = await ph.page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    check(w[0] <= w[1], `phone: no horizontal scroll (${w[0]} <= ${w[1]})`);
    await ph.ctx.close();

    // No key in any record, log line or response the stub did not need.
    const exp = execFileSync(process.execPath, [resolve(here, 'turns-export.mjs'), '--local', '--persist-to', preview.state, '--out', join(preview.state, 'k.jsonl')], { cwd: appRoot, encoding: 'utf8' });
    const recs = readFileSync(join(preview.state, 'k.jsonl'), 'utf8');
    const own = recs.trim().split('\n').map((l) => JSON.parse(l)).filter((r) => r.ownKey);
    check(own.length >= 5 && ![OR, ANT, OAI].some((k) => recs.includes(k)), `turn records: ${own.length} with ownKey true, no key in any record (${exp.trim()})`);
    check(![OR, ANT, OAI].some((k) => preview.log.includes(k)), 'no key in the Worker log');
    stub.config.keys = [];
    preview.stop();
  }
} catch (e) {
  failures.push(`crashed: ${e.stack ?? e}`);
} finally {
  rmSync(devVars, { force: true });
  await browser.close();
  stub.close?.();
}

if (failures.length) {
  console.error(`\n${failures.length} account check(s) failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('\nAll account checks passed.');
process.exit(0);
