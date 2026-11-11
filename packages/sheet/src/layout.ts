// Pure layout helpers: where the ink of a drawing is, and how large and
// where to place it in a page region without touching the header text.

export interface Rect {
  x0: number;
  y0: number;
  /** Exclusive. */
  x1: number;
  /** Exclusive. */
  y1: number;
}

export interface InkMask {
  width: number;
  height: number;
  /** Bounding box of all ink, px (empty mask: zero-size box at 0,0). */
  bbox: Rect;
  /** For each column c: the smallest y of any ink in columns 0..c (Infinity if none). */
  topUpTo: Float64Array;
  /** True when ink touches the image border (the subject may be clipped). */
  touchesBorder: boolean;
}

/** Finds the ink (any channel below `threshold`) of an RGBA image. */
export function inkMask(data: ArrayLike<number>, width: number, height: number, threshold: number): InkMask {
  const colTop = new Float64Array(width).fill(Infinity);
  let x0 = width, y0 = height, x1 = 0, y1 = 0;
  for (let y = 0; y < height; y++) {
    let row = y * width * 4;
    for (let x = 0; x < width; x++, row += 4) {
      if (data[row]! < threshold || data[row + 1]! < threshold || data[row + 2]! < threshold) {
        if (y < colTop[x]!) colTop[x] = y;
        if (x < x0) x0 = x;
        if (x >= x1) x1 = x + 1;
        if (y < y0) y0 = y;
        if (y >= y1) y1 = y + 1;
      }
    }
  }
  const topUpTo = new Float64Array(width);
  let m = Infinity;
  for (let x = 0; x < width; x++) {
    m = Math.min(m, colTop[x]!);
    topUpTo[x] = m;
  }
  const empty = x1 <= x0;
  const bbox = empty ? { x0: 0, y0: 0, x1: 0, y1: 0 } : { x0, y0, x1, y1 };
  const touchesBorder = !empty && (x0 === 0 || y0 === 0 || x1 === width || y1 === height);
  return { width, height, bbox, topUpTo, touchesBorder };
}

export interface Placement {
  /** Page px per mask px. */
  scale: number;
  /** Page position of the ink bounding box's top-left corner. */
  x: number;
  y: number;
}

export interface PlaceOptions {
  /** Preferred horizontal centre of the drawing (page px). */
  centerX: number;
  /** Vertical alignment inside the region. */
  alignY: 'bottom' | 'center';
  /**
   * Rectangles anchored at the page's top-left corner (the header text
   * lines) that no ink may enter.
   */
  keepout?: readonly Rect[];
  /** Upper bound on the scale. */
  maxScale?: number;
}

/** True when some ink, placed at (scale, x, y), falls inside `keepout` (top-left anchored). */
export function hitsKeepout(mask: InkMask, p: Placement, keepout: Rect): boolean {
  const { bbox } = mask;
  // Ink columns whose page x is left of keepout.x1.
  const limit = bbox.x0 + (keepout.x1 - p.x) / p.scale;
  if (limit <= bbox.x0) return false;
  const col = Math.min(Math.ceil(limit) - 1, bbox.x1 - 1);
  const top = mask.topUpTo[col]!;
  if (!Number.isFinite(top)) return false;
  return p.y + p.scale * (top - bbox.y0) < keepout.y1;
}

/**
 * The largest placement of the mask's ink inside `region` that keeps clear
 * of the keepout block: aligned as asked, centred on `centerX` when
 * possible, otherwise pushed right just far enough; shrinks only when no
 * horizontal position works.
 */
export function placeDrawing(mask: InkMask, region: Rect, o: PlaceOptions): Placement {
  const bw = mask.bbox.x1 - mask.bbox.x0;
  const bh = mask.bbox.y1 - mask.bbox.y0;
  const rw = region.x1 - region.x0;
  const rh = region.y1 - region.y0;
  if (bw <= 0 || bh <= 0) return { scale: 1, x: region.x0, y: region.y0 };
  const kMax = Math.min(rw / bw, rh / bh, o.maxScale ?? Infinity);
  let fallback: Placement | null = null;
  for (let k = kMax; k > kMax * 0.3; k *= 0.99) {
    const dw = bw * k;
    const dh = bh * k;
    const y = o.alignY === 'bottom' ? region.y1 - dh : region.y0 + (rh - dh) / 2;
    const xLo = region.x0;
    const xHi = region.x1 - dw;
    const xc = Math.min(Math.max(o.centerX - dw / 2, xLo), xHi);
    fallback ??= { scale: k, x: xc, y };
    if (!o.keepout) return { scale: k, x: xc, y };
    for (let x = xc; x <= xHi + 1e-6; x += 2) {
      const p = { scale: k, x, y };
      if (!o.keepout.some((r) => hitsKeepout(mask, p, r))) return p;
    }
  }
  return fallback!;
}
