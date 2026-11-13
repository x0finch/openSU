// Static check (task 017): no file under src/studio/ or src/chat/ sets a
// chrome surface's background, border, shadow, blur or backdrop filter
// itself; that is the glass module's job (src/glass/). Fails on the
// patterns below unless the line is on the allow-list.
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
  { file: 'studio/SheetGallery.tsx', why: 'gallery sheets stay white paper (UI_STYLE rule 11)' },
];

/**
 * Not converted yet: Phase B of task 017 (phone dock and sheets, walk HUD,
 * plan and gallery chrome, pinned sidebar, settings, menus). This list must
 * be empty when task 017 is done.
 */
const PENDING_PHASE_B = [
  { file: 'studio/PhoneDock.tsx' },
  { file: 'studio/WalkHUD.tsx' },
  { file: 'studio/SitePanels.tsx' },
  { file: 'chat/SettingsSheet.tsx' },
  { file: 'studio/tools.tsx', line: /bg-surface shadow-float/, why: 'phone tool bar' },
  { file: 'chat/ChatPanel.tsx', line: /rounded-\[10px\] border border-black\/10 bg-white|h-\[26px\] bg-white px-\[9px\]/, why: 'changes card in the pinned column' },
  { file: 'chat/ChatPanel.tsx', line: /border-hairline bg-white py-1\.5/, why: 'suggestion chips (pinned column)' },
  { file: 'chat/ChatPanel.tsx', line: /w-\[360px\].*bg-white/, why: 'pinned column (becomes a floating glass sidebar)' },
  { file: 'chat/ChatPanel.tsx', line: /overflow-hidden bg-white shadow-\[/, why: 'settings host' },
];

const files = DIRS.flatMap((d) => readdirSync(join(src, d)).filter((f) => /\.(tsx?|css)$/.test(f)).map((f) => join(src, d, f)));
const failures = [];
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
console.log(`glass check: ${files.length} files, ${failures.length} violations, ${pending} lines pending (Phase B)`);
for (const f of failures) console.log(`  FAIL ${f}`);
process.exit(failures.length ? 1 : 0);
