// The package's boundaries (task 031), checked statically. `@opensu/ui` is
// not coupled to the app: it could be split out and published as it is.
//
//   node scripts/boundary-check.mjs
//
// Rules:
// - imports: no file of an app (`apps/`), no other `@opensu/*` package,
//   nothing outside this package by a relative path, no three.js, no
//   store, router, auth or data library; only React, Base UI and Vaul
//   from outside (and the package's own files);
// - package.json: peer dependencies are react and react-dom only;
//   dependencies are Base UI and Vaul only;
// - no product text: no CJK text in code, no literal string for an
//   accessible name, a title, a placeholder or alt text, no literal text
//   between JSX tags (every string comes in through props; a `labels`
//   prop may carry English defaults, written as `labels = { ... }`
//   defaults, which this check allows);
// - no app globals or I/O: no `fetch(`, no `window.__studio`, no
//   localStorage / sessionStorage, no `document.cookie`.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'src');
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
const files = walk(src).filter((f) => /\.(tsx?|css)$/.test(f));
const failures = [];
const fail = (file, line, rule, what) => failures.push(`${relative(root, file)}:${line}: ${rule}: ${what.trim().slice(0, 140)}`);

/** Packages a file may import from outside the package. */
const ALLOWED = [/^react$/, /^react\/jsx-runtime$/, /^react-dom$/, /^react-dom\/client$/, /^@base-ui\/react(\/[\w-]+)?$/, /^vaul$/];
const BANNED_NAMES = /^(three|zustand|jotai|redux|@reduxjs\/|@tanstack\/|better-auth|swr|axios)/;

let imports = 0;
for (const f of files) {
  const text = readFileSync(f, 'utf8');
  const lines = text.split('\n');
  const isCss = f.endsWith('.css');
  // Comments may say anything; strip them line by line (block comments too).
  let inBlock = false;
  const code = lines.map((l) => {
    let out = '';
    for (let i = 0; i < l.length; i++) {
      if (inBlock) {
        if (l.startsWith('*/', i)) {
          inBlock = false;
          i++;
        }
        continue;
      }
      if (l.startsWith('/*', i)) {
        inBlock = true;
        i++;
        continue;
      }
      if (!isCss && l.startsWith('//', i) && l[i - 1] !== ':') break;
      out += l[i];
    }
    return out.replace(/\{\/\*.*?\*\/\}/g, '');
  });
  code.forEach((c, i) => {
    const n = i + 1;
    if (isCss) {
      const m = /@import\s+["']([^"']+)["']/.exec(c);
      if (m && !m[1].startsWith('./')) fail(f, n, 'import', `stylesheet imports ${m[1]} (only the package's own files)`);
      if (/[㐀-鿿]/.test(c)) fail(f, n, 'product text', c);
      return;
    }
    for (const m of c.matchAll(/(?:\bfrom\s+|\bimport\s*\(\s*|^\s*import\s+)['"]([^'"]+)['"]/g)) {
      imports++;
      const spec = m[1];
      if (spec.startsWith('.')) {
        const target = resolve(dirname(f), spec);
        if (!target.startsWith(src)) fail(f, n, 'import', `${spec} leaves the package`);
        continue;
      }
      if (/(^|\/)apps\//.test(spec)) fail(f, n, 'import', `${spec} (an app)`);
      else if (spec.startsWith('@opensu/')) fail(f, n, 'import', `${spec} (another @opensu package)`);
      else if (BANNED_NAMES.test(spec)) fail(f, n, 'import', `${spec} (three.js, a store, router, auth or data library)`);
      else if (!ALLOWED.some((r) => r.test(spec))) fail(f, n, 'import', `${spec} (not react, react-dom, Base UI or Vaul)`);
    }
    if (/[㐀-鿿]/.test(c)) fail(f, n, 'product text', c);
    if (/\b(aria-label|aria-description|title|placeholder|alt)=["'][^"']*[A-Za-z][^"']*["']/.test(c)) fail(f, n, 'product text', `${c} (a literal string for a name, title, placeholder or alt; take it from props)`);
    if (/\b(aria-label|title|placeholder|alt)=\{\s*['"`][^'"`]*[A-Za-z]/.test(c)) fail(f, n, 'product text', `${c} (a literal string for a name, title, placeholder or alt; take it from props)`);
    // Literal text between JSX tags (">Close<").
    if (/>\s*[A-Za-z][A-Za-z ,.'!?-]{1,}\s*<\//.test(c)) fail(f, n, 'product text', `${c} (literal text in JSX; take it from props)`);
    if (/\bfetch\s*\(/.test(c)) fail(f, n, 'i/o', `${c} (fetch: the app loads data, not the package)`);
    if (/__studio|\blocalStorage\b|\bsessionStorage\b|document\.cookie/.test(c)) fail(f, n, 'app global', c);
  });
}

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const peers = Object.keys(pkg.peerDependencies ?? {}).sort();
if (peers.join() !== 'react,react-dom') failures.push(`package.json: peerDependencies must be react and react-dom only (are: ${peers.join(', ') || 'none'})`);
const deps = Object.keys(pkg.dependencies ?? {});
for (const d of deps) if (!['@base-ui/react', 'vaul'].includes(d)) failures.push(`package.json: dependency ${d} (only Base UI and Vaul)`);
for (const [d, v] of Object.entries(pkg.dependencies ?? {})) if (!/^\d+\.\d+\.\d+$/.test(v)) failures.push(`package.json: ${d} is not pinned to an exact version (${v})`);

console.log(`ui boundary check: ${files.length} files, ${imports} imports, dependencies [${deps.join(', ') || 'none'}], peers [${peers.join(', ')}], ${failures.length} violations`);
for (const f of failures) console.log(`  FAIL ${f}`);
process.exit(failures.length ? 1 : 0);
