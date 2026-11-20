// This browser's images (task 038): shrinking an attached image and the
// IndexedDB store, loaded with the first image (images.ts has the rest).
import { useEffect, useState } from 'react';
import type { PendingImage } from './images';

/** Images kept in memory for this visit (the store fills it). */
const cache = new Map<string, string>();

/**
 * The long side an image is scaled down to, px, and the JPEG quality: enough
 * to read a plan or a photo at about 80-150 KB. Four of them keep a request
 * under the relay's 1.5 MB and its JSON handling within the Worker's CPU
 * budget (scripts/relay-check.mjs).
 */
const LONG_SIDE = 1024;
const QUALITY = 0.78;
/** A JPEG data URL longer than this is encoded again at a lower quality, then smaller (four stay under 600 KB). */
const MAX_URL = 140 * 1024;

const newId = () => `img-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** Decodes an image file and re-encodes it as a JPEG no larger than LONG_SIDE on its long side. */
export async function prepareImage(file: Blob): Promise<PendingImage> {
  const bmp = await createImageBitmap(file);
  const encode = (long: number) => {
    const k = Math.min(1, long / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * k)), h = Math.max(1, Math.round(bmp.height * k));
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d')!;
    // A transparent PNG on white (JPEG has no alpha).
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, w, h);
    g.drawImage(bmp, 0, 0, w, h);
    let dataUrl = c.toDataURL('image/jpeg', QUALITY);
    for (const q of [0.62, 0.48]) if (dataUrl.length > MAX_URL) dataUrl = c.toDataURL('image/jpeg', q);
    return { dataUrl, w, h };
  };
  let out = encode(LONG_SIDE);
  if (out.dataUrl.length > MAX_URL) out = encode(768);
  bmp.close?.();
  return { id: newId(), ...out };
}

// --- This browser's store (IndexedDB), with a memory cache ---

const DB = 'opensu-images';
const STORE = 'images';
let dbp: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  dbp ??= new Promise((ok, fail) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => ok(r.result);
    r.onerror = () => fail(r.error);
  });
  return dbp;
}

/** Keeps an image (data URL) on this device. Failing storage (private mode) only loses it after a reload. */
export async function putImage(id: string, dataUrl: string): Promise<void> {
  cache.set(id, dataUrl);
  try {
    const d = await db();
    await new Promise<void>((ok, fail) => {
      const tx = d.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(dataUrl, id);
      tx.oncomplete = () => ok();
      tx.onerror = () => fail(tx.error);
    });
  } catch {
    /* kept in memory for this visit */
  }
}

/** An image kept on this device, or null (another device's, or cleared). */
export async function getImage(id: string): Promise<string | null> {
  const hit = cache.get(id);
  if (hit) return hit;
  try {
    const d = await db();
    const v = await new Promise<unknown>((ok, fail) => {
      const r = d.transaction(STORE).objectStore(STORE).get(id);
      r.onsuccess = () => ok(r.result);
      r.onerror = () => fail(r.error);
    });
    if (typeof v === 'string') {
      cache.set(id, v);
      return v;
    }
  } catch {
    /* none */
  }
  return null;
}


/** An image's data URL for display: undefined while loading, null when it is not on this device. */
export function useImage(id: string): string | null | undefined {
  const [url, setUrl] = useState<string | null | undefined>(() => cache.get(id));
  useEffect(() => {
    let live = true;
    if (!id) setUrl(null);
    else if (cache.has(id)) setUrl(cache.get(id));
    else void getImage(id).then((v) => live && setUrl(v));
    return () => {
      live = false;
    };
  }, [id]);
  return url;
}
