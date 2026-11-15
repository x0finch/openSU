// End-to-end check of accounts and the daily quota (task 019), and of the
// saved conversation turns and the conversation export (task 020), against the
// SCRIPTED chat stub (no real model, no email, no network beyond
// localhost): the built app in workerd (`vite preview`) with a fresh local
// D1 (migrations applied with wrangler), sign-in codes read from the
// localhost-only test hook.
//
//   node scripts/account-e2e.mjs            checks + screenshots -> artifacts/task019/*.png, artifacts/task020/*.png
//   node scripts/account-e2e.mjs --smoke    checks only
//   node scripts/account-e2e.mjs --only desktop,phone,limits,turns
//
// Requires a build (`pnpm --filter @opensu/web build`).
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STUB_KEY, STUB_MODEL, startStub } from './chat-stub.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, '..');
const outDir = resolve(appRoot, '../../artifacts/task019');
const outDir20 = resolve(appRoot, '../../artifacts/task020');
const devVars = resolve(appRoot, 'dist/server/.dev.vars');
const smoke = process.argv.includes('--smoke');
const onlyArg = process.argv.indexOf('--only');
const only = onlyArg > 0 ? process.argv[onlyArg + 1].split(',') : null;
const wanted = (name) => !only || only.some((o) => name.startsWith(o));
mkdirSync(outDir, { recursive: true });
mkdirSync(outDir20, { recursive: true });

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
    env: { ...process.env, CI: '1', OPENSU_STATE: state },
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

    check(((await page.getByTestId('quota-left').textContent()) ?? '').includes('3'), 'the input shows 3 left (3 or fewer)');
    await page.getByTestId('prompt-bar').fill('');
    await shot(page, 'desktop-remaining-3');
    for (let i = 1; i <= 3; i++) await turn(page, `你好 ${i}`);
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
    check(((await page.getByTestId('menu-account').textContent()) ?? '').includes('reader@example.com') && (await page.getByTestId('menu-signout').count()) === 1, 'the menu shows the email and sign out');
    await shot(page, 'desktop-menu-account');
    await closeMenu(page);
    await page.getByTestId('prompt-bar').fill('');
    for (let i = 1; i <= 10; i++) {
      await turn(page, `你好 ${i}`);
      if (i === 7) {
        const left = await page.getByTestId('quota-left').textContent();
        check((left ?? '').includes('3'), `the hint appears at 3 left (${left})`);
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
    await page.getByTestId('menu-signout').click();
    await page.waitForFunction(() => window.__studio.chat.getState().server?.user === null, null, { timeout: 10000 });
    check((await quota(page))?.kind === 'anon', 'signed out: anonymous again');
    await ctx.close();
    preview.stop();
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
    check(((await page.getByTestId('quota-left').textContent()) ?? '').includes('1'), 'phone: the input shows 1 left');
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
