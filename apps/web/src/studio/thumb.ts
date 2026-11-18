// Lazy chunk (task 027): a project's thumbnail, rendered in the browser
// with its own offscreen WebGL context: the house's default view, 480 x 360,
// WebP (JPEG where the browser cannot encode WebP), usually 10-30 KB.
import { buildHouse } from '@opensu/kernel';
import { type House, resolve } from '@opensu/model';
import { OffscreenView } from '@opensu/render';
import { DEFAULT_VIEW, presetById } from '../lib/views';

export const THUMB_W = 480;
export const THUMB_H = 360;

const encode = (c: HTMLCanvasElement, type: string, q: number) => new Promise<Blob | null>((ok) => c.toBlob(ok, type, q));

export async function renderThumb(house: House): Promise<Blob | null> {
  const view = new OffscreenView(buildHouse(resolve(house)), { pixelRatio: 1 });
  try {
    const canvas = view.render(presetById(DEFAULT_VIEW), { width: THUMB_W, height: THUMB_H });
    const webp = await encode(canvas, 'image/webp', 0.82);
    if (webp?.type === 'image/webp') return webp;
    const jpeg = await encode(canvas, 'image/jpeg', 0.82);
    return jpeg?.type === 'image/jpeg' ? jpeg : null;
  } finally {
    view.dispose();
  }
}
