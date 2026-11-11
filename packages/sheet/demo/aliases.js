// Workspace packages resolve to their TypeScript sources in the demo, the
// shots script and the tests (no prior build needed).
import { fileURLToPath } from 'node:url';

const src = (pkg) => fileURLToPath(new URL(`../../${pkg}/src/index.ts`, import.meta.url));

export const workspaceAliases = {
  '@opensu/model': src('model'),
  '@opensu/kernel': src('kernel'),
  '@opensu/plan': src('plan'),
  '@opensu/render': src('render'),
};
