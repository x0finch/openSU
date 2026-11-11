// The built-in template houses: our own designs (not the golden reference),
// each authored as a script of `edit_house` commands on a blank plot.
import { applyCommands, type House } from '@opensu/model';
import { blankHouse } from '../blank';
import { T1_COMMANDS } from './t1';
import { T2_COMMANDS } from './t2';
import { T3_COMMANDS } from './t3';
import { TEMPLATE_META, type TemplateId, type TemplateMeta } from './meta';

export { DEFAULT_TEMPLATE, isTemplateId, TEMPLATE_IDS, TEMPLATE_META, type TemplateId, type TemplateMeta } from './meta';

export interface Template extends TemplateMeta {
  commands: readonly unknown[];
}

const COMMANDS: Record<TemplateId, readonly unknown[]> = { t1: T1_COMMANDS, t2: T2_COMMANDS, t3: T3_COMMANDS };

export const TEMPLATES: readonly Template[] = TEMPLATE_META.map((m) => ({ ...m, commands: COMMANDS[m.id] }));

/** A template house, built from `blankHouse()` with its commands. */
export function templateHouse(id: TemplateId): House {
  const t = TEMPLATES.find((x) => x.id === id)!;
  const r = applyCommands(blankHouse({ width: t.plot.width, depth: t.plot.depth, name: t.name }), t.commands);
  if (!r.ok) {
    const msg = r.issues.filter((i) => i.severity === 'error').map((i) => `${i.code}: ${i.message}`).join('\n');
    throw new Error(`template ${id} does not validate:\n${msg}`);
  }
  return r.house;
}
