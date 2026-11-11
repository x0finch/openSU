// Workspace packages resolve to their TypeScript sources in the demo (no
// prior build needed for `pnpm dev` / `pnpm shots`).
import { fileURLToPath } from 'node:url';

export const workspaceAliases = {
  '@opensu/model': fileURLToPath(new URL('../../model/src/index.ts', import.meta.url)),
  '@opensu/kernel': fileURLToPath(new URL('../../kernel/src/index.ts', import.meta.url)),
};
