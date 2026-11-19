// Prints gzip sizes of what each page loads and enforces the budgets of
// docs/tasks/005: initial JS for /studio < 200 KB, viewer chunk < 300 KB.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const client = join(root, 'dist/client');
const assets = join(client, 'assets');
// Task 031: /studio's initial JS went from 199.2 KB to 243.4 KB with Base UI (Tooltip, Radio, Switch, Slider, Field on
// first paint; Popover, Menu and the Vaul sheet load on first use). Task 032: the tooltip, the tool panels, the walk HUD and the sign-in, share and settings contents load when idle; back to 200 KB (owner).
const BUDGET = { studioInitial: 200 * 1024, viewer: 300 * 1024, assistant: 150 * 1024, places: 400 * 1024 };

const gz = new Map();
const deps = new Map();
/** The chunk with the assistant (TanStack AI + the relay adapter), found by its adapter name. */
let assistantEntry = null;
for (const f of readdirSync(assets)) {
  if (!f.endsWith('.js') && !f.endsWith('.css')) continue;
  const src = readFileSync(join(assets, f));
  gz.set(f, gzipSync(src, { level: 9 }).length);
  if (f.endsWith('.js')) {
    const text = src.toString();
    const stat = new Set();
    for (const m of text.matchAll(/(?:from|import)\s*["'`]\.\/([^"'`]+\.js)["'`]/g)) stat.add(m[1]);
    if (text.includes('opensu-relay')) assistantEntry = f;
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
const entry = (re) => [...gz.keys()].find((f) => re.test(f));
const lazy = (re, ...exclude) => {
  const f = entry(re);
  const skip = new Set([...studio.js, ...exclude.flatMap((x) => [...x])]);
  return new Set(f ? [...closure([f])].filter((x) => !skip.has(x)) : []);
};
const viewer = lazy(/^engine-.*\.js$/);
const model = lazy(/^house-data-.*\.js$/);
const plan = lazy(/^plan-data-.*\.js$/, model);
// The sheet chunk shares three.js, the kernel and the plans with the others.
const sheets = lazy(/^SheetGallery-.*\.js$/, viewer, model, plan);
const assistant = assistantEntry ? lazy(new RegExp(`^${assistantEntry.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`), model) : new Set();

console.log('\nBundle size report (gzip -9)\n');
report('/ initial JS', landing.js);
report('/studio initial JS', studio.js, BUDGET.studioInitial);
report('viewer chunk (lazy, 3D)', viewer, BUDGET.viewer);
report('model chunk (lazy)', model);
report('plan chunk (lazy)', plan);
report('sheet chunk (lazy, on top)', sheets);
report('assistant chunk (lazy, chat)', assistant, BUDGET.assistant);
// The built-in place list (location picker, find_place): only on first use.
report('places chunk (lazy, location)', lazy(/^places-.*\.js$/), BUDGET.places);
report('CSS', studio.css);
// The Worker (dist/server) must stay small and never carry viewer code.
const server = join(root, 'dist/server');
const serverJs = [];
const walk = (d) => {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    if (e.isDirectory()) walk(join(d, e.name));
    else if (e.name.endsWith('.js')) serverJs.push(join(d, e.name));
  }
};
walk(server);
let serverBytes = 0;
let serverGz = 0;
const withThree = [];
const withAgent = [];
for (const f of serverJs) {
  const src = readFileSync(f);
  serverBytes += src.length;
  serverGz += gzipSync(src, { level: 9 }).length;
  if (/WebGLRenderer|ShaderChunk/.test(src.toString())) withThree.push(f.slice(server.length + 1));
  // The agent loop and the provider SDK run in the browser only.
  if (/opensu-relay|dangerouslyAllowBrowser/.test(src.toString())) withAgent.push(f.slice(server.length + 1));
}
if (withThree.length || withAgent.length) failed = true;
rows.push(`Worker bundle (dist/server JS)  ${kb(serverBytes)} raw, ${kb(serverGz).trim()} gzip, ${serverJs.length} files`);
rows.push(withThree.length ? `    contains three.js: ${withThree.join(', ')}  FAIL` : '    no three.js  ok');
rows.push(withAgent.length ? `    contains the agent / provider SDK: ${withAgent.join(', ')}  FAIL` : '    no agent or provider SDK  ok');
console.log(rows.join('\n'));
console.log(failed ? '\nSize budget exceeded.' : '\nAll size budgets met.');
process.exit(failed ? 1 : 0);
