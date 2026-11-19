// Task 031 evidence (not a test): every surface open at 1440x900 and at
// 390x844, side by side on one comparison sheet per viewport, with each
// surface's header, close box, inset, radius and gap measured; and frame
// strips (8 frames of the open and 8 of the close, CSS transitions slowed
// down through the DevTools protocol) of the views, sun, share and project
// menu surfaces on desktop and one sheet on the phone, with every frame's
// box checked against its anchor and the bar the anchor sits in.
//
//   pnpm --filter @opensu/web build
//   node scripts/surface-evidence.mjs            -> artifacts/task031/
//   node scripts/surface-evidence.mjs --only strips
//
// Needs ImageMagick (`montage`, `convert`) for the sheets and strips.
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STUB_KEY, STUB_MODEL, startStub } from './chat-stub.mjs';
import { tmo } from '../../../tools/e2e-timeouts.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, '..');
const out = resolve(appRoot, '../../artifacts/task031');
const raw = resolve(out, 'raw');
mkdirSync(raw, { recursive: true });
const onlyArg = process.argv.indexOf('--only');
const only = onlyArg > 0 ? process.argv[onlyArg + 1].split(',') : null;
const want = (n) => !only || only.includes(n);
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const devVars = resolve(appRoot, 'dist/server/.dev.vars');

const freePort = () =>
  new Promise((ok) => {
    const s = createServer();
    s.listen(0, () => {
      const { port } = s.address();
      s.close(() => ok(port));
    });
  });

const stub = await startStub();
const state = mkdtempSync(join(tmpdir(), 'opensu-evidence-'));
execFileSync(process.execPath, [resolve(appRoot, 'node_modules/wrangler/bin/wrangler.js'), 'd1', 'migrations', 'apply', 'DB', '--local', '--persist-to', state], { cwd: appRoot, stdio: 'pipe', env: { ...process.env, CI: '1' } });
const port = await freePort();
const base = `http://localhost:${port}`;
const vars = { OPENAI_API_KEY: STUB_KEY, OPENAI_BASE_URL: stub.url, OPENSU_MODEL: STUB_MODEL, SITE_URL: base, BETTER_AUTH_SECRET: 'evidence-secret-not-real-0123456789', AUTH_TEST_HOOK: '1', KEYS_SECRET: 'evidence-keys-secret-not-real-0123456789' };
writeFileSync(devVars, Object.entries(vars).map(([k, v]) => `${k}='${v}'\n`).join(''));
const server = spawn(process.execPath, [resolve(appRoot, 'node_modules/vite/bin/vite.js'), 'preview', '--port', String(port), '--strictPort'], { cwd: appRoot, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, CI: '1', OPENSU_STATE: state, OPENSU_ANY_HOST: '1' } });
let log = '';
server.stdout.on('data', (d) => (log += d));
server.stderr.on('data', (d) => (log += d));
const stop = () => {
  server.kill('SIGTERM');
  rmSync(state, { recursive: true, force: true });
  rmSync(devVars, { force: true });
  stub.close?.();
};
process.on('exit', stop);
for (let i = 0; ; i++) {
  try {
    if ((await fetch(`${base}/api/health`)).ok) break;
  } catch {
    /* not up yet */
  }
  if (i > 400) throw new Error(`preview did not start:\n${log}`);
  await new Promise((r) => setTimeout(r, 250));
}

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const WHERE = { timezoneId: 'Asia/Shanghai', locale: 'zh-CN' };
const DESKTOP = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, ...WHERE };
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, ...WHERE };

async function studio(opts, email) {
  const ctx = await browser.newContext(opts);
  await ctx.addInitScript(() => {
    localStorage.setItem('opensu.hints.v1', 'done');
    localStorage.setItem('opensu.toolnames.v1', 'done');
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(`  page error: ${e.message.split('\n')[0]}`));
  await page.goto(`${base}/studio?lang=zh&nohints`, { waitUntil: 'networkidle' });
  if (email) {
    await page.evaluate(async (e) => {
      const post = (p, b) => fetch(`/api/auth${p}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });
      await post('/email-otp/send-verification-otp', { email: e, type: 'sign-in' });
      const { code } = await (await fetch(`/api/auth-test/code?email=${encodeURIComponent(e)}`)).json();
      await post('/sign-in/email-otp', { email: e, otp: code });
    }, email);
    await page.goto(`${base}/studio?lang=zh&nohints`, { waitUntil: 'networkidle' });
  }
  await page.waitForFunction(() => window.__studio?.ready3d === true, null, { timeout: tmo(180000) });
  await page.waitForFunction(() => !!window.__studio?.chat?.getState().server, null, { timeout: tmo(30000) });
  await page.waitForTimeout(1500);
  return { ctx, page };
}

/** The open surface (desktop popover or menu, phone sheet) and what its parts measure. */
const measure = (page) =>
  page.evaluate(() => {
    const vis = (e) => {
      const r = e.getBoundingClientRect();
      if (r.width < 40 || r.height < 40) return false;
      for (let x = e; x && x.nodeType === 1; x = x.parentElement) if (getComputedStyle(x).visibility === 'hidden' || Number(getComputedStyle(x).opacity) < 0.5) return false;
      return true;
    };
    const s = [...document.querySelectorAll('[data-anchored][data-open], .lg-sheet[data-open]')].filter(vis).pop();
    if (!s) return null;
    const r = s.getBoundingClientRect();
    const panel = s.querySelector('.lg-panel');
    const title = panel?.querySelector('[data-panel-title]');
    const close = panel?.querySelector('[data-panel-close]');
    const cs = panel ? getComputedStyle(panel) : null;
    const ts = title ? getComputedStyle(title) : null;
    const cr = close?.getBoundingClientRect();
    const pr = panel?.getBoundingClientRect();
    return {
      role: s.getAttribute('role'),
      box: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) },
      radius: getComputedStyle(s).borderTopLeftRadius,
      title: ts ? `${ts.fontSize} ${ts.fontWeight}` : null,
      close: cr ? `${Math.round(cr.width)}x${Math.round(cr.height)} at ${Math.round(pr.right - cr.right)} px from the right, ${Math.round(cr.top - pr.top)} px from the top` : null,
      inset: cs ? `${cs.paddingTop} ${cs.paddingRight} ${cs.paddingBottom} ${cs.paddingLeft}` : null,
      gap: cs?.rowGap ?? null,
    };
  });

const rows = [];
async function capture(page, name, label, phone) {
  await page.waitForTimeout(600);
  // At rest: a surface opened from another one (share from the project menu) can still be sliding after a fixed pause.
  await page
    .waitForFunction(() => {
      const s = [...document.querySelectorAll('[data-anchored][data-open], .lg-sheet[data-open]')].pop();
      if (!s || s.getBoundingClientRect().height < 40) return false;
      const pop = s.closest('.lg-pop') ?? s;
      return !pop.hasAttribute('data-starting-style') && getComputedStyle(s).transform === 'none' && s.getAnimations({ subtree: true }).every((a) => a.playState !== 'running');
    }, null, { timeout: tmo(8000) })
    .catch(() => console.log(`  (${label}: not at rest after the wait; measured as it is)`));
  await page.waitForTimeout(300);
  const m = await measure(page);
  const file = resolve(raw, `${phone ? 'phone' : 'desktop'}-${name}.png`);
  if (m && !phone) {
    const pad = 24;
    const clip = { x: Math.max(0, m.box.x - pad), y: Math.max(0, m.box.y - pad - 60), width: Math.min(1440 - Math.max(0, m.box.x - pad), m.box.w + 2 * pad), height: Math.min(900 - Math.max(0, m.box.y - pad - 60), m.box.h + 2 * pad + 60) };
    await page.screenshot({ path: file, clip });
  } else await page.screenshot({ path: file });
  rows.push({ viewport: phone ? '390x844' : '1440x900', surface: label, ...(m ?? { missing: true }) });
  console.log(`  ${phone ? 'phone' : 'desktop'} ${label}: ${m ? `title ${m.title}, close ${m.close}, inset ${m.inset}, gap ${m.gap}, radius ${m.radius}, ${m.box.w}x${m.box.h}` : 'NOT FOUND'}`);
  return file;
}
const esc = async (page) => {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(900);
};

async function comparison(opts, phone) {
  const files = [];
  const labels = [];
  const add = async (page, name, label) => {
    files.push(await capture(page, name, label, phone));
    labels.push(label);
  };
  // Signed out.
  {
    const { ctx, page } = await studio(opts);
    for (const [t, l] of [['views', '视角 views'], ['levels', '楼层 levels'], ['sun', '日照 sun']]) {
      await page.getByTestId(`bar-${t}`).click();
      await add(page, t, l);
      if (phone) await page.getByTestId('panel-close').click();
      else await page.getByTestId(`bar-${t}`).click();
      await page.waitForTimeout(800);
    }
    if (phone) {
      await page.getByTestId('project-menu').click();
      await page.waitForTimeout(700);
      await page.getByTestId('menu-share').click();
    } else await page.locator('[data-share-button]').click();
    await add(page, 'share-out', '分享 share (signed out)');
    await esc(page);
    await page.getByTestId('project-menu').click();
    await add(page, 'project-menu', '项目菜单 project menu');
    await page.getByTestId('menu-signin').click();
    await add(page, 'signin', '登录 sign-in');
    await esc(page);
    await ctx.close();
  }
  // Signed in.
  {
    const { ctx, page } = await studio(opts, `evidence-${phone ? 'p' : 'd'}@example.com`);
    if (phone) {
      await page.getByTestId('project-menu').click();
      await page.waitForTimeout(700);
      await page.getByTestId('menu-share').click();
    } else await page.locator('[data-share-button]').click();
    await add(page, 'share-in', '分享 share (signed in)');
    await esc(page);
    await page.getByTestId('project-menu').click();
    await page.waitForTimeout(700);
    await page.getByTestId('menu-account').click();
    await add(page, 'account-menu', '账户菜单 account menu');
    await esc(page);
    await page.evaluate(() => window.__studio.keys.setState({ sheet: { mode: 'add' }, anchor: null, picker: null }));
    await add(page, 'keys', '密钥 keys');
    await esc(page);
    await ctx.close();
  }
  const sheet = resolve(out, `compare-${phone ? '390x844' : '1440x900'}.png`);
  const args = [];
  files.forEach((f, i) => args.push('-label', labels[i], f));
  execFileSync('montage', [...args, '-font', 'WenQuanYi-Zen-Hei', '-pointsize', phone ? '22' : '15', '-tile', phone ? '5x' : '4x', '-geometry', '+12+12', '-background', '#f2f2f2', sheet]);
  console.log(`  -> ${sheet}`);
}

/** Frame strips: 8 frames open, 8 close, transitions at `rate` of their speed. */
async function strip(page, name, open, close, phone) {
  // Forty times slower (a screenshot takes a second or two in software GL), same curves: the glass layer's motion numbers and Vaul's slide, overridden for this page.
  const rate = 0.025;
  await page.addStyleTag({ content: `[data-glass-tone] { --lg-pop-open: ${380 / rate}ms !important; --lg-pop-close: ${220 / rate}ms !important; } .lg.lg-sheet[data-vaul-drawer], [data-vaul-overlay] { animation-duration: ${500 / rate}ms !important; transition-duration: ${500 / rate}ms !important; }` });
  const frames = [];
  const sample = async (dir, k, total) => {
    const f = await page.evaluate(() => {
      const s = [...document.querySelectorAll('[data-anchored], [data-testid=phone-sheet]')].pop();
      if (!s) return null;
      const r = s.getBoundingClientRect();
      const a = s.__anchor?.();
      let ab = null, bar = null;
      if (a) {
        const ar = a.getBoundingClientRect();
        const b = a.closest('.lg[data-kind=control]');
        const br = b && b !== a ? b.getBoundingClientRect() : null;
        ab = { x: ar.left, y: ar.top, w: ar.width, h: ar.height };
        bar = br ? { x: br.left, y: br.top, w: br.width, h: br.height } : null;
      }
      const g = window.__glass?.shapeOf?.(s);
      const op = Number(getComputedStyle(s).opacity);
      window.__studio?.glass?.kick?.();
      return { b: { x: r.left, y: r.top, w: r.width, h: r.height }, glass: g ? { x: g.x, y: g.y, w: g.width, h: g.height } : null, ab, bar, op };
    });
    const file = resolve(raw, `strip-${name}-${dir}-${k}.png`);
    await page.screenshot({ path: file, clip: phone ? undefined : { x: 0, y: 0, width: 1440, height: 560 } });
    frames.push({ dir, k, file, f });
    return f;
  };
  const run = async (dir, act, ms) => {
    await act();
    const t0 = Date.now();
    for (let k = 0; k < 8; k++) {
      const due = t0 + (k / 7) * (ms / rate);
      const wait = due - Date.now();
      if (wait > 0) await page.waitForTimeout(wait);
      await sample(dir, k);
    }
    await page.waitForTimeout(ms / rate * 0.3);
  };
  await run('open', open, phone ? 500 : 380);
  await run('close', close, phone ? 500 : 220);
  await page.waitForTimeout(1500);
  await page.evaluate(() => document.querySelectorAll('style').forEach((x) => x.textContent.includes('--lg-pop-open:') && x.remove()));
  // Checks: on no frame is the surface over its anchor or the anchor's bar; its edge nearest the anchor stays within
  // the module's gap (8 px) of where it rests (it grows away, it does not slide across).
  const opened = frames.filter((x) => x.dir === 'open' && x.f);
  const rest = opened.at(-1)?.f?.b;
  const bad = [];
  for (const { dir, k, f } of frames) {
    if (!f || f.op < 0.02) continue;
    for (const box of [f.b, f.glass].filter(Boolean)) {
      for (const k2 of [f.ab, f.bar].filter(Boolean)) {
        if (box.x < k2.x + k2.w - 0.5 && box.x + box.w > k2.x + 0.5 && box.y < k2.y + k2.h - 0.5 && box.y + box.h > k2.y + 0.5) bad.push(`${dir} ${k}: over its anchor or bar`);
      }
      if (rest && f.ab && !phone) {
        const below = rest.y >= f.ab.y + f.ab.h - 2;
        const drift = below ? Math.abs(box.y - rest.y) : Math.abs(box.y + box.h - (rest.y + rest.h));
        if (drift > 9.5) bad.push(`${dir} ${k}: its anchor-side edge is ${drift.toFixed(1)} px from where it rests`);
      }
    }
  }
  const order = ['open', 'close'];
  const files = order.flatMap((d) => frames.filter((x) => x.dir === d).map((x) => x.file));
  const crop = phone ? [] : ['-crop', '560x520+880+0'];
  const tiles = files.map((f, i) => {
    const t = resolve(raw, `tile-${name}-${i}.png`);
    const fr = frames.find((x) => x.file === f);
    const box = fr?.f?.b;
    const label = `${fr.dir} ${fr.k + 1}/8${box ? ` y ${Math.round(box.y)} h ${Math.round(box.h)} a ${fr.f.op.toFixed(2)}` : ' (gone)'}`;
    const cx = phone ? [] : name === 'project-menu' || name === 'share' ? ['-crop', '560x520+0+0'] : crop;
    execFileSync('convert', [f, ...cx, '+repage', ...(phone ? ['-resize', '50%'] : []), '-gravity', 'South', '-background', '#f2f2f2', '-splice', '0x22', '-font', 'DejaVu-Sans', '-pointsize', '14', '-annotate', '+0+3', label, t]);
    return t;
  });
  const file = resolve(out, `strip-${name}.png`);
  execFileSync('montage', [...tiles, '-tile', '8x2', '-geometry', '+4+4', '-background', '#f2f2f2', file]);
  console.log(`  -> ${file}: ${bad.length ? `FAIL ${bad.slice(0, 4).join('; ')}` : 'ok: no frame over the anchor or its bar; it grows away from the anchor'}`);
  writeFileSync(resolve(raw, `strip-${name}.json`), JSON.stringify(frames.map(({ dir, k, f }) => ({ dir, k, ...f })), null, 1));
  return bad;
}

async function strips() {
  {
    const { ctx, page } = await studio(DESKTOP);
    await strip(page, 'views', () => page.getByTestId('bar-views').click(), () => page.getByTestId('bar-views').click());
    await page.waitForTimeout(800);
    await strip(page, 'sun', () => page.getByTestId('bar-sun').click(), () => page.getByTestId('bar-sun').click());
    await page.waitForTimeout(800);
    await strip(page, 'share', () => page.locator('[data-share-button]').click(), () => page.keyboard.press('Escape'));
    await page.waitForTimeout(800);
    await strip(page, 'project-menu', () => page.getByTestId('project-menu').click(), () => page.keyboard.press('Escape'));
    await ctx.close();
  }
  {
    const { ctx, page } = await studio(PHONE);
    await strip(page, 'phone-views-sheet', () => page.getByTestId('bar-views').click(), () => page.getByTestId('panel-close').click(), true);
    await ctx.close();
  }
}

try {
  if (want('compare')) {
    await comparison(DESKTOP, false);
    await comparison(PHONE, true);
    writeFileSync(resolve(out, 'surfaces.json'), JSON.stringify(rows, null, 1));
  }
  if (want('strips')) await strips();
  if (only?.includes('probe-menu')) {
    // Task 032: the project menu signed out (fresh, after an edit, the template question) and signed in.
    const shot = async (page, name) => {
      await page.waitForTimeout(700);
      const b = await page.getByTestId('project-menu-list').boundingBox();
      await page.screenshot({ path: resolve(out, `menu-${name}.png`), clip: { x: 0, y: 0, width: Math.min(1440, (b?.x ?? 0) + (b?.width ?? 400) + 40), height: Math.min(900, (b?.y ?? 0) + (b?.height ?? 500) + 30) } });
      console.log(`  -> menu-${name}.png`);
    };
    const { ctx, page } = await studio(DESKTOP);
    await page.getByTestId('project-menu').click();
    await shot(page, 'out-fresh');
    await page.keyboard.press('Escape');
    await page.evaluate(() => {
      const s = window.__studio.store.getState();
      s.setSun({ on: false });
    });
    await page.getByTestId('project-menu').click();
    await page.getByTestId('menu-templates').click();
    await page.locator('[data-testid^=menu-template-]').nth(1).click();
    await page.waitForTimeout(1500);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await page.getByTestId('project-menu').click();
    await shot(page, 'out-edited');
    await page.getByTestId('menu-templates').click();
    await page.locator('[data-testid^=menu-template-]').nth(0).click();
    await shot(page, 'out-confirm');
    await ctx.close();
    const b = await studio(DESKTOP, 'probe-menu@example.com');
    await b.page.getByTestId('project-menu').click();
    await shot(b.page, 'in');
    await b.ctx.close();
  } else if (only?.includes('probe-share')) {
    // The phone share sheet, signed in, opened from the project menu: where the sheet and its glass are over time.
    const { ctx, page } = await studio(PHONE, 'probe-share@example.com');
    await page.getByTestId('project-menu').click();
    await page.waitForTimeout(700);
    await page.getByTestId('menu-share').click();
    for (const ms of [200, 600, 1300, 3000]) {
      await page.waitForTimeout(ms);
      console.log(ms, JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('.lg-sheet')].map((s) => {
        const r = s.getBoundingClientRect();
        const g = window.__glass?.shapeOf?.(s);
        const ops = [];
        for (let x = s; x && x.nodeType === 1; x = x.parentElement) if (Number(getComputedStyle(x).opacity) < 1) ops.push(`${x.tagName}.${String(x.className).slice(0, 30)}=${getComputedStyle(x).opacity}`);
        return { kind: s.getAttribute('data-sheet'), open: s.hasAttribute('data-open'), y: Math.round(r.top), h: Math.round(r.height), glass: g ? { y: Math.round(g.y), h: Math.round(g.height) } : null, transform: getComputedStyle(s).transform, ops };
      }))));
    }
    await page.screenshot({ path: resolve(raw, 'probe-share-phone.png') });
    await ctx.close();
  } else if (only?.includes('probe')) {
    // The account menu under the house name: its gap, settled (account-e2e's check).
    const { ctx, page } = await studio(DESKTOP, 'probe@example.com');
    await page.getByTestId('project-menu').click();
    await page.waitForTimeout(700);
    await page.getByTestId('menu-account').click();
    for (const ms of [100, 400, 1000, 2000]) {
      await page.waitForTimeout(ms);
      console.log(ms, await page.evaluate(() => {
        const n = document.querySelector('[data-house-name]').getBoundingClientRect();
        const m = document.querySelector('[data-testid=account-menu]');
        const r = m.getBoundingClientRect();
        const pos = m.parentElement.getBoundingClientRect();
        return { nameBottom: n.bottom, menuTop: r.top, posTop: pos.top, h: r.height, tr: getComputedStyle(m).transform, attrs: [...m.attributes].map((a) => a.name).filter((a) => a.startsWith('data-')).join(' ') };
      }));
    }
    await ctx.close();
  }
} finally {
  await browser.close();
  stop();
}
