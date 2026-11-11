// Renders the default house (template T1) for the landing page and the
// Open Graph image, in the presentation light of the viewer. Driven by
// ../hero.mjs; exposes `window.__render(spec)` which returns a PNG/WebP
// data URL.
import { DEFAULT_TEMPLATE, templateHouse } from '@opensu/agent/starter';
import { buildHouse } from '@opensu/kernel';
import { resolve } from '@opensu/model';
import { createHouseObject, IllustrationViewer, type ViewPreset } from '@opensu/render';

interface Spec {
  /** CSS px of the frame and device pixel ratio. */
  width: number;
  height: number;
  dpr: number;
  view: ViewPreset;
  /** Crop to the ink plus this padding (CSS px); 0 keeps the frame. */
  cropPad: number;
  type: 'image/png' | 'image/webp';
  quality?: number;
}

const house = templateHouse(DEFAULT_TEMPLATE);
const geometry = buildHouse(resolve(house));

async function render(spec: Spec): Promise<{ url: string; width: number; height: number; name: string }> {
  const el = document.getElementById('app')!;
  el.style.width = `${spec.width}px`;
  el.style.height = `${spec.height}px`;
  el.replaceChildren();
  const viewer = new IllustrationViewer(el, { pixelRatio: spec.dpr, preserveDrawingBuffer: true });
  const obj = createHouseObject(geometry, viewer.palette);
  viewer.setContent(obj.root, obj.framePoints);
  viewer.setView(spec.view);
  viewer.renderNow();
  const src = viewer.renderer.domElement;
  let x0 = 0, y0 = 0, x1 = src.width, y1 = src.height;
  if (spec.cropPad > 0) {
    const c = document.createElement('canvas');
    c.width = src.width;
    c.height = src.height;
    const g = c.getContext('2d')!;
    g.drawImage(src, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    x0 = c.width; y0 = c.height; x1 = 0; y1 = 0;
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
      const i = (y * c.width + x) * 4;
      if (d[i]! < 250 || d[i + 1]! < 250 || d[i + 2]! < 250) { x0 = Math.min(x0, x); x1 = Math.max(x1, x + 1); y0 = Math.min(y0, y); y1 = Math.max(y1, y + 1); }
    }
    const pad = Math.round(spec.cropPad * spec.dpr);
    x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(c.width, x1 + pad); y1 = Math.min(c.height, y1 + pad);
  }
  const out = document.createElement('canvas');
  out.width = x1 - x0;
  out.height = y1 - y0;
  const g = out.getContext('2d')!;
  g.fillStyle = '#fff';
  g.fillRect(0, 0, out.width, out.height);
  g.drawImage(src, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  viewer.dispose?.();
  return { url: out.toDataURL(spec.type, spec.quality), width: out.width, height: out.height, name: house.name };
}

Object.assign(window, { __render: render, __ready: true });
