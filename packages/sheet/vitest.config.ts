import { defineConfig } from 'vitest/config';
import { workspaceAliases } from './demo/aliases.js';

// Tests run against the workspace sources, not their (possibly stale) dist.
export default defineConfig({ resolve: { alias: workspaceAliases } });
