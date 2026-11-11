// Lazy chunk: three.js, the kernel and the illustration viewer. Nothing in
// here may be imported statically from the route modules.
import { OrthographicCamera, Vector3 } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildHouse } from '@opensu/kernel';
import type { ResolvedHouse } from '@opensu/model';
import { cameraForView, createHouseObject, defaultLighting, IllustrationViewer, sunForView, type SceneStats, type ViewPreset } from '@opensu/render';

export interface Engine {
  /** Shows a preset; animated (~400 ms) unless `instant`. */
  setView(preset: ViewPreset, instant?: boolean): void;
  resize(): void;
  /** Renders a frame now and returns the share of non-white pixels (0..1). */
  inkCoverage(): number;
  stats(): SceneStats;
  /** The underlying viewer (tests and debugging). */
  readonly viewer: IllustrationViewer;
  dispose(): void;
}

const DURATION = 420;
const FADE = 150;

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** Signed shortest angle from a to b, degrees. */
function angleDelta(a: number, b: number): number {
  let d = (((b - a) % 360) + 540) % 360 - 180;
  if (d === -180) d = 180;
  return d;
}

/** A parallel view reduced to what is visible: bearing, elevation, centre point and half-height. */
interface OrthoPose {
  az: number;
  el: number;
  center: Vector3;
  halfHeight: number;
}

function orthoPose(cam: OrthographicCamera, sceneCenter: Vector3): OrthoPose {
  cam.updateMatrixWorld();
  const dir = cam.getWorldDirection(new Vector3());
  const right = new Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
  const up = new Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
  const cx = (cam.left + cam.right) / 2 / cam.zoom;
  const cy = (cam.top + cam.bottom) / 2 / cam.zoom;
  const p = cam.position.clone().addScaledVector(right, cx).addScaledVector(up, cy);
  // Slide the frame centre along the view axis to the depth of the scene centre.
  p.addScaledVector(dir, dir.dot(sceneCenter.clone().sub(p)));
  return {
    az: (Math.atan2(-dir.x, dir.z) * 180) / Math.PI,
    el: (Math.asin(Math.min(1, Math.max(-1, -dir.y))) * 180) / Math.PI,
    center: p,
    halfHeight: (cam.top - cam.bottom) / 2 / cam.zoom,
  };
}

function applyOrthoPose(cam: OrthographicCamera, pose: OrthoPose, aspect: number, radius: number): void {
  const a = (pose.az * Math.PI) / 180;
  const e = (pose.el * Math.PI) / 180;
  const toCam = new Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e));
  const dist = radius * 3;
  cam.position.copy(pose.center).addScaledVector(toCam, dist);
  cam.up.set(0, 1, 0);
  cam.lookAt(pose.center);
  cam.zoom = 1;
  cam.left = -pose.halfHeight * aspect;
  cam.right = pose.halfHeight * aspect;
  cam.top = pose.halfHeight;
  cam.bottom = -pose.halfHeight;
  cam.near = Math.max(0.01, dist - radius * 2);
  cam.far = dist + radius * 2;
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
}

export function createEngine(container: HTMLElement, resolved: ResolvedHouse, opts: { pixelRatio?: number } = {}): Engine {
  const viewer = new IllustrationViewer(container, { pixelRatio: opts.pixelRatio });
  const canvas = viewer.renderer.domElement;
  canvas.style.transition = `opacity ${FADE}ms ease`;
  canvas.style.touchAction = 'none';
  canvas.style.outline = 'none';

  const geometry = buildHouse(resolved);
  const house = createHouseObject(geometry, viewer.palette);
  viewer.setContent(house.root, house.framePoints);

  const points = house.framePoints;
  const min = new Vector3(Infinity, Infinity, Infinity);
  const max = new Vector3(-Infinity, -Infinity, -Infinity);
  for (const p of points) {
    min.min(p);
    max.max(p);
  }
  const sceneCenter = min.clone().add(max).multiplyScalar(0.5);
  let radius = 0;
  for (const p of points) radius = Math.max(radius, p.distanceTo(sceneCenter));

  let controls: OrbitControls | null = null;
  let anim = 0;
  let fadeTimer = 0;
  let disposed = false;

  const aspect = () => Math.max(1, container.clientWidth) / Math.max(1, container.clientHeight);

  function attachControls(): void {
    controls?.dispose();
    // Read the focus first: OrbitControls' constructor already calls update()
    // with its default target (the origin), which re-aims the camera.
    const focus = viewer.focusPoint();
    const quaternion = viewer.camera.quaternion.clone();
    controls = new OrbitControls(viewer.camera, canvas);
    viewer.camera.quaternion.copy(quaternion);
    viewer.camera.updateMatrixWorld();
    controls.target.copy(focus);
    controls.enableDamping = false;
    controls.zoomToCursor = true;
    controls.update();
    controls.addEventListener('change', () => viewer.requestRender());
  }

  function snap(preset: ViewPreset): void {
    viewer.setLighting(defaultLighting);
    viewer.setView(preset);
    attachControls();
  }

  function stop(): void {
    cancelAnimationFrame(anim);
    clearTimeout(fadeTimer);
    anim = 0;
    canvas.style.opacity = '1';
  }

  function setView(preset: ViewPreset, instant = false): void {
    stop();
    const from = viewer.camera;
    const reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (instant || reduceMotion || !viewer.currentView) {
      snap(preset);
      return;
    }
    const target = cameraForView(preset, points, aspect());
    if (!(from instanceof OrthographicCamera) || !(target instanceof OrthographicCamera)) {
      // Perspective <-> parallel: a short dissolve instead of a morph.
      controls?.dispose();
      controls = null;
      canvas.style.opacity = '0';
      fadeTimer = window.setTimeout(() => {
        snap(preset);
        requestAnimationFrame(() => (canvas.style.opacity = '1'));
      }, FADE);
      return;
    }
    controls?.dispose();
    controls = null;
    const a = orthoPose(from, sceneCenter);
    const b = orthoPose(target, sceneCenter);
    const dAz = angleDelta(a.az, b.az);
    const sunA = { az: viewer.sun.azimuthDeg, el: viewer.sun.elevationDeg };
    const sunB = sunForView(defaultLighting, preset.kind, preset.azimuthDeg);
    const dSun = angleDelta(sunA.az, sunB.azimuthDeg);
    const cam = new OrthographicCamera();
    const t0 = performance.now();
    const step = (now: number) => {
      if (disposed) return;
      const t = Math.min(1, (now - t0) / DURATION);
      const k = easeInOut(t);
      applyOrthoPose(
        cam,
        {
          az: a.az + dAz * k,
          el: a.el + (b.el - a.el) * k,
          center: a.center.clone().lerp(b.center, k),
          halfHeight: a.halfHeight + (b.halfHeight - a.halfHeight) * k,
        },
        aspect(),
        radius,
      );
      viewer.camera = cam;
      viewer.setLighting({ mode: 'physical', sun: { azimuthDeg: sunA.az + dSun * k, elevationDeg: sunA.el + (sunB.elevationDeg - sunA.el) * k } });
      if (t < 1) anim = requestAnimationFrame(step);
      else {
        anim = 0;
        snap(preset);
      }
    };
    anim = requestAnimationFrame(step);
  }

  return {
    viewer,
    setView,
    resize: () => viewer.resize(),
    inkCoverage() {
      viewer.renderNow();
      const gl = viewer.renderer.getContext();
      const w = gl.drawingBufferWidth;
      const h = gl.drawingBufferHeight;
      const px = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      let ink = 0;
      let n = 0;
      for (let i = 0; i < px.length; i += 4 * 7) {
        n++;
        if (px[i]! < 250 || px[i + 1]! < 250 || px[i + 2]! < 250) ink++;
      }
      return ink / n;
    },
    stats: () => viewer.lastStats,
    dispose() {
      disposed = true;
      stop();
      controls?.dispose();
      viewer.dispose();
    },
  };
}

