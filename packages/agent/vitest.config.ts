import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Tests run against the sources, not (possibly stale) dists. The template
// quality test also reaches the furniture, plan and kernel packages.
const src = (p: string) => fileURLToPath(new URL(`../${p}/src/index.ts`, import.meta.url));
export default defineConfig({
  resolve: {
    alias: { '@opensu/model': src('model'), '@opensu/furnish': src('furnish'), '@opensu/plan': src('plan'), '@opensu/kernel': src('kernel') },
  },
});
