import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Tests run against the model's sources, not its (possibly stale) dist.
export default defineConfig({
  resolve: {
    alias: {
      '@opensu/model': fileURLToPath(new URL('../model/src/index.ts', import.meta.url)),
      '@opensu/furnish': fileURLToPath(new URL('../furnish/src/index.ts', import.meta.url)),
    },
  },
});
