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
  /**
   * Eye level from a fixed standing point (scene x, z; e.g. inside the plot
   * fence) instead of a distance fitted to the field of view: the field of
   * view widens up to `maxFovDeg` to show the subject.
   */
  eyeAt?: [number, number];
  /** Widest vertical field of view for `eyeAt`, degrees. */
  maxFovDeg?: number;
  /** Points to frame instead of the viewer's framing points (e.g. the building without its plot). */
  frame?: readonly Vector3[];
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

/**
 * Eye-level two-point perspective from a fixed standing point: the camera
 * looks horizontally at the subject's centre; the field of view is the
 * narrowest from `fovDeg` up to `maxFovDeg` that shows the subject with the
 * margin. When even the widest one cannot, the ground line stays in the
 * frame and the top is cut.
 */
export function fitEyeLevelFrom(points: readonly Vector3[], at: [number, number], eyeHeight: number, fovDeg: number, maxFovDeg: number, aspect: number, margin: number): PerspectiveCamera {
  const center = centerOf(points);
  const cam = new PerspectiveCamera(fovDeg, aspect, 0.1, 1000);
  cam.position.set(at[0], eyeHeight, at[1]);
  cam.up.set(0, 1, 0);
  cam.lookAt(center.x, eyeHeight, center.z);
  cam.updateMatrixWorld();
  const view = new Matrix4().copy(cam.matrixWorld).invert();
  const k = 1 / (1 - 2 * margin);
  const minTan = Math.tan((fovDeg * Math.PI) / 360) * 2;
  const maxTan = Math.tan((maxFovDeg * Math.PI) / 360) * 2;
  // Only what the widest frame can hold sideways counts (a wing beside the
  // standing point is cut at the frame's edge, as in a photograph).
  const side = (maxTan * aspect) / 2 / k;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, far = 0;
  const v = new Vector3();
  for (const p of points) {
    v.copy(p).applyMatrix4(view);
    const depth = -v.z;
    if (depth < 1 || Math.abs(v.x / depth) > side) continue;
    far = Math.max(far, depth);
    x0 = Math.min(x0, v.x / depth); x1 = Math.max(x1, v.x / depth);
    y0 = Math.min(y0, v.y / depth); y1 = Math.max(y1, v.y / depth);
  }
  if (x0 === Infinity) return fitEyeLevelCamera(points, 0, eyeHeight, fovDeg, aspect, margin);
  const need = Math.max((y1 - y0) * k, ((x1 - x0) * k) / aspect);
  const tanH = Math.min(maxTan, Math.max(minTan, need));
  const hh = tanH / 2;
  const cx = (x0 + x1) / 2;
  // Centred when it fits; else the ground line (with its margin) at the bottom.
  const fits = (y1 - y0) * k <= tanH;
  const cy = fits ? (y0 + y1) / 2 : y0 - (y1 - y0) * (k - 1) / 2 + hh;
  cam.near = 0.1;
  cam.far = far * 4 + 200;
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

/** Screen space (CSS px) kept free of the subject on each side, e.g. under floating UI. */
export interface FrameInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export const NO_INSETS: FrameInsets = { top: 0, right: 0, bottom: 0, left: 0 };

/** The aspect of the free area inside a `width` x `height` canvas. */
export function freeAspect(insets: FrameInsets, width: number, height: number): number {
  return Math.max(1, width - insets.left - insets.right) / Math.max(1, height - insets.top - insets.bottom);
}

/**
 * A camera framed for the free area (built with `freeAspect`) grows its
 * frustum to the whole canvas: the subject stays inside the free area.
 */
export function applyFrameInsets(cam: Camera, insets: FrameInsets, width: number, height: number): void {
  const { top: t, right: r, bottom: b, left: l } = insets;
  if (!t && !r && !b && !l) return;
  const fh = Math.max(1, height - t - b);
  if (cam instanceof OrthographicCamera) {
    const k = (cam.top - cam.bottom) / cam.zoom / fh;
    cam.left -= l * k;
    cam.right += r * k;
    cam.top += t * k;
    cam.bottom -= b * k;
    cam.updateProjectionMatrix();
    return;
  }
  if (cam instanceof PerspectiveCamera && cam.userData.lensShift) {
    const fw = Math.max(1, width - l - r);
    const { cx, cy, hh } = cam.userData.lensShift as { cx: number; cy: number; hh: number };
    const k = (2 * hh) / fh;
    const x0 = cx - (hh * fw) / fh - l * k, x1 = cx + (hh * fw) / fh + r * k;
    const y0 = cy - hh - b * k, y1 = cy + hh + t * k;
    cam.userData.lensShift = { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, hh: (y1 - y0) / 2 };
    applyLensShift(cam, width / Math.max(1, height));
  }
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
      if (preset.eyeAt) return fitEyeLevelFrom(preset.frame ?? points, preset.eyeAt, preset.eyeHeight ?? camTokens.eyeHeight, preset.fovDeg ?? camTokens.eyeFovDeg, preset.maxFovDeg ?? preset.fovDeg ?? camTokens.eyeFovDeg, aspect, margin);
      return fitEyeLevelCamera(preset.frame ?? points, preset.azimuthDeg, preset.eyeHeight ?? camTokens.eyeHeight, preset.fovDeg ?? camTokens.eyeFovDeg, aspect, margin);
  }
}
