import type { ViewPreset } from '@opensu/render';

/**
 * The studio's view presets. Ids and angles shared with the render demo
 * (packages/render/demo/views.ts: axo-se, axo-ne, axo-sw, eye-sw,
 * elev-south) are identical so app views match `pnpm shots`.
 */
export const VIEW_PRESETS = [
  { id: 'axo-se', label: 'Axo SE', kind: 'axo', azimuthDeg: 148 },
  { id: 'axo-ne', label: 'Axo NE', kind: 'axo', azimuthDeg: 50 },
  { id: 'axo-nw', label: 'Axo NW', kind: 'axo', azimuthDeg: 310 },
  { id: 'axo-sw', label: 'Axo SW', kind: 'axo', azimuthDeg: 212 },
  { id: 'eye-sw', label: 'Eye SW', kind: 'eye', azimuthDeg: 222 },
  { id: 'elev-south', label: 'South', kind: 'elevation', azimuthDeg: 180 },
  { id: 'elev-east', label: 'East', kind: 'elevation', azimuthDeg: 90 },
  { id: 'elev-north', label: 'North', kind: 'elevation', azimuthDeg: 0 },
  { id: 'elev-west', label: 'West', kind: 'elevation', azimuthDeg: 270 },
] as const satisfies readonly ViewPreset[];

export type ViewId = (typeof VIEW_PRESETS)[number]['id'];

/**
 * The eye-level view from the other side (the sheets' `eye-se`, same
 * angle): the studio's eye level turns here when a tree hides the centre of
 * the facade from the south-west and not from the south-east.
 */
export const EYE_ALTERNATE = { id: 'eye-se', label: 'Eye SE', kind: 'eye', azimuthDeg: 140 } as const satisfies ViewPreset;
export const DEFAULT_VIEW: ViewId = 'axo-se';

export const VIEW_GROUPS: { key: 'views.axo' | 'views.eye' | 'views.elevation'; ids: ViewId[] }[] = [
  { key: 'views.axo', ids: ['axo-nw', 'axo-ne', 'axo-sw', 'axo-se'] },
  { key: 'views.eye', ids: ['eye-sw'] },
  { key: 'views.elevation', ids: ['elev-north', 'elev-east', 'elev-south', 'elev-west'] },
];

export function presetById(id: ViewId): ViewPreset {
  return VIEW_PRESETS.find((v) => v.id === id)!;
}

/**
 * The camera of a level cutaway: the axonometric looks down steeper (50 deg,
 * VISUAL_SPEC) with a little more margin, as the render demo's cut views.
 */
export function cutawayPreset(p: ViewPreset): ViewPreset {
  return p.kind === 'axo' ? { ...p, elevationDeg: 50, margin: 0.15 } : p;
}

export function isViewId(s: unknown): s is ViewId {
  return VIEW_PRESETS.some((v) => v.id === s);
}

/**
 * The cutaway shown in 3D: axonometrics show the chosen cut; eye-level and
 * elevations show the whole house while the choice is kept for the next
 * axonometric (it is never reset silently).
 */
export function shownCut(s: { view: ViewId; cut: string | null }): string | null {
  return s.cut && presetById(s.view).kind === 'axo' ? s.cut : null;
}
