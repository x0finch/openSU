// Renders the landing hero and the default Open Graph image from the
// default house (template T1) and writes them to public/:
//   public/hero-t1.webp     landing hero (axonometric from the south-east, 2x)
//   public/og-default.png   1200 x 630 link preview
//
//   pnpm --filter @opensu/web hero
//
// Headless Chromium with SwiftShader WebGL (the preinstalled Playwright).
// Re-run it whenever the default house or the renderer's style changes,
// and commit the two files.
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, '..');
const pkg = (p) => resolve(appRoot, `../../packages/${p}/src/index.ts`);
const require = createRequire(import.meta.url);
let playwright;
try {
  playwright = require('playwright');
} catch {
  playwright = require(require.resolve('playwright', { paths: [process.env.NODE_PATH ?? '', '/opt/node-tools/node_modules'] }));
}

const server = await createServer({
  root: resolve(here, 'hero'),
  configFile: false,
  logLevel: 'error',
  resolve: {
    alias: {
      '@opensu/agent/starter': resolve(appRoot, '../../packages/agent/src/starter.ts'),
      '@opensu/model': pkg('model'),
      '@opensu/furnish': pkg('furnish'),
      '@opensu/kernel': pkg('kernel'),
      '@opensu/render': pkg('render'),
    },
  },
  server: { port: 0, host: '127.0.0.1', fs: { allow: [resolve(appRoot, '../..')] } },
});
await server.listen();
const base = `http://127.0.0.1:${server.httpServer.address().port}/`;
const browser = await playwright.chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'],
});

const AXO_SE = { id: 'axo-se', label: 'Axo SE', kind: 'axo', azimuthDeg: 148, margin: 0.04 };
const jobs = [
  { file: 'hero-t1.webp', spec: { width: 760, height: 620, dpr: 2, view: AXO_SE, cropPad: 8, type: 'image/webp', quality: 0.9 } },
  { file: 'og-default.png', spec: { width: 1200, height: 630, dpr: 1, view: { ...AXO_SE, margin: 0.08 }, cropPad: 0, type: 'image/png' } },
];

let failed = false;
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  page.on('pageerror', (e) => {
    console.error(`page error: ${e.message}`);
    failed = true;
  });
  await page.goto(base);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
  for (const { file, spec } of jobs) {
    const r = await page.evaluate((s) => window.__render(s), spec);
    const buf = Buffer.from(r.url.split(',')[1], 'base64');
    const out = resolve(appRoot, 'public', file);
    writeFileSync(out, buf);
    console.log(`${file}: ${r.width} x ${r.height}, ${(buf.length / 1024).toFixed(0)} KB (${r.name})`);
  }
} finally {
  await browser.close();
  await server.close();
}
process.exit(failed ? 1 : 0);
