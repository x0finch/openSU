import {
  Box3,
  type Camera,
  Color,
  Mesh,
  NoToneMapping,
  type Object3D,
  OrthographicCamera,
  PCFShadowMap,
  type Material,
  PerspectiveCamera,
  Plane,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';
import type { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { bakeScene } from './style/batch.js';
import { applyLensShift, applyOrthoAspect, cameraForView, type ViewPreset } from './style/cameras.js';
import { defaultLighting, type LightingMode, sunForView } from './style/lighting.js';
import { createGround } from './style/ground.js';
import { createLineMaterial, createPalette, type Palette, setToneFactors, toneFactor, toneToward } from './style/materials.js';
import { Sun } from './style/sun.js';
import { cutaway as cutTokens, cutawayLight, lines, materials as matTokens, physical as physTokens, shading, stage } from './style/tokens.js';
import { type StudySite, studySun, type StudySun } from './sun/study.js';
import { GROW_DURATION, growHeight, type GrowOptions } from './grow.js';

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
  private bounds = new Box3();
  private pending = false;
  private preset: ViewPreset | null = null;
  private lighting: LightingMode = defaultLighting;
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
  /** Height of the grow clip plane while `playGrow` runs (scene metres). */
  private growZ: number | null = null;
  private growFrame = 0;
  private growDone: (() => void) | null = null;
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
    this.scene.add(this.sun.light, this.sun.target);
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
    for (const m of this.clipLineMaterials) m.resolution.copy(this.edgeMaterial.resolution);
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
    this.applyCutaway();
    this.applySun();
    if (this.preset) this.setView(this.preset);
    this.requestRender();
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
      for (const o of objs) o.visible = visible;
    }
    this.applyInteriorTones(!!level && physical);
    this.shadowsDirty = true;
  }

  /**
   * Light, calm interior for the sun study in a cutaway (`cutawayLight`
   * tokens): lifted floor shade with warm sun patches, walls in cast shadow
   * at the turned-away tone, outdoor surfaces at the ground-shadow tone.
   */
  private applyInteriorTones(on: boolean): void {
    const p = this.palette;
    if (!on) {
      for (const m of [p.floor, p.wall, p.paving, p.gravel, p.deck]) setToneFactors(m, null);
      return;
    }
    const shade = toneToward(matTokens.floor, cutawayLight.floorShade);
    const sun = toneToward(matTokens.floor, cutawayLight.floorSunBase).multiply(toneFactor(cutawayLight.floorSunTint));
    setToneFactors(p.floor, { sun, away: shade, shadow: shade });
    setToneFactors(p.wall, { shadow: toneFactor(shading.awayTone) });
    const ground = { shadow: toneFactor(shading.groundShadowTone) };
    for (const m of [p.paving, p.gravel, p.deck]) setToneFactors(m, ground);
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
    this.preset = preset;
    const { width, height } = this.size();
    this.camera = cameraForView(preset, this.viewPoints(), width / height);
    this.applySun();
    this.requestRender();
  }

  /** Framing points: in a cutaway, only what stays below the cut plane. */
  viewPoints(): Vector3[] {
    let pts = this.framePoints;
    const level = this.levels.find((l) => l.id === this.cutLevel);
    if (level) {
      const below = pts.filter((p) => p.y <= level.cutZ + 0.01);
      if (below.length > 3) pts = below;
    }
    return pts.length ? pts : [new Vector3(-1, 0, -1), new Vector3(1, 1, 1)];
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
    const kind = this.preset?.kind ?? 'axo';
    const az = this.preset?.azimuthDeg ?? 135;
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
    this.edgeMaterial.resolution.set(width, height);
    this.floorMaterial.resolution.set(width, height);
    for (const m of this.clipLineMaterials) m.resolution.set(width, height);
    // Adapt the current camera in place (controls keep their reference).
    const cam = this.camera;
    const aspect = width / height;
    if (cam instanceof PerspectiveCamera) {
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
    // Billboards cast shadows: turning them changes the shadow map.
    if (angle !== this.billboardAngle) this.shadowsDirty = true;
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
    if (this.shadowsDirty) {
      this.renderer.shadowMap.needsUpdate = true;
      this.shadowsDirty = false;
    }
    this.renderer.render(this.scene, this.camera);
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
    this.onAfterRender?.(this.lastStats);
    return this.lastStats;
  }

  dispose(): void {
    this.stopGrow();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
