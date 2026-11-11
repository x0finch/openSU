// Renders the golden sample's floor plans to artifacts/plans/<level>.svg and
// .png (about 1600 px wide) and prints the overlap check.
//   pnpm --filter @opensu/plan shots           (add "--hires" for 2x PNGs too)
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import { golden, resolve } from '@opensu/model';
import { checkPlan, renderPlanDetailed } from '../src/index';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolvePath(here, '../../../artifacts/plans');
mkdirSync(outDir, { recursive: true });
const hires = process.argv.includes('--hires');

const house = resolve(golden);
const files: { id: string; svg: string; w: number; h: number }[] = [];
let problems = 0;
for (const level of house.levels) {
  const t0 = Date.now();
  const r = renderPlanDetailed(house, level.id);
  const issues = checkPlan(r);
  problems += issues.length + r.missingLabels.length;
  writeFileSync(resolvePath(outDir, `${level.id}.svg`), r.svg);
  files.push({ id: level.id, svg: r.svg, w: r.width, h: r.height });
  console.log(`${level.id} ${level.name}: ${r.width}x${r.height}px, ${(r.svg.length / 1024).toFixed(0)} KB, `
    + `${r.furniture.length} pieces, ${r.texts.length} texts, ${issues.length} overlaps, ${Date.now() - t0} ms`);
  for (const i of issues) console.log(`  [${i.kind}] ${i.a} <-> ${i.b}`);
  for (const m of r.missingLabels) console.log(`  [label] no free spot for ${m}`);
}

// Rasterise with the preinstalled Playwright Chromium.
const require = createRequire(import.meta.url);
interface Page {
  setViewportSize(s: { width: number; height: number }): Promise<void>;
  setContent(html: string): Promise<void>;
  evaluate(expr: string): Promise<unknown>;
  screenshot(o: { path: string; clip: { x: number; y: number; width: number; height: number } }): Promise<unknown>;
}
interface Pw { chromium: { launch(): Promise<{ newPage(o: { deviceScaleFactor: number }): Promise<Page>; close(): Promise<void> }> } }
let playwright: Pw | null = null;
for (const paths of [[here], [process.env.NODE_PATH ?? '', '/opt/node-tools/node_modules']]) {
  try {
    playwright = require(require.resolve('playwright', { paths })) as Pw;
    break;
  } catch { /* try next */ }
}
if (!playwright) {
  console.log('Playwright not found: wrote SVGs only.');
} else {
  const browser = await playwright.chromium.launch();
  try {
    // One pixel ratio for all levels so they share a drawing scale (the widest is ~1600 px).
    const base = 1600 / Math.max(...files.map((x) => x.w));
    for (const scale of hires ? [1, 2] : [1]) {
      for (const fl of files) {
        const dpr = base * scale;
        const page = await browser.newPage({ deviceScaleFactor: dpr });
        await page.setViewportSize({ width: fl.w, height: fl.h });
        await page.setContent(`<!doctype html><html><body style="margin:0">${fl.svg}</body></html>`);
        await page.evaluate('document.fonts.ready.then(() => true)');
        const path = resolvePath(outDir, `${fl.id}${scale > 1 ? '@2x' : ''}.png`);
        await page.screenshot({ path, clip: { x: 0, y: 0, width: fl.w, height: fl.h } });
        console.log(`  ${path}`);
      }
    }
  } finally {
    await browser.close();
  }
}
console.log(problems ? `${problems} problem(s)` : 'No overlaps.');
