import { defineConfig } from 'vite';
import { workspaceAliases } from './aliases.js';

export default defineConfig({
  build: { chunkSizeWarningLimit: 2000 },
  resolve: { alias: workspaceAliases },
});
