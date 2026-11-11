// Renders the fixed demo views to artifacts/shots/*.png (1600x1200, DPR 1).
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createServer } from 'vite';

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(here, '..');
const repoRoot = resolve(pkgRoot, '../..');
const outDir = resolve(repoRoot, 'artifacts/shots');
mkdirSync(outDir, { recursive: true });

const require = createRequire(import.meta.url);
let playwright;
try {
  playwright = require('playwright');
} catch {
  // Preinstalled globally in the dev container.
  playwright = require(require.resolve('playwright', { paths: [process.env.NODE_PATH ?? '', '/opt/node-tools/node_modules'] }));
}

const VIEWS = (process.argv[2] ?? 'axo-se,axo-ne,eye-sw,elev-south').split(',');
const EXTRA = process.argv[3] ? `&${process.argv[3]}` : '';
const SUFFIX = process.argv[4] ?? '';

const server = await createServer({ root: resolve(pkgRoot, 'demo'), configFile: false, logLevel: 'error', server: { port: 0, host: '127.0.0.1' } });
await server.listen();
const address = server.httpServer.address();
const base = `http://127.0.0.1:${address.port}/`;

const browser = await playwright.chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'],
});
let failed = false;
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1200 }, deviceScaleFactor: 1 });
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning' || m.text().startsWith('[openSU]')) console.log(`  [browser ${m.type()}] ${m.text()}`);
  });
  page.on('pageerror', (e) => {
    console.error(`  [page error] ${e.message}`);
    failed = true;
  });
  for (const id of VIEWS) {
    const t0 = Date.now();
    await page.goto(`${base}?view=${id}&shot=1${EXTRA}`);
    await page.waitForFunction(() => window.__shotReady === true, null, { timeout: 180000 });
    const info = await page.evaluate(() => {
      const c = document.querySelector('canvas');
      const tmp = document.createElement('canvas');
      tmp.width = 200;
      tmp.height = 150;
      const ctx = tmp.getContext('2d');
      ctx.drawImage(c, 0, 0, 200, 150);
      const d = ctx.getImageData(0, 0, 200, 150).data;
      let ink = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i] < 250 || d[i + 1] < 250 || d[i + 2] < 250) ink++;
      return { stats: window.__stats, ink: ink / (200 * 150) };
    });
    const file = resolve(outDir, `${id}${SUFFIX}.png`);
    await page.screenshot({ path: file });
    const s = info.stats;
    console.log(`${id}: ${s.triangles} triangles, ${s.drawCalls} draw calls (${s.drawCallsWithShadows} incl. shadow pass), non-white ${(info.ink * 100).toFixed(1)}%, ${Date.now() - t0} ms -> ${file}`);
    if (info.ink < 0.02) {
      console.error(`  ${id}: canvas looks blank`);
      failed = true;
    }
  }
} finally {
  await browser.close();
  await server.close();
}
process.exit(failed ? 1 : 0);
