import type { ViewKind } from './cameras.js';
import { lighting as lightTokens } from './tokens.js';

/** Sun position as compass bearing towards the sun and elevation, degrees. */
export interface SunPosition {
  azimuthDeg: number;
  elevationDeg: number;
}

/**
 * Lighting modes (docs/DECISIONS.md, "Two lighting modes").
 * - presentation: art-directed sun placed relative to the camera so that one
 *   main visible face is sunlit and the other is turned away (stills, sheets).
 * - physical: the sun is given explicitly (e.g. computed from latitude, date
 *   and time by a sun-study module).
 */
export type LightingMode =
  | {
      mode: 'presentation';
      /** Bearing of one facade normal of the building (facades every 90 deg). */
      facadeAxisDeg?: number;
      /** Which side of the viewer the sun comes from; 'auto' lights the facade facing the camera most. */
      side?: 'auto' | 'left' | 'right';
    }
  | { mode: 'physical'; sun: SunPosition };

export const defaultLighting: LightingMode = { mode: 'presentation' };

/** Signed smallest angle a - b in (-180, 180]. */
function angleDiff(a: number, b: number): number {
  let d = (((a - b) % 360) + 360) % 360;
  if (d > 180) d -= 360;
  return d;
}

/**
 * Presentation rule: the sun sits behind the viewer, `offsetDeg` to one
 * side, high (60 deg for axonometrics, 45 deg for eye-level and elevations).
 */
export function presentationSun(kind: ViewKind, cameraAzimuthDeg: number, facadeAxisDeg = 0, side: 'auto' | 'left' | 'right' = 'auto'): SunPosition {
  const offset = lightTokens.presentationOffsetDeg;
  let sign: number;
  if (side === 'left') sign = 1;
  else if (side === 'right') sign = -1;
  else {
    // The main facade is the one whose normal is closest to the camera bearing.
    const k = Math.round(angleDiff(cameraAzimuthDeg, facadeAxisDeg) / 90);
    const main = facadeAxisDeg + k * 90;
    const d = angleDiff(main, cameraAzimuthDeg);
    sign = d < 0 ? -1 : 1;
  }
  const elevationDeg = kind === 'axo' ? lightTokens.presentationAxoElevationDeg : lightTokens.presentationLowElevationDeg;
  return { azimuthDeg: (((cameraAzimuthDeg + sign * offset) % 360) + 360) % 360, elevationDeg };
}

export function sunForView(mode: LightingMode, kind: ViewKind, cameraAzimuthDeg: number): SunPosition {
  if (mode.mode === 'physical') return mode.sun;
  return presentationSun(kind, cameraAzimuthDeg, mode.facadeAxisDeg, mode.side);
}
