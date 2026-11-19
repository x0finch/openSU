// Renders the fixed views of the golden sample (model -> kernel -> render)
// to artifacts/shots/*.png (1600x1200, DPR 1): the presentation views, the
// sun study (physical sun at the golden site) and the level cutaways.
//
//   node scripts/shots.mjs [names|views] [extra query] [suffix]
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createServer } from 'vite';
import { workspaceAliases } from '../demo/aliases.js';
import { scaleBrowser, tmo } from '../../../tools/e2e-timeouts.mjs';

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

// Shot name -> demo query. A name that is not listed is taken as a view id.
const SHOTS = {
  'axo-se': 'view=axo-se',
  'axo-ne': 'view=axo-ne',
  'eye-sw': 'view=eye-sw',
  'elev-south': 'view=elev-south',
  'axo-sw': 'view=axo-sw',
  'sun-winter-09': 'view=axo-se&sun=winter&time=09:00&year=2026',
  'sun-winter-12': 'view=axo-se&sun=winter&time=12:00&year=2026',
  'sun-winter-15': 'view=axo-se&sun=winter&time=15:00&year=2026',
  'sun-summer-12': 'view=axo-se&sun=summer&time=12:00&year=2026',
  'cut-L1': 'view=cut-L1',
  'cut-L2': 'view=cut-L2',
  'cut-L1-sun-winter-15': 'view=cut-L1&sun=winter&time=15:00&year=2026',
  'cut-L1-sun-winter-10': 'view=cut-L1&sun=winter&time=10:00&year=2026',
  'cut-L2-sun-winter-10': 'view=cut-L2&sun=winter&time=10:00&year=2026',
  // Furnished cutaways (presentation light) and the walk views.
  'cut-L1-furnished': 'view=cut-L1',
  'cut-L2-furnished': 'view=cut-L2',
  'walk-living': 'walk=L1&at=13.2,6.3&heading=212&sun=winter&time=10:00&year=2026',
  'walk-dining': 'walk=L1&at=12.6,2.4&heading=285&sun=winter&time=10:00&year=2026',
  'walk-bedroom': 'walk=L2&at=10.1,4.95&heading=118&sun=winter&time=10:00&year=2026',
  'walk-terrace': 'walk=L3&at=13.3,2.2&heading=318&pitch=-4&sun=winter&time=10:00&year=2026',
};
const VIEWS = process.argv[2] ? process.argv[2].split(',') : Object.keys(SHOTS);
const EXTRA = process.argv[3] ? `&${process.argv[3]}` : '';
const SUFFIX = process.argv[4] ?? '';

const server = await createServer({ root: resolve(pkgRoot, 'demo'), configFile: false, resolve: { alias: workspaceAliases }, logLevel: 'error', server: { port: 0, host: '127.0.0.1' } });
await server.listen();
const address = server.httpServer.address();
const base = `http://127.0.0.1:${address.port}/`;

const browser = await playwright.chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'],
});
scaleBrowser(browser);
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
    await page.goto(`${base}?${SHOTS[id] ?? `view=${id}`}&shot=1${EXTRA}`);
    await page.waitForFunction(() => window.__shotReady === true, null, { timeout: tmo(180000) });
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
      return { stats: window.__stats, ink: ink / (200 * 150), sun: window.__viewer.sunStudy };
    });
    const file = resolve(outDir, `${id}${SUFFIX}.png`);
    await page.screenshot({ path: file });
    const s = info.stats;
    console.log(`${id}: ${s.triangles} triangles, ${s.drawCalls} draw calls (${s.drawCallsWithShadows} incl. shadow pass), non-white ${(info.ink * 100).toFixed(1)}%, ${Date.now() - t0} ms -> ${file}`);
    if (info.sun) {
      const t = info.sun.minutes;
      console.log(`  sun at ${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.round(t % 60)).padStart(2, '0')}: azimuth ${info.sun.trueAzimuthDeg.toFixed(1)} deg, elevation ${info.sun.trueElevationDeg.toFixed(1)} deg`);
    }
    if (id === 'sun-winter-15' || id === 'cut-L1-sun-winter-15') {
      const m = await page.evaluate(() => window.__measureShadows(5));
      console.log(`  frame with shadow update ${m.withShadows.toFixed(0)} ms, without ${m.withoutShadows.toFixed(0)} ms -> shadow update ~${(m.withShadows - m.withoutShadows).toFixed(0)} ms (SwiftShader, software GL)`);
    }
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
