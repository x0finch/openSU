// Lets Node (with --experimental-transform-types) import the workspace packages'
// TypeScript sources the way Vite does: extensionless relative imports get
// `.ts` (or `/index.ts`) and `@opensu/<pkg>` maps to packages/<pkg>/src.
// For test scripts only:
//   node --experimental-transform-types --import ./scripts/ts-resolve.mjs <script.ts>
import { existsSync } from 'node:fs';
import { register } from 'node:module';
import { fileURLToPath } from 'node:url';

if (!globalThis.__opensuTsResolve) {
  globalThis.__opensuTsResolve = true;
  register(import.meta.url);
}

const packages = new URL('../../../packages/', import.meta.url);

export async function resolve(specifier, context, next) {
  const pkg = /^@opensu\/([a-z]+)(?:\/(starter|templates-meta))?$/.exec(specifier);
  if (pkg) {
    const sub = pkg[2] === 'starter' ? 'starter.ts' : pkg[2] === 'templates-meta' ? 'templates/meta.ts' : 'index.ts';
    return next(new URL(`${pkg[1]}/src/${sub}`, packages).href, context);
  }
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && context.parentURL?.endsWith('.ts') && !/\.[cm]?[jt]sx?$|\.json$/.test(specifier)) {
    const base = new URL(specifier, context.parentURL);
    for (const cand of [`${base.href}.ts`, `${base.href}/index.ts`]) if (existsSync(fileURLToPath(cand))) return next(cand, context);
  }
  return next(specifier, context);
}
