// Renders the golden sample's sheet set in headless Chromium (SwiftShader
// WebGL) through the demo page and writes artifacts/sheets/*.png.
//   pnpm --filter @opensu/sheet shots          (add "--2x" for 3000 x 4000 too)
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createServer } from 'vite';
import { workspaceAliases } from '../demo/aliases.js';

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(here, '..');
const outDir = resolve(pkgRoot, '../../artifacts/sheets');
mkdirSync(outDir, { recursive: true });
const scales = process.argv.includes('--2x') ? [1, 2] : [1];

const require = createRequire(import.meta.url);
let playwright;
try {
  playwright = require('playwright');
} catch {
  // Preinstalled globally in the dev container.
  playwright = require(require.resolve('playwright', { paths: [process.env.NODE_PATH ?? '', '/opt/node-tools/node_modules'] }));
}

const server = await createServer({ root: resolve(pkgRoot, 'demo'), configFile: false, resolve: { alias: workspaceAliases }, logLevel: 'error', server: { port: 0, host: '127.0.0.1' } });
await server.listen();
const base = `http://127.0.0.1:${server.httpServer.address().port}/`;
const browser = await playwright.chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'],
});
let failed = false;
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 1 });
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') console.log(`  [browser ${m.type()}] ${m.text()}`);
  });
  page.on('pageerror', (e) => {
    console.error(`  [page error] ${e.message}`);
    failed = true;
  });
  await page.goto(base);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
  // Ad-hoc single sheet: --sheet '<SheetOptions JSON>' writes artifacts/sheets/custom.png.
  const custom = process.argv.indexOf('--sheet');
  if (custom > 0) {
    const b64 = await page.evaluate((o) => window.__sheet(o), JSON.parse(process.argv[custom + 1]));
    const file = resolve(outDir, 'custom.png');
    writeFileSync(file, Buffer.from(b64, 'base64'));
    console.log(`  ${file}`);
    scales.length = 0;
  }
  for (const scale of scales) {
    const { pngs, ms, names } = await page.evaluate((s) => window.__sheetSet(s), scale);
    console.log(`set @${scale}x: ${pngs.length} sheets in ${(ms / 1000).toFixed(2)} s (${(ms / pngs.length / 1000).toFixed(2)} s per sheet, one shared WebGL context)`);
    pngs.forEach((b64, i) => {
      const buf = Buffer.from(b64, 'base64');
      const file = resolve(outDir, `${names[i] ?? `sheet-${i + 1}`}${scale > 1 ? `@${scale}x` : ''}.png`);
      writeFileSync(file, buf);
      const w = buf.readUInt32BE(16);
      const h = buf.readUInt32BE(20);
      const mb = buf.length / 1024 / 1024;
      console.log(`  ${file}: ${w}x${h}, ${mb.toFixed(2)} MB`);
      if (scale === 1 && mb > 1.5) {
        console.error('    over the 1.5 MB budget');
        failed = true;
      }
    });
    const single = await page.evaluate((s) => window.__singleSheet(s), scale);
    console.log(`single sheet @${scale}x (own WebGL context, incl. kernel build): ${(single.ms / 1000).toFixed(2)} s`);
  }
  // The on-screen viewer must be untouched by the offscreen exports.
  await page.waitForTimeout(1200);
  const lost = await page.evaluate(() => window.__liveContextLost());
  const ink = await page.evaluate(() => window.__liveInk());
  const canvases = await page.evaluate(() => document.querySelectorAll('canvas').length);
  console.log(`live viewer after export: context lost ${lost}, non-white ${(ink * 100).toFixed(1)}%, canvases in page ${canvases}`);
  if (lost || ink < 0.02 || canvases !== 1) failed = true;
} finally {
  await browser.close();
  await server.close();
}
process.exit(failed ? 1 : 0);
