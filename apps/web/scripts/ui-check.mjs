// Static check of the base-component rule (task 029; it grew out of the
// glass check of tasks 017 and 025). Since task 031 the base components
// are the package `@opensu/ui` (packages/ui); everything in this app only
// applies them: no file there sets a radius, a hover or focus
// state, a focus ring, a shadow, a backdrop or a surface's padding, uses a
// base component's own classes (`lg-plate`, `lg-field`, ...), sets a
// surface title's size, draws a tooltip, or positions a floating surface
// (Popover and Menu take an anchor and a placement, never a position).
// A feature file composes components and lays out its own content.
// Exceptions are listed below, each with its reason.
//
//   node scripts/ui-check.mjs
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const src = resolve(dirname(fileURLToPath(import.meta.url)), '../src');

/** Line rules: the classes and properties only the base may set. */
const RULES = [
  ['radius', /(^|[\s'"`:!])-?rounded(-|(?=[\s'"`]))/],
  ['hover or focus state', /(^|[\s'"`:!])(hover|group-hover|enabled:hover|focus|focus-visible|focus-within|peer-focus-visible|peer-checked):/],
  ['focus ring', /\[&:focus(-visible)?\]|\blg-focus\b|(^|[\s'"`])outline(-|(?=[\s'"`]))/],
  ['shadow', /(^|[\s'"`:!])(drop-)?shadow(-|(?=[\s'"`]))|box-shadow/],
  ['backdrop', /backdrop-filter|backdrop-blur/],
  ['background on a surface', /\bbg-\[|\bbg-white\b/],
  ['base class', /\b(lg-plate|lg-field|lg-code|lg-panel[\w-]*|lg-sep|lg-knob|lg-tip(ped)?|lg-step-aside|google-btn)\b/],
  ['title size', /<h[1-3]\b[^>]*\btext-(\[(1[5-9]|[2-9]\d)(\.\d+)?px\]|lg|xl|[2-9]xl)/],
  ['tooltip', /role=["']tooltip["']|group-hover\/tip/],
  ['portal', /\bcreatePortal\(/],
];

/** Tag rules: base surfaces are not padded or positioned by their callers. */
const SURFACES = /^(Popover|Menu|Sheet|Notice|Bar|HudPanel|Toast|TextSurface|InputBar)$/;
const PADDING = /(^|[\s'"`])(p|px|py|pt|pb|pl|pr)-[\w.[\]]+/;
const POSITION = /(^|[\s'"`])(-?(absolute|fixed|sticky|inset-[\w[\]-]+|top-[\w[\]-]+|left-[\w[\]-]+|right-[\w[\]-]+|bottom-[\w[\]-]+|-?translate-[xy]-[\w[\]/-]+))(?=[\s'"`])/;
const FLOATING = /^(Popover|Menu)$/;

/** Exceptions: file, rule, optional line pattern, and why. */
const ALLOW = [
  { file: 'routes/index.tsx', rule: 'title size', why: 'the landing headline is the page\'s display type (DESIGN.md "Landing display"), not a surface title' },
  { file: 'projects/ProjectsPage.tsx', rule: 'title size', why: 'the page title of /projects (paper page), not a surface title' },
  { file: 'routes/s/$id.tsx', rule: 'title size', why: 'the old share placeholder page (paper), kept as it is (task 028 notes)' },
  { file: 'routes/__root.tsx', rule: 'title size', why: 'the not-found page title (paper)' },
  { file: 'studio/SheetGallery.tsx', rule: 'focus ring', line: /fixed inset-0 z-40 flex/, why: 'the full-screen sheet viewer takes focus itself (to receive the arrow keys); it is not a control and draws no ring' },
  { file: 'studio/ProjectMissing.tsx', rule: 'title size', why: 'the not-found page of a project or link (paper, full screen), not a surface title' },
];

/**
 * Product components that left the base in task 031 (a stranger's app would
 * not use them unchanged): they compose package parts and keep their own
 * look, so the rule does not apply to them. Each with its reason.
 */
const PRODUCT = [
  { file: 'chat/turn.tsx', why: 'the assistant turn: its timeline marks and disclosure line are this product\'s conversation' },
  { file: 'chat/attach.tsx', why: 'images in the conversation (task 038): the attachment thumbnails with their 图N names, a message\'s pictures and the "@" list are this product\'s chat' },
  { file: 'chat/GoogleButton.tsx', why: 'Google\'s own button: its brand rules (fill, stroke, radius), styles.css `.google-btn`' },
  { file: 'studio/paper-sheet.tsx', why: 'the drawing sheet\'s picture and its placeholder (this product\'s sheet layout)' },
];

const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
const product = new Set(PRODUCT.map((p) => p.file));
const files = walk(src).filter((f) => /\.(tsx?|css)$/.test(f) && !product.has(relative(src, f).replaceAll('\\', '/')) && !f.endsWith('routeTree.gen.ts') && !f.endsWith('styles.css'));
const failures = [];
const allowed = new Set();

/** JSX opening tags: name, attribute text, line. */
function tags(text) {
  const out = [];
  const re = /<([A-Za-z][\w.]*)(?=[\s>/])/g;
  let m;
  while ((m = re.exec(text))) {
    let i = re.lastIndex, depth = 0, q = null;
    for (; i < text.length && i - re.lastIndex < 4000; i++) {
      const c = text[i];
      if (q) {
        if (c === q && text[i - 1] !== '\\') q = null;
        continue;
      }
      if (c === '"' || c === "'" || c === '`') q = c;
      else if (c === '{') depth++;
      else if (c === '}') depth--;
      else if (c === '>' && depth === 0) break;
    }
    out.push({ name: m[1], attrs: text.slice(re.lastIndex, i), line: text.slice(0, m.index).split('\n').length });
  }
  return out;
}

for (const f of files) {
  const rel = relative(src, f).replaceAll('\\', '/');
  const text = readFileSync(f, 'utf8');
  const lines = text.split('\n');
  const fail = (rule, line, what) => {
    const code = lines[line - 1] ?? '';
    const a = ALLOW.find((x) => x.file === rel && x.rule === rule && (!x.line || x.line.test(code)));
    if (a) {
      allowed.add(`${rel}: ${rule} (${a.why})`);
      return;
    }
    failures.push(`${rel}:${line}: ${rule}: ${what.trim().slice(0, 150)}`);
  };
  lines.forEach((line, i) => {
    // Comments may name what they avoid.
    const code = line.replace(/^\s*(\/\/|\*|\/\*).*$/, '').replace(/\{\/\*.*?\*\/\}/g, '');
    for (const [rule, re] of RULES) if (re.test(code)) fail(rule, i + 1, code);
  });
  for (const t of tags(text)) {
    if (/^[a-z]/.test(t.name) && /(^|\s)title=/.test(t.attrs)) fail('tooltip', t.line, `<${t.name} title=...> (a native tooltip; use Tooltip)`);
    if (!SURFACES.test(t.name)) continue;
    const cls = /className=(\{[^}]*\}|"[^"]*")/.exec(t.attrs)?.[1] ?? '';
    const style = /style=\{\{([^}]*)\}\}/.exec(t.attrs)?.[1] ?? '';
    if (PADDING.test(cls) || /\bpadding\w*\s*:/.test(style)) fail('surface padding', t.line, `<${t.name} ${cls}> (the surface's inset is the base's)`);
    if (FLOATING.test(t.name) && (POSITION.test(cls) || /\b(left|top|right|bottom|inset|transform|position|margin\w*)\s*:/.test(style))) fail('floating surface positioned', t.line, `<${t.name} ${cls} ${style}> (give it an anchor and a placement)`);
  }
}
console.log(`ui check: ${files.length} app files, ${failures.length} violations, ${allowed.size} allowed exceptions, ${PRODUCT.length} product components`);
for (const p of PRODUCT) console.log(`  product ${p.file} (${p.why})`);
for (const a of allowed) console.log(`  allowed ${a}`);
for (const f of failures) console.log(`  FAIL ${f}`);
process.exit(failures.length ? 1 : 0);
