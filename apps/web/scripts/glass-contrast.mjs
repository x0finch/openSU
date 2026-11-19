// Contrast check of text on glass (task 017, owner's decision 4): every
// label on a capsule (segmented labels, tool values, the input
// placeholder) and all text on text surfaces (latest exchange, sun panel)
// must reach 4.5:1 against the glass behind it, over the white drawing.
//
// How: screenshot once with all text hidden (the glass alone), then for
// each text box take the background pixel that is worst for its ink (the
// lightest under light ink, the darkest under dark ink), composite the
// ink's alpha over it and compute the WCAG contrast ratio.
//
//   node scripts/glass-contrast.mjs [--glass light] [--phone]
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scaleBrowser, tmo } from '../../../tools/e2e-timeouts.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, '..');
const MIN = 4.5;
const tone = process.argv.includes('--glass') ? process.argv[process.argv.indexOf('--glass') + 1] : 'dark';

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
const server = spawn(process.execPath, [resolve(appRoot, 'node_modules/vite/bin/vite.js'), 'preview', '--port', String(port), '--strictPort'], { cwd: appRoot, stdio: 'ignore', env: { ...process.env, CI: '1' } });
process.on('exit', () => server.kill('SIGTERM'));
for (let i = 0; i < tmo(120); i++) {
  try {
    if ((await fetch(`${base}/api/health`)).ok) break;
  } catch {}
  await new Promise((r) => setTimeout(r, 250));
}
const browser = await playwright.chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
scaleBrowser(browser);

/** Text boxes inside glass, with their ink: [{ name, rects: [x,y,w,h][], color: [r,g,b,a] }]. */
async function textBoxes(page, selectors) {
  return page.evaluate((selectors) => {
    const parse = (c) => {
      const m = c.match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
      return [p[0], p[1], p[2], p[3] ?? 1];
    };
    const out = [];
    for (const [name, sel, pseudo] of selectors) {
      for (const el of document.querySelectorAll(sel)) {
        if (!el.closest('.lg')) continue;
        const r0 = el.getBoundingClientRect();
        if (r0.width < 2 || r0.height < 2) continue;
        let rects = [];
        let color;
        if (pseudo) {
          // The placeholder: its line box inside the field.
          color = parse(getComputedStyle(el, '::placeholder').color);
          const lh = parseFloat(getComputedStyle(el).lineHeight) || 20;
          const pt = parseFloat(getComputedStyle(el).paddingTop) || 0;
          const w = Math.min(r0.width, el.placeholder.length * 15);
          rects = [[r0.left, r0.top + pt, w, lh]];
        } else {
          const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
          for (let n = walker.nextNode(); n; n = walker.nextNode()) {
            if (!n.textContent.trim()) continue;
            const range = document.createRange();
            range.selectNodeContents(n);
            for (const r of range.getClientRects()) if (r.width > 1) rects.push([r.left, r.top, r.width, r.height]);
            color ??= parse(getComputedStyle(n.parentElement).color);
          }
        }
        if (rects.length && color) out.push({ name, rects, color });
      }
    }
    return out;
  }, selectors);
}

async function measure(page, label, selectors) {
  const boxes = await textBoxes(page, selectors);
  await page.addStyleTag({ content: '*,*::placeholder{color:transparent!important;-webkit-text-fill-color:transparent!important;caret-color:transparent!important}', }).then((h) => h);
  await page.evaluate(() => document.documentElement.setAttribute('data-hide-text', ''));
  await page.waitForTimeout(400);
  const png = (await page.screenshot()).toString('base64');
  const results = await page.evaluate(
    async ({ png, boxes }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${png}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0);
      const k = img.width / innerWidth;
      const lin = (v) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      const L = (r, gg, b) => 0.2126 * lin(r) + 0.7152 * lin(gg) + 0.0722 * lin(b);
      return boxes.map((b) => {
        const [ir, ig, ib, ia] = b.color;
        const lightInk = L(ir, ig, ib) > 0.4;
        let worst = null;
        for (const [x, y, w, h] of b.rects) {
          const d = g.getImageData(Math.round(x * k), Math.round(y * k), Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k))).data;
          for (let i = 0; i < d.length; i += 4) {
            const l = L(d[i], d[i + 1], d[i + 2]);
            if (!worst || (lightInk ? l > worst.l : l < worst.l)) worst = { l, rgb: [d[i], d[i + 1], d[i + 2]] };
          }
        }
        const mix = [0, 1, 2].map((j) => b.color[j] * ia + worst.rgb[j] * (1 - ia));
        const li = L(...mix);
        const ratio = (Math.max(li, worst.l) + 0.05) / (Math.min(li, worst.l) + 0.05);
        return { name: b.name, ratio, bg: worst.rgb };
      });
    },
    { png, boxes },
  );
  // Worst per name.
  const by = new Map();
  for (const r of results) if (!by.has(r.name) || r.ratio < by.get(r.name).ratio) by.set(r.name, r);
  const rows = [...by.values()];
  for (const r of rows) console.log(`  ${r.ratio >= MIN ? 'ok  ' : 'FAIL'} ${label}: ${r.name} ${r.ratio.toFixed(2)}:1 (bg rgb ${r.bg.join(' ')})`);
  return rows;
}

const all = [];
async function open(path, viewport, opts = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, ...opts });
  const page = await ctx.newPage();
  await page.goto(`${base}${path}`);
  await page.waitForFunction(() => window.__studio?.ready3d === true, null, { timeout: tmo(180000) });
  await page.waitForTimeout(1500);
  return { ctx, page };
}
const q = `nohints&glass=${tone}`;
const CAPSULES = [
  ['segmented label', '[data-seg]'],
  ['tool value', '[data-testid=toolbar] button span'],
  ['input placeholder', '[data-testid=prompt-bar]', true],
];
const exchange = async (page) => {
  await page.evaluate(() => {
    window.__studio.chat.setState({ items: [
      { id: 'u1', role: 'user', text: '把北侧房间加深 600' },
      { id: 'a1', role: 'assistant', text: '北墙外移 600 mm，厨房、楼梯和洗衣房一起变深。建筑面积 +7.2 m²。', phase: 'done' },
    ] });
  });
  await page.waitForTimeout(600);
};
for (const [label, vp, opts] of [['desktop', { width: 1440, height: 900 }, {}], ['phone', { width: 390, height: 844 }, { isMobile: true, hasTouch: true }]]) {
  // Capsules and the sun panel (sun on: the tool shows its time).
  {
    const { ctx, page } = await open(`/studio?${q}&sun=winter&time=10:00`, vp, opts);
    all.push(...(await measure(page, `${label} capsules`, CAPSULES)));
    await ctx.close();
  }
  {
    const { ctx, page } = await open(`/studio?${q}&sun=winter&time=10:00`, vp, opts);
    await page.getByTestId('bar-sun').click();
    await page.waitForTimeout(1500);
    all.push(...(await measure(page, `${label} sun panel`, [['panel text', '[data-panel] p, [data-panel] span, [data-panel] h2']])));
    await ctx.close();
  }
  {
    const { ctx, page } = await open(`/studio?${q}&panel=open`, vp, opts);
    await exchange(page);
    all.push(...(await measure(page, `${label} latest exchange`, [['user line', '[data-testid=user-message]'], ['answer', '[data-testid=assistant-message]'], ['strip header', '#recent-strip header']])));
    await ctx.close();
  }
}
await browser.close();
server.kill('SIGTERM');
const fails = all.filter((r) => r.ratio < MIN);
console.log(fails.length ? `\n${fails.length} text roles below ${MIN}:1` : `\nAll glass text reaches ${MIN}:1 (${all.length} roles).`);
process.exit(fails.length ? 1 : 0);
