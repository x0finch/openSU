// End-to-end check of the AI assistant against a SCRIPTED STUB (no real
// model is called): the built app runs in the local Workers runtime
// (`vite preview` = workerd) with `/api/chat` relaying to scripts/chat-stub.mjs.
//
//   node scripts/chat-e2e.mjs            checks + screenshots -> artifacts/web/chat-*.png
//   node scripts/chat-e2e.mjs --smoke    checks only
//   node scripts/chat-e2e.mjs --only chat-repair,phone   (name prefixes)
//
// Requires a build (`pnpm --filter @opensu/web build`). The stub's
// credentials go into dist/server/.dev.vars (what `vite preview` reads); the
// file is removed afterwards.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scriptFor, STUB_KEY, STUB_MODEL, startStub } from './chat-stub.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, '..');
const repoRoot = resolve(appRoot, '../..');
const outDir = resolve(repoRoot, 'artifacts/web');
const devVars = resolve(appRoot, 'dist/server/.dev.vars');
const smoke = process.argv.includes('--smoke');
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

const failures = [];
const check = (cond, msg) => {
  if (!cond) failures.push(msg);
  console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${msg}`);
};

/** Starts `vite preview` with the given Worker variables; returns base URL, log and stop(). */
async function startPreview(vars) {
  if (vars) writeFileSync(devVars, Object.entries(vars).map(([k, v]) => `${k}='${v}'\n`).join(''));
  else rmSync(devVars, { force: true });
  const port = await freePort();
  const base = `http://localhost:${port}`;
  const proc = spawn(process.execPath, [resolve(appRoot, 'node_modules/vite/bin/vite.js'), 'preview', '--port', String(port), '--strictPort'], {
    cwd: appRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, CI: '1' },
  });
  const p = { base, log: '', stop: () => proc.kill('SIGTERM') };
  proc.stdout.on('data', (d) => (p.log += d));
  proc.stderr.on('data', (d) => (p.log += d));
  process.on('exit', p.stop);
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

const DESKTOP = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

const stub = await startStub();
console.log(`chat stub (scripted, not a model) on ${stub.url}`);
const browser = await playwright.chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'],
});

async function open(base, ctxOpts, path) {
  const ctx = await browser.newContext(ctxOpts);
  await ctx.addInitScript(() => localStorage.setItem('opensu.hints.v1', 'done'));
  const page = await ctx.newPage();
  page.on('pageerror', (e) => failures.push(`${path}: page error ${e.message}`));
  page.on('console', (m) => {
    // A refused relay call is logged by the browser as a failed resource; the UI handles it.
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) failures.push(`${path}: console error ${m.text()}`);
  });
  await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__studio?.ready3d === true, null, { timeout: 180000 });
  return { ctx, page };
}

async function shot(page, name) {
  if (smoke) return;
  const file = resolve(outDir, `${name}.png`);
  // Software GL on a busy machine can take long for one frame.
  await page.screenshot({ path: file, timeout: 180000 });
  console.log(`  -> ${file}`);
}

const settle = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

/** Downsampled canvas pixels of the 3D view. */
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

const pixelDiff = (a, b) => {
  let n = 0;
  for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 30) n++;
  return n / (a.length / 4);
};

/** Interior floor area as the studio shows it (m²). */
const shownArea = async (page) => {
  const t = await page.getByTestId('fact-area').first().textContent();
  return Number(/([\d.]+)/.exec(t ?? '')?.[1]);
};

const waitDone = (page, n) =>
  page.waitForFunction((k) => {
    const ms = [...document.querySelectorAll('[data-testid=assistant-message]')];
    return ms.length >= k && ms[k - 1].dataset.phase === 'done';
  }, n, { timeout: 60000 });
const waitGrown = (page) => page.waitForFunction(() => !window.__studio?.growing, null, { timeout: 30000 });

async function sendMessage(page, text) {
  const input = page.getByTestId('chat-input');
  await input.fill(text);
  await input.press('Enter');
}

const received = (script) => stub.received.filter((r) => r.script === script);

let preview = await startPreview({ OPENAI_API_KEY: STUB_KEY, OPENAI_BASE_URL: stub.url, OPENSU_MODEL: STUB_MODEL });
console.log(`preview (workerd) on ${preview.base}, Worker key -> stub`);

try {
  // --- Relay status -------------------------------------------------------
  {
    const r = await fetch(`${preview.base}/api/chat`);
    const text = await r.text();
    const s = JSON.parse(text);
    check(r.ok && s.serverKey === true && s.model === STUB_MODEL, `GET /api/chat reports the server key and model (${text})`);
    check(!text.includes(STUB_KEY), 'GET /api/chat does not reveal the key');
  }

  // --- Desktop: the main flow ---------------------------------------------
  if (wanted('chat-desktop') || wanted('chat-repair') || wanted('chat-error') || wanted('chat-settings') || wanted('chat-giveup') || wanted('chat-new')) {
    const { ctx, page } = await open(preview.base, DESKTOP, '/studio');
    // Focusing the prompt bar opens the conversation; the prompt moves into the panel with its focus.
    await page.getByTestId('prompt-bar').click();
    await page.waitForSelector('[data-testid=suggestions]');
    await page.waitForTimeout(300);
    check(await page.evaluate(() => document.activeElement?.dataset.testid === 'chat-input'), 'focusing the prompt bar opens the panel with the prompt focused');
    await shot(page, 'chat-empty-desktop');
    // The suggestion chips and the stub's scripted answers agree for T1 (task 014).
    const chips = async () => page.getByTestId('suggestions').getByRole('button').allTextContents();
    const zhChips = await chips();
    await page.evaluate(() => window.__studio.store.getState().setLang('en'));
    const enChips = await chips();
    await page.evaluate(() => window.__studio.store.getState().setLang('zh'));
    const expected = ['north-deeper', 'study-to-bedroom', 'roof-pitch', 'new-house'];
    check([zhChips, enChips].every((c) => c.length === 4 && c.every((t, i) => scriptFor(t) === expected[i])), `each suggestion chip has its own scripted answer (${zhChips.join(' / ')} | ${enChips.join(' / ')})`);

    const area0 = await shownArea(page);
    // Opening the panel re-frames the house (~0.4 s): wait until the camera has settled.
    await page.waitForTimeout(900);
    await settle(page);
    const px0 = await canvasPixels(page);

    // 1. "把北侧房间加深 600": text streams first, then the tool call is applied.
    stub.config.holdMs = 2500;
    stub.config.delay = 20;
    // The phases of the turn as the store goes through them (task 014: the indicator follows the phase).
    await page.evaluate(() => {
      window.__phases = [];
      window.__studio.chat.subscribe((st) => {
        const it = st.items.at(-1);
        if (it?.role === 'assistant') window.__phases.push({ phase: it.phase, summary: /改好了/.test(it.text), changes: it.changes?.length ?? 0 });
      });
    });
    await sendMessage(page, '把北侧房间加深 600');
    await page.waitForFunction(() => document.querySelector('[data-testid=assistant-message]')?.textContent?.includes('轴线 F'), null, { timeout: 30000 });
    const midText = await page.getByTestId('assistant-message').first().textContent();
    check(/北侧房间加深/.test(midText ?? '') && (await page.getByTestId('changes-card').count()) === 0, 'stream shows text before the tool call is applied');
    await shot(page, 'chat-streaming-desktop');
    stub.config.holdMs = 0;
    stub.config.delay = 8;
    // The grow transition runs right after the edit lands.
    await page.waitForFunction(() => window.__studio?.growing === true, null, { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(500);
    await shot(page, 'chat-grow-desktop');
    await waitDone(page, 1);
    await waitGrown(page);
    await settle(page);
    const phases = await page.evaluate(() => window.__phases);
    const order = phases.map((p) => p.phase).filter((p, i, a) => p !== a[i - 1]);
    check(phases.some((p) => p.phase === 'working') && phases.filter((p) => p.summary && p.phase !== 'done').every((p) => p.phase === 'writing') && phases.some((p) => p.summary && p.phase === 'writing'),
      `the indicator follows the phase: ${order.join(' -> ')} (writing while the summary streams)`);
    check((await page.getByTestId('chat-panel').locator('[role=status]').count()) === 0, 'the working indicator is gone when the reply completes');
    const area1 = await shownArea(page);
    const px1 = await canvasPixels(page);
    check(Math.abs(area1 - area0 - 13.3) < 0.15, `edit applied: interior area ${area0} -> ${area1} m² (+13.3 expected)`);
    const d01 = pixelDiff(px0, px1);
    check(d01 > 0.005, `3D view changed after the edit (${(d01 * 100).toFixed(1)}% pixels differ)`);
    const card = page.getByTestId('changes-card').first();
    check((await card.textContent())?.includes('北侧房间加深 600 mm'), 'changes card lists the edit in plain language');
    await page.waitForTimeout(200);
    await shot(page, 'chat-changes-desktop');

    // 2. Undo restores the house.
    await card.getByRole('button', { name: '撤销' }).click();
    await waitGrown(page);
    await page.waitForTimeout(300);
    await settle(page);
    const area2 = await shownArea(page);
    const px2 = await canvasPixels(page);
    const d02 = pixelDiff(px0, px2);
    check(area2 === area0, `undo restores the area (${area2} m²)`);
    check(d02 < 0.002, `undo restores the 3D view (${(d02 * 100).toFixed(2)}% pixels differ from before)`);
    check((await card.getByRole('button', { name: '恢复' }).count()) === 1, 'undone card offers redo');

    // 3. A bad edit followed by a repair round.
    await sendMessage(page, '二楼起居室改成卧室');
    await waitDone(page, 2);
    await waitGrown(page);
    const rep = received('study-to-bedroom');
    const firstResult = rep[1]?.toolResults?.[0] ?? '';
    check(rep.length === 3, `repair: 3 model calls (edit, repair, reply): ${rep.length}`);
    check(/"ok":false/.test(firstResult) && /l2-family/.test(firstResult), 'repair: the rejected batch went back with errors naming the right id');
    const msg2 = page.getByTestId('assistant-message').nth(1);
    check((await msg2.textContent())?.includes('二楼起居室已改成卧室'), 'repair: final reply shown');
    check((await msg2.getByTestId('changes-card').count()) === 1, 'repair: one changes card for the repaired edit');
    await page.waitForTimeout(200);
    await shot(page, 'chat-repair-desktop');

    // 4. Upstream error (HTTP 429 from the provider, passed through the relay).
    await sendMessage(page, '限流测试');
    await waitDone(page, 3);
    const msg3 = page.getByTestId('assistant-message').nth(2);
    check((await msg3.textContent())?.includes('请求太频繁'), 'rate limit: calm inline message');
    check((await msg3.getByRole('button', { name: '重试' }).count()) === 1, 'rate limit: retry offered');
    await shot(page, 'chat-error-desktop');

    // 5. Give up after 3 repair rounds; the house stays valid.
    const areaBefore = await shownArea(page);
    await sendMessage(page, '在客厅南墙开一扇 9 米的门');
    await waitDone(page, 4);
    check(received('give-up').length === 4, `give-up: stops after 1 attempt + 3 repairs (${received('give-up').length} model calls)`);
    const giveUpText = (await page.getByTestId('assistant-message').nth(3).textContent()) ?? '';
    check(giveUpText.includes('没能做成') && !/"[a-z0-9]+-[a-z0-9-]+"/.test(giveUpText), 'give-up: the user is told plainly (no raw validator text or ids)');
    check((await page.getByTestId('assistant-message').nth(3).getByRole('button', { name: '重试' }).count()) === 0, 'give-up: no retry (the same words would fail again)');
    check((await shownArea(page)) === areaBefore, 'give-up: the house is unchanged');
    await shot(page, 'chat-giveup-desktop');

    // 6. Settings sheet.
    await page.getByTestId('chat-settings').click();
    await page.waitForSelector('[data-testid=settings-sheet]');
    await page.getByTestId('settings-own').check({ force: true });
    await page.waitForTimeout(250);
    await shot(page, 'chat-settings-desktop');

    // 7. Bring your own key: the browser sends it in a header to /api/chat
    // (intercepted here: the relay would forward it to a real provider).
    await page.getByTestId('settings-key').fill('sk-test-byo-not-real');
    await page.getByTestId('settings-save').click();
    await page.waitForSelector('[data-testid=settings-sheet]', { state: 'detached' });
    const byo = [];
    await page.route('**/api/chat', (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      byo.push({ headers: route.request().headers(), url: route.request().url() });
      return route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: { message: 'Invalid API key (intercepted)' } }) });
    });
    await sendMessage(page, '你好');
    await waitDone(page, 5);
    check(byo.length === 1 && byo[0].headers['x-opensu-key'] === 'sk-test-byo-not-real' && byo[0].headers['x-opensu-base-url'] === 'https://openrouter.ai/api/v1', 'BYO: the key goes in a request header to /api/chat');
    check(!byo[0]?.url.includes('sk-test'), 'BYO: the key is not in the URL');
    const stored = await page.evaluate(() => localStorage.getItem('opensu.ai') ?? '');
    check(stored.includes('sk-test-byo-not-real'), 'BYO: the key is stored in this browser (localStorage)');
    check((await page.getByTestId('assistant-message').nth(4).textContent())?.includes('拒绝了这个密钥'), 'BYO: a refused key gets a calm message');
    await shot(page, 'chat-auth-error-desktop');
    await page.unroute('**/api/chat');
    await page.getByTestId('chat-settings').click();
    await page.getByRole('button', { name: '清除我的密钥' }).click();
    await page.getByRole('button', { name: '完成' }).click();
    check(!(await page.evaluate(() => localStorage.getItem('opensu.ai') ?? '')).includes('sk-test'), 'BYO: clearing removes the key');

    // 8. A new house plays the full grow.
    await sendMessage(page, '重新开始一栋新房子');
    await page.waitForFunction(() => window.__studio?.growing === true, null, { timeout: 30000 });
    await page.waitForTimeout(700);
    await shot(page, 'chat-new-house-grow-desktop');
    await waitDone(page, 6);
    await waitGrown(page);

    // 8b. Where the house is, said in a sentence: find_place (the built-in
    //     list, no network) and then update_site with its answer.
    await sendMessage(page, '我家在成都，房子朝南偏东 15 度');
    await waitDone(page, 7);
    const placeCalls = received('place');
    const site = await page.evaluate(() => window.__studio.store.getState().house.site);
    check(placeCalls.length === 3 && placeCalls[0].tools.includes('find_place'), `place: the model is offered find_place and the turn takes 3 calls (${placeCalls.length})`);
    check(/"matches":\[\{"name":"成都市"/.test(placeCalls[1]?.toolResults?.[0] ?? ''), 'place: find_place answers with Chengdu from the built-in list');
    check(site.latitude === 30.66 && site.longitude === 104.06 && site.timeZone === 'Asia/Shanghai' && site.northDeg === 15 && site.placeName === '成都', `place: the site is set by update_site (${JSON.stringify(site)})`);
    await page.getByTestId('chat-collapse').click();
    await page.getByTestId('bar-sun').click();
    check((await page.getByTestId('sun-place').textContent())?.includes('成都') && (await page.getByTestId('sun-orientation').textContent())?.includes('南偏东 15°'), 'place: the sun tray shows the new place and orientation');
    await page.waitForTimeout(300);
    await shot(page, 'chat-place-desktop');
    await page.keyboard.press('Escape');
    await page.evaluate(() => window.__studio.store.getState().setSun({ on: false }));

    // 9. Walk through the house the assistant just made: the walk button
    //    tucks the chat away and starts at the new house's entrance.
    // After a change the bar sums it up; its line opens the conversation again.
    await page.getByTestId('bar-summary').getByRole('button', { name: '展开对话' }).click();
    await page.getByTestId('bar-walk').click();
    await page.waitForFunction(() => window.__studio?.engine?.viewer?.walking === true, null, { timeout: 30000 });
    await page.waitForTimeout(400);
    check((await page.getByTestId('chat-panel').count()) === 0, 'walk mode tucks the chat panel away');
    const walk = await page.evaluate(() => {
      const v = window.__studio.engine.viewer;
      const s0 = v.walkState;
      const start = v.walkArrivals[0];
      v.walk.step(0.6);
      const s1 = v.walkState;
      return { s0, s1, start };
    });
    const atStart = walk.start && Math.hypot(walk.s0.x - walk.start.position[0], walk.s0.y - walk.start.position[1]) < 0.5;
    check(atStart && Math.hypot(walk.s1.x - walk.s0.x, walk.s1.y - walk.s0.y) > 0.3, `walk follows the edited house: starts at its entrance and moves (${JSON.stringify(walk.s0)})`);
    await settle(page);
    await shot(page, 'chat-walk-after-edit-desktop');
    await page.getByTestId('bar-summary').getByRole('button', { name: '展开对话' }).click();
    await page.waitForTimeout(500);
    check((await page.evaluate(() => window.__studio.engine.viewer.walking)) === false, 'opening the assistant ends the walk');
    await ctx.close();
  }

  // --- Undo survives a reload (task 014) --------------------------------------
  if (wanted('chat-reload')) {
    const { ctx, page } = await open(preview.base, DESKTOP, '/studio');
    const area0 = await shownArea(page);
    await page.getByTestId('prompt-bar').click();
    await sendMessage(page, '把北侧房间加深 600');
    await waitDone(page, 1);
    await waitGrown(page);
    await page.getByTestId('chat-collapse').click();
    // Autosave runs ~0.6 s after the last change.
    await page.waitForTimeout(1200);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('opensu.autosave.v1') ?? '{}').history ?? null);
    check(saved?.undo?.length === 1 && saved.redo.length === 0, `the undo history is autosaved (${saved?.undo?.length ?? 0} undo step)`);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__studio?.ready3d === true, null, { timeout: 180000 });
    const area1 = await shownArea(page);
    const undo = page.getByTestId('bar-summary').getByRole('button', { name: '撤销' });
    check(Math.abs(area1 - area0 - 13.3) < 0.15 && (await undo.count()) === 1, `after a reload the bar still offers undo (${area0} -> ${area1} m²)`);
    await shot(page, 'chat-reload-undo-desktop');
    await undo.click();
    await page.waitForFunction((a) => document.querySelector('[data-testid=fact-area]')?.textContent?.startsWith(String(a)), area0, { timeout: 30000 });
    check(true, `undo after the reload restores the house (${area0} m²)`);
    const redo = page.getByTestId('bar-summary').getByRole('button', { name: '恢复' });
    check((await redo.count()) === 1, 'and offers redo');
    await page.waitForTimeout(1200);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__studio?.ready3d === true, null, { timeout: 180000 });
    await page.getByTestId('bar-summary').getByRole('button', { name: '恢复' }).click();
    await page.waitForFunction((a) => !document.querySelector('[data-testid=fact-area]')?.textContent?.startsWith(String(a)), area0, { timeout: 30000 });
    check(Math.abs((await shownArea(page)) - area1) < 0.05, 'redo survives a reload too');
    await ctx.close();
  }

  // --- Phone ---------------------------------------------------------------
  if (wanted('chat-phone')) {
    const { ctx, page } = await open(preview.base, PHONE, '/studio');
    // The prompt bar stays the input; the conversation opens as a sheet above it.
    await page.getByTestId('prompt-bar').click();
    await page.waitForSelector('[data-testid=suggestions]');
    await page.waitForTimeout(300);
    await shot(page, 'chat-phone-empty');
    stub.config.holdMs = 2500;
    stub.config.delay = 20;
    await page.getByTestId('suggestions').getByRole('button').first().click();
    await page.waitForSelector('[data-testid=chat-panel]', { state: 'detached', timeout: 5000 });
    check(true, 'phone: sending folds the conversation back into the bar');
    await page.waitForTimeout(1200);
    check((await page.getByTestId('bar-summary').locator('[role=status]').count()) === 1, 'phone: the bar shows the progress of the turn');
    await shot(page, 'chat-phone-streaming');
    stub.config.holdMs = 0;
    stub.config.delay = 8;
    await page.waitForFunction(() => window.__studio?.growing === true, null, { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(500);
    await shot(page, 'chat-phone-grow');
    await waitGrown(page);
    await page.waitForFunction(() => !document.querySelector('[data-testid=bar-summary] [role=status]'), null, { timeout: 30000 });
    await page.waitForTimeout(300);
    check((await page.getByTestId('bar-summary').getByRole('button', { name: '撤销' }).count()) === 1, 'phone: the bar sums up the last change with undo');
    await shot(page, 'chat-phone-bar');
    await page.getByRole('button', { name: '展开对话' }).first().click();
    await page.waitForTimeout(400);
    await shot(page, 'chat-phone-changes');
    await page.getByTestId('prompt-bar').fill('限流测试');
    await page.getByTestId('prompt-bar').press('Enter');
    await page.waitForTimeout(1500);
    await page.getByRole('button', { name: '展开对话' }).first().click();
    await page.waitForTimeout(400);
    await shot(page, 'chat-phone-error');
    await page.getByTestId('chat-settings').click();
    await page.waitForSelector('[data-testid=settings-sheet]');
    await page.waitForTimeout(250);
    await shot(page, 'chat-phone-settings');
    const w = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    check(w[0] <= w[1], `phone: no horizontal scroll (${w[0]} <= ${w[1]})`);
    await ctx.close();
  }

  // --- What reached the provider ---------------------------------------------
  {
    const all = stub.received;
    check(all.length > 0 && all.every((r) => r.authorization === `Bearer ${STUB_KEY}`), `every upstream call carries the server key (${all.length} calls)`);
    check(all.every((r) => r.model === STUB_MODEL && r.stream === true), 'the relay sets the configured model and stream: true');
    check(all.every((r) => !r.headers.includes('x-opensu-key') && !r.headers.includes('cookie')), 'no browser headers (cookies, BYO header) reach the provider');
    const sys = all.map((r) => r.messages.filter((m) => m.role === 'system').length);
    check(sys.every((n) => n === 1), 'one system message per call (prompt + house description, once per turn)');
    const maxBytes = Math.max(...all.map((r) => r.bytes));
    console.log(`  largest request body ${(maxBytes / 1024).toFixed(1)} KB`);
    check(!preview.log.includes(STUB_KEY), 'the key never appears in the Worker log');
  }
  preview.stop();

  // --- No key configured ---------------------------------------------------
  if (wanted('chat-nokey')) {
    preview = await startPreview(null);
    const s = await (await fetch(`${preview.base}/api/chat`)).json();
    check(s.serverKey === false, 'without a key the relay says so');
    const { ctx, page } = await open(preview.base, DESKTOP, '/studio');
    await page.getByTestId('prompt-bar').click();
    await sendMessage(page, '把北侧房间加深 600');
    await waitDone(page, 1);
    const t = await page.getByTestId('assistant-message').first().textContent();
    check(t?.includes('还没有配置 AI 密钥') && (await page.getByRole('button', { name: '打开设置' }).count()) === 1, 'no key: calm message with a way to add one');
    await shot(page, 'chat-nokey-desktop');
    await ctx.close();
    preview.stop();
  }
} finally {
  await browser.close();
  preview.stop();
  await stub.close();
  rmSync(devVars, { force: true });
}

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('\nAll chat checks passed (against the scripted stub; no real model was called).');
