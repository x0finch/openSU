// Names and one-line summaries of the template houses, without their
// commands or the model package: small enough for the Worker (share-page
// titles) and the landing page.

export const TEMPLATE_IDS = ['t1', 't2', 't3'] as const;
export type TemplateId = (typeof TEMPLATE_IDS)[number];

export interface TemplateMeta {
  id: TemplateId;
  /** House name (Chinese, as data). */
  name: string;
  /** One line for the assistant: what the house is. */
  summary: string;
  plot: { width: number; depth: number };
}

export const TEMPLATE_META: readonly TemplateMeta[] = [
  {
    id: 't1',
    name: '白墙坡顶小院',
    summary: 'L-shaped two-storey white house with pitched roofs on a 12 x 14 m plot: single-storey wing with a roof terrace, south courtyard with a deck, carport; three bedrooms',
    plot: { width: 12000, depth: 14000 },
  },
  {
    id: 't2',
    name: '平顶现代',
    summary: 'three-storey flat-roofed modern house on a narrow 10 x 12 m plot: the upper floors step back to a long terrace and a roof terrace; three bedrooms, a study and a tea room',
    plot: { width: 10000, depth: 12000 },
  },
  {
    id: 't3',
    name: '三合院',
    summary: 'U-shaped courtyard house on a 15 x 15 m plot: two-storey main hall, single-storey wings with pitched roofs around a south courtyard; four bedrooms and a tea room',
    plot: { width: 15000, depth: 15000 },
  },
];

/** The default house: the studio opens with it, the landing page shows it. */
export const DEFAULT_TEMPLATE: TemplateId = 't1';

export function isTemplateId(id: unknown): id is TemplateId {
  return typeof id === 'string' && (TEMPLATE_IDS as readonly string[]).includes(id);
}
