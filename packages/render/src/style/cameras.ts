import { type Camera, Matrix4, OrthographicCamera, PerspectiveCamera, Vector3 } from 'three';
import { cameras as camTokens } from './tokens.js';

export type ViewKind = 'axo' | 'eye' | 'elevation';

export interface ViewPreset {
  id: string;
  label: string;
  kind: ViewKind;
  /** Compass bearing from the subject towards the camera (0 = north, 90 = east). */
  azimuthDeg: number;
  /** Axonometric elevation angle (defaults to the token value). */
  elevationDeg?: number;
  /** Eye-level camera height in metres. */
  eyeHeight?: number;
  /** Eye-level vertical field of view (defaults to the token value). */
  fovDeg?: number;
  /** White margin as a fraction of the frame. */
  margin?: number;
}

function horizontalDir(azimuthDeg: number): Vector3 {
  const a = (azimuthDeg * Math.PI) / 180;
  return new Vector3(Math.sin(a), 0, -Math.cos(a));
}

function centerOf(points: readonly Vector3[]): Vector3 {
  const min = new Vector3(Infinity, Infinity, Infinity);
  const max = new Vector3(-Infinity, -Infinity, -Infinity);
  for (const p of points) {
    min.min(p);
    max.max(p);
  }
  return min.add(max).multiplyScalar(0.5);
}

/**
 * Parallel projection looking at the subject from a compass bearing and an
 * elevation angle (0 = straight elevation). The frustum is fitted to the
 * given points with a white margin and the requested aspect ratio.
 */
export function fitParallelCamera(points: readonly Vector3[], azimuthDeg: number, elevationDeg: number, aspect: number, margin: number): OrthographicCamera {
  const center = centerOf(points);
  const el = (elevationDeg * Math.PI) / 180;
  const dir = horizontalDir(azimuthDeg).multiplyScalar(Math.cos(el));
  dir.y = Math.sin(el);
  let radius = 0;
  for (const p of points) radius = Math.max(radius, p.distanceTo(center));
  const cam = new OrthographicCamera();
  cam.position.copy(center).addScaledVector(dir, radius * 3);
  cam.up.set(0, 1, 0);
  cam.lookAt(center);
  cam.updateMatrixWorld();
  const view = new Matrix4().copy(cam.matrixWorld).invert();
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  const v = new Vector3();
  for (const p of points) {
    v.copy(p).applyMatrix4(view);
    x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x);
    y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y);
    z0 = Math.min(z0, v.z); z1 = Math.max(z1, v.z);
  }
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  let hh = Math.max((y1 - y0) / 2, (x1 - x0) / 2 / aspect) / (1 - 2 * margin);
  const hw = hh * aspect;
  cam.left = cx - hw;
  cam.right = cx + hw;
  cam.top = cy + hh;
  cam.bottom = cy - hh;
  cam.near = Math.max(0.01, -z1 - radius);
  cam.far = -z0 + radius;
  cam.updateProjectionMatrix();
  return cam;
}

/**
 * Eye-level two-point perspective: the camera looks horizontally (so
 * verticals stay vertical) and the subject is framed with a lens shift.
 * The distance is chosen so the frame matches the requested field of view.
 */
export function fitEyeLevelCamera(points: readonly Vector3[], azimuthDeg: number, eyeHeight: number, fovDeg: number, aspect: number, margin: number): PerspectiveCamera {
  const center = centerOf(points);
  const dir = horizontalDir(azimuthDeg);
  const cam = new PerspectiveCamera(fovDeg, aspect, 0.1, 1000);
  const targetTan = Math.tan(((fovDeg * Math.PI) / 180) / 2) * 2;
  const window = { x0: 0, x1: 0, y0: 0, y1: 0 };
  const place = (d: number) => {
    cam.position.set(center.x + dir.x * d, eyeHeight, center.z + dir.z * d);
    cam.up.set(0, 1, 0);
    cam.lookAt(center.x, eyeHeight, center.z);
    cam.updateMatrixWorld();
    const view = new Matrix4().copy(cam.matrixWorld).invert();
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    const v = new Vector3();
    for (const p of points) {
      v.copy(p).applyMatrix4(view);
      const depth = Math.max(0.05, -v.z);
      x0 = Math.min(x0, v.x / depth); x1 = Math.max(x1, v.x / depth);
      y0 = Math.min(y0, v.y / depth); y1 = Math.max(y1, v.y / depth);
    }
    Object.assign(window, { x0, x1, y0, y1 });
    return Math.max(y1 - y0, (x1 - x0) / aspect) / (1 - 2 * margin);
  };
  let lo = 1, hi = 1000;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (place(mid) > targetTan) lo = mid; else hi = mid;
  }
  place(hi);
  const near = 0.1;
  const cx = (window.x0 + window.x1) / 2;
  const cy = (window.y0 + window.y1) / 2;
  const hh = targetTan / 2;
  const hw = hh * aspect;
  cam.near = near;
  cam.far = hi * 4 + 200;
  cam.userData.lensShift = { cx, cy, hh };
  applyLensShift(cam, aspect);
  return cam;
}

/** Re-applies a lens-shifted frustum (after a resize) keeping its vertical extent. */
export function applyLensShift(cam: PerspectiveCamera, aspect: number): void {
  const shift = cam.userData.lensShift as { cx: number; cy: number; hh: number } | undefined;
  if (!shift) return;
  const { cx, cy, hh } = shift;
  const hw = hh * aspect;
  const near = cam.near;
  cam.aspect = aspect;
  cam.projectionMatrix.makePerspective((cx - hw) * near, (cx + hw) * near, (cy + hh) * near, (cy - hh) * near, near, cam.far);
  cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
}

/** Keeps an orthographic frustum's centre and height, adapting its width. */
export function applyOrthoAspect(cam: OrthographicCamera, aspect: number): void {
  const cx = (cam.left + cam.right) / 2;
  const hw = ((cam.top - cam.bottom) / 2) * aspect;
  cam.left = cx - hw;
  cam.right = cx + hw;
  cam.updateProjectionMatrix();
}

/** Builds the camera for a preset, framing the given world-space points. */
export function cameraForView(preset: ViewPreset, points: readonly Vector3[], aspect: number): Camera {
  const margin = preset.margin ?? camTokens.margin;
  switch (preset.kind) {
    case 'axo':
      return fitParallelCamera(points, preset.azimuthDeg, preset.elevationDeg ?? camTokens.axoElevationDeg, aspect, margin);
    case 'elevation':
      return fitParallelCamera(points, preset.azimuthDeg, 0, aspect, margin);
    case 'eye':
      return fitEyeLevelCamera(points, preset.azimuthDeg, preset.eyeHeight ?? camTokens.eyeHeight, preset.fovDeg ?? camTokens.eyeFovDeg, aspect, margin);
  }
}
