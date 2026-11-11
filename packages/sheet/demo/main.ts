import { golden, resolve } from '@opensu/model';
import { buildHouse } from '@opensu/kernel';
import { createHouseObject, IllustrationViewer } from '@opensu/render';
import { renderSheet, renderSheetSet, type SheetOptions } from '../src/index.js';

// The golden sample's name is an internal benchmark label; sheets show the
// title the reference sheets use.
const TITLE = '自建房';
const house = resolve(golden);

// An on-screen viewer, to show that offscreen sheet rendering leaves it alone.
const live = new IllustrationViewer(document.getElementById('live')!, { preserveDrawingBuffer: true });
const obj = createHouseObject(buildHouse(house), live.palette);
live.setContent(obj.root, obj.framePoints);
live.setView({ id: 'axo-se', label: 'Axo SE', kind: 'axo', azimuthDeg: 148 });

const status = document.getElementById('status')!;
const gallery = document.getElementById('sheets')!;

async function exportSet(scale: number): Promise<{ blobs: Blob[]; ms: number }> {
  status.textContent = 'Rendering...';
  const t0 = performance.now();
  const blobs = await renderSheetSet(house, { title: TITLE, scale });
  const ms = performance.now() - t0;
  gallery.replaceChildren(...blobs.map((b) => Object.assign(document.createElement('img'), { src: URL.createObjectURL(b) })));
  status.textContent = `${blobs.length} sheets in ${(ms / 1000).toFixed(1)} s`;
  return { blobs, ms };
}

document.getElementById('export')!.onclick = () => void exportSet(1);
document.getElementById('export2x')!.onclick = () => void exportSet(2);

async function toBase64(b: Blob): Promise<string> {
  const bytes = new Uint8Array(await b.arrayBuffer());
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Share of non-white pixels of the live viewer (it must still draw after an export). */
function liveInk(): number {
  live.renderNow();
  const c = document.createElement('canvas');
  c.width = 120;
  c.height = 80;
  const g = c.getContext('2d')!;
  g.drawImage(live.renderer.domElement, 0, 0, 120, 80);
  const d = g.getImageData(0, 0, 120, 80).data;
  let ink = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i]! < 250 || d[i + 1]! < 250 || d[i + 2]! < 250) ink++;
  return ink / (120 * 80);
}

// Hooks for scripts/shots.mjs.
Object.assign(window, {
  __sheetSet: async (scale: number) => {
    const { blobs, ms } = await exportSet(scale);
    const names = [...house.levels.map((l, i) => `${i + 1}-${l.id}`), `${house.levels.length + 1}-views`];
    return { pngs: await Promise.all(blobs.map(toBase64)), ms, names };
  },
  __singleSheet: async (scale: number) => {
    const t0 = performance.now();
    const blob = await renderSheet(house, { kind: 'level', levelId: house.levels[0]!.id, view: 'axo-se', title: TITLE, scale });
    return { ms: performance.now() - t0, bytes: blob.size };
  },
  /** Any single sheet, as base64 PNG (for ad-hoc checks). */
  __sheet: async (options: SheetOptions) => toBase64(await renderSheet(house, options)),
  __liveInk: liveInk,
  __liveContextLost: () => live.renderer.getContext().isContextLost(),
  __ready: true,
});
