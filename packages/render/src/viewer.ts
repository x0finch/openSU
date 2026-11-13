import {
  Box3,
  type Camera,
  Color,
  Mesh,
  MeshDepthMaterial,
  NoToneMapping,
  type Object3D,
  OrthographicCamera,
  PCFShadowMap,
  type Material,
  PerspectiveCamera,
  Plane,
  Scene,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import type { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { bakeScene, CLIP_GROUP } from './style/batch.js';
import { applyFrameInsets, applyLensShift, applyOrthoAspect, cameraForView, type FrameInsets, freeAspect, NO_INSETS, type ViewPreset } from './style/cameras.js';
import { defaultLighting, type LightingMode, presentationSun, sunForView } from './style/lighting.js';
import { createGround } from './style/ground.js';
import { createLineMaterial, createPalette, type Palette, setShadowFade, setToneFactors, toneFactor, toneToward } from './style/materials.js';
import { Sun, sunDirection } from './style/sun.js';
import { cutaway as cutTokens, cutawayLight, lines, materials as matTokens, physical as physTokens, shading, stage, walk as walkTokens, walkLight } from './style/tokens.js';
import { type StudySite, studySun, type StudySun } from './sun/study.js';
import type { WalkData } from '@opensu/kernel';
import { WalkController, type WalkState } from './walk/controller.js';
import { WalkWorld } from './walk/world.js';

/** Where to start walking (defaults: the main entrance, or a level's arrival point). */
const WALK_BEST_START_ENABLED: boolean = false;

export interface WalkOptions {
  /** Storey to start on (its stair arrival point unless `position` is given). */
  level?: string;
  /** Plan position, metres (model axes). */
  position?: [number, number];
  /** Bearing to look towards (0 = model north). */
  headingDeg?: number;
  pitchDeg?: number;
}
import { GROW_DURATION, growHeight, type GrowOptions } from './grow.js';
import { GlassCompositor, type GlassMaterial, type GlassShape } from './glass.js';

/**
 * Shadow framing (`setFrameShadows`): a sun lower than `minElevationDeg`
 * is framed as if it stood that high (its long shadows fade out), and no
 * shadow is framed longer than `maxLength` times the subject's height.
 */
const SHADOW_FRAME = { minElevationDeg: 15, maxLength: 3.8 } as const;

/** Convex hull of plan points (monotone chain). */
function convexHull(pts: [number, number][]): [number, number][] {
  if (pts.length < 3) return pts;
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: [number, number], a: [number, number], b: [number, number]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: [number, number][] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: [number, number][] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i]!;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, q) <= 0) upper.pop();
    upper.push(q);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

/** A storey as the kernel reports it (metres). */
export interface ViewerLevel {
  id: string;
  elevation: number;
  top: number;
  cutZ: number;
}

/** Meshes that are surfaces (not fat-line helpers). */
function isSurface(o: Object3D): o is Mesh {
  return o instanceof Mesh && !(o as { isLineSegments2?: boolean }).isLineSegments2;
}

export interface ViewerOptions {
  /** Fixed pixel ratio; defaults to min(devicePixelRatio, maxPixelRatio). */
  pixelRatio?: number;
  /** Keep the drawing buffer for screenshots. */
  preserveDrawingBuffer?: boolean;
}

export interface SceneStats {
  /** Triangles in the scene (geometry, one pass). */
  triangles: number;
  /** Draw calls of the main pass. */
  drawCalls: number;
  /** Draw calls including the shadow pass, as reported by three.js. */
  drawCallsWithShadows: number;
  /** Triangles including the shadow pass, as reported by three.js. */
  trianglesWithShadows: number;
}

/**
 * The illustration viewer: owns the renderer, the sun, the shadow catcher
 * and the style materials. Renders on demand only.
 */
export class IllustrationViewer {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly palette: Palette;
  readonly sun = new Sun();
  readonly edgeMaterial: LineMaterial;
  readonly floorMaterial: LineMaterial;
  camera: Camera = new PerspectiveCamera();
  private content: Object3D | null = null;
  private framePoints: Vector3[] = [];
  private frameShadows = false;
  private chosenInsets: FrameInsets = { ...NO_INSETS };
  private shadowCache: { key: string; points: Vector3[] } | null = null;
  private bounds = new Box3();
  private pending = false;
  private preset: ViewPreset | null = null;
  private lighting: LightingMode = defaultLighting;
  private insets: FrameInsets[] = [{ ...NO_INSETS }];
  private readonly fixedPixelRatio: number | undefined;
  private groups = new Map<string, Object3D[]>();
  private clipMaterials: Material[] = [];
  private clipLineMaterials: LineMaterial[] = [];
  private levels: ViewerLevel[] = [];
  private site: StudySite | null = null;
  private cutLevel: string | null = null;
  private readonly clipPlane = new Plane(new Vector3(0, -1, 0), 0);
  private shadowsDirty = true;
  private billboardAngle = NaN;
  private study: StudySun | null = null;
  private walkData: WalkData | null = null;
  private walker: WalkController | null = null;
  /** Cutaway and view to return to after walking. */
  private beforeWalk: { cut: string | null; preset: ViewPreset | null } | null = null;
  /** Presentation sun bearing while walking (fixed at entry, so turning never moves shadows). */
  private walkSunAzimuth = 0;
  /** Height of the grow clip plane while `playGrow` runs (scene metres). */
  private growZ: number | null = null;
  private growFrame = 0;
  private growDone: (() => void) | null = null;
  /** The glass composite pass (null: the scene renders straight to the canvas). */
  private glass: GlassCompositor | null = null;
  private glassPending = false;
  /** Frames drawn: scene renders and composite-only (glass) frames. Tests and the debug overlay read them. */
  readonly frameCounts = { scene: 0, glass: 0 };
  /** Called after every frame (stats, UI). */
  onAfterRender: ((stats: SceneStats) => void) | null = null;
  lastStats: SceneStats = { triangles: 0, drawCalls: 0, drawCallsWithShadows: 0, trianglesWithShadows: 0 };

  constructor(readonly container: HTMLElement, opts: ViewerOptions = {}) {
    this.renderer = new WebGLRenderer({ antialias: true, preserveDrawingBuffer: opts.preserveDrawingBuffer ?? false, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = NoToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFShadowMap;
    // Shadows are re-rendered only when the sun, the content or the cutaway change.
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.localClippingEnabled = true;
    this.renderer.setClearColor(new Color(stage.background), 1);
    this.fixedPixelRatio = opts.pixelRatio;
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.display = 'block';
    this.palette = createPalette();
    this.edgeMaterial = createLineMaterial(lines.color, lines.width, lines.profileWidth);
    this.floorMaterial = createLineMaterial(lines.floorLineColor, lines.floorLineWidth);
    this.scene.background = new Color(stage.background);
    this.scene.add(this.sun.light, this.sun.outdoor, this.sun.target);
    this.resize();
  }

  /**
   * Bakes `root` into a few draw calls and shows it. Views are framed on
   * `framePoints` when given (e.g. the architecture only), otherwise on
   * every baked vertex.
   */
  setContent(root: Object3D, framePoints?: readonly Vector3[]): void {
    if (this.content) this.scene.remove(this.content);
    const baked = bakeScene(root, this.edgeMaterial, this.floorMaterial);
    this.content = baked.group;
    this.groups = baked.groups;
    this.clipMaterials = baked.clipMaterials;
    this.clipLineMaterials = baked.clipLineMaterials;
    this.levels = (root.userData.levels as ViewerLevel[] | undefined) ?? [];
    const site = root.userData.site as StudySite | undefined;
    if (site) this.site = site;
    this.walkData = (root.userData.walk as WalkData | undefined) ?? null;
    // Walking through a house that changes (an edit, a new house): keep
    // walking in the new one from the same spot when it is still free,
    // else from its entrance. The walker is replaced (`walk` changes).
    const resume = this.walker ? this.walker.state : null;
    if (this.walker) {
      this.walker.dispose();
      this.walker = null;
    }
    for (const m of this.clipLineMaterials) m.resolution.copy(this.edgeMaterial.resolution);
    // The outdoor sun never sees what a cutaway hides: clippable meshes clip
    // their shadow-depth pass for that light only.
    const outdoorCam = this.sun.outdoor.shadow.camera;
    const plane = this.clipPlane;
    for (const o of this.groups.get(CLIP_GROUP) ?? []) {
      if (!isSurface(o) || !o.castShadow) continue;
      o.customDepthMaterial = new MeshDepthMaterial();
      o.onBeforeShadow = (_r, _o, _c, shadowCamera, _g, depth) => {
        if (shadowCamera !== outdoorCam || !this.sun.outdoor.visible) return;
        depth.clippingPlanes = [plane];
        depth.clipShadows = true;
      };
    }
    if (this.cutLevel && !this.levels.some((l) => l.id === this.cutLevel)) this.cutLevel = null;
    this.scene.add(baked.group);
    this.bounds.makeEmpty();
    this.framePoints = [];
    baked.group.updateMatrixWorld(true);
    baked.group.traverse((o) => {
      if (!isSurface(o)) return;
      if (o.geometry.boundingBox === null) o.geometry.computeBoundingBox();
      if (!o.userData.noFrame) {
        const bb = o.geometry.boundingBox!.clone().applyMatrix4(o.matrixWorld);
        this.bounds.union(bb);
      }
    });
    // Framing points: every vertex, welded on a 5 cm grid to keep it small.
    if (framePoints?.length) this.framePoints = framePoints.map((p) => p.clone());
    const seen = new Set<string>();
    const v = new Vector3();
    baked.group.traverse((o) => {
      if (framePoints?.length || !isSurface(o) || o.userData.noFrame) return;
      const pos = o.geometry.getAttribute('position');
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
        const key = `${Math.round(v.x * 20)},${Math.round(v.y * 20)},${Math.round(v.z * 20)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        this.framePoints.push(v.clone());
      }
    });
    const ground = createGround(this.bounds, this.palette.ground);
    baked.group.add(ground);
    if (resume && this.walkData) {
      const lv = this.levels.find((l) => l.id === resume.level);
      this.enterWalk({ ...(lv ? { level: lv.id, position: [resume.x, resume.y] as [number, number] } : {}), headingDeg: resume.headingDeg, pitchDeg: resume.pitchDeg });
      return;
    }
    if (resume && this.beforeWalk) {
      // The new content cannot be walked: back to the view shown before.
      this.cutLevel = this.beforeWalk.cut;
      this.preset = this.beforeWalk.preset;
      this.beforeWalk = null;
    }
    this.applyCutaway();
    this.applySun();
    if (this.preset) this.setView(this.preset);
    this.requestRender();
  }

  /** Per level, the walk's arrival point (stair top; the entrance on the ground floor). */
  get walkArrivals(): WalkData['arrivals'] {
    return this.walkData?.arrivals ?? [];
  }

  /** Site of the sun study (taken from the content when it carries one). */
  setSite(site: StudySite): void {
    this.site = { ...site };
    this.applySun();
  }

  /** Storeys of the current content, bottom to top. */
  get levelList(): readonly ViewerLevel[] {
    return this.levels;
  }

  /** The physical sun last applied (null unless lighting by date and time). */
  get sunStudy(): StudySun | null {
    return this.study;
  }

  /**
   * Dollhouse cutaway: everything of the house above the chosen level's cut
   * plane is clipped away (upper levels, the slab above, roofs), the cut
   * wall tops show as section caps; stairs and entourage of the level stay
   * whole, those of higher levels are hidden.
   * Site and garden stay. `null` shows the whole house. In physical
   * lighting the clipped parts still cast shadows (the light inside stays
   * true); in presentation lighting they do not.
   */
  setCutaway(levelId: string | null): void {
    this.cutLevel = levelId && this.levels.some((l) => l.id === levelId) ? levelId : null;
    this.applyCutaway();
    if (this.preset) this.setView(this.preset);
    this.requestRender();
  }

  get cutaway(): string | null {
    return this.cutLevel;
  }

  private applyCutaway(): void {
    const li = this.cutLevel ? this.levels.findIndex((l) => l.id === this.cutLevel) : -1;
    const level = li >= 0 ? this.levels[li]! : null;
    // The grow transition clips with the same plane, at the lower of the two heights.
    const growZ = this.growZ;
    const cutZ = level ? level.cutZ + cutTokens.clipAbove : Infinity;
    const clipZ = Math.min(cutZ, growZ ?? Infinity);
    const clipped = Number.isFinite(clipZ);
    if (clipped) this.clipPlane.constant = clipZ;
    const physical = this.lighting.mode === 'physical';
    for (const m of this.clipMaterials) {
      const planes = clipped ? [this.clipPlane] : null;
      if ((m.clippingPlanes?.length ?? 0) !== (planes?.length ?? 0) || m.clipShadows !== !physical) m.needsUpdate = true;
      m.clippingPlanes = planes;
      m.clipShadows = !physical;
    }
    for (const [name, objs] of this.groups) {
      let visible = true;
      if (name.startsWith('cut:')) visible = !!level && name === `cut:${level.id}` && (growZ === null || growZ >= cutZ);
      else if (name.startsWith('level:')) {
        const idx = this.levels.findIndex((l) => l.id === name.slice(6));
        visible = (!level || idx <= li) && (growZ === null || (this.levels[idx]?.elevation ?? 0) < growZ);
      }
      // People are flat silhouettes for the views from outside; at eye
      // level, close up, they would read as cardboard: hidden while walking.
      for (const o of objs) o.visible = visible && !(this.walker && o.userData.billboard);
    }
    this.applyInteriorTones(this.walker ? 'walk' : !!level && physical ? 'cutaway' : null);
    // Cutaway shadow rule: with the physical sun the hidden parts shade the
    // inside of the house but never the garden (a second, outdoor sun).
    this.sun.outdoor.visible = !!level && physical;
    this.shadowsDirty = true;
  }

  /**
   * Light, calm interior for the sun study in a cutaway (`cutawayLight`
   * tokens): lifted floor shade with warm sun patches, walls in cast shadow
   * at the turned-away tone, outdoor surfaces at the ground-shadow tone.
   */
  private applyInteriorTones(mode: 'cutaway' | 'walk' | null): void {
    const p = this.palette;
    const furniture = [p.furniture, p.furnitureWood, p.textile, p.fixture, p.furnitureDark];
    for (const m of [p.floor, p.wall, p.fascia, p.paving, p.gravel, p.deck, ...furniture]) setToneFactors(m, null);
    for (const [m, o] of [[p.glass, matTokens.glassOpacity], [p.balustrade, matTokens.balustradeOpacity]] as const) m.opacity = mode === 'walk' ? (m === p.glass ? walkTokens.glassOpacity : walkTokens.balustradeOpacity) : o;
    if (!mode) return;
    const sun = toneToward(matTokens.floor, cutawayLight.floorSunBase).multiply(toneFactor(cutawayLight.floorSunTint));
    const ground = { shadow: toneFactor(shading.groundShadowTone) };
    for (const m of [p.paving, p.gravel, p.deck]) setToneFactors(m, ground);
    if (mode === 'cutaway') {
      const shade = toneToward(matTokens.floor, cutawayLight.floorShade);
      setToneFactors(p.floor, { sun, away: shade, shadow: shade });
      setToneFactors(p.wall, { shadow: toneFactor(shading.awayTone) });
      for (const m of furniture) setToneFactors(m, { shadow: toneFactor(shading.awayTone) });
      return;
    }
    // Walk: a light interior; sun patches are the accent.
    const shade = toneToward(matTokens.floor, walkLight.floorShade);
    setToneFactors(p.floor, { sun, away: shade, shadow: shade });
    const white = { away: toneFactor(walkLight.wallShade), shadow: toneFactor(walkLight.wallShadow) };
    setToneFactors(p.wall, { ...white, ceiling: toneFactor(walkLight.ceiling) });
    // Under a pitched roof the ceiling is the underside of the roof boards
    // (indoors only: from a terrace the eaves keep their timber soffit).
    this.walkIndoors = null;
    this.updateWalkCeiling();
    for (const m of furniture) setToneFactors(m, white);
  }

  /** Indoors (roof boards read as ceiling) at the walker's last checked spot. */
  private walkIndoors: boolean | null = null;
  private walkCheckedAt = { x: NaN, y: NaN, z: NaN };

  /** Roof-board undersides take the ceiling tone while the walker is inside a room. */
  private updateWalkCeiling(): void {
    const w = this.walker;
    if (!w) return;
    const st = w.state;
    const c = this.walkCheckedAt;
    if (this.walkIndoors !== null && Math.hypot(st.x - c.x, st.y - c.y) < 0.3 && Math.abs(st.z - c.z) < 0.2) return;
    this.walkCheckedAt = { x: st.x, y: st.y, z: st.z };
    const indoors = w.world.enclosed({ x: st.x, y: st.y, z: st.z });
    if (indoors === this.walkIndoors) return;
    this.walkIndoors = indoors;
    setToneFactors(this.palette.fascia, indoors ? { ceiling: toneToward(matTokens.fascia, walkLight.ceiling) } : null);
  }

  /** True while walking. */
  get walking(): boolean {
    return !!this.walker;
  }

  /** The walk controller while walking (input, position, events). */
  get walk(): WalkController | null {
    return this.walker;
  }

  /** Whether the content can be walked (it carries the kernel's walk data). */
  get canWalk(): boolean {
    return !!this.walkData;
  }

  /**
   * First-person walk: a perspective camera at eye height (1.6 m), wide
   * field of view, collisions with walls, windows, rails and furniture;
   * doors and stairs are passable. Clears the cutaway (restored by
   * `exitWalk`). Either lighting mode works.
   */
  enterWalk(opts: WalkOptions = {}): WalkController {
    if (!this.walkData) throw new Error('enterWalk: the content has no walk data (use createHouseObject on kernel output)');
    this.walker?.dispose();
    const data = this.walkData;
    const arrival = opts.level ? data.arrivals.find((a) => a.level === opts.level) : undefined;
    const base = arrival ?? data.start;
    const lv = this.levels.find((l) => l.id === (opts.level ?? base.level)) ?? this.levels[0];
    const pos = opts.position ?? base.position;
    const world = new WalkWorld(data, { radius: walkTokens.bodyRadius, stepUp: walkTokens.stepUp });
    if (!this.beforeWalk) this.beforeWalk = { cut: this.cutLevel, preset: this.preset };
    this.cutLevel = null;
    let at = { x: pos[0], y: pos[1], z: lv?.elevation ?? 0, headingDeg: opts.headingDeg ?? base.headingDeg };
    let settled = world.settle(at.x, at.y, at.z);
    let chosen = false;
    // Off for now: on T1 the chosen start faces blank walls. See
    // docs/BACKLOG.md, task 016 item 9.
    if (WALK_BEST_START_ENABLED && settled && !opts.position && !arrival && opts.headingDeg === undefined) {
      // The entrance: step to a spot with room ahead, looking down the
      // longest open sightline into the house (never wedged in the door).
      const start = world.bestStart(settled, at.headingDeg);
      if (start) {
        settled = start.pose;
        at = { ...at, x: start.pose.x, y: start.pose.y, headingDeg: start.headingDeg };
        chosen = true;
      }
    }
    // Start facing into the room, not at a wall (unless a heading was asked for).
    if (settled && opts.headingDeg === undefined && !chosen) at.headingDeg = world.openHeading(settled, at.headingDeg);
    if (!settled) {
      // Nowhere to stand there (a removed room, a bad position): the entrance.
      const s = data.start;
      at = { x: s.position[0], y: s.position[1], z: this.levels.find((l) => l.id === s.level)?.elevation ?? 0, headingDeg: s.headingDeg };
    }
    const walker = new WalkController({ renderNow: () => this.renderNow(), requestRender: () => this.requestRender(), levels: this.levels }, world, { ...at, pitchDeg: opts.pitchDeg ?? 0 });
    this.walker = walker;
    this.preset = null;
    this.walkSunAzimuth = ((walker.state.headingDeg + 180) % 360);
    const { width, height } = this.size();
    walker.setAspect(width / height);
    this.camera = walker.camera;
    this.applyCutaway();
    this.applySun();
    walker.attach(this.renderer.domElement);
    this.requestRender();
    return walker;
  }

  /** Back to the view (and cutaway) shown before walking. */
  exitWalk(): void {
    const w = this.walker;
    if (!w) return;
    w.dispose();
    this.walker = null;
    const prev = this.beforeWalk;
    this.beforeWalk = null;
    this.cutLevel = prev?.cut ?? null;
    this.applyCutaway();
    if (prev?.preset) this.setView(prev.preset);
    else this.applySun();
    this.requestRender();
  }

  /** The walker's state (null unless walking). */
  get walkState(): WalkState | null {
    return this.walker?.state ?? null;
  }

  /**
   * The "grow" transition after the content changed: levels rise in
   * sequence (a clip plane sweeps up from the floor of `fromLevel` past the
   * roof, ~1.5 s), then the viewer is back to render on demand. Respects
   * a level cutaway (the sweep stops at its cut) and reduced motion (no
   * animation). Resolves when done or cancelled by a newer call.
   */
  playGrow(opts: GrowOptions = {}): Promise<void> {
    this.stopGrow();
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || !this.levels.length) return Promise.resolve();
    const duration = opts.duration ?? GROW_DURATION;
    const ceiling = this.bounds.isEmpty() ? this.levels[this.levels.length - 1]!.top : this.bounds.max.y + 0.01;
    const t0 = performance.now();
    return new Promise<void>((done) => {
      this.growDone = done;
      const step = (now: number) => {
        const t = Math.min(1, (now - t0) / duration);
        this.growZ = t < 1 ? growHeight(this.levels, ceiling, t, opts.fromLevel) : null;
        this.applyCutaway();
        this.renderNow();
        if (t < 1) this.growFrame = requestAnimationFrame(step);
        else this.stopGrow();
      };
      this.growZ = growHeight(this.levels, ceiling, 0, opts.fromLevel);
      this.applyCutaway();
      this.growFrame = requestAnimationFrame(step);
    });
  }

  /** Ends a running grow at once (the house shows whole). */
  stopGrow(): void {
    cancelAnimationFrame(this.growFrame);
    this.growFrame = 0;
    const done = this.growDone;
    this.growDone = null;
    if (this.growZ !== null) {
      this.growZ = null;
      this.applyCutaway();
      this.requestRender();
    }
    done?.();
  }

  get growing(): boolean {
    return this.growDone !== null;
  }

  /** Re-render the shadow map with the next frame (after external scene edits). */
  invalidateShadows(): void {
    this.shadowsDirty = true;
    this.requestRender();
  }

  setView(preset: ViewPreset): void {
    if (this.walker) {
      this.walker.dispose();
      this.walker = null;
      this.cutLevel = this.beforeWalk?.cut ?? null;
      this.beforeWalk = null;
      this.applyCutaway();
    }
    this.preset = preset;
    this.camera = this.cameraFor(preset);
    this.applySun();
    this.requestRender();
  }

  /**
   * The camera of a preset for the current canvas, framed inside the free
   * area. With several alternative insets (floating UI that can be avoided
   * from above or from the side), the one that shows the subject largest.
   */
  cameraFor(preset: ViewPreset): Camera {
    const { width, height } = this.size();
    let best: Camera | null = null;
    let bestScale = -Infinity;
    for (const raw of this.insets) {
      const i = { ...raw };
      // Never leave less than a third of the canvas free.
      if (width - i.left - i.right < width / 3) i.left = i.right = 0;
      if (height - i.top - i.bottom < height / 3) i.top = i.bottom = 0;
      const cam = cameraForView(preset, this.viewPoints(preset), freeAspect(i, width, height));
      applyFrameInsets(cam, i, width, height);
      // Screen pixels per unit of the frustum's height: larger = a larger subject.
      let scale = 0;
      if (cam instanceof OrthographicCamera) scale = (height * cam.zoom) / (cam.top - cam.bottom);
      else if (cam instanceof PerspectiveCamera) scale = height / (2 * ((cam.userData.lensShift as { hh: number } | undefined)?.hh ?? Math.tan((cam.fov * Math.PI) / 360)));
      if (scale > bestScale + 1e-9) {
        bestScale = scale;
        best = cam;
        this.chosenInsets = i;
      }
    }
    return best!;
  }

  /**
   * Keeps presets framed inside the canvas minus these insets (CSS px), e.g.
   * the space under floating UI; alternatives are tried and the one that
   * shows the subject largest wins. Re-frames the current preset.
   */
  setFrameInsets(insets: FrameInsets | readonly FrameInsets[], reframe = true): void {
    const list = (Array.isArray(insets) ? insets : [insets]) as readonly FrameInsets[];
    this.insets = (list.length ? list : [NO_INSETS]).map((i) => ({ top: Math.max(0, i.top), right: Math.max(0, i.right), bottom: Math.max(0, i.bottom), left: Math.max(0, i.left) }));
    if (reframe && this.preset && !this.walker) this.setView(this.preset);
  }

  get frameInsets(): readonly FrameInsets[] {
    return this.insets;
  }

  /** The insets the last framed camera was fitted into (the alternative that won). */
  get framedInsets(): FrameInsets {
    return this.chosenInsets;
  }

  /**
   * Frame the ground shadow with the subject (axonometric views): the
   * presentation shadow of the preset, or in the sun study the shadows of
   * the date's day (see `shadowSuns`). Off by default (the renderer's shots
   * frame the architecture alone).
   */
  setFrameShadows(on: boolean): void {
    if (on === this.frameShadows) return;
    this.frameShadows = on;
    if (this.preset && !this.walker) this.setView(this.preset);
  }

  /** Framing points: in a cutaway, only what stays below the cut plane; with `setFrameShadows`, their ground shadow. */
  viewPoints(preset: ViewPreset | null = this.preset): Vector3[] {
    let pts = this.framePoints;
    const level = this.levels.find((l) => l.id === this.cutLevel);
    if (level) {
      const below = pts.filter((p) => p.y <= level.cutZ + 0.01);
      if (below.length > 3) pts = below;
    }
    if (!pts.length) return [new Vector3(-1, 0, -1), new Vector3(1, 1, 1)];
    if (!this.frameShadows || !preset || preset.kind !== 'axo') return pts;
    return pts.concat(this.shadowOutline(pts, this.shadowSuns(preset)));
  }

  /**
   * Suns whose ground shadow is framed: the presentation sun of the preset,
   * or the sun study's sun at its date and time (the studio re-frames when
   * the time has settled, not while it is dragged or played). Shadows of a
   * sun lower than SHADOW_FRAME.minElevationDeg are framed as if it stood
   * that high: they fade out beyond the plot anyway.
   */
  private shadowSuns(preset: ViewPreset): Vector3[] {
    const mode = this.lighting;
    if (mode.mode === 'presentation') {
      const s = presentationSun(preset.kind, preset.azimuthDeg, mode.facadeAxisDeg, mode.side);
      return [sunDirection(s.azimuthDeg, s.elevationDeg)];
    }
    if ('sun' in mode) return [sunDirection(mode.sun.azimuthDeg, Math.max(mode.sun.elevationDeg, SHADOW_FRAME.minElevationDeg))];
    if (!this.site) return [];
    const s = studySun(this.site, mode.date, mode.minutes);
    return s.trueElevationDeg > 0 ? [sunDirection(s.azimuthDeg, Math.max(s.trueElevationDeg, SHADOW_FRAME.minElevationDeg))] : [];
  }

  /**
   * The plan outline (convex hull on the ground) of the shadows the points
   * cast for these suns; each shadow at most SHADOW_FRAME.maxLength times
   * the subject's height long.
   */
  private shadowOutline(pts: readonly Vector3[], suns: readonly Vector3[]): Vector3[] {
    if (!suns.length) return [];
    const key = `${pts.length}:${pts[0]!.x},${pts[pts.length - 1]!.z}:${suns.map((d) => `${d.x.toFixed(4)},${d.y.toFixed(4)},${d.z.toFixed(4)}`).join(';')}`;
    if (this.shadowCache?.key === key) return this.shadowCache.points;
    let ground = Infinity, height = 0;
    for (const p of pts) {
      ground = Math.min(ground, p.y);
      height = Math.max(height, p.y);
    }
    ground = Math.max(0, ground);
    height -= ground;
    const flat: [number, number][] = [];
    for (const d of suns) {
      const horiz = Math.hypot(d.x, d.z);
      if (d.y <= 1e-3 || horiz < 1e-6) continue;
      for (const p of pts) {
        const h = p.y - ground;
        if (h < 0.05) continue;
        const len = Math.min((h * horiz) / d.y, SHADOW_FRAME.maxLength * height);
        flat.push([p.x - (d.x / horiz) * len, p.z - (d.z / horiz) * len]);
      }
    }
    const points = convexHull(flat).map(([x, z]) => new Vector3(x, ground, z));
    this.shadowCache = { key, points };
    return points;
  }

  /** Point on the view axis nearest to the scene centre (orbit target). */
  focusPoint(): Vector3 {
    const center = this.bounds.getCenter(new Vector3());
    const dir = this.camera.getWorldDirection(new Vector3());
    const pos = this.camera.getWorldPosition(new Vector3());
    return pos.clone().addScaledVector(dir, dir.dot(center.sub(pos)));
  }

  /**
   * Switch between presentation lighting (default) and the physical sun:
   * `{ mode: 'physical', date: 'YYYY-MM-DD', minutes }` places the real sun
   * of the site (clamped to sunrise..sunset), `{ mode: 'physical', sun }`
   * an explicit one.
   */
  setLighting(mode: LightingMode): void {
    const wasPhysical = this.lighting.mode === 'physical';
    this.lighting = mode;
    if (wasPhysical !== (mode.mode === 'physical')) this.applyCutaway();
    this.applySun();
  }

  get lightingMode(): LightingMode {
    return this.lighting;
  }

  private applySun(): void {
    const kind = this.walker ? 'eye' : this.preset?.kind ?? 'axo';
    const az = this.walker ? this.walkSunAzimuth : this.preset?.azimuthDeg ?? 135;
    const mode = this.lighting;
    this.study = null;
    if (mode.mode === 'physical' && !('sun' in mode)) {
      if (!this.site) throw new Error('setLighting: the physical sun needs a site (content from createHouseObject, or setSite)');
      this.study = studySun(this.site, mode.date, mode.minutes);
    }
    const s = sunForView(mode, kind, az, this.study ?? undefined);
    const physical = mode.mode === 'physical';
    this.sun.setDirection(s.azimuthDeg, s.elevationDeg);
    this.sun.fit(this.bounds, physical ? physTokens.shadowReach : 0);
    // Low sun (0 above lowSunFromDeg .. 1 at lowSunFullDeg): long ground
    // shadows fade out a few metres beyond the scene, and the shadows over
    // the plot's paving, gravel and decks lift towards the ground's shadow
    // tone, so the plot is not a dark slab next to the light ground outside
    // (whole house only; cutaway and walk set their own tones).
    const t0 = physical ? Math.min(1, Math.max(0, (physTokens.lowSunFromDeg - s.elevationDeg) / (physTokens.lowSunFromDeg - physTokens.lowSunFullDeg))) : 0;
    const low = t0 * t0 * (3 - 2 * t0);
    const b = this.bounds;
    const far = physTokens.shadowReach;
    setShadowFade(
      this.palette.ground,
      low > 0 && !b.isEmpty() ? [b.min.x, b.min.z, b.max.x, b.max.z] : null,
      far + (physTokens.shadowFadeStart - far) * low,
      far + 10 + (physTokens.shadowFadeEnd - far - 10) * low,
    );
    if (physical && !this.cutLevel && !this.walker) {
      const shadow = toneFactor(shading.shadowTone).lerp(toneFactor(shading.groundShadowTone), low);
      for (const m of [this.palette.paving, this.palette.gravel, this.palette.deck]) setToneFactors(m, low > 0 ? { shadow } : null);
    }
    // Glass passes sunlight in the sun study: its flat backing stops casting.
    for (const o of this.content?.children ?? []) {
      if (o.userData.paletteMaterial === this.palette.glassBacking) (o as Mesh).castShadow = !physical;
    }
    this.shadowsDirty = true;
    this.requestRender();
  }

  /**
   * Milliseconds per frame with a shadow-map update and without one
   * (averaged, GPU-synchronised by a pixel read). The difference is the cost
   * of one shadow update.
   */
  measureShadowUpdate(frames = 6): { withShadows: number; withoutShadows: number } {
    const gl = this.renderer.getContext();
    const px = new Uint8Array(4);
    const frame = (dirty: boolean) => {
      if (dirty) this.shadowsDirty = true;
      const t0 = performance.now();
      this.renderNow();
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      return performance.now() - t0;
    };
    frame(true);
    const a: number[] = [], b: number[] = [];
    for (let i = 0; i < frames; i++) {
      a.push(frame(true));
      b.push(frame(false));
    }
    const median = (v: number[]) => v.sort((x, y) => x - y)[Math.floor(v.length / 2)]!;
    return { withShadows: median(a), withoutShadows: median(b) };
  }

  get currentView(): ViewPreset | null {
    return this.preset;
  }

  private size(): { width: number; height: number } {
    return { width: Math.max(1, this.container.clientWidth), height: Math.max(1, this.container.clientHeight) };
  }

  resize(): void {
    const { width, height } = this.size();
    const pr = this.fixedPixelRatio ?? Math.min(window.devicePixelRatio || 1, stage.maxPixelRatio);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(width, height, true);
    if (this.glass) {
      const buf = this.renderer.getDrawingBufferSize(new Vector2());
      this.glass.setSize(buf.x, buf.y, pr);
    }
    this.edgeMaterial.resolution.set(width, height);
    this.floorMaterial.resolution.set(width, height);
    for (const m of this.clipLineMaterials) m.resolution.set(width, height);
    // Adapt the current camera in place (controls keep their reference).
    const cam = this.camera;
    const aspect = width / height;
    if (this.walker && cam === this.walker.camera) this.walker.setAspect(aspect);
    else if (cam instanceof PerspectiveCamera) {
      if (cam.userData.lensShift) applyLensShift(cam, aspect);
      else {
        cam.aspect = aspect;
        cam.updateProjectionMatrix();
      }
    } else if (cam instanceof OrthographicCamera) {
      applyOrthoAspect(cam, aspect);
    }
    this.requestRender();
  }

  /**
   * Liquid glass chrome (task 017): `shapes` are drawn over the scene by a
   * composite pass, in CSS px relative to the canvas. The scene itself then
   * renders into a multisampled target, only when it changes; a change of
   * the glass alone re-runs the composite pass. `null` switches the pass
   * off (the scene renders straight to the canvas again).
   */
  setGlass(shapes: readonly GlassShape[] | null, material?: GlassMaterial): void {
    if (!shapes || !material) {
      if (!this.glass) return;
      this.glass.dispose();
      this.glass = null;
      this.requestRender();
      return;
    }
    if (!this.glass) {
      const buf = this.renderer.getDrawingBufferSize(new Vector2());
      this.glass = new GlassCompositor(buf.x, buf.y);
      this.glass.setSize(buf.x, buf.y, this.renderer.getPixelRatio());
      this.glass.setGlass(shapes, material);
      // The target is empty: the scene must be drawn into it once.
      this.requestRender();
      return;
    }
    this.glass.setGlass(shapes, material);
    this.requestGlassRender();
  }

  /** Whether the glass composite pass is on. */
  get glassOn(): boolean {
    return !!this.glass;
  }

  /** Schedule a composite-only frame (the scene is unchanged). */
  requestGlassRender(): void {
    if (this.glassPending || this.pending) return;
    this.glassPending = true;
    requestAnimationFrame(() => {
      this.glassPending = false;
      if (this.pending || !this.glass) return;
      this.glass.composite(this.renderer);
      this.frameCounts.glass++;
    });
  }

  /** Schedule one frame. Nothing renders unless something asked for it. */
  requestRender(): void {
    if (this.pending) return;
    this.pending = true;
    requestAnimationFrame(() => {
      this.pending = false;
      this.renderNow();
    });
  }

  private updateBillboards(): void {
    const dir = new Vector3();
    this.camera.getWorldDirection(dir);
    const angle = Math.atan2(-dir.x, -dir.z);
    // Billboards cast shadows: turning them changes the shadow map (not
    // while walking: every turn of the head would redraw the shadows).
    if (angle !== this.billboardAngle && !this.walker) this.shadowsDirty = true;
    this.billboardAngle = angle;
    this.scene.traverse((o) => {
      if (o.userData.billboard) {
        o.rotation.set(0, angle + ((o.userData.billboardYaw as number | undefined) ?? 0), 0);
        o.updateMatrixWorld(true);
      }
    });
  }

  renderNow(): SceneStats {
    this.updateBillboards();
    this.updateWalkCeiling();
    if (this.shadowsDirty) {
      this.renderer.shadowMap.needsUpdate = true;
      this.shadowsDirty = false;
    }
    if (this.glass) {
      this.renderer.setRenderTarget(this.glass.target);
      this.renderer.render(this.scene, this.camera);
      this.renderer.setRenderTarget(null);
    } else this.renderer.render(this.scene, this.camera);
    this.frameCounts.scene++;
    const info = this.renderer.info.render;
    let triangles = 0;
    let drawCalls = 0;
    this.scene.traverseVisible((o) => {
      const m = o as Mesh;
      if (!(m as { isMesh?: boolean }).isMesh) return;
      drawCalls++;
      const g = m.geometry;
      const instanced = (g as { isInstancedBufferGeometry?: boolean }).isInstancedBufferGeometry;
      if (instanced) {
        // Fat lines: two triangles per segment.
        triangles += (g.getAttribute('instanceStart')?.count ?? 0) * 2;
      } else {
        triangles += g.index ? g.index.count / 3 : g.getAttribute('position').count / 3;
      }
    });
    this.lastStats = { triangles: Math.round(triangles), drawCalls, drawCallsWithShadows: info.calls, trianglesWithShadows: info.triangles };
    this.glass?.composite(this.renderer);
    this.onAfterRender?.(this.lastStats);
    return this.lastStats;
  }

  dispose(): void {
    this.walker?.dispose();
    this.walker = null;
    this.stopGrow();
    this.glass?.dispose();
    this.glass = null;
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
