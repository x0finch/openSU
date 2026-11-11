// Writes the debug view of the golden sample: one SVG + PNG per level in
// artifacts/model/, and prints areas and validation issues.
//   pnpm --filter @opensu/model debug
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import { debugSvg, golden, resolve, validate } from '../src/index';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolvePath(here, '../../../artifacts/model');
mkdirSync(outDir, { recursive: true });

const issues = validate(golden);
const house = resolve(golden);
const m2 = (mm2: number) => (mm2 / 1e6).toFixed(2);

for (const level of house.levels) {
  console.log(`\n${level.id} ${level.name}: interior ${m2(level.interiorArea)} m²`);
  for (const s of level.spaces) console.log(`  ${s.id.padEnd(16)} ${s.type.padEnd(10)} ${m2(s.area).padStart(7)} m²  ${s.name}`);
}
console.log(`\nTotal interior floor area: ${m2(house.interiorArea)} m²`);
console.log(`\nValidation: ${issues.length === 0 ? 'no issues' : ''}`);
for (const i of issues) console.log(`  [${i.severity}] ${i.code}: ${i.message}`);

const files: { svg: string; png: string }[] = [];
house.levels.forEach((level, idx) => {
  const svg = debugSvg(house, idx);
  const base = `${String(idx + 1).padStart(2, '0')}-${level.id}`;
  const svgPath = resolvePath(outDir, `${base}.svg`);
  writeFileSync(svgPath, svg);
  files.push({ svg, png: resolvePath(outDir, `${base}.png`) });
});

// Rasterise with the preinstalled Playwright Chromium.
const require = createRequire(import.meta.url);
// Minimal shape of the Playwright API used here (not a dependency).
interface Pw {
  chromium: {
    launch(): Promise<{
      newPage(o: { deviceScaleFactor: number }): Promise<{
        setViewportSize(s: { width: number; height: number }): Promise<void>;
        setContent(html: string): Promise<void>;
        screenshot(o: { path: string; clip: { x: number; y: number; width: number; height: number } }): Promise<unknown>;
      }>;
      close(): Promise<void>;
    }>;
  };
}
let playwright: Pw | null = null;
for (const paths of [[here], [process.env.NODE_PATH ?? '', '/opt/node-tools/node_modules']]) {
  try {
    playwright = require(require.resolve('playwright', { paths })) as Pw;
    break;
  } catch { /* try next */ }
}
if (!playwright) {
  console.log('\nPlaywright not found: wrote SVGs only.');
} else {
  const browser = await playwright.chromium.launch();
  try {
    const page = await browser.newPage({ deviceScaleFactor: 2 });
    for (const f of files) {
      const w = Number(/width="(\d+)"/.exec(f.svg)![1]);
      const h = Number(/height="(\d+)"/.exec(f.svg)![1]);
      await page.setViewportSize({ width: w, height: h });
      await page.setContent(`<!doctype html><html><body style="margin:0">${f.svg}</body></html>`);
      await page.screenshot({ path: f.png, clip: { x: 0, y: 0, width: w, height: h } });
    }
  } finally {
    await browser.close();
  }
}
console.log(`\nWrote ${files.length} levels to ${outDir}`);
for (const f of files) console.log(`  ${f.png}`);
