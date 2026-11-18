import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { cloudflare } from '@cloudflare/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const src = (p: string) => fileURLToPath(new URL(`../../packages/${p}/src/index.ts`, import.meta.url));

/** "<package version>+<commit>": in turn records and the conversation export (task 020). */
function appVersion(): string {
  const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };
  let commit = process.env.GITHUB_SHA?.slice(0, 7) ?? '';
  if (!commit) {
    try {
      commit = execFileSync('git', ['rev-parse', '--short=7', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch {
      commit = 'unknown';
    }
  }
  return `${pkg.version}+${commit}`;
}

export default defineConfig({
  server: { port: 5173 },
  // Tests of the canonical host (scripts/account-e2e.mjs `canonical`) send other Host headers to `vite preview`.
  preview: process.env.OPENSU_ANY_HOST ? { allowedHosts: true } : {},
  define: { __APP_VERSION__: JSON.stringify(appVersion()) },
  resolve: {
    // Workspace packages resolve to their TypeScript sources: no prior build
    // needed for `pnpm dev`, and one bundler pass tree-shakes everything.
    alias: {
      // Style tokens only (no three.js), for drawings outside the viewer.
      '@opensu/render/tokens': fileURLToPath(new URL('../../packages/render/src/style/tokens.ts', import.meta.url)),
      // Solar position and date presets only (no three.js), for the time bar.
      '@opensu/render/sun': fileURLToPath(new URL('../../packages/render/src/sun/study.ts', import.meta.url)),
      // The starter house alone (no TanStack AI), for the model chunk.
      '@opensu/agent/starter': fileURLToPath(new URL('../../packages/agent/src/starter.ts', import.meta.url)),
      // Template names only (no model), for share-page titles on the Worker.
      '@opensu/agent/templates-meta': fileURLToPath(new URL('../../packages/agent/src/templates/meta.ts', import.meta.url)),
      '@opensu/agent': src('agent'),
      '@opensu/model': src('model'),
      '@opensu/furnish': src('furnish'),
      '@opensu/kernel': src('kernel'),
      '@opensu/render': src('render'),
      '@opensu/plan': src('plan'),
      '@opensu/sheet': src('sheet'),
    },
  },
  build: {
    // Size budgets are enforced by scripts/size-report.mjs instead.
    chunkSizeWarningLimit: 1500,
  },
  plugins: [
    // OPENSU_STATE: a separate local state folder (D1 etc.) for test runs
    // (scripts/account-e2e.mjs), so they never touch the dev database.
    cloudflare({ viteEnvironment: { name: 'ssr' }, persistState: process.env.OPENSU_STATE ? { path: process.env.OPENSU_STATE } : true }),
    tanstackStart({
      prerender: {
        enabled: true,
        // Only the landing page and the client-only studio shell are static;
        // share pages and the API stay dynamic on the Worker.
        autoSubfolderIndex: false,
        autoStaticPathsDiscovery: false,
        crawlLinks: false,
        failOnError: true,
      },
      pages: [
        { path: '/', prerender: { enabled: true } },
        { path: '/studio', prerender: { enabled: true } },
      ],
    }),
    react(),
    tailwindcss(),
  ],
});
