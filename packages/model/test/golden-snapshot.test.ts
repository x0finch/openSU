// Proves that schema changes and the golden sample's migration leave the
// resolved output (what kernel, plan and sheet consume) exactly the same.
// The snapshot was written before the task-009 opening-host migration;
// regenerate it only on purpose:
//   UPDATE_GOLDEN_SNAPSHOT=1 pnpm --filter @opensu/model test
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { golden, resolve } from '../src/index';

const file = resolvePath(dirname(fileURLToPath(import.meta.url)), 'snapshots/golden-resolved.json');

describe('golden resolved snapshot', () => {
  it('resolve(golden) is unchanged', () => {
    const actual = `${JSON.stringify(resolve(golden), null, 1)}\n`;
    if (process.env.UPDATE_GOLDEN_SNAPSHOT) writeFileSync(file, actual);
    expect(actual).toBe(readFileSync(file, 'utf8'));
  });
});
