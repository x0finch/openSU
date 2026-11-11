import { Matrix4 } from 'three';
import type { HouseGeometry } from '@opensu/kernel';
import { createHouseObject } from './house.js';
import type { ViewPreset } from './style/cameras.js';
import { IllustrationViewer } from './viewer.js';

/** A sub-rectangle of a framed view, as fractions of the frame (y down). */
export interface FrameWindow {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface OffscreenRenderOptions {
  /** Output size in CSS pixels (the canvas is this times the pixel ratio). */
  width: number;
  height: number;
  /**
   * Aspect ratio (width / height) the view is framed at. Defaults to
   * width / height. Together with `window` this lets a caller frame a view
   * once (e.g. a small probe render) and then render any part of that same
   * frame at another size.
   */
  frameAspect?: number;
  /** Part of the frame to render (default the whole frame). Its aspect must match width / height. */
  window?: FrameWindow;
}

/**
 * Renders views of a house into detached canvases, without touching any
 * on-screen viewer: it owns its own (hidden) WebGL context, which
 * `dispose()` releases. Each `render` returns a fresh 2D canvas copy, so
 * one instance can render several views.
 */
export class OffscreenView {
  private readonly container: HTMLDivElement;
  private readonly viewer: IllustrationViewer;
  private disposed = false;

  constructor(geometry: HouseGeometry, opts: { pixelRatio?: number } = {}) {
    this.container = document.createElement('div');
    this.container.setAttribute('aria-hidden', 'true');
    Object.assign(this.container.style, { position: 'fixed', left: '-100000px', top: '0', width: '16px', height: '16px', overflow: 'hidden', pointerEvents: 'none' });
    document.body.appendChild(this.container);
    this.viewer = new IllustrationViewer(this.container, { pixelRatio: opts.pixelRatio ?? 1, preserveDrawingBuffer: true });
    const house = createHouseObject(geometry, this.viewer.palette);
    this.viewer.setContent(house.root, house.framePoints);
  }

  private setSize(w: number, h: number): void {
    this.container.style.width = `${Math.max(1, Math.round(w))}px`;
    this.container.style.height = `${Math.max(1, Math.round(h))}px`;
  }

  render(preset: ViewPreset, o: OffscreenRenderOptions): HTMLCanvasElement {
    if (this.disposed) throw new Error('OffscreenView: disposed');
    const aspect = o.frameAspect ?? o.width / o.height;
    // Frame the view at the requested aspect (only the container's aspect matters here).
    this.setSize(1000 * aspect, 1000);
    this.viewer.setView(preset);
    const framed = this.viewer.camera.projectionMatrix.clone();
    this.setSize(o.width, o.height);
    this.viewer.resize();
    const cam = this.viewer.camera as { projectionMatrix: Matrix4; projectionMatrixInverse: Matrix4 };
    const w = o.window ?? { x0: 0, y0: 0, x1: 1, y1: 1 };
    // Window in NDC (y up), then the affine map window -> [-1, 1]^2 applied
    // in clip space (works for parallel and perspective projections).
    const nx0 = 2 * w.x0 - 1, nx1 = 2 * w.x1 - 1;
    const ny0 = 1 - 2 * w.y1, ny1 = 1 - 2 * w.y0;
    const sx = 2 / (nx1 - nx0), sy = 2 / (ny1 - ny0);
    const crop = new Matrix4().set(
      sx, 0, 0, -(nx1 + nx0) / (nx1 - nx0),
      0, sy, 0, -(ny1 + ny0) / (ny1 - ny0),
      0, 0, 1, 0,
      0, 0, 0, 1,
    );
    cam.projectionMatrix.copy(crop.multiply(framed));
    cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
    this.viewer.renderNow();
    const src = this.viewer.renderer.domElement;
    const out = document.createElement('canvas');
    out.width = src.width;
    out.height = src.height;
    out.getContext('2d')!.drawImage(src, 0, 0);
    return out;
  }

  /** Releases the WebGL context and removes the hidden canvas. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    // A frame may still be scheduled by setView/resize; let it run on a live renderer first.
    const viewer = this.viewer;
    const container = this.container;
    // (Fallback timer for hidden pages, where animation frames are paused.)
    let done = false;
    const release = () => {
      if (done) return;
      done = true;
      viewer.renderer.forceContextLoss();
      viewer.dispose();
      container.remove();
    };
    requestAnimationFrame(release);
    setTimeout(release, 1000);
  }
}
