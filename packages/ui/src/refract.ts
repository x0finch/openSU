// Rim refraction for the CSS glass, on Chromium only (task 035). Chromium
// (Chrome, Edge, Android's browsers) applies an SVG filter in
// `backdrop-filter`; WebKit and Gecko parse it and drop the whole filter
// list, so the check is on the engine (`@supports` would say yes in Safari).
// Elsewhere the glass is the same material without the bend.
//
// Each surface gets its own SVG filter: a displacement map (a PNG drawn
// once per size and corner radius, cached) that pulls the backdrop inwards
// in a band along the rim, as a thick pane of glass bends what lies under
// its edge. The surface's `backdrop-filter` puts it before the blur
// (glass.css, `[data-refract]`).
import { GLASS } from './material';

const NS = 'http://www.w3.org/2000/svg';

/** Whether this browser draws an SVG filter in `backdrop-filter` (Chromium's engine). */
function chromium(): boolean {
  if (typeof navigator === 'undefined') return false;
  const brands = (navigator as Navigator & { userAgentData?: { brands?: { brand: string }[] } }).userAgentData?.brands;
  if (brands?.length) return brands.some((b) => b.brand === 'Chromium');
  // iOS browsers are all WebKit (CriOS and EdgiOS carry no "Chrome/"); headless Chromium says "HeadlessChrome/".
  return /Chrome\/\d/.test(navigator.userAgent);
}

let enabled: boolean | null = null;
/** Rim refraction is on: Chromium, unless the page asks for none (`?refract=off`, for comparison). */
export function refractionOn(): boolean {
  if (enabled === null) {
    enabled = typeof window !== 'undefined' && chromium() && new URLSearchParams(location.search).get('refract') !== 'off';
    if (enabled) document.documentElement.dataset.lgRefract = '';
  }
  return enabled;
}

let svg: SVGSVGElement | null = null;
function defs(): SVGSVGElement {
  if (svg?.isConnected) return svg;
  svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  // Not display:none: Chromium does not resolve filters inside an undisplayed SVG.
  svg.style.cssText = 'position:fixed;width:0;height:0;overflow:hidden;pointer-events:none';
  document.body.appendChild(svg);
  return svg;
}

interface Map {
  url: string;
  /** The displacement at a channel's extreme, px (feDisplacementMap's `scale` is twice it). */
  pull: number;
}
const maps = new globalThis.Map<string, Map>();

/** The band's width for a surface of this size, px. */
export function rimOf(w: number, h: number): number {
  return Math.min(GLASS.rimMax, Math.min(w, h) / GLASS.rimDivisor);
}

/**
 * The displacement map of a w x h rounded rectangle (radius r, px): red and
 * green carry x and y of the offset to sample from, 128 = none. Inside the
 * band along the rim the offset points inwards (the normal of the rounded
 * rectangle) and grows towards the edge.
 */
function mapOf(w: number, h: number, r: number): Map {
  const key = `${w}x${h}r${r}`;
  const hit = maps.get(key);
  if (hit) {
    maps.delete(key);
    maps.set(key, hit);
    return hit;
  }
  const rim = rimOf(w, h);
  const pull = Math.max(1, rim * GLASS.rimPull);
  // A big surface's map at a lower resolution (the filter scales it up; the offsets are smooth).
  const k = Math.min(1, Math.sqrt(90000 / (w * h)));
  const W = Math.max(2, Math.round(w * k)), H = Math.max(2, Math.round(h * k));
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const img = g.createImageData(W, H);
  const d = img.data;
  const hx = w / 2, hy = h / 2, rr = Math.min(r, hx, hy);
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const o = (j * W + i) * 4;
      d[o + 3] = 255;
      // Centre-relative position, CSS px.
      const px = (i + 0.5) / k - hx, py = (j + 0.5) / k - hy;
      const ax = Math.abs(px), ay = Math.abs(py);
      const qx = ax - (hx - rr), qy = ay - (hy - rr);
      // Distance inside the edge, and the outward normal (in the first quadrant).
      let depth: number, nx: number, ny: number;
      if (qx > 0 && qy > 0) {
        const l = Math.hypot(qx, qy) || 1;
        depth = rr - l;
        nx = qx / l;
        ny = qy / l;
      } else if (qx > qy) {
        depth = hx - ax;
        nx = 1;
        ny = 0;
      } else {
        depth = hy - ay;
        nx = 0;
        ny = 1;
      }
      let dx = 0, dy = 0;
      if (depth < rim && depth > -1) {
        const a = Math.pow(1 - Math.max(0, depth) / rim, GLASS.falloff);
        // Inwards: against the outward normal, in the pixel's quadrant.
        dx = -Math.sign(px) * nx * a;
        dy = -Math.sign(py) * ny * a;
      }
      d[o] = Math.round(128 + 127 * dx);
      d[o + 1] = Math.round(128 + 127 * dy);
      d[o + 2] = 128;
    }
  }
  g.putImageData(img, 0, 0);
  const m = { url: c.toDataURL('image/png'), pull };
  maps.set(key, m);
  if (maps.size > 48) maps.delete(maps.keys().next().value!);
  return m;
}

let nextId = 1;

/** One SVG filter: the map image and the three displacements (one per colour channel, red bending most). */
interface Filter {
  el: SVGFilterElement;
  image: SVGFEImageElement;
  disp: SVGFEDisplacementMapElement[];
}

function makeFilter(): Filter {
  const f = document.createElementNS(NS, 'filter');
  f.id = `lg-refract-${nextId++}`;
  // The region: the element's box (user space = the element's border box).
  const attrs: [string, string][] = [['filterUnits', 'userSpaceOnUse'], ['primitiveUnits', 'userSpaceOnUse'], ['color-interpolation-filters', 'sRGB'], ['x', '0'], ['y', '0']];
  for (const [a, v] of attrs) f.setAttribute(a, v);
  const image = document.createElementNS(NS, 'feImage');
  image.setAttribute('x', '0');
  image.setAttribute('y', '0');
  image.setAttribute('preserveAspectRatio', 'none');
  image.setAttribute('result', 'map');
  f.append(image);
  // Each channel displaced on its own and kept (opaque), then summed: the rim's colour fringe.
  const keep = ['1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1', '0 0 0 0 0 0 1 0 0 0 0 0 0 0 0 0 0 0 0 1', '0 0 0 0 0 0 0 0 0 0 0 0 1 0 0 0 0 0 0 1'];
  const disp: SVGFEDisplacementMapElement[] = [];
  keep.forEach((values, c) => {
    const dm = document.createElementNS(NS, 'feDisplacementMap');
    dm.setAttribute('in', 'SourceGraphic');
    dm.setAttribute('in2', 'map');
    dm.setAttribute('xChannelSelector', 'R');
    dm.setAttribute('yChannelSelector', 'G');
    const cm = document.createElementNS(NS, 'feColorMatrix');
    cm.setAttribute('type', 'matrix');
    cm.setAttribute('values', values);
    cm.setAttribute('result', `c${c}`);
    f.append(dm, cm);
    disp.push(dm);
  });
  for (const [a, b] of [['c0', 'c1'], ['s', 'c2']]) {
    const sum = document.createElementNS(NS, 'feComposite');
    sum.setAttribute('in', a!);
    sum.setAttribute('in2', b!);
    sum.setAttribute('operator', 'arithmetic');
    sum.setAttribute('k2', '1');
    sum.setAttribute('k3', '1');
    sum.setAttribute('result', 's');
    f.append(sum);
  }
  return { el: f, image, disp };
}

function sizeFilter(f: Filter, w: number, h: number): void {
  for (const n of [f.el, f.image]) {
    n.setAttribute('width', String(w));
    n.setAttribute('height', String(h));
  }
}

/**
 * One surface's refraction, sized to the element. A new size or radius
 * stretches the map in use at once (a frame never shows the backdrop out of
 * place) and, once the size has settled, draws a map for it in a new filter
 * that replaces the old one only when its image is ready: a filter whose
 * map image has not loaded yet displaces the whole backdrop out of the box
 * (it shows black), so the element never points at one.
 */
export class Refraction {
  /** The filter the element uses now (null until the first map is ready). */
  private shown: Filter | null = null;
  /** A filter being readied (its map image loading). */
  private next: Filter | null = null;
  private key = '';
  private size = { w: 0, h: 0 };
  private timer = 0;
  private gone = false;

  constructor(private el: HTMLElement) {}

  /** The element's size (layout px, transforms aside) and corner radius changed, or may have. */
  update(): void {
    const el = this.el;
    const w = Math.round(el.offsetWidth), h = Math.round(el.offsetHeight);
    if (w < 4 || h < 4) return;
    const r = Math.round(parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0);
    const key = `${w}x${h}r${r}`;
    if (key === this.key) return;
    this.size = { w, h };
    if (this.shown) sizeFilter(this.shown, w, h);
    if (this.next) sizeFilter(this.next, w, h);
    const first = !this.key;
    this.key = key;
    clearTimeout(this.timer);
    if (first) this.draw(w, h, r, key);
    // Resizing (a sheet's height, a growing strip): keep the map in use stretched until the size settles.
    else this.timer = window.setTimeout(() => this.draw(w, h, r, key), 120);
  }

  private draw(w: number, h: number, r: number, key: string): void {
    if (this.gone || this.key !== key) return;
    const m = mapOf(w, h, r);
    this.next?.el.remove();
    const f = makeFilter();
    this.next = f;
    sizeFilter(f, this.size.w, this.size.h);
    f.disp.forEach((d, c) => d.setAttribute('scale', String(2 * m.pull * (1 + GLASS.dispersion * (1 - c)))));
    f.image.setAttribute('href', m.url);
    defs().appendChild(f.el);
    const img = new Image();
    img.src = m.url;
    // Decoded, then two frames for the filter's own image to load and be drawn once, off screen.
    img.decode().then(() => requestAnimationFrame(() => requestAnimationFrame(() => {
      if (this.gone || this.next !== f) return;
      this.next = null;
      const old = this.shown;
      this.shown = f;
      this.el.style.setProperty('--lg-refract', `url(#${f.el.id})`);
      this.el.dataset.refract = '';
      // The old filter goes a frame later, once the element has moved to the new one.
      if (old) requestAnimationFrame(() => old.el.remove());
    })), () => {});
  }

  dispose(): void {
    this.gone = true;
    clearTimeout(this.timer);
    this.shown?.el.remove();
    this.next?.el.remove();
    this.el.style.removeProperty('--lg-refract');
    delete this.el.dataset.refract;
  }
}
