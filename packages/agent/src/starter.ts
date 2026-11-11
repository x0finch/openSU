// Built-in starting points: an empty plot and the template houses (our own
// designs, not the golden reference), authored with the same commands the
// assistant uses, so they double as worked examples and as a regression
// check of the command layer. This entry stays free of the AI SDK so the
// app can load it without the assistant chunk.
import type { House } from '@opensu/model';
import { DEFAULT_TEMPLATE, templateHouse } from './templates/index';
import { T1_COMMANDS } from './templates/t1';

export { blankHouse, type BlankOptions } from './blank';
export {
  DEFAULT_TEMPLATE, TEMPLATES, TEMPLATE_IDS, TEMPLATE_META, templateHouse, isTemplateId, type Template, type TemplateId, type TemplateMeta,
} from './templates/index';

/** Commands of the default house (T1), applied to `blankHouse()`. */
export const STARTER_COMMANDS: readonly unknown[] = T1_COMMANDS;

/** The default house the studio opens with: template T1. */
export function starterHouse(): House {
  return templateHouse(DEFAULT_TEMPLATE);
}
