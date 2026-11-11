import { fileURLToPath } from 'node:url';
import { cloudflare } from '@cloudflare/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const src = (p: string) => fileURLToPath(new URL(`../../packages/${p}/src/index.ts`, import.meta.url));

export default defineConfig({
  server: { port: 5173 },
  resolve: {
    // Workspace packages resolve to their TypeScript sources: no prior build
    // needed for `pnpm dev`, and one bundler pass tree-shakes everything.
    alias: {
      // Style tokens only (no three.js), for drawings outside the viewer.
      '@opensu/render/tokens': fileURLToPath(new URL('../../packages/render/src/style/tokens.ts', import.meta.url)),
      '@opensu/model': src('model'),
      '@opensu/kernel': src('kernel'),
      '@opensu/render': src('render'),
      '@opensu/plan': src('plan'),
    },
  },
  build: {
    // Size budgets are enforced by scripts/size-report.mjs instead.
    chunkSizeWarningLimit: 1500,
  },
  plugins: [
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
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
