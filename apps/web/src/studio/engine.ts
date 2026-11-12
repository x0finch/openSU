// Lazy chunk: three.js, the kernel and the illustration viewer. Nothing in
// here may be imported statically from the route modules.
import { Box3, type Mesh, type Object3D, OrthographicCamera, PerspectiveCamera, Vector3 } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { crownRadius, plantSite, pointInRings, treeHidesFacade } from '@opensu/furnish';
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
/** The sun study re-frames this long after the time stops changing. */
const SUN_REFRAME_MS = 450;
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

/**
 * Vertices of the entourage (a sample, at most ~400 per object): framing
 * points that follow the round crowns of the trees instead of their boxes,
 * whose corners would leave uneven white beside a tree.
 */
function entourageSamples(root: Object3D): Vector3[] {
  const out: Vector3[] = [];
  root.updateMatrixWorld(true);
  for (const o of root.children) {
    if (o.userData.partId !== undefined || o.name === 'floor-lines') continue;
    let count = 0;
    o.traverse((m) => {
      const g = (m as Mesh).geometry;
      if (g?.getAttribute('position')) count += g.getAttribute('position').count;
    });
    const step = Math.max(1, Math.floor(count / 400));
    let i = 0;
    o.traverse((m) => {
      const g = (m as Mesh).geometry;
      const pos = g?.getAttribute('position');
      if (!pos) return;
      for (let k = 0; k < pos.count; k++, i++) if (i % step === 0) out.push(new Vector3().fromBufferAttribute(pos, k).applyMatrix4(m.matrixWorld));
    });
  }
  return out;
}

/** Widest field of view of the eye level from inside the plot (degrees; the walk uses 65). */
const EYE_MAX_FOV = 64;

/**
 * Where to stand for the eye level inside a fenced plot (scene x, z and the
 * bearing from the house to that spot). The eye at 1.6 m behind a fence
 * sees the wall and the gate, so it stands on the plot's open ground
 * (gardens, courts, porches; not under a roof, clear of trees, cars and
 * walls) where the building is seen most whole within EYE_MAX_FOV, from
 * the side `azimuthDeg` points to (the front and its corner), looking at
 * two facades rather than square at one; the middle of the view looks
 * across at least 3.2 m of open ground. Null without a fence or without
 * such a spot (narrow front strips): the eye level then stays outside.
 */
const EYE_STAND_ENABLED: boolean = false;

function eyeStand(r: ResolvedHouse, building: readonly Vector3[], obstacles: readonly Vector3[], azimuthDeg: number): { eyeAt: [number, number]; azimuthDeg: number } | null {
  const site = r.site;
  if (!site.fence || !building.length) return null;
  const gf = r.levels[0]!;
  // A light sample of the building (plan mm: x, y; height m).
  const step = Math.max(1, Math.floor(building.length / 1500));
  const pts: [number, number, number][] = [];
  for (let i = 0; i < building.length; i += step) pts.push([building[i]!.x * 1000, -building[i]!.z * 1000, building[i]!.y]);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of pts) {
    x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]);
    y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]);
  }
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const plants = plantSite(r).filter((p) => p.level === gf.id && p.kind !== 'grass');
  const ground = gf.spaces.filter((sp) => sp.outdoor && sp.type !== 'carport');
  const covered = (x: number, y: number) => r.roofs.some((rf) => pointInRings(rf.rings, x, y)) || r.levels.slice(1).some((lv) => lv.spaces.some((sp) => pointInRings(sp.rings, x, y)));
  const onGround = (x: number, y: number) => ground.some((sp) => pointInRings(sp.rings, x, y));
  const maxTan = Math.tan((EYE_MAX_FOV * Math.PI) / 360) * 2 * 0.9;
  const eye = 1.6;
  const want = (azimuthDeg * Math.PI) / 180;
  let best: { x: number; y: number; score: number } | null = null;
  for (let x = 600; x <= site.width - 600; x += 500) {
    for (let y = 600; y <= site.depth - 600; y += 500) {
      // Open ground with room around (no wall, fence or building within reach).
      if (![[0, 0], [450, 0], [-450, 0], [0, 450], [0, -450]].every(([a, b]) => onGround(x + a!, y + b!)) || covered(x, y)) continue;
      if (plants.some((p) => Math.hypot(p.x - x, p.y - y) < (p.kind === 'bamboo' ? 700 : crownRadius(p) * 0.8))) continue;
      const vx = cx - x, vy = cy - y, L = Math.hypot(vx, vy);
      if (L < 1) continue;
      // No crown in the near line of sight.
      const blocked = plants.some((p) => {
        const t = ((p.x - x) * vx + (p.y - y) * vy) / L;
        if (t < 0 || t > 6000) return false;
        return Math.abs((p.x - x) * vy - (p.y - y) * vx) / L < (p.kind === 'bamboo' ? 500 : crownRadius(p) * 0.7);
      });
      if (blocked) continue;
      // The building as seen looking at its centre through a 3:2 frame at
      // the widest field of view: the share of it inside the frame's width,
      // and how much of its height fits there.
      const ux = vx / L, uy = vy / L;
      const half = (maxTan * 1.5) / 2;
      let b0 = Infinity, b1 = -Infinity, near = Infinity, inCone = 0, front = Infinity, centre = Infinity;
      const depths: number[] = [];
      for (const p of pts) {
        const dx = p[0] - x, dy = p[1] - y;
        const depth = dx * ux + dy * uy;
        near = Math.min(near, Math.hypot(dx, dy));
        if (depth < 300 || Math.abs((dx * uy - dy * ux) / depth) > half) continue;
        inCone++;
        const up = ((p[2] - eye) * 1000) / depth;
        // Walls and glazing (not a deck or a step) set how close the building stands.
        if (p[2] > 0.6) {
          front = Math.min(front, depth);
          if (Math.abs((dx * uy - dy * ux) / depth) < half * 0.4) centre = Math.min(centre, depth);
          depths.push(depth);
        }
        b0 = Math.min(b0, up); b1 = Math.max(b1, up);
      }
      // Room in front and a deep view (a court, or a facade across a garden, not one wall).
      depths.sort((a, b) => a - b);
      const deep = depths.length ? depths[Math.floor(depths.length / 2)]! : 0;
      // The middle of the picture looks across open ground (3.2 m at least), not at a wall.
      if (near < 1500 || !inCone || front < 1800 || centre < 3200 || deep < 4500) continue;
      // Nothing taller than the eye close in front: a garden wall, the fence, a car.
      let wall = false;
      for (const o of obstacles) {
        const dx = o.x * 1000 - x, dy = -o.z * 1000 - y;
        const depth = dx * ux + dy * uy;
        if (depth > 150 && depth < 3500 && o.y > 1.1 && Math.abs((dx * uy - dy * ux) / depth) < half) {
          wall = true;
          break;
        }
      }
      if (wall) continue;
      const fit = Math.min(1, maxTan / (b1 - b0)) * (inCone / pts.length);
      // The side asked for (bearing from the house to the spot), and a corner view.
      const bearing = Math.atan2(-vx, -vy);
      const off = Math.abs(Math.atan2(Math.sin(bearing - want), Math.cos(bearing - want)));
      const corner = Math.abs(Math.sin(2 * bearing));
      const score = fit * 3 + Math.min(deep, 9000) / 9000 + Math.min(front, 3500) / 2000 - off * 1.2 + corner * 0.3;
      if (fit > 0.3 && off < 1.6 && (!best || score > best.score)) best = { x, y, score };
    }
  }
  if (!best) return null;
  const az = (Math.atan2(best.x - cx, best.y - cy) * 180) / Math.PI;
  return { eyeAt: [best.x / 1000, -best.y / 1000], azimuthDeg: ((az % 360) + 360) % 360 };
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
  /** Bounds of the architecture (scene axes): what zoom and pan keep on screen. */
  const houseBox = new Box3();
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
    const p = hidden ? { ...preset, azimuthDeg: EYE_ALTERNATE.azimuthDeg } : preset;
    // Behind a fence the eye at 1.6 m sees the wall and the gate: stand
    // inside the plot instead, in the garden or court on that side.
    // Off for now: on T1 the standing point is too close (roof cut, car and
    // person in the foreground). See docs/BACKLOG.md, task 016 item 9.
    const at = EYE_STAND_ENABLED && wideFrame ? eyeStand(current, buildingPoints, eyeObstacles, p.azimuthDeg) : null;
    return at ? { ...p, ...at, maxFovDeg: EYE_MAX_FOV, frame: buildingPoints } : p;
  }

  let wideFrame = !!opts.wideFrame;
  /** The building alone (no plot), for the eye level from inside the fence; what may stand in its way (plot walls, fence, cars). */
  let buildingPoints: Vector3[] = [];
  let eyeObstacles: Vector3[] = [];

  /** Builds and shows a house; frees the geometry of the previous one. */
  function load(r: ResolvedHouse): void {
    current = r;
    const old = viewer.scene.getObjectByName('baked');
    old?.traverse((o) => (o as Mesh).geometry?.dispose());
    const house = createHouseObject(buildHouse(r), viewer.palette);
    buildingPoints = house.buildingPoints;
    const inBuilding = new Set(buildingPoints);
    const low = entouragePoints(house.root).filter((q, i, all) => {
      // Corners of low entourage (cars, people), not of trees.
      const k = Math.floor(i / 8) * 8;
      const top = Math.max(...all.slice(k, k + 8).map((v) => v.y));
      return top < 2.5;
    });
    eyeObstacles = [...house.framePoints.filter((q) => !inBuilding.has(q)), ...low];
    // The studio frames the whole picture: the house, its trees and people,
    // and the shadow it casts on the ground (`?frame=full`: the renderer's
    // framing on the architecture alone).
    viewer.setFrameShadows(wideFrame);
    viewer.setContent(house.root, wideFrame ? [...house.framePoints, ...entourageSamples(house.root)] : house.framePoints);
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
    houseBox.set(min, max);
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
      controls.maxZoom = cam.zoom * 3.5;
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
    let good = { pos: c.object.position.clone(), target: c.target.clone(), zoom: (c.object as OrthographicCamera).zoom ?? 1, quat: c.object.quaternion.clone() };
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
      // Zooming and panning never lose the house: a step that would leave
      // too little of it on screen is taken back.
      const cam = c.object as OrthographicCamera | PerspectiveCamera;
      cam.updateMatrixWorld();
      if (onScreen(cam)) good = { pos: cam.position.clone(), target: t.clone(), zoom: cam.zoom, quat: cam.quaternion.clone() };
      else {
        cam.position.copy(good.pos);
        cam.quaternion.copy(good.quat);
        t.copy(good.target);
        if (cam.zoom !== good.zoom) {
          cam.zoom = good.zoom;
          cam.updateProjectionMatrix();
        }
        cam.updateMatrixWorld();
      }
      viewer.requestRender();
    });
  }

  /**
   * Enough of the house on screen: the projected box of the architecture
   * covers at least 40 % of the screen (or of itself, when smaller) in each
   * direction.
   */
  function onScreen(cam: OrthographicCamera | PerspectiveCamera): boolean {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    const v = new Vector3();
    for (let i = 0; i < 8; i++) {
      v.set(i & 1 ? houseBox.max.x : houseBox.min.x, i & 2 ? houseBox.max.y : houseBox.min.y, i & 4 ? houseBox.max.z : houseBox.min.z);
      const view = v.clone().applyMatrix4(cam.matrixWorldInverse);
      if (view.z > -0.05) continue;
      v.project(cam);
      x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x);
      y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y);
    }
    if (x0 === Infinity) return false;
    const ok = (a: number, b: number) => Math.min(b, 1) - Math.max(a, -1) >= 0.4 * Math.min(2, b - a);
    return ok(x0, x1) && ok(y0, y1);
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
    if (movedFlag || fadeTimer || !view || viewer.walking) return;
    // A morph under way (e.g. the re-frame of a pinned column that also
    // resizes the canvas) is re-aimed at the framing for the new size.
    if (anim && goal) setView(goal, viewer.cutaway);
    else {
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

  /** Sun study date and time the framing was made for ('off' = presentation light). */
  let sunKey = 'off';
  let sunTimer = 0;

  /** Frames the current preset again (animated) unless the user has taken the camera. */
  function reframe(): void {
    if (movedFlag || viewer.walking || fadeTimer) return;
    const view = anim && goal ? goal : viewer.currentView;
    if (view) setView(view, viewer.cutaway, !(viewer.camera instanceof OrthographicCamera));
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
      // The framed shadow follows the sun: switching it on or off re-frames
      // the house at once; a new date or time once it has settled (not
      // while the slider is dragged or the day plays).
      const key = sun ? `${sun.date}|${Math.round(sun.minutes)}` : 'off';
      if (key === sunKey || !wideFrame) return;
      const toggled = (key === 'off') !== (sunKey === 'off');
      sunKey = key;
      clearTimeout(sunTimer);
      if (toggled) reframe();
      else sunTimer = window.setTimeout(reframe, SUN_REFRAME_MS);
    },
    sunAt: (date, minutes) => studySun(site, date, minutes),
    resize,
    setHouse(r) {
      const moving = !!(anim || fadeTimer);
      stop();
      const cam = viewer.camera;
      const before = current.site;
      load(r);
      const s = r.site;
      // A new place or orientation moves the sun and its shadows: the house
      // is framed afresh (from where the camera was), even after an orbit.
      if (!viewer.walking && (s.latitude !== before.latitude || s.longitude !== before.longitude || s.northDeg !== before.northDeg || s.timeZone !== before.timeZone || s.utcOffsetHours !== before.utcOffsetHours)) {
        const view = (moving && goal) || viewer.currentView;
        if (view) {
          setMoved(false);
          viewer.camera = cam;
          setView(view, viewer.cutaway);
          return;
        }
      }
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
      clearTimeout(sunTimer);
      walkListeners.clear();
      stop();
      dropControls();
      viewer.dispose();
    },
  };
  return engine;
}

