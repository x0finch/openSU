import type { ViewPreset } from '../src/index.js';

/** The fixed views used by the demo and the screenshot script. */
export const VIEWS: ViewPreset[] = [
  { id: 'axo-se', label: 'Axo SE', kind: 'axo', azimuthDeg: 148 },
  { id: 'axo-ne', label: 'Axo NE', kind: 'axo', azimuthDeg: 50 },
  { id: 'eye-sw', label: 'Eye SW', kind: 'eye', azimuthDeg: 222 },
  { id: 'elev-south', label: 'South', kind: 'elevation', azimuthDeg: 180 },
  { id: 'axo-sw', label: 'Axo SW', kind: 'axo', azimuthDeg: 212 },
];
