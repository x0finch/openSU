// Static check (task 017): no file under src/studio/ or src/chat/ sets a
// chrome surface's background, border, shadow, blur or backdrop filter
// itself; that is the glass module's job (src/glass/). Fails on the
// patterns below unless the line is on the allow-list.
//
// Task 025: nothing outside src/glass/ positions an anchored surface (a
// menu, a panel, a popover: GlassPopover / GlassMenu take an anchor and a
// placement, never a position; no portals, no fixed stand-ins placed from a
// measured box), styles a hover plate (`hover:bg-*`) or draws a tooltip
// (`lg-tip`, a `Tip`, a native `title` attribute): those are GlassPopover,
// `.lg-plate` and GlassTip.
//
//   node scripts/glass-check.mjs
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const src = resolve(dirname(fileURLToPath(import.meta.url)), '../src');
const DIRS = ['studio', 'chat'];

const PATTERNS = [
  ['backdrop-filter', /backdrop-filter/],
  ['backdrop-blur', /backdrop-blur/],
  ['shadow utility', /(^|[\s'"`:!])shadow-/],
  ['bg-white', /\bbg-white\b/],
  ['arbitrary background', /\bbg-\[/],
  ['old surface token', /\b(bg-surface|shadow-float|shadow-hair|bg-veil|glass-solid|ai-input|ai-halo|ai-rim)\b/],
  ['old glass utility', /(className=|cx\().*[\s'"`]glass(?=[\s'"`])/],
];

/**
 * Legitimate exceptions: the white paper sheets of the gallery (UI_STYLE
 * rule 11) and the controls that only paint the drawing's own colours.
 */
const ALLOW = [
  { file: 'studio/SheetGallery.tsx', line: /bg-white shadow-hair|rounded-\[4px\] bg-white|file && 'shadow-\[/, why: 'gallery sheets stay white paper (UI_STYLE rule 11)' },
];

/** Not converted yet (task 017 Phase B emptied it; keep it empty). */
const PENDING_PHASE_B = [];

const files = DIRS.flatMap((d) => readdirSync(join(src, d)).filter((f) => /\.(tsx?|css)$/.test(f)).map((f) => join(src, d, f)));
const failures = [];

/* ---- task 025: anchored surfaces, hover plates, tooltips (every file outside src/glass/) ---- */
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
const outside = walk(src).filter((f) => /\.(tsx?|css)$/.test(f) && !relative(src, f).replaceAll('\\', '/').startsWith('glass/') && !f.endsWith('routeTree.gen.ts'));
const ALLOW_025 = [
  { file: 'routes/index.tsx', rule: 'hover plate', why: 'the landing page is paper with no glass (DESIGN.md: "a light, editorial page ... with no glass at all")' },
  { file: 'components/ui.tsx', rule: 'hover plate', line: /hover:bg-wash hover:text-ink/, why: 'LangToggle, used on the landing page only (paper, no glass)' },
  { file: 'projects/ProjectsPage.tsx', rule: 'hover plate', why: 'the projects page is paper like the landing page (task 027): its buttons have no glass to carry a plate' },
];

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
const POSITION = /(^|[\s'"`])(-?(absolute|fixed|sticky|inset-[\w[\]-]+|top-[\w[\]-]+|left-[\w[\]-]+|right-[\w[\]-]+|bottom-[\w[\]-]+|m[tblrxy]?-[\w[\]-]+|-?translate-[xy]-[\w[\]/-]+))(?=[\s'"`])/;
for (const f of outside) {
  const rel = relative(src, f).replaceAll('\\', '/');
  const text = readFileSync(f, 'utf8');
  const fail = (rule, line, what) => {
    const code = text.split('\n')[line - 1] ?? '';
    if (ALLOW_025.some((a) => a.file === rel && a.rule === rule && (!a.line || a.line.test(code)))) return;
    failures.push(`${rel}:${line}: ${rule}: ${what.trim().slice(0, 140)}`);
  };
  text.split('\n').forEach((line, i) => {
    const code = line.replace(/^\s*(\/\/|\*|\/\*).*$/, '');
    if (/(^|[\s'"`:])hover:bg-/.test(code)) fail('hover plate', i + 1, code);
    if (/\blg-tip(ped)?\b|role=["']tooltip["']|group-hover\/tip/.test(code)) fail('tooltip', i + 1, code);
    if (/\bcreatePortal\(/.test(code)) fail('anchored surface positioned outside glass (portal)', i + 1, code);
  });
  for (const t of tags(text)) {
    const native = /^[a-z]/.test(t.name) || t.name.startsWith('Glass') || t.name === 'Link';
    if (native && /(^|\s)title=/.test(t.attrs)) fail('tooltip', t.line, `<${t.name} title=...> (a native tooltip; use GlassTip)`);
    if (t.name === 'Tip' || t.name === 'IconButton') fail('tooltip', t.line, `<${t.name}> (use GlassTip / GlassIconButton)`);
    if (/^Glass(Popover|Menu)$/.test(t.name)) {
      const cls = /className=(\{[^}]*\}|"[^"]*")/.exec(t.attrs)?.[1] ?? '';
      const style = /style=\{\{([^}]*)\}\}/.exec(t.attrs)?.[1] ?? '';
      if (POSITION.test(cls) || /\b(left|top|right|bottom|inset|transform|position|margin\w*)\s*:/.test(style)) fail('anchored surface positioned outside glass', t.line, `<${t.name} ${cls} ${style}> (give it an anchor and a placement)`);
    }
    // A stand-in placed from a measured box (the old way to grow a surface out of a closed menu row).
    if (/^[a-z]/.test(t.name) && /className=\{?["'`][^"'`]*\bfixed\b/.test(t.attrs) && /style=\{\{[^}]*\b(left|top)\s*:/.test(t.attrs)) fail('anchored surface positioned outside glass', t.line, `<${t.name} fixed ... style={{ left/top }}>`);
  }
}
let pending = 0;
for (const f of files) {
  const rel = relative(src, f).replaceAll('\\', '/');
  readFileSync(f, 'utf8').split('\n').forEach((text, i) => {
    // Comments may name what they avoid.
    const code = text.replace(/^\s*(\/\/|\*|\/\*).*$/, '');
    for (const [name, re] of PATTERNS) {
      if (!re.test(code)) continue;
      if (ALLOW.some((a) => a.file === rel && (!a.line || a.line.test(code)))) continue;
      if (PENDING_PHASE_B.some((a) => a.file === rel && (!a.line || a.line.test(code)))) {
        pending++;
        continue;
      }
      failures.push(`${rel}:${i + 1}: ${name}: ${code.trim().slice(0, 140)}`);
    }
  });
}
console.log(`glass check: ${files.length} chrome files, ${outside.length} files outside src/glass/, ${failures.length} violations, ${pending} lines pending (Phase B)`);
for (const f of failures) console.log(`  FAIL ${f}`);
process.exit(failures.length ? 1 : 0);
