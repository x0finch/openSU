// The assistant's tools. They run where the agent loop runs (the browser in
// the app), against the turn's working copy of the house.
import { applyCommands, commandsJsonSchema, describeHouse, EDIT_HOUSE_DESCRIPTION, type House, type Issue, validate } from '@opensu/model';
import { toolDefinition } from '@tanstack/ai';
import { describeDiff } from './diff';
import { blankHouse, DEFAULT_TEMPLATE, isTemplateId, TEMPLATE_IDS, TEMPLATES, templateHouse } from './starter';

/**
 * A Standard Schema that accepts any input but reports `jsonSchema` to the
 * model. Input checking is left to `applyCommands`, whose messages name ids,
 * nearest valid ids and numbers; a generic JSON Schema validator would
 * reject a bad command with a much less useful message.
 */
function lenientSchema(jsonSchema: Record<string, unknown>) {
  return {
    '~standard': {
      version: 1 as const,
      vendor: 'opensu',
      validate: (value: unknown) => ({ value }),
      jsonSchema: { input: () => jsonSchema, output: () => jsonSchema },
    },
  };
}

/** `edit_house` input: the model package's command schema plus a summary line. */
export function editHouseInputSchema(): Record<string, unknown> {
  const base = commandsJsonSchema() as { properties?: Record<string, unknown>; required?: string[] };
  return {
    ...base,
    properties: {
      summary: { type: 'string', description: 'One short line in the user\'s language saying what this batch changes, e.g. "客厅向东加宽 600 mm". Shown to the user.' },
      ...base.properties,
    },
    required: [...(base.required ?? ['commands'])],
  };
}

/** One applied batch, for the "changes" card. */
export interface AppliedBatch {
  /** The model's one-line summary (user's language), or the first command summary. */
  summary: string;
  /** What each command did (English, from `applyCommands`). */
  details: string[];
}

/** What the tools report back to the turn controller. */
export interface ToolHooks {
  /** A batch was kept: the house moved on. */
  onEdit(house: House, batch: AppliedBatch, firstChangedLevel: number): void;
  /** A batch was rejected; returns the repairs left (negative = give up). */
  onReject(errors: string[]): number;
  /** The house was replaced (new_house). */
  onNewHouse(house: House, summary: string): void;
}

const errorLines = (issues: readonly Issue[]) => issues.filter((i) => i.severity === 'error' && i.code !== 'rolled-back').map((i) => `${i.code}: ${i.message}`);
const warningLines = (issues: readonly Issue[]) => issues.filter((i) => i.severity === 'warning').map((i) => `${i.code}: ${i.message}`);

/** Index of the lowest level whose description changed (0 when unsure). */
function firstChangedLevel(before: House, after: House): number {
  if (before.levels.length !== after.levels.length || JSON.stringify(before.grid) !== JSON.stringify(after.grid)) return 0;
  const i = after.levels.findIndex((l, k) => JSON.stringify(l) !== JSON.stringify(before.levels[k]));
  return i < 0 ? Math.max(0, after.levels.length - 1) : i;
}

/** A place from the host's built-in list (see `find_place`). */
export interface PlaceMatch {
  /** Display name, e.g. "成都" or "Berlin". */
  name: string;
  /** Region and country, e.g. "四川, 中国" or "Berlin, Germany". */
  region: string;
  latitude: number;
  longitude: number;
  /** IANA time zone. */
  timeZone: string;
}

/** Looks a place up by name (any language the host supports); best match first. */
export type FindPlace = (query: string) => Promise<PlaceMatch[]>;

/**
 * The tools for one turn. `getHouse` / `setHouse` read and write the turn's
 * working house (the last valid state). With `findPlace` the model can
 * also look up where the house is (no network: the host's own list).
 */
export function createHouseTools(getHouse: () => House, hooks: ToolHooks, findPlace?: FindPlace) {
  const editHouse = toolDefinition({
    name: 'edit_house',
    description: `${EDIT_HOUSE_DESCRIPTION} Also give "summary": one short line in the user's language. The result lists what each command did and the changed lines of the house description.`,
    inputSchema: lenientSchema(editHouseInputSchema()),
  }).server((input: unknown) => {
    const { summary, commands } = (input ?? {}) as { summary?: unknown; commands?: unknown };
    const before = getHouse();
    const r = applyCommands(before, Array.isArray(commands) ? commands : [commands]);
    if (!r.ok) {
      const errors = errorLines(r.issues);
      const left = hooks.onReject(errors);
      return {
        ok: false,
        errors: errors.length ? errors : ['The batch was rejected (no commands?). Send {"commands": [...]}.'],
        note: left >= 0
          ? `Nothing was changed. Fix the batch and send the whole corrected batch again (${left} repair attempt${left === 1 ? '' : 's'} left).`
          : 'Nothing was changed and no repair attempts are left. Do not call edit_house again; tell the user plainly what blocked this and suggest an alternative.',
      };
    }
    const details = r.applied.map((a) => a.summary);
    const batch: AppliedBatch = { summary: typeof summary === 'string' && summary.trim() ? summary.trim() : details[0] ?? 'Edit', details };
    const changed = describeDiff(describeHouse(before), describeHouse(r.house, r.issues));
    hooks.onEdit(r.house, batch, firstChangedLevel(before, r.house));
    const warnings = warningLines(r.issues);
    return { ok: true, applied: details, ...(warnings.length ? { warnings: warnings.slice(0, 6) } : {}), changed };
  });

  const getHouseTool = toolDefinition({
    name: 'get_house',
    description: 'The full current description of the house (same format as CURRENT HOUSE), with its issues. Only needed after many edits in one turn.',
    inputSchema: lenientSchema({ type: 'object', properties: {}, additionalProperties: false }),
  }).server(() => {
    const h = getHouse();
    return { description: describeHouse(h, validate(h)) };
  });

  const newHouse = toolDefinition({
    name: 'new_house',
    description: `Start over: replace the whole house (the user can undo). Finished houses to adapt: ${TEMPLATES.map((t) => `"${t.id}" ${t.name}: ${t.summary}`).join('; ')}. "blank": an empty plot with one empty level, to build on with edit_house. Returns the full description of the new house.`,
    inputSchema: lenientSchema({
      type: 'object',
      properties: {
        template: { type: 'string', enum: [...TEMPLATE_IDS, 'blank'] },
        plotWidth: { type: 'number', description: 'blank only: plot size along X (west-east), mm. Default 16800.' },
        plotDepth: { type: 'number', description: 'blank only: plot size along Y (south-north), mm. Default 18000.' },
        name: { type: 'string', description: 'House name.' },
        summary: { type: 'string', description: 'One short line in the user\'s language, shown to the user.' },
      },
      required: ['template'],
      additionalProperties: false,
    }),
  }).server((input: unknown) => {
    const { template, plotWidth, plotDepth, name, summary } = (input ?? {}) as { template?: string; plotWidth?: number; plotDepth?: number; name?: string; summary?: string };
    let house = template === 'blank'
      ? blankHouse({ width: typeof plotWidth === 'number' ? plotWidth : undefined, depth: typeof plotDepth === 'number' ? plotDepth : undefined, name })
      : templateHouse(isTemplateId(template) ? template : DEFAULT_TEMPLATE);
    if (template !== 'blank' && name) house = { ...house, name };
    hooks.onNewHouse(house, typeof summary === 'string' && summary.trim() ? summary.trim() : `New house: ${house.name}`);
    return { ok: true, description: describeHouse(house) };
  });

  const findPlaceTool = toolDefinition({
    name: 'find_place',
    description: 'Look up a city or town by name (Chinese, pinyin or English) in the built-in place list. Returns up to 5 matches with latitude, longitude and IANA time zone, best first. Then set the site with edit_house update_site { latitude, longitude, timeZone, placeName }.',
    inputSchema: lenientSchema({
      type: 'object',
      properties: { query: { type: 'string', description: 'Place name, e.g. "成都", "chengdu", "Berlin".' } },
      required: ['query'],
      additionalProperties: false,
    }),
  }).server(async (input: unknown) => {
    const query = String((input as { query?: unknown } | null)?.query ?? '').trim();
    if (!query || !findPlace) return { ok: false, matches: [], note: 'Give a place name.' };
    const matches = (await findPlace(query)).slice(0, 5);
    return matches.length ? { ok: true, matches } : { ok: false, matches: [], note: 'No such place in the list. Ask the user for a nearby larger town, or for latitude and longitude.' };
  });

  return findPlace ? ([editHouse, getHouseTool, newHouse, findPlaceTool] as const) : ([editHouse, getHouseTool, newHouse] as const);
}
