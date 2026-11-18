// UI audit (task 024): opens every surface and state of the built app,
// measures the DOM and the rendered pixels, and reports defects without
// being told where to look. Writes artifacts/audit/ (never committed):
//   findings.json      every finding, raw and de-duplicated
//   findings.md        the de-duplicated list, grouped by component
//   index.html         the contact sheet: 3x crops with guides, by component
//   crops/, shots/     the crops and the full screenshots (CSS scale)
//
//   node scripts/ui-audit.mjs                      the whole matrix
//   node scripts/ui-audit.mjs --configs d1440-zh   some configurations (name prefixes)
//   node scripts/ui-audit.mjs --only pinned,plan   some states (name prefixes)
//   node scripts/ui-audit.mjs --no-crops           measurements only
//   node scripts/ui-audit.mjs --smoke              a small set, compared with
//                                                  scripts/ui-audit-allow.json
//   node scripts/ui-audit.mjs --smoke --write-allow  rewrite that list
//
// The rules are in scripts/ui-audit-rules.mjs; what each one measures, its
// tolerance and its false positives are in docs/tasks/024-notes.md.
// Requires a build (`pnpm --filter @opensu/web build`).
import { createHash } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STUB_KEY, STUB_MODEL, startStub } from './chat-stub.mjs';
import { analysePixels, anchoredSurfaces, hoverRead, hoverTargets, inkStrength, joinFill, measureDom, motionFrame, shapeMask, tipContrast } from './ui-audit-rules.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, '..');
const repoRoot = resolve(appRoot, '../..');
const outDir = resolve(repoRoot, 'artifacts/audit');
const allowFile = resolve(here, 'ui-audit-allow.json');
const argv = process.argv.slice(2);
const flag = (f) => argv.includes(f);
const listArg = (f) => (argv.indexOf(f) >= 0 ? argv[argv.indexOf(f) + 1].split(',') : null);
const smoke = flag('--smoke');
const writeAllow = flag('--write-allow');
const onlyStates = listArg('--only');
const onlyConfigs = listArg('--configs');
const crops = !smoke && !flag('--no-crops');
const noHover = flag('--no-hover');
const noMotion = flag('--no-motion');
const DPR = 3;

if (!existsSync(resolve(appRoot, 'dist/client/studio.html'))) {
  console.error('No build found: run `pnpm --filter @opensu/web build` first.');
  process.exit(1);
}
const require = createRequire(import.meta.url);
let playwright;
try {
  playwright = require('playwright');
} catch {
  playwright = require(require.resolve('playwright', { paths: [process.env.NODE_PATH ?? '', '/opt/node-tools/node_modules'] }));
}
if (!smoke) rmSync(outDir, { recursive: true, force: true });
mkdirSync(resolve(outDir, 'crops'), { recursive: true });
mkdirSync(resolve(outDir, 'shots'), { recursive: true });

/* ------------------------------------------------------------------ */
/* The app: built preview, scripted chat stub, local D1, test hooks    */
/* ------------------------------------------------------------------ */

const freePort = () =>
  new Promise((ok) => {
    const s = createServer();
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => ok(port));
    });
  });
const stub = await startStub();
const KEYS_SECRET = 'audit-keys-secret-not-real-0123456789abcdef';
const OR_KEY = 'sk-or-v1-audit-not-a-real-key-0r0r';
const ANT_KEY = 'sk-ant-api03-audit-not-a-real-key-a7a7';
const devVars = resolve(appRoot, 'dist/server/.dev.vars');
const previews = [];
async function startPreview(extra = {}) {
  const state = mkdtempSync(join(tmpdir(), 'opensu-audit-'));
  execFileSync(process.execPath, [resolve(appRoot, 'node_modules/wrangler/bin/wrangler.js'), 'd1', 'migrations', 'apply', 'DB', '--local', '--persist-to', state], { cwd: appRoot, stdio: 'pipe', env: { ...process.env, CI: '1' } });
  const port = await freePort();
  const base = `http://localhost:${port}`;
  const vars = {
    OPENAI_API_KEY: STUB_KEY,
    OPENAI_BASE_URL: stub.url,
    OPENSU_MODEL: STUB_MODEL,
    SITE_URL: base,
    BETTER_AUTH_SECRET: 'audit-secret-not-real-0123456789abcdef',
    AUTH_TEST_HOOK: '1',
    KEYS_SECRET,
    KEYS_TEST_UPSTREAM: stub.url.replace(/\/v1$/, ''),
    QUOTA_IP_DAILY: '100000',
    QUOTA_SITE_DAILY: '100000',
    ...extra,
  };
  writeFileSync(devVars, Object.entries(vars).map(([k, v]) => `${k}='${v}'\n`).join(''));
  const proc = spawn(process.execPath, [resolve(appRoot, 'node_modules/vite/bin/vite.js'), 'preview', '--port', String(port), '--strictPort'], { cwd: appRoot, stdio: 'ignore', env: { ...process.env, CI: '1', OPENSU_STATE: state } });
  const p = { base, stop: () => (proc.kill('SIGTERM'), rmSync(state, { recursive: true, force: true })) };
  previews.push(p);
  process.on('exit', () => proc.kill('SIGTERM'));
  for (let i = 0; i < 160; i++) {
    try {
      if ((await fetch(`${base}/api/health`)).ok) return p;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('preview did not start');
}
const preview = await startPreview();
console.log(`audit: preview ${preview.base}, chat stub ${stub.url} (scripted, not a model)`);
const browser = await playwright.chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
// The pixel work happens here, never in the page under test.
const lab = await (await browser.newContext()).newPage();
await lab.setContent('<!doctype html><title>lab</title>');

/* ------------------------------------------------------------------ */
/* The matrix                                                          */
/* ------------------------------------------------------------------ */

// Full: every state. Layout: the states whose layout depends on width and
// language. Glass: the states whose pixels depend on the glass backend.
const FULL = 'full', LAYOUT = 'layout', GLASS = 'glass', SMOKE = 'smoke';
const CONFIGS = [
  { name: 'd1440-zh', w: 1440, h: 900, lang: 'zh', set: FULL },
  { name: 'p390-zh', w: 390, h: 844, phone: true, lang: 'zh', set: FULL },
  { name: 'd1280-zh', w: 1280, h: 720, lang: 'zh', set: LAYOUT },
  { name: 'd2000-zh', w: 2000, h: 1100, lang: 'zh', set: LAYOUT },
  { name: 'd1440-en', w: 1440, h: 900, lang: 'en', set: FULL },
  { name: 'd1280-en', w: 1280, h: 720, lang: 'en', set: LAYOUT },
  { name: 'd2000-en', w: 2000, h: 1100, lang: 'en', set: LAYOUT },
  { name: 'p390-en', w: 390, h: 844, phone: true, lang: 'en', set: LAYOUT },
  { name: 'p844x390-zh', w: 844, h: 390, phone: true, lang: 'zh', set: LAYOUT },
  { name: 'd1440-zh-css', w: 1440, h: 900, lang: 'zh', css: true, set: GLASS },
  { name: 'p390-zh-css', w: 390, h: 844, phone: true, lang: 'zh', css: true, set: GLASS },
];
const SETS = {
  [LAYOUT]: ['landing', '3d-idle', 'panel-', 'project-menu', 'site-location', 'plan-', 'sheets', 'chat-text', 'chat-long-text', 'chat-done', 'chat-recent', 'pinned-', 'signin-email', 'account-'],
  [GLASS]: ['3d-idle', 'panel-', 'project-menu', 'chat-text', 'chat-done', 'chat-recent', 'pinned-', 'plan-pinned', 'signin-email', 'key-own-sheet', 'account-'],
  [SMOKE]: ['3d-idle', 'project-menu', 'pinned-idle', 'plan-pinned', 'account-invite', 'account-project', 'account-projects', 'account-share'],
};
const configs = smoke ? [{ ...CONFIGS[0], set: SMOKE }] : CONFIGS.filter((c) => !onlyConfigs || onlyConfigs.some((o) => c.name.startsWith(o)));

/* ------------------------------------------------------------------ */
/* Capture and measure one state                                       */
/* ------------------------------------------------------------------ */

const raw = []; // every finding
const states = []; // every state measured
const cropIndex = []; // { comp, file, config, state, w, h }
const strings = { zh: new Map(), en: new Map() };
const selectedSigs = [];
const disabledLooks = [];
const enabledLooks = [];
const colourUse = new Map();
const radiusUse = new Map();
const toolbars = []; // the toolbar's box per state (it keeps its width)
const subjects = []; // { config, state, mode, pinned, centre }
let tokenColours = null;
const cropHashes = new Map();
const errors = [];

const settle = (page, ms = 700) => page.evaluate((m) => new Promise((r) => setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(r)), m)), ms);
const HIDE_TEXT = '*,*::placeholder,*::before,*::after{color:transparent!important;-webkit-text-fill-color:transparent!important;caret-color:transparent!important;text-shadow:none!important}.lg svg,button svg,[role=menuitem] svg,[role=menuitemradio] svg{visibility:hidden!important}[data-primary-action],.lg-field,.lg-switch{visibility:hidden!important}';
// (Task 029: a surface's filled controls, the yellow primary action, a field and a switch, are content, not its glass: hidden too.)

const SEVERITY = {
  wrap: () => 'P1',
  'row-align': (f) => (f.evidence.spread > 2 ? 'P1' : 'P2'),
  'inset-lr': (f) => (Math.abs(f.evidence.left - f.evidence.right) > 3 ? 'P1' : 'P2'),
  'inset-tb': (f) => (Math.abs(f.evidence.top - f.evidence.bottom) > 3 ? 'P1' : 'P2'),
  'capsule-radius': () => 'P2',
  concentric: (f) => (f.evidence.glass && Math.abs(f.evidence.radius - f.evidence.expected) > 6 ? 'P1' : 'P2'),
  'glass-on-glass': () => 'P1',
  'card-in-card': () => 'P1',
  'box-in-panel': () => 'P2',
  hairline: () => 'P2',
  'bright-rule': () => 'P1',
  'field-passive-text': () => 'P1',
  'placeholder-dim': () => 'P1',
  'disabled-affordance': () => 'P1',
  'disabled-same': () => 'P1',
  'mode-centre': () => 'P1',
  'subject-centre': () => 'P1',
  'subject-same-point': () => 'P1',
  contrast: (f) => (f.evidence.ratio < 3 ? 'P0' : 'P1'),
  'hit-target': (f) => (f.phone ? 'P1' : 'P2'),
  overlap: (f) => (/glass/.test(f.msg) ? 'P1' : 'P1'),
  'text-size': () => 'P2',
  'text-truncated': () => 'P2',
  'selected-treatment': () => 'P2',
  'label-dupe': () => 'P2',
  'off-token-colour': () => 'P2',
  'off-token-radius': () => 'P2',
  'accent-use': () => 'P2',
  'stable-width': () => 'P2',
  'same-label': () => 'P1',
  'tip-contrast': (f) => (f.evidence.ratio < 3 ? 'P0' : 'P1'),
  'hover-plate': () => 'P1',
  'anchor-gap': () => 'P1',
  'panel-shell': () => 'P1',
  'motion-shape': () => 'P1',
  'motion-anchor': () => 'P1',
  'motion-empty': () => 'P1',
};

// A bright rule: a line inside a glass surface brighter than the glass on
// both sides, by this much luma (0-255) over the mean of the two sides. The
// module hairline (.lg-sep, 0.5 px, in the project menu) measures about 24
// in these screenshots (DPR 3, read at CSS scale); a rule half as bright
// again is flagged.
const HAIRLINE_REF = 24;
const BRIGHT_RULE_DELTA = 36;
// The placeholder must be visibly dimmer than entered text: its ink strength
// at most this share of the entered text's.
const PLACEHOLDER_MAX = 0.8;
// Disabled controls: share of the box in the accent colour.
const DISABLED_ACCENT_MAX = 0.25;
// The module's gap between a floating surface and its anchor (material.ts
// `GLASS.anchorGap`; 8 px, the menus' old margin, where it is not defined).
const ANCHOR_GAP = (() => {
  try {
    const m = /anchorGap:\s*(\d+(?:\.\d+)?)/.exec(readFileSync(resolve(appRoot, 'src/ui/material.ts'), 'utf8'));
    return m ? Number(m[1]) : 8;
  } catch {
    return 8;
  }
})();
// Tooltips: the contrast of their text on rendered pixels.
const TIP_MIN = 4.5;
// Motion: a frame's glass outline against the rounded rectangle of its bounding box.
const MOTION_IOU_MIN = 0.9;
const shells = []; // task 029: the inside of every open non-menu surface (title size, close box, inset)

async function capture(page, cfg, state, extra = {}) {
  // No hover: the pointer rests on the page's right edge (tooltips closed).
  if (!cfg.phone) await page.mouse.move(cfg.w - 2, Math.round(cfg.h / 2)).catch(() => {});
  await settle(page);
  const opts = { phone: !!cfg.phone, minText: 12, hitMin: cfg.phone ? 44 : 28 };
  let dom;
  try {
    dom = await page.evaluate(measureDom, opts);
  } catch (e) {
    errors.push(`${cfg.name} ${state}: measure failed: ${e.message.split('\n')[0]}`);
    return;
  }
  if (!tokenColours?.length || !tokenColours.some(([n]) => n.endsWith('(glass)'))) tokenColours = await page.evaluate(readTokenColours).catch(() => null);
  const normal = await page.screenshot({ scale: 'css', timeout: 120000 });
  const hide = await page.addStyleTag({ content: HIDE_TEXT });
  await settle(page, 120);
  const bare = await page.screenshot({ scale: 'css', timeout: 120000 });
  await hide.evaluate((n) => n.remove());
  const shotName = `${cfg.name}--${state}`;
  writeFileSync(resolve(outDir, 'shots', `${shotName}.png`), normal);
  const accent = await page.evaluate(() => {
    const p = document.createElement('span');
    p.style.color = 'var(--color-accent)';
    document.body.appendChild(p);
    const c = getComputedStyle(p).color;
    p.remove();
    const m = /rgba?\(([^)]+)\)/.exec(c);
    return m ? m[1].split(/[ ,/]+/).slice(0, 3).map(Number) : null;
  });
  const px = await lab.evaluate(analysePixels, {
    normal: normal.toString('base64'),
    bare: bare.toString('base64'),
    textBoxes: dom.textBoxes,
    nested: dom.nested,
    surfaces: dom.surfaces,
    disabled: dom.disabled,
    enabledKeyed: dom.enabledKeyed,
    accent,
  });
  const found = [...dom.findings];
  const at = (rule, f) => found.push({ rule, ...f });
  // contrast
  for (const c of px.contrast) {
    const large = c.size >= 18 || (c.size >= 14 && c.weight >= 700);
    const min = large ? 3 : 4.5;
    if (c.ratio < min) at('contrast', { el: c.id, comp: c.comp, msg: `text contrast ${c.ratio}:1 on the rendered glass (minimum ${min}:1)`, evidence: { ratio: c.ratio, background: `rgb(${c.bg.join(' ')})`, size: c.size, text: c.text }, rect: { x: c.rect[0], y: c.rect[1], w: c.rect[2], h: c.rect[3] } });
  }
  // fills of nested surfaces
  for (const f of px.fills) {
    const n = dom.nested.find((x) => x.id === f.id);
    if (Math.abs(f.delta) >= 6) at('card-in-card', { el: f.id, comp: f.comp, msg: `nested surface reads as its own card: fill luma ${f.inner} inside vs ${f.outer} around it (${f.delta > 0 ? '+' : ''}${f.delta})`, evidence: f, rect: n.rect });
  }
  // bright rules: name what draws the line (a border, the edge of a nested surface)
  for (const r of px.rules) {
    if (r.delta < BRIGHT_RULE_DELTA) continue;
    const s = dom.surfaces.find((x) => x.id === r.surface);
    const border = dom.rules.find((b) => Math.abs(b.y - r.y) <= 1.5);
    const edge = dom.surfaces.find((x) => x.id !== r.surface && (Math.abs(x.rect.y - r.y) <= 2 || Math.abs(x.rect.y + x.rect.h - r.y) <= 2));
    const what = border ? `${border.id} border` : edge ? `${edge.id} ${Math.abs(edge.rect.y - r.y) <= 2 ? 'top' : 'bottom'} edge` : `${r.surface} line`;
    at('bright-rule', { el: what, comp: r.comp, msg: `bright rule (${what}) at y ${r.y}: luma ${r.delta} above the glass around it (the module hairline measures ${HAIRLINE_REF})`, evidence: r, rect: { x: s.rect.x, y: r.y - 6, w: s.rect.w, h: 12 } });
  }
  // disabled controls
  for (const d of px.accent) {
    if (d.share > DISABLED_ACCENT_MAX) at('disabled-affordance', { el: d.id, comp: d.comp, msg: `cannot act but ${Math.round(d.share * 100)}% of it is solid accent (looks ready)`, evidence: d, rect: d.rect });
    disabledLooks.push({ config: cfg.name, state, ...d });
  }
  for (const d of px.enabledMeans) enabledLooks.push({ config: cfg.name, state, ...d });
  // placeholders: the same string as entered text, rendered, compared
  for (const f of dom.fields) {
    if (!f.sel) continue;
    const loc = page.locator(f.sel).first();
    const clip = { x: f.rect.x, y: f.rect.y, width: Math.max(4, f.rect.w), height: Math.max(4, f.rect.h) };
    try {
      const a = await page.screenshot({ scale: 'css', clip });
      await loc.evaluate((el, v) => {
        const set = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set;
        set.call(el, v);
      }, f.placeholder);
      const b = await page.screenshot({ scale: 'css', clip });
      await loc.evaluate((el) => {
        const set = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set;
        set.call(el, '');
      });
      const pa = await lab.evaluate(inkStrength, { png: a.toString('base64') });
      const pb = await lab.evaluate(inkStrength, { png: b.toString('base64') });
      const share = pb.p98 > 0 ? pa.p98 / pb.p98 : 1;
      const ev = { placeholderInk: pa.p98, textInk: pb.p98, share: Math.round(share * 100) / 100, placeholderColor: f.phColor, textColor: f.color, placeholderSize: f.phSize, textSize: f.size, placeholderWeight: f.phWeight, textWeight: f.weight };
      if (share > PLACEHOLDER_MAX) at('placeholder-dim', { el: f.id, comp: f.comp, msg: `placeholder is ${Math.round(share * 100)}% as strong as entered text${f.phSize === f.size && f.phWeight === f.weight ? `, same size and weight (${f.size}, ${f.weight})` : ''}`, evidence: ev, rect: f.rect });
    } catch (e) {
      errors.push(`${cfg.name} ${state}: placeholder test ${f.id}: ${e.message.split('\n')[0]}`);
    }
  }
  // Anchored surfaces (task 025; task 029: one attachment): every open surface stands at the module's gap from its anchor.
  const anchored = await page.evaluate(anchoredSurfaces).catch(() => []);
  for (const a of anchored) {
    const s = a.s, b = a.a;
    const xOver = Math.min(s.x + s.w, b.x + b.w) - Math.max(s.x, b.x);
    const yOver = Math.min(s.y + s.h, b.y + b.h) - Math.max(s.y, b.y);
    // Main axis: vertical when the two overlap horizontally (a menu below or above), else horizontal.
    const vertical = xOver > 0 || yOver <= 0;
    const gap = vertical ? Math.max(s.y - (b.y + b.h), b.y - (s.y + s.h)) : Math.max(s.x - (b.x + b.w), b.x - (s.x + s.w));
    const cross = vertical ? xOver : yOver;
    const ev = { gap: Math.round(gap * 10) / 10, crossOverlap: Math.round(cross * 10) / 10, surface: s, anchor: b, bar: a.bar };
    if (cross <= 0 || gap > ANCHOR_GAP + 1.5 || gap < ANCHOR_GAP - 1.5) {
      at('anchor-gap', { el: a.surface, comp: a.surface.replace(/[[\]]/g, ''), msg: cross <= 0 ? `an open surface does not overlap its anchor ${a.anchor} on the cross axis (${Math.round(gap)} px away)` : `an open surface is ${Math.round(gap)} px from its anchor ${a.anchor} (the module's gap is ${ANCHOR_GAP} px)`, evidence: ev, rect: { x: Math.min(s.x, b.x), y: Math.min(s.y, b.y), w: Math.max(s.x + s.w, b.x + b.w) - Math.min(s.x, b.x), h: Math.max(s.y + s.h, b.y + b.h) - Math.min(s.y, b.y) } });
    }
  }
  // Task 029: the inside of every open surface that is not a menu (desktop popovers, phone sheets).
  const sh = await page.evaluate(() => {
    const vis = (e) => {
      const r = e.getBoundingClientRect();
      if (r.width < 40 || r.height < 40) return false;
      for (let x = e; x && x.nodeType === 1; x = x.parentElement) if (getComputedStyle(x).visibility === 'hidden' || Number(getComputedStyle(x).opacity) < 0.5) return false;
      return true;
    };
    const tid = (e) => e.getAttribute('data-testid');
    const out = [];
    const surfaces = [...document.querySelectorAll('[data-anchored]:not([role=menu]), [data-testid=phone-sheet][data-kind=tool], [role=dialog]')].filter(vis);
    for (const sEl of surfaces) {
      const surf = sEl.closest('.lg') ?? sEl;
      if (out.some((o) => o.el === surf)) continue;
      const shell = surf.querySelector('.lg-panel');
      const title = shell?.querySelector('[data-panel-title]');
      const close = shell?.querySelector('[data-panel-close]');
      const cs = shell ? getComputedStyle(shell) : null;
      const t = title ? getComputedStyle(title) : null;
      const cr = close?.getBoundingClientRect();
      out.push({ el: surf, id: tid(surf) || tid(sEl) || surf.getAttribute('aria-label') || 'surface', shell: !!shell, phone: shell?.hasAttribute('data-phone') ?? false, title: t ? `${t.fontSize} ${t.fontWeight}` : null, close: cr ? `${Math.round(cr.width)}x${Math.round(cr.height)}` : null, inset: cs ? `${cs.paddingTop} ${cs.paddingRight} ${cs.paddingBottom} ${cs.paddingLeft}` : null, gap: cs?.rowGap ?? null });
    }
    return out.map(({ el, ...o }) => o);
  }).catch(() => []);
  for (const x of sh) {
    shells.push({ config: cfg.name, state, phone: !!cfg.phone, ...x });
    if (!x.shell) found.push({ rule: 'panel-shell', el: `[${x.id}]`, comp: x.id, msg: 'an open surface that is not a menu is not built on the Popover parts (its header, inset and footer are its own)', evidence: x });
  }
  if (crops) await cropState(page, cfg, state, dom, found);
  // record
  for (const f of found) raw.push({ ...f, config: cfg.name, state, phone: !!cfg.phone, lang: cfg.lang, backend: cfg.css ? 'css' : 'webgl', shot: `shots/${shotName}.png` });
  for (const s of dom.strings) {
    const m = strings[cfg.lang];
    if (!m.has(s)) m.set(s, `${cfg.name} ${state}`);
  }
  for (const s of dom.selected) selectedSigs.push({ config: cfg.name, state, backend: cfg.css ? 'css' : 'webgl', ...s });
  for (const [k, v] of dom.colours) if (!colourUse.has(k)) colourUse.set(k, `${v} (${cfg.name} ${state})`);
  for (const [k, v] of dom.radii) if (!radiusUse.has(k)) radiusUse.set(k, `${v} (${cfg.name} ${state})`);
  if (dom.toolbar) toolbars.push({ config: cfg.name, state, mode: dom.subject?.mode ?? null, ...dom.toolbar });
  if (dom.subject?.centre) subjects.push({ config: cfg.name, state, mode: dom.subject.mode, pinned: !!extra.pinned, key: extra.layout ?? null, centre: dom.subject.centre, box: dom.subject.box });
  states.push({ config: cfg.name, state, findings: found.length, subject: dom.subject, modeSwitch: dom.modeSwitch, rules: px.rules.map((r) => ({ comp: r.comp, y: r.y, delta: r.delta })), shot: `shots/${shotName}.png` });
  console.log(`  ${cfg.name} ${state}: ${found.length} findings`);
}


/* ------------------------------------------------------------------ */
/* Interaction passes (task 025): hover, motion                        */
/* ------------------------------------------------------------------ */

// States whose controls are hovered one by one (desktop: phones do not hover).
const HOVER_STATES = ['3d-idle', 'account-invite', 'account-signed-in', 'account-menu', 'account-share', 'account-share-viewer', 'account-project-menu', 'account-projects-page', 'panel-views', 'panel-levels', 'panel-sun', 'project-menu', 'plan-L2', 'plan-levels-panel', 'pinned-turn', 'pinned-menu', 'pinned-picker', 'chat-recent', 'site-location', 'signin-email', 'sheets'];

/** Hovers every control: tooltip contrast on rendered pixels, one hover plate shape and height per row. */
async function hoverPass(page, cfg, state) {
  if (cfg.phone) return [];
  const found = [];
  const targets = await page.evaluate(hoverTargets);
  const plates = [];
  for (const t of targets) {
    await page.mouse.move(t.x, t.y);
    await page.waitForTimeout(650);
    const h = await page.evaluate(hoverRead, t.i).catch(() => null);
    if (!h) continue;
    if (h.plate) plates.push({ ...t, ...h });
    for (const tip of h.tips) {
      // The plate without its rounded ends (they show what lies behind).
      const inset = Math.max(2, Math.min(tip.radius, tip.rect.h / 2));
      const clip = { x: tip.rect.x + inset, y: tip.rect.y + 2, width: tip.rect.w - 2 * inset, height: tip.rect.h - 4 };
      if (clip.width < 4 || clip.height < 4 || clip.x < 0 || clip.y < 0 || clip.x + clip.width > cfg.w || clip.y + clip.height > cfg.h) continue;
      const png = await page.screenshot({ clip, scale: 'device' });
      const c = await lab.evaluate(tipContrast, { png: png.toString('base64') });
      tipsSeen.push({ config: cfg.name, state, control: t.id, text: tip.text, ratio: c.ratio });
      if (c.ratio < TIP_MIN) found.push({ rule: 'tip-contrast', el: t.id, comp: t.comp, msg: `tooltip "${tip.text}" reads ${c.ratio}:1 on its plate (minimum ${TIP_MIN}:1)`, evidence: { ratio: c.ratio, plate: c.plate, ink: c.ink, text: tip.text }, rect: { x: tip.rect.x, y: tip.rect.y, w: tip.rect.w, h: tip.rect.h } });
    }
  }
  await page.mouse.move(cfg.w - 2, Math.round(cfg.h / 2));
  // One shape and one height per row (round ends count as one shape: capsule or circle).
  const rows = new Map();
  for (const p of plates) {
    if (p.row === null) continue;
    if (!rows.has(p.row)) rows.set(p.row, []);
    rows.get(p.row).push(p);
  }
  for (const list of rows.values()) {
    if (list.length < 2) continue;
    const shapeOf = (p) => (p.plate.full ? 'round ends' : `corner radius ${p.plate.radius}`);
    const shapes = [...new Set(list.map(shapeOf))];
    const hs = list.map((p) => p.plate.h);
    if (shapes.length > 1 || Math.max(...hs) - Math.min(...hs) > 1) {
      const x0 = Math.min(...list.map((p) => p.rect.x)), y0 = Math.min(...list.map((p) => p.rect.y));
      const x1 = Math.max(...list.map((p) => p.rect.x + p.rect.w)), y1 = Math.max(...list.map((p) => p.rect.y + p.rect.h));
      found.push({ rule: 'hover-plate', el: list.map((p) => p.id).join(' / '), comp: list[0].comp, msg: `hover plates in one row differ: ${list.map((p) => `${p.id.replace(/^\[[^\]]+\] /, '')} ${shapeOf(p)}, ${p.plate.h} px`).join('; ')}`, evidence: list.map((p) => ({ id: p.id, ...p.plate })), rect: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } });
    }
  }
  return found;
}
const tipsSeen = [];

/**
 * Frames of a surface opening (`act` opens it) or closing, with the module's
 * clock stepped by hand (the springs) and CSS transitions slowed: on every
 * frame the glass outline is a rounded rectangle and the surface is not an
 * empty shape at full opacity.
 */
const MOTION_FRAMES = 12;
const MOTION_STEP_MS = 55;
async function motionPass(page, cfg, state, { open, close, find, between }) {
  const found = [];
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Animation.enable');
  let hide = null;
  const dir = resolve(outDir, 'motion', cfg.name);
  mkdirSync(dir, { recursive: true });
  const run = async (label, act, handle) => {
    const frames = [];
    hide = await page.addStyleTag({ content: HIDE_TEXT });
    await page.evaluate(() => window.__auditClock.freeze());
    await cdp.send('Animation.setPlaybackRate', { playbackRate: 0.03 });
    await act();
    let el = handle ?? null;
    for (let k = 0; k < MOTION_FRAMES; k++) {
      await page.evaluate((ms) => window.__auditClock.advance(ms), MOTION_STEP_MS);
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      if (!el) el = await find();
      const f = el ? await page.evaluate(motionFrame, el).catch(() => ({ gone: true })) : { gone: true };
      const png = await page.screenshot({ scale: 'css', timeout: 120000 });
      const file = `${state}-${label}-${String(k).padStart(2, '0')}.png`;
      writeFileSync(resolve(dir, file), png);
      frames.push({ k, f, png, file });
    }
    await cdp.send('Animation.setPlaybackRate', { playbackRate: 1 });
    await page.evaluate(() => window.__auditClock.release());
    await settle(page, 900);
    return { frames, el };
  };
  const unhide = async () => {
    await hide?.evaluate((n) => n.remove()).catch(() => {});
    hide = null;
  };
  try {
    const o = await run('open', open, null);
    // The settled surface: its area and the luma of its glass.
    const el = o.el ?? (await find());
    const fin = el ? await page.evaluate(motionFrame, el) : null;
    const finPng = await page.screenshot({ scale: 'css' });
    const name = el ? await el.evaluate((e) => e.getAttribute('data-testid') || e.getAttribute('aria-label') || e.getAttribute('role')).catch(() => null) : null;
    let thr = 170;
    if (fin && !fin.gone) {
      const b = fin.b;
      const inside = { x: Math.round(b.x + Math.min(24, b.w / 4)), y: Math.round(b.y + Math.min(24, b.h / 4)), w: Math.max(4, Math.round(b.w - 2 * Math.min(24, b.w / 4))), h: 4 };
      const j = await lab.evaluate(joinFill, { png: finPng.toString('base64'), band: inside, inside });
      thr = Math.min(205, j.glass + 0.45 * (250 - j.glass));
    }
    // Task 029, part 4: where the surface's anchor stands (the bar's edge for a control in a bar), at rest.
    const anc = el ? await el.evaluate((e) => {
      const a = e.__anchor?.();
      if (!a) return null;
      const r = a.getBoundingClientRect();
      const bar = a.closest('.lg[data-kind=control]');
      const b = bar && bar !== a ? bar.getBoundingClientRect() : null;
      const box = b && b.height <= 64 ? { x: r.left, y: b.top, w: r.width, h: b.height } : { x: r.left, y: r.top, w: r.width, h: r.height };
      return { a: box, bar: b ? { x: b.left, y: b.top, w: b.width, h: b.height } : null };
    }).catch(() => null) : null;
    await unhide();
    if (between) await between();
    const c = close ? await run('close', close, el) : { frames: [] };
    await unhide();
    const area = fin && !fin.gone ? fin.b.w * fin.b.h : 0;
    for (const [label, seq] of [['open', o.frames], ['close', c.frames]]) {
      let worst = null, empty = null;
      for (const fr of seq) {
        const f = fr.f;
        // A sliver (the last frames of a close) is too thin to judge at CSS pixels.
        if (f.gone || f.alpha < 0.05 || f.b.w < 12 || f.b.h < 12) continue;
        const m = await lab.evaluate(shapeMask, { png: fr.png.toString('base64'), b: f.b, thr, margin: 2 });
        fr.m = m;
        // The outline is judged where the glass is mostly opaque (a fading surface reads lighter than the threshold).
        if (!m.skip && f.alpha >= 0.75 && (m.iou < MOTION_IOU_MIN || m.cover < 0.6) && (!worst || m.iou < worst.m.iou)) worst = fr;
        if (area && f.alpha >= 0.9 && (f.b.w * f.b.h) / area >= 0.25 && f.content < 0.15 && !empty) empty = fr;
      }
      const id = name ? `[${name}]` : state;
      // Task 029, part 4: it opens away from its anchor. On no frame does its glass cross the anchor or the bar the
      // anchor sits in, and its edge nearest the anchor stays within the module's gap of where it rests (it grows
      // away from the anchor; it does not slide across it).
      if (anc && fin && !fin.gone) {
        const fb = fin.b;
        const below = fb.y >= anc.a.y + anc.a.h - 2, above = fb.y + fb.h <= anc.a.y + 2;
        const keep = [anc.a, anc.bar].filter(Boolean);
        let bad = null;
        for (const fr of seq) {
          const f = fr.f;
          if (f.gone || f.alpha < 0.05 || f.b.w < 1 || f.b.h < 1) continue;
          const hits = keep.some((k) => f.b.x < k.x + k.w - 0.5 && f.b.x + f.b.w > k.x + 0.5 && f.b.y < k.y + k.h - 0.5 && f.b.y + f.b.h > k.y + 0.5);
          const drift = below ? Math.abs(f.b.y - fb.y) : above ? Math.abs(f.b.y + f.b.h - (fb.y + fb.h)) : 0;
          if ((hits || drift > ANCHOR_GAP + 1.5) && !bad) bad = { fr, hits, drift };
        }
        if (bad) found.push({ rule: 'motion-anchor', el: id, comp: id.replace(/[[\]]/g, ''), msg: `while it ${label}s, the surface ${bad.hits ? 'crosses its anchor or the bar it sits in' : `slides ${Math.round(bad.drift)} px along its anchor's side instead of growing away from it`} (frame ${bad.fr.k})`, evidence: { frame: `motion/${cfg.name}/${bad.fr.file}`, box: bad.fr.f.b, anchor: anc.a, bar: anc.bar, drift: Math.round(bad.drift * 10) / 10 }, rect: { x: bad.fr.f.b.x, y: bad.fr.f.b.y, w: bad.fr.f.b.w, h: bad.fr.f.b.h } });
      }
      motionSeen.push({ config: cfg.name, state, dir: label, frames: seq.map((fr) => ({ file: fr.file, ...fr.f, iou: fr.m?.iou, cover: fr.m?.cover })) });
      if (worst) found.push({ rule: 'motion-shape', el: id, comp: id.replace(/[[\]]/g, ''), msg: `while it ${label}s, the glass is not a rounded rectangle (frame ${worst.k}: ${Math.round(worst.m.iou * 100)}% of its outline matches its box's rounded rectangle, ${Math.round(worst.m.cover * 100)}% of its box is glass)`, evidence: { frame: `motion/${cfg.name}/${worst.file}`, iou: worst.m.iou, cover: worst.m.cover, box: worst.f.b, mask: worst.m.bbox, thr: Math.round(thr) }, rect: { x: worst.f.b.x, y: worst.f.b.y, w: worst.f.b.w, h: worst.f.b.h } });
      if (empty) found.push({ rule: 'motion-empty', el: id, comp: id.replace(/[[\]]/g, ''), msg: `while it ${label}s, the surface is an empty shape at full opacity (frame ${empty.k}: glass ${Math.round(empty.f.alpha * 100)}%, ${Math.round(((empty.f.b.w * empty.f.b.h) / area) * 100)}% of its size, content ${Math.round(empty.f.content * 100)}%)`, evidence: { frame: `motion/${cfg.name}/${empty.file}`, ...empty.f }, rect: { x: empty.f.b.x, y: empty.f.b.y, w: empty.f.b.w, h: empty.f.b.h } });
    }
  } catch (e) {
    errors.push(`${cfg.name} ${state}: motion: ${e.message.split('\n')[0]}`);
  } finally {
    await unhide();
    await page.evaluate(() => window.__auditClock.release()).catch(() => {});
    await cdp.detach().catch(() => {});
  }
  for (const f of found) raw.push({ ...f, config: cfg.name, state, phone: !!cfg.phone, lang: cfg.lang, backend: cfg.css ? 'css' : 'webgl', shot: `shots/${cfg.name}--${state}.png` });
  console.log(`  ${cfg.name} ${state}: motion, ${found.length} findings`);
  return found;
}
const motionSeen = [];

/** The module's clock, for stepping springs frame by frame (performance.now, scaled or frozen). */
function auditClock() {
  const real = performance.now.bind(performance);
  let base = 0, at = 0, frozen = false;
  performance.now = () => (frozen ? base : base + (real() - at));
  window.__auditClock = {
    freeze() {
      base = performance.now();
      frozen = true;
    },
    advance(ms) {
      base += ms;
    },
    release() {
      if (!frozen) return;
      at = real();
      frozen = false;
    },
  };
}

/** Resolves every colour custom property of the glass layer (the tokens). */
function readTokenColours() {
  const names = new Set();
  const visit = (rules) => {
    for (const r of rules) {
      if (r.style) for (const p of r.style) if (p.startsWith('--')) names.add(p);
      if (r.cssRules) visit(r.cssRules);
    }
  };
  for (const s of document.styleSheets) {
    try {
      visit(s.cssRules);
    } catch {
      /* cross-origin */
    }
  }
  const host = document.querySelector('[data-glass-tone]') || document.body;
  // The material's values are set inline on the glass layer.
  for (const e of [host, document.documentElement]) for (const p of e.style) if (p.startsWith('--')) names.add(p);
  const out = [];
  const probe = document.createElement('span');
  host.appendChild(probe);
  for (const n of names) {
    probe.style.color = '';
    probe.style.color = `var(${n})`;
    const c = getComputedStyle(probe).color;
    const v = getComputedStyle(host).getPropertyValue(n).trim();
    if (v && /^(#|rgb|hsl|oklch|color|white|black|transparent)/.test(v)) out.push([n, c]);
  }
  probe.remove();
  // Inside glass the ink levels are remapped: read them there too.
  const lg = document.querySelector('.lg');
  if (lg) {
    const p2 = document.createElement('span');
    lg.appendChild(p2);
    for (const n of names) {
      p2.style.color = '';
      p2.style.color = `var(${n})`;
      const c = getComputedStyle(p2).color;
      if (getComputedStyle(lg).getPropertyValue(n).trim()) out.push([`${n} (glass)`, c]);
    }
    p2.remove();
  }
  return out;
}

/** 3x crops of every surface (and every finding) with guides drawn on top. */
async function cropState(page, cfg, state, dom, found) {
  const items = dom.comps.map((c) => ({ ...c, rect: c.guides.box, guides: c.guides, kind: 'comp' }));
  const seenF = new Set();
  for (const f of found) {
    if (!f.rect || f.rect.w < 1) continue;
    const k = `${f.rule}|${f.el}`;
    if (seenF.has(k)) continue;
    seenF.add(k);
    f.crop = `crops/${cfg.name}/${state}/f-${seenF.size}.png`;
    items.push({ key: `f-${seenF.size}`, name: f.comp, rect: f.rect, guides: { box: f.rect, centreY: f.rect.y + f.rect.h / 2 }, kind: 'finding', finding: f });
  }
  await page.evaluate(
    ({ items, dpr }) => {
      const o = document.createElement('div');
      o.setAttribute('data-audit-overlay', '');
      o.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none';
      const t = 1 / dpr;
      const line = (x, y, w, h, c) => {
        const d = document.createElement('div');
        d.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;background:${c}`;
        o.appendChild(d);
      };
      for (const it of items) {
        const b = it.guides.box;
        const col = it.kind === 'finding' ? 'rgba(255,40,40,.95)' : 'rgba(0,190,255,.9)';
        line(b.x, b.y, b.w, t, col);
        line(b.x, b.y + b.h - t, b.w, t, col);
        line(b.x, b.y, t, b.h, col);
        line(b.x + b.w - t, b.y, t, b.h, col);
        line(b.x - 6, it.guides.centreY, b.w + 12, t, 'rgba(255,0,200,.9)');
        if (it.guides.inkL !== undefined) {
          line(it.guides.inkL, b.y - 4, t, b.h + 8, 'rgba(60,220,60,.95)');
          line(it.guides.inkR, b.y - 4, t, b.h + 8, 'rgba(60,220,60,.95)');
        }
        for (const cy of it.guides.childCentres ?? []) line(b.x - 10, cy, 8, t, 'rgba(255,150,0,.95)');
      }
      document.body.appendChild(o);
    },
    { items, dpr: DPR },
  );
  try {
    for (const it of items) {
      const pad = 10;
      const x = Math.max(0, it.rect.x - pad), y = Math.max(0, it.rect.y - pad);
      const w = Math.min(cfg.w - x, it.rect.w + 2 * pad), h = Math.min(cfg.h - y, it.rect.h + 2 * pad);
      if (w < 4 || h < 4) continue;
      const buf = await page.screenshot({ clip: { x, y, width: w, height: h }, scale: 'device', timeout: 60000 });
      const hash = createHash('sha1').update(buf).digest('hex');
      const dir = resolve(outDir, 'crops', cfg.name, state);
      mkdirSync(dir, { recursive: true });
      const file = `crops/${cfg.name}/${state}/${it.kind === 'finding' ? it.key : it.key.replace(/[^\w-]+/g, '_')}.png`;
      if (it.kind === 'comp' && cropHashes.has(`${it.name}|${hash}`)) continue; // the same pixels already shown
      cropHashes.set(`${it.name}|${hash}`, file);
      writeFileSync(resolve(outDir, file), buf);
      if (it.kind === 'comp') cropIndex.push({ comp: it.name, file, config: cfg.name, state, w, h });
    }
  } finally {
    await page.evaluate(() => document.querySelectorAll('[data-audit-overlay]').forEach((n) => n.remove()));
  }
}

/* ------------------------------------------------------------------ */
/* Driving the app                                                     */
/* ------------------------------------------------------------------ */

const WHERE = { timezoneId: 'Asia/Shanghai', locale: 'zh-CN' };
async function newPage(cfg, { hints = false, init } = {}) {
  const ctx = await browser.newContext({ viewport: { width: cfg.w, height: cfg.h }, deviceScaleFactor: DPR, isMobile: !!cfg.phone, hasTouch: !!cfg.phone, ...WHERE });
  await ctx.addInitScript(
    ({ hints, lang }) => {
      if (!hints) localStorage.setItem('opensu.hints.v1', 'done');
      localStorage.setItem('opensu.lang', lang);
    },
    { hints, lang: cfg.lang },
  );
  if (init) await ctx.addInitScript(init.fn, init.arg);
  await ctx.addInitScript(auditClock);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${cfg.name}: page error ${e.message}`));
  return { ctx, page };
}
const q = (cfg, extra = '') => `?dpr=1${cfg.css ? '&glass=css' : ''}${extra}`;
async function openStudio(page, cfg, extra = '') {
  await page.goto(`${preview.base}/studio${q(cfg, extra)}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__studio?.ready3d === true, null, { timeout: 180000 });
  await settle(page, 1200);
}
const store = (page, fn, arg) => page.evaluate(fn, arg);
const esc = async (page) => {
  await page.keyboard.press('Escape');
  await settle(page, 500);
};
const lastDone = (page) => page.evaluate(() => window.__studio.chat.getState().items.filter((i) => i.role === 'assistant').length);
async function turn(page, text, { hold = 0, onWorking } = {}) {
  const n = await lastDone(page);
  let release;
  if (hold) {
    const gate = new Promise((r) => (release = r));
    await page.route('**/api/chat', async (route) => {
      if (route.request().method() === 'POST') await gate;
      await route.continue();
    });
  }
  const input = page.getByTestId('prompt-bar').first();
  await input.fill(text);
  await input.press('Enter');
  if (hold) {
    await page.waitForFunction(() => window.__studio.chat.getState().running, null, { timeout: 10000 }).catch(() => {});
    if (onWorking) await onWorking();
    release();
  }
  await page.waitForFunction((k) => {
    const s = window.__studio.chat.getState();
    return s.items.filter((i) => i.role === 'assistant').length > k && !s.running;
  }, n, { timeout: 90000 }).catch(() => errors.push(`turn "${text}" did not finish`));
  if (hold) await page.unroute('**/api/chat');
}
const T = {
  zh: { north: '把北侧房间加深 600', long: '把北侧房间加深 600，再把二楼的起居室改成卧室，屋顶坡度改小一点，南边加一个大阳台，院子里多种几棵银杏树，最好还能有一个车库', giveUp: '开一个 9 米的门', rate: '限流测试', hi: '你好' },
  en: { north: 'Make the north rooms 600 deeper', long: 'Make the north rooms 600 deeper, turn the upstairs family room into a bedroom, make the roof flatter, add a large balcony to the south and plant a few more ginkgo trees in the yard', giveUp: 'Add a 9 m door', rate: 'rate limit test', hi: 'Hello' },
};

function wants(cfg, name) {
  if (onlyStates && !onlyStates.some((o) => name.startsWith(o))) return false;
  if (cfg.set === FULL) return true;
  return SETS[cfg.set].some((p) => name.startsWith(p));
}

async function runConfig(cfg) {
  console.log(`\n${cfg.name} (${cfg.w}x${cfg.h}, ${cfg.lang}, ${cfg.css ? 'CSS glass' : 'WebGL glass'}, ${cfg.set})`);
  const S = async (page, name, fn, extra) => {
    if (!wants(cfg, name)) return false;
    try {
      if (fn) await fn();
      await capture(page, cfg, name, extra);
      if (!cfg.phone && HOVER_STATES.includes(name) && !noHover) {
        const hf = await hoverPass(page, cfg, name);
        for (const f of hf) raw.push({ ...f, config: cfg.name, state: name, phone: !!cfg.phone, lang: cfg.lang, backend: cfg.css ? 'css' : 'webgl', shot: `shots/${cfg.name}--${name}.png` });
        console.log(`  ${cfg.name} ${name}: hover, ${hf.length} findings`);
      }
    } catch (e) {
      errors.push(`${cfg.name} ${name}: ${e.message.split('\n')[0]}`);
    }
    return true;
  };
  const tl = T[cfg.lang];
  // A surface that opens: its frames (open and close) around the state's capture.
  const M = async (page, name, { open, close, find, extra }) => {
    if (!wants(cfg, name)) return false;
    if (noMotion) {
      await open();
      await settle(page, 1200);
      await S(page, name, null, extra);
      if (close) await close();
      await settle(page, 600);
      return true;
    }
    await motionPass(page, cfg, name, { open, close, find, between: () => S(page, name, null, extra) });
    return true;
  };
  const byTestId = (page, id) => () => page.$(`[data-testid="${id}"]`);

  if (wants(cfg, 'landing')) {
    const { ctx, page } = await newPage(cfg);
    await page.goto(`${preview.base}/${q(cfg)}`, { waitUntil: 'networkidle' });
    await settle(page, 1200);
    await S(page, 'landing');
    await ctx.close();
  }
  if (wants(cfg, '3d-first-visit') && cfg.set === FULL) {
    const { ctx, page } = await newPage(cfg, { hints: true });
    await openStudio(page, cfg);
    await S(page, '3d-first-visit');
    await ctx.close();
  }

  const { ctx, page } = await newPage(cfg);
  await openStudio(page, cfg, '&sun=winter&time=10:00');
  await S(page, '3d-idle');
  for (const tool of ['views', 'levels', 'sun']) {
    if (!wants(cfg, `panel-${tool}`)) continue;
    // Desktop panels are anchored surfaces: each is filmed opening and closing (task 029: away from its tool).
    if (!cfg.phone) {
      await M(page, `panel-${tool}`, { open: () => page.getByTestId(`bar-${tool}`).first().click(), close: () => page.keyboard.press('Escape'), find: byTestId(page, `tray-${tool}`) });
      await settle(page, 600);
      continue;
    }
    await S(page, `panel-${tool}`, async () => {
      await page.getByTestId(`bar-${tool}`).first().click();
      await settle(page, 1200);
    });
    if (cfg.phone) await page.getByTestId(`bar-${tool}`).first().click().catch(() => {});
    else await esc(page);
    await settle(page, 600);
  }
  if (wants(cfg, 'sun-')) {
    await S(page, 'sun-on', async () => {
      await store(page, () => {
        const s = window.__studio.store.getState();
        s.setSun({ on: true });
      });
      await settle(page, 1500);
    });
    await S(page, 'sun-off', async () => {
      await store(page, () => window.__studio.store.getState().setSun({ on: false }));
      await settle(page, 1500);
    });
  }
  await M(page, 'project-menu', { open: () => page.getByTestId('project-menu').first().click(), close: () => page.keyboard.press('Escape'), find: () => page.$('[role=menu]') });
  for (const kind of ['location', 'orientation']) {
    if (!wants(cfg, `site-${kind}`)) continue;
    if (!cfg.phone && kind === 'location') {
      await M(page, 'site-location', { open: () => store(page, () => window.__studio.store.getState().setSitePanel({ kind: 'location' })), close: () => store(page, () => window.__studio.store.getState().setSitePanel(null)), find: byTestId(page, 'panel-site') });
      await settle(page, 700);
      continue;
    }
    await S(page, `site-${kind}`, async () => {
      await store(page, (k) => window.__studio.store.getState().setSitePanel({ kind: k }), kind);
      await settle(page, 1300);
    });
    await store(page, () => window.__studio.store.getState().setSitePanel(null));
    await settle(page, 700);
  }
  if (wants(cfg, 'walk')) {
    await S(page, 'walk', async () => {
      await page.getByTestId('bar-walk').first().click();
      await settle(page, 2500);
    });
    await store(page, () => window.__studio.store.getState().setWalk(false));
    await settle(page, 1200);
  }
  if (wants(cfg, 'plan-')) {
    await store(page, () => window.__studio.store.getState().setMode('plan'));
    await page.waitForSelector('[data-testid=plan] svg', { timeout: 90000 });
    await settle(page, 1500);
    const levels = await page.evaluate(() => window.__studio.store.getState().house.levels.map((l) => l.id));
    await S(page, 'plan-L1', null, { layout: 'plain' });
    if (levels[1]) {
      await S(page, 'plan-L2', async () => {
        await store(page, (id) => window.__studio.store.getState().setLevel(id), levels[1]);
        await settle(page, 1500);
      });
      if (cfg.phone) {
        await S(page, 'plan-levels-panel', async () => {
          await page.getByTestId('bar-levels').first().click();
          await settle(page, 1200);
        });
        await page.getByTestId('bar-levels').first().click().catch(() => {});
      } else await M(page, 'plan-levels-panel', { open: () => page.getByTestId('bar-levels').first().click(), close: () => page.keyboard.press('Escape'), find: byTestId(page, 'tray-levels') });
      await store(page, (id) => window.__studio.store.getState().setLevel(id), levels[0]);
    }
    await store(page, () => window.__studio.store.getState().setMode('3d'));
    await settle(page, 1500);
  }
  if (wants(cfg, 'sheets')) {
    await S(page, 'sheets', async () => {
      await store(page, () => window.__studio.store.getState().setMode('sheet'));
      await page.waitForTimeout(4000);
      await page.waitForFunction(() => !/正在生成|Generating/.test(document.body.innerText), null, { timeout: 120000 }).catch(() => {});
      await settle(page, 1200);
    });
    await store(page, () => window.__studio.store.getState().setMode('3d'));
    await settle(page, 1500);
  }
  // The conversation, before any turn (the free allowance hint shows 3).
  const prompt = page.getByTestId('prompt-bar').first();
  await S(page, 'chat-focused', async () => {
    await prompt.click();
    await settle(page, 600);
  });
  await S(page, 'chat-text', async () => {
    await prompt.fill(tl.north);
  });
  await S(page, 'chat-long-text', async () => {
    await prompt.fill(tl.long);
  });
  await prompt.fill('').catch(() => {});
  await page.locator('body').click({ position: { x: 5, y: Math.round(cfg.h / 2) } }).catch(() => {});
  const pin = (on) => store(page, (v) => window.__studio.store.getState().setPinned(v), on).then(() => settle(page, 1600));
  if (wants(cfg, 'pinned-idle') || wants(cfg, 'pinned-text') || wants(cfg, 'pinned-long')) {
    await pin(true);
    await S(page, 'pinned-idle', null, { pinned: true });
    await S(page, 'pinned-text', () => page.getByTestId('prompt-bar').first().fill(tl.north));
    await S(page, 'pinned-long-text', () => page.getByTestId('prompt-bar').first().fill(tl.long));
    await page.getByTestId('prompt-bar').first().fill('').catch(() => {});
    await pin(false);
  }
  // Turn 1: working, finished (the change in the input), recent strip, pinned.
  await turn(page, tl.north, { hold: wants(cfg, 'chat-working') ? 1 : 0, onWorking: () => S(page, 'chat-working', () => settle(page, 1200)) });
  // Task 029: signed out, the first change raises the sign-in invitation above the input; closed before the
  // next states (they are measured as before).
  if (await page.getByTestId('signin-invite').count()) {
    if (wants(cfg, 'account-invite')) await S(page, 'account-invite', () => settle(page, 300));
    await page.getByTestId('signin-invite-close').first().click();
    await settle(page, 400);
  }
  await S(page, 'chat-done', () => settle(page, 300));
  await S(page, 'chat-recent', async () => {
    await store(page, () => window.__studio.store.getState().setRecent(true));
    await settle(page, 1200);
  });
  await store(page, () => window.__studio.store.getState().setRecent(false));
  if (wants(cfg, 'pinned-') || wants(cfg, 'plan-pinned')) {
    await pin(true);
    await S(page, 'pinned-turn', null, { pinned: true });
    // The project menu over the pinned conversation (it steps aside), and the key menu at its button.
    await M(page, 'pinned-menu', { open: () => page.getByTestId('project-menu').first().click(), close: () => page.keyboard.press('Escape'), find: () => page.$('[role=menu]') });
    await M(page, 'pinned-picker', { open: () => page.getByTestId('key-picker').first().click(), close: () => page.keyboard.press('Escape'), find: () => page.$('[role=menu]') });
    if (wants(cfg, 'plan-pinned')) {
      await S(page, 'plan-pinned', async () => {
        await store(page, () => window.__studio.store.getState().setMode('plan'));
        await page.waitForSelector('[data-testid=plan] svg', { timeout: 90000 });
        await settle(page, 1800);
      }, { pinned: true });
      await store(page, () => window.__studio.store.getState().setMode('3d'));
      await settle(page, 1500);
    }
    await pin(false);
  }
  // Turn 2: a reply that gives up with a warning; turn 3: an error.
  if (wants(cfg, 'chat-warning')) {
    await turn(page, tl.giveUp);
    await S(page, 'chat-warning', async () => {
      await store(page, () => window.__studio.store.getState().setRecent(true));
      await settle(page, 1200);
    });
    await store(page, () => window.__studio.store.getState().setRecent(false));
  }
  if (wants(cfg, 'chat-error')) {
    await turn(page, tl.rate);
    await S(page, 'chat-error', async () => {
      await store(page, () => window.__studio.store.getState().setRecent(true));
      await settle(page, 1200);
    });
    await store(page, () => window.__studio.store.getState().setRecent(false));
  }
  if (wants(cfg, 'quota-')) {
    await S(page, 'quota-near', () => settle(page, 300));
    for (let i = 0; i < 4 && !(await page.locator('[data-testid=quota-note]').count()); i++) await turn(page, `${tl.hi} ${i}`);
    await S(page, 'quota-out', async () => {
      await store(page, () => window.__studio.store.getState().setRecent(true));
      await settle(page, 1200);
    });
    await S(page, 'quota-out-pinned', () => pin(true));
    await pin(false);
  }
  // Keys, signed out: the browser-key sheet.
  if (wants(cfg, 'key-own-sheet')) {
    await pin(true);
    await S(page, 'key-own-sheet', async () => {
      await page.getByTestId('key-picker').first().click();
      await settle(page, 800);
      await page.getByTestId('key-own').first().click();
      await settle(page, 1300);
    });
    await esc(page);
    await esc(page);
    await pin(false);
  }
  // Sign-in, each step and its errors.
  if (wants(cfg, 'signin-')) {
    const email = `audit-${cfg.name}@example.com`;
    await S(page, 'signin-email', async () => {
      await page.getByTestId('project-menu').first().click();
      await settle(page, 700);
      await page.getByTestId('menu-signin').first().click();
      await page.waitForSelector('[data-testid=signin-email-input]');
      await settle(page, 1200);
    });
    if (cfg.set === FULL) {
      await S(page, 'signin-email-error', async () => {
        await page.getByTestId('signin-email-input').fill('not-an-email');
        await page.getByTestId('signin-email-input').press('Enter');
        await settle(page, 1000);
      });
      await page.getByTestId('signin-email-input').fill(email);
      await page.getByTestId('signin-email-input').press('Enter');
      await page.waitForSelector('[data-testid=otp-0]', { timeout: 15000 });
      await S(page, 'signin-code', () => settle(page, 1000));
      const code = (await (await fetch(`${preview.base}/api/auth-test/code?email=${encodeURIComponent(email)}`)).json()).code;
      await S(page, 'signin-code-error', async () => {
        await page.keyboard.type(code === '000000' ? '111111' : '000000');
        await page.waitForSelector('[data-testid=signin-error]', { timeout: 10000 });
        await settle(page, 900);
      });
      await page.getByTestId('otp-0').focus();
      await page.evaluate((c) => {
        const dt = new DataTransfer();
        dt.setData('text/plain', c);
        document.querySelector('[data-testid=otp-0]').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
      }, code);
      await page.waitForFunction(() => !!window.__studio.chat.getState().server?.user, null, { timeout: 20000 });
      await page.waitForSelector('[data-testid=signin-sheet]', { state: 'detached', timeout: 10000 }).catch(() => {});
      await settle(page, 1200);
      await S(page, 'signed-in-menu', async () => {
        await page.getByTestId('project-menu').first().click();
        await settle(page, 900);
      });
      await esc(page);
      await pin(true);
      await S(page, 'signed-in-picker', async () => {
        await page.getByTestId('key-picker').first().click();
        await settle(page, 900);
      });
      await S(page, 'key-add-sheet', async () => {
        await page.getByTestId('key-add').first().click();
        await page.waitForSelector('[data-testid=keys-add]');
        await settle(page, 1000);
      });
      await S(page, 'key-add-filled', async () => {
        await page.getByTestId('keys-provider').getByText('Anthropic').click();
        await page.getByTestId('keys-key').fill(ANT_KEY);
        await settle(page, 500);
      });
      await page.getByTestId('keys-save').click();
      await page.waitForSelector('[data-testid=keys-sheet]', { state: 'detached', timeout: 10000 }).catch(() => {});
      await settle(page, 900);
      await S(page, 'key-saved-picker', async () => {
        await page.getByTestId('key-picker').first().click();
        await settle(page, 900);
      });
      await S(page, 'key-edit-sheet', async () => {
        await page.getByTestId('key-edit-anthropic').first().click();
        await page.waitForSelector('[data-testid=keys-edit]');
        await settle(page, 1000);
      });
      await esc(page);
      await pin(false);
    } else await esc(page);
  }
  // Task 026: signed in, the account button (an avatar) and its menu.
  if (wants(cfg, 'account-signed-in') || wants(cfg, 'account-menu') || wants(cfg, 'account-project') || wants(cfg, 'account-share')) {
    if (!(await page.evaluate(() => !!window.__studio.chat.getState().server?.user))) {
      const email = `account-${cfg.name}@example.com`;
      // Task 029: the studio's account entry is the project menu's account row.
      await page.getByTestId('project-menu').first().click();
      await settle(page, 700);
      await page.getByTestId('menu-signin').first().click();
      await page.getByTestId('signin-email-input').fill(email);
      await page.getByTestId('signin-email-input').press('Enter');
      await page.waitForSelector('[data-testid=otp-0]', { timeout: 15000 });
      const code = (await (await fetch(`${preview.base}/api/auth-test/code?email=${encodeURIComponent(email)}`)).json()).code;
      await page.getByTestId('otp-0').focus();
      await page.keyboard.type(code);
      await page.waitForFunction(() => !!window.__studio.chat.getState().server?.user, null, { timeout: 20000 });
      await page.waitForSelector('[data-testid=signin-sheet]', { state: 'detached', timeout: 10000 }).catch(() => {});
    }
    // The confirmation leaves by itself.
    await page.waitForSelector('[data-testid=account-toast]', { state: 'detached', timeout: 8000 }).catch(() => {});
    await settle(page, 600);
    if (wants(cfg, 'account-signed-in')) await S(page, 'account-signed-in', () => settle(page, 300));
    if (wants(cfg, 'account-menu')) {
      await S(page, 'account-menu', async () => {
        await page.getByTestId('project-menu').first().click();
        await settle(page, 700);
        await page.getByTestId('menu-account').first().click();
        await page.waitForSelector('[data-testid=account-menu]');
        await settle(page, 1000);
      });
      await esc(page);
    }
    // Task 028: the share surface (on, with its link) and the studio as a signed-out viewer of that link sees it.
    if (wants(cfg, 'account-share')) {
      await page.waitForFunction(() => !!window.__studio.projects?.store.getState().openId && !window.__studio.projects.store.getState().busy, null, { timeout: 30000 });
      const token = await page.evaluate(async () => {
        const p = window.__studio.projects;
        const m = await p.share(p.store.getState().openId, true);
        return m?.share ?? null;
      });
      // Task 029: desktop, the button beside the house name; phones, the project menu's first row.
      const openShareUi = cfg.phone
        ? async () => {
            await page.getByTestId('project-menu').first().click();
            await settle(page, 700);
            await page.getByTestId('menu-share').first().click();
          }
        : () => page.getByTestId('share-button').first().click();
      await M(page, 'account-share', { open: openShareUi, close: () => page.keyboard.press('Escape'), find: byTestId(page, 'share-surface') });
      if (token && wants(cfg, 'account-share-viewer')) {
        const { ctx: vc, page: vp } = await newPage(cfg);
        // The owner's sun study as well (the toolbar shows its time), so the two pages compare like for like.
        const sun = await page.evaluate(() => {
          const s = window.__studio.store.getState().sun;
          const m = Math.round(s.minutes);
          return s.on ? `&sun=${s.dateId}&time=${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}` : '';
        });
        await vp.goto(`${preview.base}/studio${q(cfg, `${sun}&s=${token}`)}`, { waitUntil: 'networkidle' });
        await vp.waitForFunction(() => window.__studio?.ready3d === true && window.__studio.shared?.getState().status === 'ready', null, { timeout: 180000 });
        await settle(vp, 1500);
        await S(vp, 'account-share-viewer');
        await vc.close();
      }
    }
    // Task 027: the projects page (signed in, a few projects), its card menu and the template cards; the studio's project menu signed in.
    if (wants(cfg, 'account-project-menu')) {
      await page.waitForFunction(() => !!window.__studio.projects?.store.getState().openId && !window.__studio.projects.store.getState().busy, null, { timeout: 30000 });
      await M(page, 'account-project-menu', { open: () => page.getByTestId('project-menu').first().click(), close: () => page.keyboard.press('Escape'), find: () => page.$('[role=menu]') });
    }
    if (wants(cfg, 'account-projects')) {
      await page.waitForFunction(() => !!window.__studio.projects?.store.getState().openId && !window.__studio.projects.store.getState().busy, null, { timeout: 30000 });
      await page.evaluate(async (names) => {
        const h = window.__studio.store.getState().house;
        for (const n of names) {
          const house = JSON.stringify({ ...h, name: n });
          const summary = JSON.stringify({ title: n, style: h.style, w: h.site.width, d: h.site.depth, area: 142.6, storeys: 2, attic: false });
          await fetch('/api/projects', { method: 'POST', headers: { 'content-type': 'application/x-opensu-project' }, body: `${JSON.stringify({ summary })}\n${house}\n{"conversation":"c-audit","items":[]}` });
        }
      }, cfg.lang === 'zh' ? ['王家老宅翻建', '河边的小院'] : ['Riverside cottage', 'Grandparents’ house']);
      await page.goto(`${preview.base}/projects${q(cfg)}`, { waitUntil: 'load' });
      await page.waitForFunction(() => window.__studio?.projects?.store.getState().projects.length >= 3, null, { timeout: 30000 });
      await settle(page, 1500);
      await S(page, 'account-projects-page');
      if (wants(cfg, 'account-projects-menu')) {
        await S(page, 'account-projects-menu', async () => {
          await page.getByTestId('project-card').nth(1).getByTestId('project-more').click();
          await page.waitForSelector('[data-testid=project-menu-card]');
          await settle(page, 900);
        });
        await esc(page);
      }
      if (wants(cfg, 'account-projects-new')) {
        await S(page, 'account-projects-new', async () => {
          await page.getByTestId('project-new').click();
          await page.waitForSelector('[data-testid=project-templates]');
          await settle(page, 1500);
        });
      }
    }
  }
  await ctx.close();

  // The offer after sign-in: a visitor with a key in this browser signs in.
  if (wants(cfg, 'keys-offer') && cfg.set === FULL) {
    const { ctx: c2, page: p2 } = await newPage(cfg, {
      init: {
        fn: (k) => {
          if (!sessionStorage.getItem('audit-key-set')) {
            sessionStorage.setItem('audit-key-set', '1');
            localStorage.setItem('opensu.ai', JSON.stringify({ useOwn: true, provider: 'openrouter', key: k, baseUrl: '', model: '' }));
          }
        },
        arg: OR_KEY,
      },
    });
    await openStudio(p2, cfg);
    const email = `offer-${cfg.name}@example.com`;
    await p2.getByTestId('project-menu').first().click();
    await settle(p2, 700);
    await p2.getByTestId('menu-signin').first().click();
    await p2.getByTestId('signin-email-input').fill(email);
    await p2.getByTestId('signin-email-input').press('Enter');
    await p2.waitForSelector('[data-testid=otp-0]', { timeout: 15000 });
    const code = (await (await fetch(`${preview.base}/api/auth-test/code?email=${encodeURIComponent(email)}`)).json()).code;
    await p2.getByTestId('otp-0').focus();
    await p2.keyboard.type(code);
    await p2.waitForSelector('[data-testid=keys-offer]', { timeout: 15000 }).catch(() => errors.push(`${cfg.name}: the offer did not appear`));
    await S(p2, 'keys-offer', () => settle(p2, 1000));
    await c2.close();
  }
}

/* ------------------------------------------------------------------ */
/* Cross-state rules                                                   */
/* ------------------------------------------------------------------ */

function crossState() {
  const out = [];
  // The house and the plan on one point (same configuration, same layout).
  for (const cfg of configs) {
    const pairs = [['3d-idle', 'plan-L1'], ['pinned-turn', 'plan-pinned']];
    for (const [a, b] of pairs) {
      const A = subjects.find((s) => s.config === cfg.name && s.state === a), B = subjects.find((s) => s.config === cfg.name && s.state === b);
      if (!A || !B) continue;
      const dx = B.centre.x - A.centre.x, dy = B.centre.y - A.centre.y;
      const tol = Math.max(8, 0.01 * cfg.w);
      if (Math.abs(dx) > tol || Math.abs(dy) > tol) out.push({ rule: 'subject-same-point', config: cfg.name, state: `${a} vs ${b}`, phone: !!cfg.phone, el: '[viewer] / [plan] svg', comp: 'drawing', msg: `the house in 3D is centred at (${A.centre.x}, ${A.centre.y}), the plan at (${B.centre.x}, ${B.centre.y}): off by (${Math.round(dx)}, ${Math.round(dy)}) px`, evidence: { three: A.centre, plan: B.centre, dx: Math.round(dx), dy: Math.round(dy) }, shot: `shots/${cfg.name}--${b}.png` });
    }
  }
  // The toolbar keeps its width (UI_STYLE: panels open without changing it), per mode.
  for (const cfg of configs) {
    const ts = toolbars.filter((t) => t.config === cfg.name && t.mode === '3d');
    if (ts.length < 2) continue;
    const ws = [...new Set(ts.map((t) => Math.round(t.w)))];
    if (ws.length > 1) out.push({ rule: 'stable-width', config: cfg.name, state: 'all 3D states', phone: !!cfg.phone, el: '[toolbar]', comp: 'toolbar', msg: `the toolbar changes width between states: ${ws.join(', ')} px`, evidence: Object.fromEntries(ws.map((w) => [w, ts.filter((t) => Math.round(t.w) === w).map((t) => t.state).slice(0, 6)])) });
  }
  // Task 029: one header, one close button and one inset for every surface (per configuration).
  for (const cfg of configs) {
    const list = shells.filter((x) => x.config === cfg.name && x.shell);
    for (const key of ['title', 'close', 'inset', 'gap']) {
      const vals = [...new Set(list.map((x) => x[key]).filter((v) => v !== null))];
      if (vals.length > 1) out.push({ rule: 'panel-shell', config: cfg.name, state: 'all surfaces', phone: !!cfg.phone, el: `[${key}]`, comp: 'surfaces', msg: `open surfaces differ in their ${key}: ${vals.join(' / ')}`, evidence: Object.fromEntries(vals.map((v) => [v, [...new Set(list.filter((x) => x[key] === v).map((x) => `${x.state} ${x.id}`))].slice(0, 6)])) });
    }
  }
  // Disabled controls that look like their enabled selves.
  for (const d of disabledLooks) {
    if (!d.round) continue; // filled round buttons: their mean colour is the button, not the row behind text
    const e = enabledLooks.find((x) => x.id === d.id && x.config === d.config);
    if (!e) continue;
    const dist = Math.abs(d.mean[0] - e.mean[0]) + Math.abs(d.mean[1] - e.mean[1]) + Math.abs(d.mean[2] - e.mean[2]);
    if (dist < 24) out.push({ rule: 'disabled-same', config: d.config, state: `${d.state} vs ${e.state}`, el: d.id, comp: d.comp, msg: `disabled and enabled look alike (mean colour ${d.mean.join(' ')} vs ${e.mean.join(' ')})`, evidence: { disabled: d.mean, enabled: e.mean, distance: dist }, rect: d.rect, shot: `shots/${d.config}--${d.state}.png` });
  }
  // One treatment for selected states (per backend).
  const byBackend = new Map();
  for (const s of selectedSigs) {
    const sig = `${s.sig.bg} / weight ${s.sig.weight}${s.sig.lens ? ' / lens' : ''}${s.sig.check ? ' / check' : ''}`;
    const k = s.backend;
    if (!byBackend.has(k)) byBackend.set(k, new Map());
    const m = byBackend.get(k);
    if (!m.has(sig)) m.set(sig, []);
    m.get(sig).push(`${s.id} (${s.config} ${s.state})`);
  }
  for (const [backend, m] of byBackend) {
    if (m.size > 1) out.push({ rule: 'selected-treatment', config: backend, state: 'all', el: 'selected controls', comp: 'consistency', msg: `${m.size} different treatments of "selected"`, evidence: Object.fromEntries([...m].map(([k, v]) => [k, [...new Set(v.map((x) => x.replace(/ \(.*\)$/, '')))].slice(0, 8)])) });
  }
  // One concept, one label: near-duplicate strings per language.
  const norm = (s) => s.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');
  const lev = (a, b) => {
    const m = a.length, n = b.length;
    if (Math.abs(m - n) > 1) return 2;
    const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
    for (let j = 1; j <= n; j++) d[0][j] = j;
    for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[m][n];
  };
  for (const lang of ['zh', 'en']) {
    const list = [...strings[lang].entries()];
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const [a, wa] = list[i], [b, wb] = list[j];
      const na = norm(a), nb = norm(b);
      if (!na || !nb || /\d/.test(na + nb)) continue;
      // Differences in symbols only (a close ×, an ellipsis) are the same label with an affordance.
      const strip = (x) => x.replace(/[×…↗→←↑↓⌄✓]/g, '').trim();
      if (strip(a) === strip(b)) continue;
      const same = na === nb;
      const near = Math.min(na.length, nb.length) >= 4 && lev(na, nb) === 1;
      if (same || near) out.push({ rule: 'label-dupe', config: lang, state: 'all', el: `"${a}" / "${b}"`, comp: 'consistency', msg: `${same ? 'the same words written two ways' : 'near-duplicate labels'}: "${a}" (${wa}) and "${b}" (${wb})`, evidence: { a, b, where: [wa, wb] } });
    }
  }
  // Colours outside the tokens.
  if (tokenColours) {
    const toks = tokenColours.map(([n, c]) => [n, /rgba?\(([^)]+)\)/.exec(c)?.[1].split(/[ ,/]+/).map(Number)]).filter(([, v]) => v);
    for (const [key, where] of colourUse) {
      const v = /rgba?\(([^)]+)\)/.exec(key)?.[1].split(/[ ,/]+/).map(Number);
      if (!v) continue;
      const a = v[3] ?? 1;
      const hit = toks.some(([, t]) => Math.abs(t[0] - v[0]) <= 2 && Math.abs(t[1] - v[1]) <= 2 && Math.abs(t[2] - v[2]) <= 2 && Math.abs((t[3] ?? 1) - a) <= 0.02);
      if (!hit) out.push({ rule: 'off-token-colour', config: 'all', state: 'all', el: where.replace(/ \(.*\)$/, ''), comp: 'tokens', msg: `${key} is not a token colour`, evidence: { value: key, where } });
    }
  }
  // Radii outside the shape tokens (capsule, material radii, styles.css radii).
  const allowedR = new Set(['capsule']);
  try {
    const mat = readFileSync(resolve(appRoot, 'src/ui/material.ts'), 'utf8');
    for (const m of mat.matchAll(/radius\w*:\s*(\d+(?:\.\d+)?)/gi)) allowedR.add(String(Number(m[1])));
    const css = readFileSync(resolve(appRoot, 'src/styles.css'), 'utf8');
    for (const m of css.matchAll(/--radius[\w-]*:\s*(\d+(?:\.\d+)?)px/g)) allowedR.add(String(Number(m[1])));
    for (const m of readFileSync(resolve(appRoot, 'src/ui/glass.css'), 'utf8').matchAll(/border-radius:\s*(\d+(?:\.\d+)?)px/g)) allowedR.add(String(Number(m[1])));
  } catch {
    /* sources missing */
  }
  for (const [r, where] of radiusUse) if (!allowedR.has(r)) out.push({ rule: 'off-token-radius', config: 'all', state: 'all', el: where.replace(/ \(.*\)$/, ''), comp: 'tokens', msg: `corner radius ${r} px is not a shape token (${[...allowedR].join(', ')})`, evidence: { radius: r, where } });
  return out;
}

/* ------------------------------------------------------------------ */
/* Run                                                                 */
/* ------------------------------------------------------------------ */

const t0 = Date.now();
try {
  for (const cfg of configs) {
    try {
      await runConfig(cfg);
    } catch (e) {
      errors.push(`${cfg.name}: ${e.message.split('\n')[0]}`);
      console.log(`  ! ${cfg.name}: ${e.message.split('\n')[0]}`);
    }
  }
} finally {
  await browser.close();
  for (const p of previews) p.stop();
  stub.close?.();
  // Its variables must not reach a later preview (shots.mjs reads the same file).
  rmSync(devVars, { force: true });
}
raw.push(...crossState());

// De-duplicate across viewports and states: one entry per defect.
const shape = (s) => s.replace(/-?\d+(\.\d+)?/g, '#');
const keyOf = (f) => `${f.rule}|${f.comp}|${f.el}|${shape(f.msg)}`;
const sevOrder = { P0: 0, P1: 1, P2: 2 };
const groups = new Map();
for (const f of raw) {
  f.severity = (SEVERITY[f.rule] ?? (() => 'P2'))(f);
  const k = keyOf(f);
  if (!groups.has(k)) groups.set(k, { key: k, rule: f.rule, comp: f.comp, el: f.el, msg: f.msg, evidence: f.evidence, severity: f.severity, crop: f.crop, shot: f.shot, where: [] });
  const g = groups.get(k);
  g.where.push(`${f.config} ${f.state}`);
  if (sevOrder[f.severity] < sevOrder[g.severity]) g.severity = f.severity;
  if (!g.crop && f.crop) g.crop = f.crop;
}
const list = [...groups.values()].sort((a, b) => a.comp.localeCompare(b.comp) || sevOrder[a.severity] - sevOrder[b.severity] || a.rule.localeCompare(b.rule));
list.forEach((g, i) => (g.id = `A${String(i + 1).padStart(3, '0')}`));

// The self-test: the eight known defects of the pinned input and the mode switch.
const KNOWN = [
  ['1 placeholder wraps', (g) => g.rule === 'wrap' && g.el === '[prompt-bar]' && /placeholder/.test(g.msg) && g.where.some((w) => /pinned/.test(w))],
  ['2 input is a card inside the sidebar card', (g) => (g.rule === 'glass-on-glass' || g.rule === 'card-in-card') && g.el === '[prompt]' && g.where.some((w) => /pinned/.test(w))],
  ['3 bright rule above the input', (g) => (g.rule === 'bright-rule' || g.rule === 'hairline') && g.comp === 'chat-panel'],
  ['4 quota hint inside the input', (g) => g.rule === 'field-passive-text' && g.el === '[quota-left]'],
  ['5 children on different centre lines', (g) => g.rule === 'row-align' && g.comp === 'prompt' && g.where.some((w) => /pinned/.test(w))],
  ['6 left inset larger than right', (g) => g.rule === 'inset-lr' && g.comp === 'prompt' && g.where.some((w) => /pinned/.test(w))],
  ['7 placeholder as bright as text', (g) => g.rule === 'placeholder-dim' && g.el === '[prompt-bar]'],
  ['8 send looks active when empty', (g) => (g.rule === 'disabled-affordance' || g.rule === 'disabled-same') && g.el === '[chat-send]'],
  ['9 mode switch off-centre when pinned', (g) => g.rule === 'mode-centre' && g.where.some((w) => /pinned/.test(w))],
  ['10 house and plan not on one point', (g) => g.rule === 'subject-same-point' || g.rule === 'subject-centre'],
  // Task 025: the owner's recording (2026-11-16).
  ['11 project menu is not a rounded rectangle while it moves', (g) => g.rule === 'motion-shape' && g.where.some((w) => /menu/.test(w))],
  ['12a tooltip unreadable in the pinned header', (g) => g.rule === 'tip-contrast' && g.where.some((w) => /pinned/.test(w))],
  ['12b hover plates of one row differ (pinned header)', (g) => g.rule === 'hover-plate' && g.where.some((w) => /pinned/.test(w))],
  ['13 key menu opens away from its button', (g) => g.rule === 'anchor-gap' && /key-menu|menu/.test(g.el) && g.where.some((w) => /picker/.test(w))],
  ['14a plan levels panel attaches unlike the 3D panels', (g) => (g.rule === 'anchor-gap' && /levels/.test(g.el)) || (g.rule === 'anchor-gap' && g.where.some((w) => /plan/.test(w)))],
  ['14b a panel is an empty shape mid-animation', (g) => g.rule === 'motion-empty'],
];
const selfTest = KNOWN.map(([name, test]) => {
  const hits = list.filter(test);
  return { name, found: hits.length > 0, by: hits.map((h) => `${h.id} ${h.rule}`) };
});

const perRule = {};
for (const g of list) perRule[g.rule] = (perRule[g.rule] ?? 0) + 1;
writeFileSync(resolve(outDir, smoke ? 'smoke.json' : 'findings.json'), JSON.stringify({ when: new Date().toISOString(), configs: configs.map((c) => c.name), states, findings: list, raw, selfTest, perRule, errors, shells, tips: tipsSeen, motion: motionSeen }, null, 1));

if (!smoke) {
  writeFileSync(resolve(outDir, 'findings.md'), findingsMd());
  writeFileSync(resolve(outDir, 'index.html'), contactSheet());
}
console.log(`\n${raw.length} raw findings, ${list.length} after de-duplication, ${states.length} states, ${Math.round((Date.now() - t0) / 1000)} s`);
console.log(Object.entries(perRule).map(([k, v]) => `  ${k}: ${v}`).join('\n'));
console.log('\nself-test:');
for (const s of selfTest) console.log(`  ${s.found ? 'found ' : 'MISSED'} ${s.name}${s.by.length ? ` (${s.by.slice(0, 3).join(', ')})` : ''}`);
if (errors.length) console.log(`\nerrors:\n  ${errors.join('\n  ')}`);

if (smoke) {
  const keys = [...new Set(list.map((g) => g.key))].sort();
  if (writeAllow) {
    writeFileSync(allowFile, `${JSON.stringify({ note: 'Known findings of `ui-audit.mjs --smoke` (task 024). A new finding fails the test; a fixed one must be removed from this list.', smoke: keys }, null, 2)}\n`);
    console.log(`wrote ${relative(repoRoot, allowFile)} (${keys.length} keys)`);
    process.exit(0);
  }
  const allow = new Set(JSON.parse(readFileSync(allowFile, 'utf8')).smoke);
  const added = keys.filter((k) => !allow.has(k));
  const fixed = [...allow].filter((k) => !keys.includes(k));
  for (const k of added) console.log(`  NEW   ${k}`);
  for (const k of fixed) console.log(`  FIXED ${k} (remove it from ui-audit-allow.json)`);
  const fail = added.length || fixed.length || errors.length;
  console.log(fail ? '\nui-audit smoke: FAIL' : `\nui-audit smoke: ok (${keys.length} known findings)`);
  process.exit(fail ? 1 : 0);
}
process.exit(0);

/* ------------------------------------------------------------------ */
/* Reports                                                             */
/* ------------------------------------------------------------------ */

function findingsMd() {
  const byComp = new Map();
  for (const g of list) {
    if (!byComp.has(g.comp)) byComp.set(g.comp, []);
    byComp.get(g.comp).push(g);
  }
  let s = `# UI audit findings\n\n${list.length} findings (${raw.length} raw) over ${states.length} states.\n\n## Self-test\n\n`;
  for (const t of selfTest) s += `- ${t.found ? 'found' : '**MISSED**'}: ${t.name}${t.by.length ? ` (${t.by.join(', ')})` : ''}\n`;
  s += '\n## Per rule\n\n' + Object.entries(perRule).map(([k, v]) => `- ${k}: ${v}`).join('\n') + '\n';
  for (const [c, gs] of byComp) {
    s += `\n## ${c}\n\n`;
    for (const g of gs) {
      const where = [...new Set(g.where)];
      s += `- **${g.id}** ${g.severity} \`${g.rule}\` ${g.el}: ${g.msg}\n  - where: ${where.slice(0, 6).join('; ')}${where.length > 6 ? ` (+${where.length - 6})` : ''}\n  - evidence: \`${JSON.stringify(g.evidence).slice(0, 400)}\`\n  - crop: ${g.crop ?? g.shot ?? '-'}\n`;
    }
  }
  return s;
}

function contactSheet() {
  const esc = (v) => String(v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const APPLE = {
    prompt: 'Apple equivalent: the Messages input bar. Messages keeps the field one line high until text needs more, puts the + button and the send button concentric in the bar (equal insets), shows the placeholder in a secondary grey, and shows no send button (only the microphone) while the field is empty. Nothing but the field and its buttons sits in the bar.',
    'chat-panel': 'Apple equivalent: a Maps place card / a sheet holding a conversation. One material level; the input at its foot is a field of the card (no second card), separated by spacing or a thin inset separator.',
    'project-menu-list': 'Apple equivalent: a pop-up menu. Rows 44 pt (touch) / 22-24 pt (Mac), leading icons in one column, trailing details right-aligned with the same inset as the leading edge, inset separators between groups.',
    'key-menu': 'Apple equivalent: a pop-up menu (see project menu): a checkmark column for the chosen row, trailing detail in secondary text.',
    'phone-sheet': 'Apple equivalent: a sheet with detents (grabber, medium and large detents); the content scrolls under a fixed header.',
    'mode-switch': 'Apple equivalent: a segmented control centred in the toolbar / navigation bar, independent of side columns.',
    toolbar: 'Apple equivalent: a toolbar / tab bar capsule; on phone the tab bar with icon over label, 49 pt high.',
    dock: 'Apple equivalent: the phone tab bar.',
  };
  const by = new Map();
  for (const c of cropIndex) {
    if (!by.has(c.comp)) by.set(c.comp, []);
    by.get(c.comp).push(c);
  }
  const fByComp = new Map();
  for (const g of list) {
    if (!fByComp.has(g.comp)) fByComp.set(g.comp, []);
    fByComp.get(g.comp).push(g);
  }
  const comps = [...new Set([...by.keys(), ...fByComp.keys()])].sort();
  let h = `<!doctype html><meta charset="utf-8"><title>UI audit</title><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
:root{--bg:#f6f6f4;--ink:#1b1c1e;--ink2:#5c5d60;--line:#d9d9d4;--p0:#b3261e;--p1:#b35c00;--p2:#5c5d60}
@media (prefers-color-scheme:dark){:root{--bg:#161618;--ink:#ececec;--ink2:#a0a0a6;--line:#333338}}
body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.45 system-ui,sans-serif}
main{max-width:1400px;margin:0 auto;padding:24px 16px}
h1{font-size:22px;margin:0 0 4px}h2{font-size:17px;margin:32px 0 8px;padding-top:12px;border-top:1px solid var(--line)}
nav a{margin-right:10px;color:var(--ink2)}
.ref{color:var(--ink2);max-width:80ch}
ul.f{padding-left:18px}ul.f li{margin:3px 0}.sev{font-weight:600}.P0{color:var(--p0)}.P1{color:var(--p1)}.P2{color:var(--p2)}
.grid{display:flex;flex-wrap:wrap;gap:14px;align-items:flex-start}
figure{margin:0;max-width:100%}figure img{display:block;max-width:100%;height:auto;image-rendering:pixelated;border:1px solid var(--line)}
figcaption{font-size:12px;color:var(--ink2)}
.legend span{display:inline-block;margin-right:12px}
</style><main><h1>UI audit: contact sheet</h1>
<p class="legend">Crops at ${DPR}x device pixels. Guides: <span style="color:#00beff">blue: box</span><span style="color:#ff00c8">magenta: centre line</span><span style="color:#3cdc3c">green: content insets</span><span style="color:#ff9600">orange: children's centres</span><span style="color:#ff2828">red: a finding</span>. The WebGL canvas (drawing and glass in the WebGL backend) renders at 1x and is upscaled in crops.</p>
<p>${list.length} findings over ${states.length} states. Self-test: ${selfTest.filter((s) => s.found).length}/${selfTest.length} known defects found.</p>
<nav>${comps.map((c) => `<a href="#${esc(c)}">${esc(c)}</a>`).join('')}</nav>`;
  for (const c of comps) {
    h += `<h2 id="${esc(c)}">${esc(c)}</h2>`;
    if (APPLE[c]) h += `<p class="ref">${esc(APPLE[c])}</p>`;
    const fs = fByComp.get(c) ?? [];
    if (fs.length) h += `<ul class="f">${fs.map((g) => `<li><span class="sev ${g.severity}">${g.severity}</span> <b>${g.id}</b> <code>${esc(g.rule)}</code> ${esc(g.el)}: ${esc(g.msg)} <small>(${esc([...new Set(g.where)].slice(0, 4).join('; '))})</small>${g.crop ? ` <a href="${esc(g.crop)}">crop</a>` : ''}</li>`).join('')}</ul>`;
    const cs = by.get(c) ?? [];
    h += `<div class="grid">${cs.map((x) => `<figure><img loading="lazy" src="${esc(x.file)}" width="${Math.round(x.w * 1.5)}" alt=""><figcaption>${esc(x.config)} · ${esc(x.state)}</figcaption></figure>`).join('')}</div>`;
  }
  return `${h}</main>`;
}
