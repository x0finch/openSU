// CI runs some browser suites in shards (`--only <name prefixes>`, task 030).
// This checks that every section of a sharded suite is named by a shard in
// .github/workflows/ci.yml, so a new section cannot silently drop out of CI.
// Run by the `fast` job; no browser, no build.
//
//   node apps/web/scripts/ci-shards-check.mjs
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ci = readFileSync(resolve(here, '../../../.github/workflows/ci.yml'), 'utf8');
const read = (f) => readFileSync(resolve(here, f), 'utf8');

/** Literal section names: `wanted('name')`. */
const literals = (src) => [...src.matchAll(/wanted\('([A-Za-z0-9-]+)'\)/g)].map((m) => m[1]);

/** shots.mjs: the checks, plus the named shots the smoke run takes (its main block without the `if (!smoke)` part). */
function shotsSections() {
  const src = read('shots.mjs');
  const main = src.slice(src.lastIndexOf('\ntry {'));
  const smokeOnly = main.replace(/\n {2}if \(!smoke\) \{[\s\S]*?\n {2}\}\n/, '\n');
  const named = [...smokeOnly.matchAll(/await (?:landing|studio3d|studioPlan|sheets)\((?:DESKTOP|PHONE), '([^']+)'/g)].map((m) => m[1]);
  // `compare` runs only without --smoke.
  return [...literals(src).filter((n) => n !== 'compare'), ...named];
}

const suites = {
  'test:account': () => literals(read('account-e2e.mjs')),
  'test:chat': () => literals(read('chat-e2e.mjs')),
  'test:shots': shotsSections,
};

// Matrix entries: `run: test:x` followed by `only: a,b`.
const shards = {};
for (const m of ci.matchAll(/run: (test:[a-z]+)\n\s+only: ([A-Za-z0-9,-]+)/g)) (shards[m[1]] ??= []).push(...m[2].split(','));
// A suite listed without `only` runs whole.
const whole = new Set([...ci.matchAll(/run: (test:[a-z]+)\n(?!\s+only:)/g)].map((m) => m[1]));

let bad = 0;
for (const [suite, list] of Object.entries(shards)) {
  if (whole.has(suite)) continue;
  const sections = [...new Set(suites[suite]?.() ?? [])];
  if (!sections.length) {
    console.log(`::error::${suite} is sharded in ci.yml but this check does not know its sections`);
    bad++;
    continue;
  }
  // Covered: a shard names the section or a prefix of it, or (for a block that only holds parts) one of its parts.
  const missing = sections.filter((s) => !list.some((t) => s.startsWith(t) || t.startsWith(`${s}-`)));
  if (missing.length) {
    console.log(`::error::${suite}: sections in no CI shard: ${missing.join(', ')}`);
    bad++;
  } else console.log(`${suite}: ${sections.length} sections, all in a shard`);
}
process.exit(bad ? 1 : 0);
