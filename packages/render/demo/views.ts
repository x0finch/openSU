import type { ViewPreset } from '../src/index.js';

/** The fixed views used by the demo and the screenshot script. */
export const VIEWS: ViewPreset[] = [
  { id: 'axo-se', label: 'Axo SE', kind: 'axo', azimuthDeg: 148, sun: { azimuthDeg: 188, elevationDeg: 50 } },
  { id: 'axo-ne', label: 'Axo NE', kind: 'axo', azimuthDeg: 45, sun: { azimuthDeg: 96, elevationDeg: 50 } },
  { id: 'eye-sw', label: 'Eye SW', kind: 'eye', azimuthDeg: 222, eyeHeight: 4.0, sun: { azimuthDeg: 200 } },
  { id: 'elev-south', label: 'South', kind: 'elevation', azimuthDeg: 180, sun: { azimuthDeg: 215, elevationDeg: 45 } },
];
