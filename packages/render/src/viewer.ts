import {
  Box3,
  type Camera,
  Color,
  Mesh,
  NoToneMapping,
  type Object3D,
  OrthographicCamera,
  PCFShadowMap,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';
import type { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { bakeScene } from './style/batch.js';
import { applyLensShift, applyOrthoAspect, cameraForView, sunElevationFor, type ViewPreset } from './style/cameras.js';
import { createGround } from './style/ground.js';
import { createLineMaterial, createPalette, type Palette } from './style/materials.js';
import { Sun } from './style/sun.js';
import { lines, stage } from './style/tokens.js';

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
  private readonly fixedPixelRatio: number | undefined;
  /** Called after every frame (stats, UI). */
  onAfterRender: ((stats: SceneStats) => void) | null = null;
  lastStats: SceneStats = { triangles: 0, drawCalls: 0, drawCallsWithShadows: 0, trianglesWithShadows: 0 };

  constructor(readonly container: HTMLElement, opts: ViewerOptions = {}) {
    this.renderer = new WebGLRenderer({ antialias: true, preserveDrawingBuffer: opts.preserveDrawingBuffer ?? false, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = NoToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = true;
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

  /** Bakes `root` into a few draw calls and shows it. */
  setContent(root: Object3D): void {
    if (this.content) this.scene.remove(this.content);
    const baked = bakeScene(root, this.edgeMaterial, this.floorMaterial);
    this.content = baked.group;
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
    const seen = new Set<string>();
    const v = new Vector3();
    baked.group.traverse((o) => {
      if (!isSurface(o) || o.userData.noFrame) return;
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
    this.sun.fit(this.bounds);
    if (this.preset) this.setView(this.preset);
    this.requestRender();
  }

  setView(preset: ViewPreset): void {
    this.preset = preset;
    const { width, height } = this.size();
    this.camera = cameraForView(preset, this.framePoints.length ? this.framePoints : [new Vector3(-1, 0, -1), new Vector3(1, 1, 1)], width / height);
    this.sun.setDirection(preset.sun.azimuthDeg, sunElevationFor(preset));
    this.sun.fit(this.bounds);
    this.requestRender();
  }

  /** Point on the view axis nearest to the scene centre (orbit target). */
  focusPoint(): Vector3 {
    const center = this.bounds.getCenter(new Vector3());
    const dir = this.camera.getWorldDirection(new Vector3());
    const pos = this.camera.getWorldPosition(new Vector3());
    return pos.clone().addScaledVector(dir, dir.dot(center.sub(pos)));
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
    this.scene.traverse((o) => {
      if (o.userData.billboard) {
        o.rotation.set(0, angle + ((o.userData.billboardYaw as number | undefined) ?? 0), 0);
        o.updateMatrixWorld(true);
      }
    });
  }

  renderNow(): SceneStats {
    this.updateBillboards();
    this.renderer.shadowMap.needsUpdate = true;
    this.renderer.render(this.scene, this.camera);
    const info = this.renderer.info.render;
    let triangles = 0;
    let drawCalls = 0;
    this.scene.traverse((o) => {
      if (!o.visible) return;
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
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
