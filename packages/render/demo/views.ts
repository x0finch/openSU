import type { ViewPreset } from '../src/index.js';

/** A demo view: a camera preset, optionally with a level cutaway. */
export interface DemoView extends ViewPreset {
  cutaway?: string;
}

/** The fixed views used by the demo and the screenshot script. */
export const VIEWS: DemoView[] = [
  { id: 'axo-se', label: 'Axo SE', kind: 'axo', azimuthDeg: 148 },
  { id: 'axo-ne', label: 'Axo NE', kind: 'axo', azimuthDeg: 50 },
  { id: 'eye-sw', label: 'Eye SW', kind: 'eye', azimuthDeg: 222 },
  { id: 'elev-south', label: 'South', kind: 'elevation', azimuthDeg: 180 },
  { id: 'axo-sw', label: 'Axo SW', kind: 'axo', azimuthDeg: 212 },
  // Cutaway axonometrics: steeper, so the rooms read like a 3D plan.
  { id: 'cut-L1', label: 'Cut L1', kind: 'axo', azimuthDeg: 148, elevationDeg: 50, margin: 0.15, cutaway: 'L1' },
  { id: 'cut-L2', label: 'Cut L2', kind: 'axo', azimuthDeg: 148, elevationDeg: 50, margin: 0.15, cutaway: 'L2' },
  { id: 'cut-L3', label: 'Cut L3', kind: 'axo', azimuthDeg: 148, elevationDeg: 50, margin: 0.15, cutaway: 'L3' },
];
