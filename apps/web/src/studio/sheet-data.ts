// Lazy chunk: the shareable sheet set (@opensu/sheet), composed in the
// browser with its own offscreen WebGL context.
import type { ResolvedHouse } from '@opensu/model';
import { renderSheetSet } from '@opensu/sheet';

export interface SheetFile {
  blob: Blob;
  url: string;
  width: number;
  height: number;
}

export interface SheetSnapshot {
  /** Sheets ready so far (index = position in the set). */
  files: (SheetFile | undefined)[];
  count: number;
  done: boolean;
  error: string | null;
  ms: number;
}

export interface SheetJob {
  snapshot(): SheetSnapshot;
  /** Calls `f` on every change; returns an unsubscribe. */
  subscribe(f: () => void): () => void;
}

const jobs = new WeakMap<ResolvedHouse, SheetJob>();

/** The sheet set of a house: rendered once per session and cached. */
export function sheetJob(house: ResolvedHouse, title?: string): SheetJob {
  const cached = jobs.get(house);
  if (cached) return cached;
  let snap: SheetSnapshot = { files: [], count: house.levels.length + 1, done: false, error: null, ms: 0 };
  const listeners = new Set<() => void>();
  const emit = (next: Partial<SheetSnapshot>) => {
    snap = { ...snap, ...next };
    for (const l of listeners) l();
  };
  const t0 = performance.now();
  const pending: Promise<void>[] = [];
  renderSheetSet(house, {
    title,
    onSheet: (i, count, blob) => {
      pending.push(
        createImageBitmap(blob).then((bmp) => {
          const file = { blob, url: URL.createObjectURL(blob), width: bmp.width, height: bmp.height };
          bmp.close();
          const files = snap.files.slice();
          files[i] = file;
          emit({ files, count });
        }),
      );
    },
  })
    .then(() => Promise.all(pending))
    .then(() => emit({ done: true, ms: performance.now() - t0 }))
    .catch((e: unknown) => {
      console.error(e);
      emit({ done: true, error: e instanceof Error ? e.message : String(e) });
    });
  const job: SheetJob = {
    snapshot: () => snap,
    subscribe(f) {
      listeners.add(f);
      return () => listeners.delete(f);
    },
  };
  jobs.set(house, job);
  return job;
}
