// Prints gzip sizes of what each page loads and enforces the budgets of
// docs/tasks/005: initial JS for /studio < 200 KB, viewer chunk < 300 KB.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const client = join(root, 'dist/client');
const assets = join(client, 'assets');
const BUDGET = { studioInitial: 200 * 1024, viewer: 300 * 1024 };

const gz = new Map();
const deps = new Map();
for (const f of readdirSync(assets)) {
  if (!f.endsWith('.js') && !f.endsWith('.css')) continue;
  const src = readFileSync(join(assets, f));
  gz.set(f, gzipSync(src, { level: 9 }).length);
  if (f.endsWith('.js')) {
    const text = src.toString();
    const stat = new Set();
    for (const m of text.matchAll(/(?:from|import)\s*["'`]\.\/([^"'`]+\.js)["'`]/g)) stat.add(m[1]);
    deps.set(f, stat);
  }
}

function closure(entries) {
  const out = new Set();
  const stack = [...entries];
  while (stack.length) {
    const f = stack.pop();
    if (out.has(f) || !gz.has(f)) continue;
    out.add(f);
    for (const d of deps.get(f) ?? []) stack.push(d);
  }
  return out;
}

function pageEntries(htmlPath) {
  const html = readFileSync(htmlPath, 'utf8');
  const js = new Set();
  const css = new Set();
  for (const m of html.matchAll(/(?:src|href)="\/assets\/([^"]+)"/g)) (m[1].endsWith('.css') ? css : js).add(m[1]);
  return { js: closure([...js].filter((f) => f.endsWith('.js'))), css };
}

const sum = (files) => [...files].reduce((s, f) => s + (gz.get(f) ?? 0), 0);
const kb = (n) => `${(n / 1024).toFixed(1).padStart(6)} KB`;

const rows = [];
let failed = false;
function report(label, files, budget) {
  const total = sum(files);
  const ok = budget === undefined || total < budget;
  if (!ok) failed = true;
  rows.push(`${label.padEnd(30)} ${kb(total)}${budget ? `  / budget ${kb(budget).trim()}  ${ok ? 'ok' : 'OVER BUDGET'}` : ''}`);
  for (const f of [...files].sort((a, b) => gz.get(b) - gz.get(a))) rows.push(`    ${f.padEnd(44)} ${kb(gz.get(f))}`);
}

const landing = pageEntries(join(client, 'index.html'));
const studio = pageEntries(join(client, 'studio.html'));
const engine = [...gz.keys()].find((f) => /^engine-.*\.js$/.test(f));
const viewer = new Set([...closure([engine])].filter((f) => !studio.js.has(f)));
const model = [...gz.keys()].filter((f) => /^(house-data|src)-.*\.js$/.test(f) && !studio.js.has(f));
const plan = [...gz.keys()].filter((f) => /^plan-data-.*\.js$/.test(f));

console.log('\nBundle size report (gzip -9)\n');
report('/ initial JS', landing.js);
report('/studio initial JS', studio.js, BUDGET.studioInitial);
report('viewer chunk (lazy, 3D)', viewer, BUDGET.viewer);
report('model chunk (lazy)', new Set(model));
report('plan chunk (lazy)', new Set(plan));
report('CSS', studio.css);
console.log(rows.join('\n'));
console.log(failed ? '\nSize budget exceeded.' : '\nAll size budgets met.');
process.exit(failed ? 1 : 0);
