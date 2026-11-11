// Lazy chunk: three.js, the kernel and the illustration viewer. Nothing in
// here may be imported statically from the route modules.
import { Box3, type Mesh, type Object3D, OrthographicCamera, PerspectiveCamera, Vector3 } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { treeHidesFacade } from '@opensu/furnish';
import { buildHouse } from '@opensu/kernel';
import type { ResolvedHouse } from '@opensu/model';
import {
  createHouseObject, defaultLighting, type FrameInsets, IllustrationViewer, type LightingMode, type SceneStats, type StudySite, studySun, type StudySun, sunForView,
  type ViewPreset, type WalkState,
} from '@opensu/render';
import { EYE_ALTERNATE } from '../lib/views';

export interface Engine {
  /**
   * Shows a preset with a level cutaway (null = whole house); animated
   * (~400 ms) unless `instant`. A changed cutaway clips at once and the
   * camera then moves to the new framing.
   */
  setView(preset: ViewPreset, cut?: string | null, instant?: boolean): void;
  /**
   * Sun study: the physical sun of the site at `date` / `minutes`, or back
   * to presentation lighting with `null`. Returns the sun for that date and
   * time (sunrise, sunset, position), also when switched off.
   */
  setSun(sun: { date: string; minutes: number } | null): void;
  /** The site's sun for a date and time (no change to the view). */
  sunAt(date: string, minutes: number): StudySun;
  resize(): void;
  /**
   * Replaces the house (after an edit) and keeps the camera: the preset
   * framing follows the new house unless the user has orbited away.
   */
  setHouse(resolved: ResolvedHouse): void;
  /** The "grow" transition: levels from `fromLevel` up rise in sequence (~1.5 s). */
  playGrow(fromLevel?: number): Promise<void>;
  /** Renders a frame now and returns the share of non-white pixels (0..1). */
  inkCoverage(): number;
  stats(): SceneStats;
  /**
   * Walk mode: first person from the main entrance (or a level's stair
   * arrival); a short dissolve in and out. `exitWalk` returns to the
   * preset that was shown.
   */
  enterWalk(opts?: { level?: string }): void;
  exitWalk(): void;
  readonly walking: boolean;
  /** Listens to the walker (position, heading, level); null when walking stops. */
  onWalk(cb: (s: WalkState | null) => void): () => void;
  /** Analogue movement from the touch joystick (-1..1 each). */
  walkMove(forward: number, strafe: number): void;
  /** Jump to a level's stair arrival point while walking. */
  walkToLevel(levelId: string): void;
  /**
   * Screen space (CSS px) taken by floating UI: presets frame the house in
   * what is left. Re-frames the current preset (animated, `durationMs` or
   * ~400 ms, so it can keep pace with a sliding sheet) unless the user has
   * moved the camera. A change during a running preset transition re-aims
   * that transition at the new framing.
   */
  setInsets(insets: FrameInsets | readonly FrameInsets[], instant?: boolean, durationMs?: number): void;
  /** Frames on the house with its entourage (phones) or on the architecture alone. */
  setWideFrame(on: boolean): void;
  /** Called with true when the user orbits / zooms / pans away from the preset, false when a preset is applied. */
  onMoved(cb: (moved: boolean) => void): void;
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

export interface EngineOptions {
  pixelRatio?: number;
  /** Called after each frame with the on-screen direction of north (degrees clockwise from up). */
  onNorth?: (deg: number) => void;
  /** Frame the house with its trees and entourage (phones), not the architecture alone; see `setWideFrame`. */
  wideFrame?: boolean;
}

/**
 * Corners of the entourage (trees, bamboo, people, car) of a house object:
 * framing points that keep a tree standing beside the house inside the
 * frame, so the whole picture is centred, not the architecture alone.
 */
function entouragePoints(root: Object3D): Vector3[] {
  const out: Vector3[] = [];
  const box = new Box3();
  root.updateMatrixWorld(true);
  for (const o of root.children) {
    if (o.userData.partId !== undefined || o.name === 'floor-lines') continue;
    box.setFromObject(o);
    if (box.isEmpty()) continue;
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) out.push(new Vector3(x, y, z));
  }
  return out;
}

export function createEngine(container: HTMLElement, resolved: ResolvedHouse, opts: EngineOptions = {}): Engine {
  const viewer = new IllustrationViewer(container, { pixelRatio: opts.pixelRatio });
  /** True north in scene axes (model +Y turned by the site's northDeg). */
  const north = new Vector3(0, 0, -1);
  if (opts.onNorth) {
    const onNorth = opts.onNorth;
    const right = new Vector3();
    const up = new Vector3();
    viewer.onAfterRender = () => {
      const m = viewer.camera.matrixWorld;
      right.setFromMatrixColumn(m, 0);
      up.setFromMatrixColumn(m, 1);
      onNorth((Math.atan2(right.dot(north), up.dot(north)) * 180) / Math.PI);
    };
  }
  const canvas = viewer.renderer.domElement;
  canvas.style.transition = `opacity ${FADE}ms ease`;
  canvas.style.touchAction = 'none';
  canvas.style.outline = 'none';

  let site: StudySite;
  /** Current lighting: presentation, or the physical sun by date and time. */
  let lighting: LightingMode = defaultLighting;
  const sceneCenter = new Vector3();
  let radius = 0;

  let current = resolved;

  /**
   * The eye-level preset looks at the facade from the south-west unless a
   * tree hides its centre from there and not from the south-east (the same
   * rule as the sheets' hero views).
   */
  function eyeSide(preset: ViewPreset): ViewPreset {
    if (preset.kind !== 'eye' || preset.id !== 'eye-sw') return preset;
    const hidden = treeHidesFacade(current, preset.azimuthDeg) && !treeHidesFacade(current, EYE_ALTERNATE.azimuthDeg);
    return hidden ? { ...preset, azimuthDeg: EYE_ALTERNATE.azimuthDeg } : preset;
  }

  let wideFrame = !!opts.wideFrame;

  /** Builds and shows a house; frees the geometry of the previous one. */
  function load(r: ResolvedHouse): void {
    current = r;
    const old = viewer.scene.getObjectByName('baked');
    old?.traverse((o) => (o as Mesh).geometry?.dispose());
    const house = createHouseObject(buildHouse(r), viewer.palette);
    viewer.setContent(house.root, wideFrame ? [...house.framePoints, ...entouragePoints(house.root)] : house.framePoints);
    site = house.root.userData.site as StudySite;
    const n = (r.site.northDeg * Math.PI) / 180;
    north.set(Math.sin(n), 0, -Math.cos(n));
    const min = new Vector3(Infinity, Infinity, Infinity);
    const max = new Vector3(-Infinity, -Infinity, -Infinity);
    for (const p of house.framePoints) {
      min.min(p);
      max.max(p);
    }
    sceneCenter.copy(min).add(max).multiplyScalar(0.5);
    radius = 0;
    for (const p of house.framePoints) radius = Math.max(radius, p.distanceTo(sceneCenter));
  }
  load(resolved);

  let controls: OrbitControls | null = null;
  let anim = 0;
  let fadeTimer = 0;
  let disposed = false;
  /** True once the user orbits / zooms away from the preset framing. */
  let movedFlag = false;
  let onMovedCb: ((m: boolean) => void) | null = null;
  const setMoved = (m: boolean) => {
    if (m === movedFlag) return;
    movedFlag = m;
    onMovedCb?.(m);
  };
  /** Where the orbit target may go: the scene bounds plus a little (pan stays near the plot). */
  const panBox = new Box3();

  /**
   * Disposes the orbit controls. OrbitControls resets the canvas'
   * touch-action to 'auto' on dispose; without 'none' a finger dragging in
   * walk mode would pan the page and the browser cancels the look gesture.
   */
  function dropControls(): void {
    controls?.dispose();
    controls = null;
    canvas.style.touchAction = 'none';
  }

  const aspect = () => Math.max(1, container.clientWidth) / Math.max(1, container.clientHeight);

  function attachControls(): void {
    dropControls();
    // Read the focus first: OrbitControls' constructor already calls update()
    // with its default target (the origin), which re-aims the camera.
    const focus = viewer.focusPoint();
    const quaternion = viewer.camera.quaternion.clone();
    controls = new OrbitControls(viewer.camera, canvas);
    viewer.camera.quaternion.copy(quaternion);
    viewer.camera.updateMatrixWorld();
    controls.target.copy(focus);
    controls.enableDamping = false;
    const cam = viewer.camera;
    // Never below the ground: at most a level look (elevations are exactly level).
    controls.maxPolarAngle = Math.PI / 2;
    if (cam instanceof OrthographicCamera) {
      // Between "the house fills the screen" and "a small house with room around it".
      controls.zoomToCursor = true;
      controls.minZoom = cam.zoom * 0.55;
      controls.maxZoom = cam.zoom * 5;
    } else if (cam instanceof PerspectiveCamera) {
      // Eye level: orbit around the house, never into it.
      controls.zoomToCursor = false;
      const d = cam.position.distanceTo(focus);
      controls.minDistance = Math.min(d, Math.max(radius * 1.05, d * 0.45));
      controls.maxDistance = d * 2.2;
    }
    panBox.setFromPoints([sceneCenter]).expandByScalar(radius * 0.9);
    panBox.min.y = 0;
    controls.update();
    const c = controls;
    let interacting = false;
    controls.addEventListener('start', () => (interacting = true));
    controls.addEventListener('end', () => (interacting = false));
    controls.addEventListener('change', () => {
      if (interacting) setMoved(true);
      // Pan stays near the plot: clamp the target, moving the camera with it.
      const t = c.target;
      const clamped = t.clone().clamp(panBox.min, panBox.max);
      if (!clamped.equals(t)) {
        const d = clamped.sub(t);
        t.add(d);
        c.object.position.add(d);
        c.object.updateMatrixWorld();
      }
      viewer.requestRender();
    });
  }

  function snap(preset: ViewPreset): void {
    viewer.setLighting(lighting);
    viewer.setView(preset);
    attachControls();
    setMoved(false);
  }

  /** Keeps the preset framing on resize until the user takes over the camera. */
  function resize(): void {
    viewer.resize();
    const view = viewer.currentView;
    if (!movedFlag && !anim && !fadeTimer && view && !viewer.walking) {
      viewer.setView(view);
      attachControls();
    }
  }

  function stop(): void {
    cancelAnimationFrame(anim);
    clearTimeout(fadeTimer);
    anim = 0;
    fadeTimer = 0;
    canvas.style.opacity = '1';
  }

  /** The preset the camera is on or moving to (a house swapped in mid-move lands there). */
  let goal: ViewPreset | null = null;

  function setView(requested: ViewPreset, cut: string | null = viewer.cutaway, instant = false, duration = DURATION): void {
    stop();
    const preset = eyeSide(requested);
    goal = preset;
    if (viewer.walking) {
      // A view or cutaway chosen while walking ends the walk.
      dissolve(() => {
        viewer.exitWalk();
        emitWalk(null);
        viewer.setCutaway(cut);
        snap(preset);
      });
      return;
    }
    const from = viewer.camera;
    if (cut !== viewer.cutaway) {
      // Clip now; the viewer re-frames its current preset, the morph below
      // starts from where the camera was.
      viewer.setCutaway(cut);
      viewer.camera = from;
    }
    const reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (instant || reduceMotion || !viewer.currentView) {
      snap(preset);
      return;
    }
    const target = viewer.cameraFor(preset);
    if (!(from instanceof OrthographicCamera) || !(target instanceof OrthographicCamera)) {
      // Perspective <-> parallel: a short dissolve instead of a morph.
      dropControls();
      controls = null;
      canvas.style.opacity = '0';
      fadeTimer = window.setTimeout(() => {
        fadeTimer = 0;
        snap(preset);
        requestAnimationFrame(() => (canvas.style.opacity = '1'));
      }, FADE);
      return;
    }
    dropControls();
    controls = null;
    const a = orthoPose(from, sceneCenter);
    const b = orthoPose(target, sceneCenter);
    const dAz = angleDelta(a.az, b.az);
    // Presentation light follows the camera; the physical sun stays put.
    const sunA = { az: viewer.sun.azimuthDeg, el: viewer.sun.elevationDeg };
    const sunB = sunForView(defaultLighting, preset.kind, preset.azimuthDeg);
    const dSun = angleDelta(sunA.az, sunB.azimuthDeg);
    const cam = new OrthographicCamera();
    const t0 = performance.now();
    const step = (now: number) => {
      if (disposed) return;
      const t = Math.min(1, (now - t0) / duration);
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
      if (lighting.mode === 'presentation') viewer.setLighting({ mode: 'presentation', sun: { azimuthDeg: sunA.az + dSun * k, elevationDeg: sunA.el + (sunB.elevationDeg - sunA.el) * k } });
      else viewer.requestRender();
      if (t < 1) anim = requestAnimationFrame(step);
      else {
        anim = 0;
        snap(preset);
      }
    };
    anim = requestAnimationFrame(step);
  }

  const walkListeners = new Set<(s: WalkState | null) => void>();
  const emitWalk = (st: WalkState | null) => {
    for (const cb of walkListeners) cb(st);
  };
  /** Runs `fn` under a short dissolve (or at once with reduced motion). */
  function dissolve(fn: () => void): void {
    const reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    stop();
    if (reduceMotion) {
      fn();
      return;
    }
    canvas.style.opacity = '0';
    fadeTimer = window.setTimeout(() => {
      fadeTimer = 0;
      fn();
      requestAnimationFrame(() => (canvas.style.opacity = '1'));
    }, FADE);
  }

  function enterWalk(opts: { level?: string } = {}): void {
    dissolve(() => {
      dropControls();
      controls = null;
      viewer.setLighting(lighting);
      const w = viewer.enterWalk(opts.level ? { level: opts.level } : {});
      w.onChange = (st) => emitWalk(st);
      emitWalk(w.state);
    });
  }

  function exitWalk(): void {
    if (!viewer.walking) return;
    dissolve(() => {
      viewer.exitWalk();
      emitWalk(null);
      const view = viewer.currentView;
      if (view) snap(view);
    });
  }

  const engine: Engine = {
    viewer,
    enterWalk,
    exitWalk,
    get walking() {
      return viewer.walking;
    },
    onWalk(cb) {
      walkListeners.add(cb);
      return () => walkListeners.delete(cb);
    },
    walkMove(forward, strafe) {
      viewer.walk?.setMove(forward, strafe);
    },
    walkToLevel(levelId) {
      const w = viewer.walk;
      const a = viewer.walkArrivals.find((x) => x.level === levelId);
      const lv = viewer.levelList.find((l) => l.id === levelId);
      if (!w || !a || !lv) return;
      dissolve(() => w.teleport(a.position[0], a.position[1], lv.elevation, a.headingDeg, { faceRoom: true }));
    },
    setView: (preset, cut, instant) => setView(preset, cut, instant),
    setInsets(insets, instant = false, duration = DURATION) {
      const list = Array.isArray(insets) ? insets : [insets];
      if (JSON.stringify(viewer.frameInsets) === JSON.stringify(list)) return;
      viewer.setFrameInsets(list, false);
      if (movedFlag || viewer.walking || fadeTimer) return;
      // A morph under way (another preset, or the previous inset change) is
      // re-aimed from where the camera is now at the new framing.
      const view = anim && goal ? goal : viewer.currentView;
      // Eye level cannot morph: a re-frame there is instant rather than a dissolve.
      if (view) setView(view, viewer.cutaway, instant || !(viewer.camera instanceof OrthographicCamera), duration);
    },
    onMoved(cb) {
      onMovedCb = cb;
    },
    setWideFrame(on) {
      if (on === wideFrame) return;
      wideFrame = on;
      engine.setHouse(current);
    },
    setSun(sun) {
      lighting = sun ? { mode: 'physical', date: sun.date, minutes: sun.minutes } : defaultLighting;
      // Mid-transition the presentation sun is interpolated; the last frame applies `lighting`.
      if (!anim || lighting.mode === 'physical') viewer.setLighting(lighting);
    },
    sunAt: (date, minutes) => studySun(site, date, minutes),
    resize,
    setHouse(r) {
      const moving = !!(anim || fadeTimer);
      stop();
      const cam = viewer.camera;
      load(r);
      if (moving && goal && !viewer.walking) {
        // A view change was under way (e.g. a new template resets the view):
        // finish it on the new house instead of freezing mid-morph.
        snap(goal);
        return;
      }
      if (viewer.walking) {
        // The viewer keeps walking in the new house (same spot when free):
        // listen to its new walker.
        const w = viewer.walk!;
        w.onChange = (st) => emitWalk(st);
        emitWalk(w.state);
      } else if (movedFlag) {
        // Keep the user's camera (the controls still drive it).
        viewer.camera = cam;
        viewer.requestRender();
      } else {
        attachControls();
      }
    },
    // No grow while walking: the clip plane would sweep through the room around you.
    playGrow: (fromLevel = 0) => (viewer.walking ? Promise.resolve() : viewer.playGrow({ fromLevel })),
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
      walkListeners.clear();
      stop();
      dropControls();
      viewer.dispose();
    },
  };
  return engine;
}

