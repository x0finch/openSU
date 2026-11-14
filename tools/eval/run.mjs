// Evaluation only: runs one scenario against the real studio with Claude
// behind it, and saves every reply, model call and screenshot under
// artifacts/eval/<scenario>-<time>/ (never committed).
//
//   pnpm eval tools/eval/scenarios/villa-14x11.json            # live model
//   pnpm eval <scenario> --replay artifacts/eval/<run>/log     # no model calls
//   options: --no-build (reuse apps/web/dist), --model sonnet
//
// What it starts: `vite preview` of apps/web (the Worker, with its
// OpenAI-compatible upstream pointed at the bridge), the bridge
// (bridge.mjs), and headless Chromium. All stop when the run ends.
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startBridge } from './bridge.mjs';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const WEB = join(ROOT, 'apps/web');
const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const scenarioPath = args.find((a) => a.endsWith('.json'));
if (!scenarioPath) {
  console.error('usage: pnpm eval <scenario.json> [--replay dir] [--no-build] [--model opus|sonnet]');
  process.exit(2);
}
const scenario = JSON.parse(readFileSync(resolve(scenarioPath), 'utf8'));
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const OUT = join(ROOT, 'artifacts/eval', `${scenario.name}-${stamp}`);
mkdirSync(OUT, { recursive: true });

// Playwright is preinstalled outside the workspace in some environments.
const req = createRequire(import.meta.url);
const playwright = req(req.resolve('playwright', { paths: [WEB, ROOT, '/opt/node-tools/node_modules'] }));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stops = [];
const stopAll = () => { for (const s of stops.reverse()) try { s(); } catch { /* already gone */ } };
process.on('exit', stopAll);
process.on('SIGINT', () => process.exit(130));

if (!args.includes('--no-build')) {
  console.log('building apps/web ...');
  const b = spawnSync('pnpm', ['--filter', '@opensu/web', 'build'], { cwd: ROOT, stdio: 'inherit' });
  if (b.status !== 0) process.exit(b.status ?? 1);
}

const bridge = await startBridge({ port: 8788, log: join(OUT, 'log'), replay: opt('--replay') ? resolve(opt('--replay')) : null, model: opt('--model') ?? 'opus' });
stops.push(bridge.close);

// The Worker reads its variables from dist/server/.dev.vars under `vite preview`.
const devVars = join(WEB, 'dist/server/.dev.vars');
writeFileSync(devVars, `OPENAI_API_KEY='eval-bridge-not-a-secret'\nOPENAI_BASE_URL='${bridge.url}'\nOPENSU_MODEL='claude-${opt('--model') ?? 'opus'}'\n`);
stops.push(() => rmSync(devVars, { force: true }));
const port = 4179;
const preview = spawn(process.execPath, [join(WEB, 'node_modules/vite/bin/vite.js'), 'preview', '--port', String(port), '--strictPort'], { cwd: WEB, stdio: 'ignore', env: { ...process.env, CI: '1' } });
stops.push(() => preview.kill('SIGTERM'));
const base = `http://localhost:${port}`;
for (let i = 0; ; i++) {
  try { if ((await fetch(`${base}/api/health`)).ok) break; } catch { /* not up yet */ }
  if (i > 240) throw new Error('preview did not start');
  await sleep(250);
}

const browser = await playwright.chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
stops.push(() => browser.close());
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const crashes = [];
page.on('pageerror', (e) => crashes.push(e.message));
await page.goto(`${base}/studio`);
await page.waitForFunction(() => window.__studio?.ready3d, null, { timeout: 120000 });

async function shots(tag, levels) {
  const files = [];
  const mode = (name) => page.getByTestId('mode-switch').getByRole('radio', { name }).click();
  await page.evaluate(() => document.activeElement?.blur());
  await mode('3D');
  await page.waitForFunction(() => !window.__studio?.growing, null, { timeout: 60000 }).catch(() => {});
  await sleep(2500);
  await page.screenshot({ path: join(OUT, `${tag}-3d.png`) });
  files.push(`${tag}-3d.png`);
  const ids = levels ?? (await page.evaluate(() => window.__studio.store.getState().house.levels.map((l) => l.id)));
  await mode('平面');
  for (const id of ids) {
    await page.evaluate((l) => window.__studio.store.getState().setLevel(l), id);
    await sleep(2000);
    await page.screenshot({ path: join(OUT, `${tag}-${id}.png`) });
    files.push(`${tag}-${id}.png`);
  }
  await mode('3D');
  return files;
}

const transcript = [];
let failed = false;
for (const turn of scenario.turns) {
  console.log(`> ${turn.tag}: ${turn.text}`);
  const before = await page.evaluate(() => window.__studio.chat.getState().items.length);
  await page.getByTestId('prompt-bar').fill(turn.text);
  await page.getByTestId('prompt-bar').press('Enter');
  await page.waitForFunction((k) => { const s = window.__studio.chat.getState(); return s.items.length > k + 1 && !s.running; }, before, { timeout: 1800000, polling: 1000 });
  const crashed = await page.evaluate(() => /Something went wrong/.test(document.body.innerText));
  const reply = await page.evaluate((k) => window.__studio.chat.getState().items.slice(k + 1).map((m) => ({ text: m.text, final: m.parts?.length && m.parts.at(-1).type === 'text' ? m.parts.at(-1).text.trim() : null, changes: (m.changes ?? []).map((c) => c.summary), error: m.error, gaveUp: m.gaveUp, lastErrors: m.lastErrors })), before);
  const area = await page.getByTestId('fact-area').first().textContent().catch(() => null);
  const files = crashed ? [] : await shots(turn.tag, turn.levels);
  transcript.push({ ...turn, crashed, area, reply, files });
  for (const r of reply) console.log(`< ${r.text.replace(/\n+/g, ' / ').slice(0, 300)}${r.error ? ` [error ${JSON.stringify(r.error)}]` : ''}${r.final != null ? `\n  final message: ${r.final.length} chars` : ''}`);
  if (crashed) { console.log('! the studio crashed; stopping'); failed = true; break; }
}
const calls = JSON.parse(JSON.stringify(readdirSafe(join(OUT, 'log'))));
writeFileSync(join(OUT, 'transcript.json'), JSON.stringify({ scenario, crashes, calls, transcript }, null, 1));
console.log(`\nsaved to ${OUT}`);
process.exit(failed ? 1 : 0);

function readdirSafe(dir) {
  try {
    return req('node:fs').readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => {
      const m = JSON.parse(readFileSync(join(dir, f), 'utf8')).meta;
      return { file: f, ms: m.ms, cost: m.cost };
    });
  } catch {
    return [];
  }
}
