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
//   node scripts/account-e2e.mjs            checks + screenshots -> artifacts/task019/*.png, artifacts/task020/*.png, artifacts/task022/*.png, artifacts/task026/*.png
//   node scripts/account-e2e.mjs --smoke    checks only
//   node scripts/account-e2e.mjs --only desktop,phone,limits,turns,keys,entry,canonical
//
// `canonical` (task 026): the built app as production serves it (static
// pages first, `assets.run_worker_first` for the page routes) answers a
// request on another host with a 308 to SITE_URL, pages included.
//
// And of the account entry (task 026, `entry`): the account button signed
// out and signed in, the account menu, `?signin=1`, the landing's links,
// nothing when sign-in is off; screenshots -> artifacts/task026/*.png.
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
const outDir26 = resolve(appRoot, '../../artifacts/task026');
const devVars = resolve(appRoot, 'dist/server/.dev.vars');
const smoke = process.argv.includes('--smoke');
const onlyArg = process.argv.indexOf('--only');
const only = onlyArg > 0 ? process.argv[onlyArg + 1].split(',') : null;
const wanted = (name) => !only || only.some((o) => name.startsWith(o));
mkdirSync(outDir, { recursive: true });
mkdirSync(outDir20, { recursive: true });
mkdirSync(outDir22, { recursive: true });
mkdirSync(outDir26, { recursive: true });

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

async function open(base, ctxOpts, path = '/studio') {
  const ctx = await browser.newContext(ctxOpts);
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

  // --- The account entry (task 026) -----------------------------------------
  if (wanted('entry')) {
    const preview = await startPreview();
    console.log(`entry: preview on ${preview.base}`);
    const box = (page, sel) => page.locator(sel).first().evaluate((e) => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; });
    const state = (page) => page.getByTestId('account-button').getAttribute('data-state');
    const framing = (page) => page.evaluate(() => JSON.stringify(window.__studio.engine?.viewer.framedInsets ?? null));
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
    const waitButton = (page) => page.waitForSelector('[data-testid=account-button]', { timeout: 20000 });
    let n = 0;
    const desktops = smoke ? [['1440x900', 1440, 900, 'zh']] : [1440, 1280].flatMap((w) => ['zh', 'en'].map((lang) => [`${w}x${w === 1440 ? 900 : 720}`, w, w === 1440 ? 900 : 720, lang]));
    for (const [vp, w, h, lang] of desktops) {
      const tag = `${vp}-${lang}`;
      const { ctx, page } = await open(preview.base, { ...DESKTOP, viewport: { width: w, height: h } }, `/studio?lang=${lang}`);
      await waitButton(page);
      await page.waitForTimeout(600);
      const signInWord = lang === 'zh' ? '登录' : 'Sign in';
      const btn = await box(page, '[data-testid=account-button]');
      const glass = await box(page, '[data-account-button]').then(() => page.getByTestId('account-button').evaluate((e) => { const r = e.closest('.lg').getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; }));
      const bar = await box(page, '[data-testid=toolbar]');
      check((await state(page)) === 'signed-out' && ((await page.getByTestId('account-button').textContent()) ?? '').trim() === signInWord, `${tag}: signed out, the account button reads "${signInWord}"`);
      check(Math.abs(glass.h - bar.h) <= 0.5 && Math.abs((glass.t + glass.b) / 2 - (bar.t + bar.b) / 2) <= 1, `${tag}: the button and the toolbar share one height and one centre line (${glass.h} / ${bar.h})`);
      check(Math.abs(glass.l - bar.r - 8) <= 1 && Math.abs(w - 18 - glass.r) <= 1, `${tag}: the module's gap between toolbar and button (${(glass.l - bar.r).toFixed(1)} px), 18 from the edge`);
      check(btn.h >= 28 && btn.w >= 28, `${tag}: hit target ${btn.w.toFixed(0)} x ${btn.h.toFixed(0)}`);
      const oneLine = await page.getByTestId('account-button').evaluate((e) => e.scrollWidth <= e.clientWidth + 0.5 && e.getBoundingClientRect().height <= 48.5);
      check(oneLine, `${tag}: the label does not wrap or clip`);
      await shot(page, `${tag}-signed-out`, outDir26);
      // Sign in from the button: the sign-in surface at the button.
      const f0 = await framing(page);
      await page.getByTestId('account-button').click();
      await page.waitForSelector('[data-testid=signin-sheet]');
      await page.waitForTimeout(900);
      const pop = await box(page, '[data-testid=signin-sheet]');
      check(Math.abs(pop.t - glass.b - 8) <= 1.5 && Math.abs(pop.r - glass.r) <= 1.5, `${tag}: sign-in stands at the button, the module's gap under it, right edges aligned (gap ${(pop.t - glass.b).toFixed(1)}, right ${(pop.r - glass.r).toFixed(1)})`);
      check((await framing(page)) === f0, `${tag}: the house does not move when sign-in opens`);
      await shot(page, `${tag}-signin-open`, outDir26);
      await quickSignIn(page, `entry${++n}@example.com`);
      await page.waitForFunction(() => document.querySelector('[data-testid=account-button]')?.getAttribute('data-state') === 'signed-in');
      const toast = ((await page.getByTestId('account-toast').textContent({ timeout: 3000 }).catch(() => '')) ?? '').trim();
      check(toast === (lang === 'zh' ? `已登录 · entry${n}@example.com` : `Signed in · entry${n}@example.com`), `${tag}: after sign-in the button is the avatar and one short confirmation shows (${toast})`);
      const letter = ((await page.getByTestId('account-letter').textContent().catch(() => '')) ?? '').trim();
      check(letter === 'E', `${tag}: no picture: the first letter on a plate (${letter})`);
      const glass2 = await page.getByTestId('account-button').evaluate((e) => { const r = e.closest('.lg').getBoundingClientRect(); return { w: r.width, h: r.height, r: r.right, b: r.bottom, t: r.top }; });
      check(Math.abs(glass2.w - 48) <= 0.5 && Math.abs(glass2.h - 48) <= 0.5, `${tag}: signed in, a 48 px circle (${glass2.w} x ${glass2.h})`);
      // The avatar appeared under the resting pointer and got focus back from the closing surface: no tooltip (hover or keyboard focus only).
      const tipOpacity = () => page.getByTestId('account-button').evaluate((e) => Number(getComputedStyle(e.closest('.lg-tipped').querySelector(':scope > .lg-tip')).opacity));
      await page.waitForTimeout(700);
      const focusedBack = await page.evaluate(() => document.activeElement?.getAttribute('data-testid') === 'account-button');
      check(focusedBack && (await tipOpacity()) === 0, `${tag}: after sign-in focus is back on the avatar, and no tooltip shows from that (opacity ${await tipOpacity()})`);
      await shot(page, `${tag}-signed-in-toast`, outDir26);
      await page.waitForSelector('[data-testid=account-toast]', { state: 'detached', timeout: 6000 });
      await page.mouse.move(Math.round(w / 2), Math.round(h / 2));
      await page.waitForTimeout(300);
      await shot(page, `${tag}-signed-in`, outDir26);
      // Tooltip on hover (desktop): its own plate.
      await page.getByTestId('account-button').hover();
      await page.waitForTimeout(700);
      check((await tipOpacity()) === 1, `${tag}: hovering the avatar shows its tooltip`);
      await shot(page, `${tag}-signed-in-tooltip`, outDir26);
      // Keyboard focus (Tab from the toolbar) shows it too.
      await page.mouse.move(Math.round(w / 2), Math.round(h / 2));
      await page.getByTestId('bar-walk').focus();
      await page.keyboard.press('Tab');
      await page.waitForTimeout(500);
      const tabbed = await page.evaluate(() => document.activeElement?.getAttribute('data-testid') === 'account-button');
      check(tabbed && (await tipOpacity()) === 1, `${tag}: Tab onto the avatar shows its tooltip (${tabbed})`);
      await page.keyboard.press('Shift+Tab');
      await page.waitForTimeout(300);
      // The account menu: who, today's allowance, keys, sign out.
      await page.getByTestId('account-button').click();
      await page.waitForSelector('[data-testid=account-menu] [data-testid=account-signout]');
      await page.waitForTimeout(900);
      const menu = await box(page, '[data-testid=account-menu]');
      check(Math.abs(menu.t - glass2.b - 8) <= 1.5 && Math.abs(menu.r - glass2.r) <= 1.5, `${tag}: the account menu stands at the button (gap ${(menu.t - glass2.b).toFixed(1)})`);
      const allowance = ((await page.getByTestId('account-allowance').textContent().catch(() => '')) ?? '').trim();
      check(allowance.includes(lang === 'zh' ? '今天还剩 10 次' : '10 left today'), `${tag}: the menu shows today's allowance (${allowance})`);
      check(((await page.getByTestId('account-identity').textContent()) ?? '').includes(`entry${n}@example.com`) && (await page.getByTestId('account-keys').count()) === 1, `${tag}: the menu shows the email and "my keys"`);
      check((await framing(page)) === f0, `${tag}: the house does not move when the account menu opens`);
      await shot(page, `${tag}-account-menu`, outDir26);
      await page.keyboard.press('Escape');
      await page.waitForSelector('[data-testid=account-menu]', { state: 'detached', timeout: 5000 });
      // Walk mode: the button stays with the toolbar.
      await page.evaluate(() => window.__studio.store.getState().setWalk(true));
      await page.waitForTimeout(1500);
      const wb = await box(page, '[data-testid=account-button]');
      check(wb.w > 0, `${tag}: walking, the account button stays beside the toolbar`);
      await shot(page, `${tag}-walk`, outDir26);
      await page.evaluate(() => window.__studio.store.getState().setWalk(false));
      // Landing, signed in: "open the studio", no sign-in link.
      await page.goto(`${preview.base}/`, { waitUntil: 'networkidle' });
      await page.waitForSelector('[data-testid=landing-studio]');
      await page.waitForTimeout(400);
      check((await page.getByTestId('landing-signin').count()) === 0 && ((await page.getByTestId('landing-studio').textContent()) ?? '').trim() === (lang === 'zh' ? '打开工作台' : 'Open the studio'), `${tag}: landing signed in: "open the studio", no sign-in link`);
      await shot(page, `${tag}-landing-signed-in`, outDir26);
      // Second visit: until the status arrives the button's place is kept (the toolbar does not shift).
      await page.route('**/api/chat', async (route) => {
        if (route.request().method() === 'GET') await new Promise((r) => setTimeout(r, 2500));
        await route.continue();
      });
      await page.goto(`${preview.base}/studio`);
      await page.waitForSelector('[data-testid=toolbar]', { timeout: 60000 });
      const early = await page.evaluate(() => ({ status: !!window.__studio?.chat?.getState().server, reserve: !!document.querySelector('[data-testid=account-button-reserve]'), right: document.querySelector('[data-testid=toolbar]').getBoundingClientRect().right }));
      await waitButton(page);
      await page.waitForTimeout(300);
      const late = await box(page, '[data-testid=toolbar]');
      check(!early.status && early.reserve && Math.abs(early.right - late.r) <= 0.5, `${tag}: before the status arrives the button's place is reserved; the toolbar stays (${early.right} -> ${late.r})`);
      await page.unroute('**/api/chat');
      // Sign out from the menu: the capsule again.
      await page.goto(`${preview.base}/studio`, { waitUntil: 'networkidle' });
      await page.waitForFunction(() => window.__studio?.ready3d === true, null, { timeout: 180000 });
      await waitButton(page);
      await page.getByTestId('account-button').click();
      await page.getByTestId('account-signout').click();
      await page.waitForFunction(() => document.querySelector('[data-testid=account-button]')?.getAttribute('data-state') === 'signed-out', null, { timeout: 10000 });
      check(true, `${tag}: sign out from the account menu: the "sign in" capsule again`);
      // Landing, signed out: "sign in" left of the sample project link; it opens sign-in once.
      await page.goto(`${preview.base}/`, { waitUntil: 'networkidle' });
      await page.waitForSelector('[data-testid=landing-signin]');
      await page.waitForTimeout(400);
      const ls = await box(page, '[data-testid=landing-signin]');
      const lc = await box(page, '[data-testid=landing-studio]');
      check(ls.r <= lc.l + 0.5 && Math.abs(ls.t - lc.t) <= 0.5, `${tag}: landing signed out: "sign in" left of "${lang === 'zh' ? '打开示例项目' : 'Open the sample project'}"`);
      await shot(page, `${tag}-landing-signed-out`, outDir26);
      await page.getByTestId('landing-signin').click();
      await page.waitForURL(/\/studio/);
      await page.waitForSelector('[data-testid=signin-sheet]', { timeout: 60000 });
      check(!/signin=/.test(page.url()), `${tag}: ?signin=1 opens sign-in and leaves the address (${page.url()})`);
      await page.keyboard.press('Escape');
      await page.waitForSelector('[data-testid=signin-sheet]', { state: 'detached', timeout: 5000 });
      await page.waitForTimeout(1500);
      check((await page.getByTestId('signin-sheet').count()) === 0, `${tag}: ?signin=1 opens it once`);
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForFunction(() => window.__studio?.ready3d === true, null, { timeout: 180000 });
      await page.waitForTimeout(1200);
      check((await page.getByTestId('signin-sheet').count()) === 0, `${tag}: a reload does not open it again`);
      await ctx.close();
    }

    // Phone, upright and sideways.
    const phones = smoke ? [[390, 844, 'zh']] : [[390, 844, 'zh'], [844, 390, 'zh'], [390, 844, 'en']];
    for (const [w, h, lang] of phones) {
      const tag = `phone-${w}x${h}-${lang}`;
      const { ctx, page } = await open(preview.base, { ...PHONE, viewport: { width: w, height: h } }, `/studio?lang=${lang}`);
      await waitButton(page);
      await page.waitForTimeout(800);
      const hb = await box(page, 'header');
      const btn = await page.getByTestId('account-button').evaluate((e) => { const r = e.getBoundingClientRect(); const hit = getComputedStyle(e, '::after'); return { w: r.width, h: r.height, hitW: parseFloat(hit.width) || 0, hitH: parseFloat(hit.height) || 0 }; });
      check(Math.max(btn.h, btn.hitH) >= 44 && Math.max(btn.w, btn.hitW) >= 44, `${tag}: hit target ${Math.max(btn.w, btn.hitW)} x ${Math.max(btn.h, btn.hitH)}`);
      const sw = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
      check(sw[0] <= sw[1], `${tag}: no horizontal scroll`);
      console.log(`    ${tag}: header bottom ${hb.b.toFixed(0)} px, framing ${await framing(page)}`);
      await shot(page, `${tag}-signed-out`, outDir26);
      const f0 = await framing(page);
      await page.getByTestId('account-button').tap();
      await page.waitForSelector('[data-testid=signin-sheet]');
      await page.waitForTimeout(1200);
      check((await framing(page)) === f0, `${tag}: the house does not move when the sign-in sheet opens`);
      await shot(page, `${tag}-signin-open`, outDir26);
      await quickSignIn(page, `phone${++n}@example.com`);
      await page.waitForFunction(() => document.querySelector('[data-testid=account-button]')?.getAttribute('data-state') === 'signed-in');
      await page.waitForTimeout(600);
      await shot(page, `${tag}-signed-in-toast`, outDir26);
      await page.waitForSelector('[data-testid=account-toast]', { state: 'detached', timeout: 6000 });
      await page.waitForTimeout(300);
      check((await framing(page)) === f0, `${tag}: signing in does not move the house`);
      await shot(page, `${tag}-signed-in`, outDir26);
      await page.getByTestId('account-button').tap();
      await page.waitForSelector('[data-testid=account-menu] [data-testid=account-signout]');
      await page.waitForTimeout(1000);
      check((await framing(page)) === f0, `${tag}: the house does not move when the account menu opens`);
      await shot(page, `${tag}-account-menu`, outDir26);
      await page.getByTestId('account-signout').tap();
      await page.waitForFunction(() => document.querySelector('[data-testid=account-button]')?.getAttribute('data-state') === 'signed-out', null, { timeout: 10000 });
      if (w < h) {
        await page.evaluate(() => window.__studio.store.getState().setWalk(true));
        await page.waitForTimeout(1500);
        await shot(page, `${tag}-walk`, outDir26);
      }
      await ctx.close();
    }
    preview.stop();

    // Sign-in off: nothing of it is shown (studio, menu, landing; ?signin=1 is dropped).
    const off = await startPreview({ AUTH_ENABLED: 'false' });
    for (const [label, opts, path] of [['desktop', DESKTOP, '/studio?signin=1'], ['phone', PHONE, '/studio'], ['phone-sideways', { ...PHONE, viewport: { width: 844, height: 390 } }, '/studio']]) {
      const { ctx, page } = await open(off.base, opts, path);
      await page.waitForFunction(() => !!window.__studio.chat.getState().server, null, { timeout: 20000 });
      await page.waitForTimeout(1500);
      check((await page.getByTestId('account-button').count()) === 0 && (await page.getByTestId('signin-sheet').count()) === 0, `sign-in off (${label}): no account button, ?signin=1 opens nothing`);
      const hb = await box(page, label === 'desktop' ? '[data-testid=title-block]' : 'header');
      console.log(`    sign-in off (${label}): header bottom ${hb.b.toFixed(0)} px, framing ${await framing(page)}`);
      if (label === 'desktop') {
        check(!/signin=/.test(page.url()), 'sign-in off: ?signin=1 leaves the address too');
        await page.goto(`${off.base}/`, { waitUntil: 'networkidle' });
        await page.waitForTimeout(800);
        check((await page.getByTestId('landing-signin').count()) === 0, 'sign-in off: the landing has no sign-in link');
      } else await shot(page, `sign-in-off-${label}`, outDir26);
      await ctx.close();
    }
    off.stop();
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
    const ownCtx = await browser.newContext(DESKTOP);
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
        const ctx = await browser.newContext({ ...opts, locale: lang === 'zh' ? 'zh-CN' : 'en-US' });
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
      const ctx = await browser.newContext(opts);
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
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__studio?.keys?.getState().ready === true, null, { timeout: 20000 });
    check((await label(page)) === '免费额度', 'after a reload: still the free allowance');
    await openPicker(page);
    await page.getByTestId('key-anthropic').click();
    await page.waitForTimeout(800);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__studio?.keys?.getState().ready === true, null, { timeout: 20000 });
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
    const other = await browser.newContext(DESKTOP);
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
