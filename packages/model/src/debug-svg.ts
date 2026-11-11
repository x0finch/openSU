// Plain SVG checking view of one resolved level (walls as thick lines, spaces
// filled by type, names, openings marked). A debugging aid for comparing a
// transcription with drawings; NOT the product floor plan, so its colours
// are local debug colours, not visual tokens.
import type { ResolvedHouse, ResolvedLevel } from './resolve';
import type { Point } from './grid';
import type { SpaceType } from './schema';

const DEBUG_FILL: Record<SpaceType, string> = {
  living: '#f4d9a8', dining: '#f6e3b8', kitchen: '#f2c6a0', bedroom: '#c9daf0',
  bathroom: '#b8e0e0', study: '#d8cdea', storage: '#d9d9d0', stair: '#e8e8e8',
  hall: '#ece7dc', family: '#f0d0d8', laundry: '#c8e6d0',
  balcony: '#d4e8c4', terrace: '#cfe3b7', courtyard: '#e6dfc8', garden: '#cfe8c0',
  carport: '#dcdcdc', porch: '#e9e2cf',
};
const C = {
  bg: '#ffffff', plot: '#999999', fence: '#555555', grid: '#c8c8c8', gridText: '#8a8a8a',
  extWall: '#222222', intWall: '#555555', text: '#111111', subText: '#555555',
  window: '#1f6fd1', door: '#d1311f', sliding: '#e08a00', void: '#7a3fb0',
  rail: '#2b8a3e', ghost: '#b03a8a', roof: '#8b5a2b', stair: '#333333', gate: '#e08a00',
};

export interface DebugSvgOptions {
  /** Pixels per millimetre (default 0.07). */
  scale?: number;
  /** Draw the level below as a dashed outline (default true). */
  ghostBelow?: boolean;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function debugSvg(house: ResolvedHouse, levelIndex: number, opts: DebugSvgOptions = {}): string {
  const level = house.levels[levelIndex];
  if (!level) throw new Error(`No level at index ${levelIndex}`);
  const s = opts.scale ?? 0.07;
  const W = house.site.width;
  const D = house.site.depth;
  const margin = 1800;
  const top = 400;
  const px = (x: number) => ((x + margin) * s).toFixed(1);
  const py = (y: number) => ((D - y + top + margin) * s).toFixed(1);
  const width = (W + 2 * margin) * s;
  const height = (D + 2 * margin + top) * s;
  const out: string[] = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width.toFixed(0)}" height="${height.toFixed(0)}" viewBox="0 0 ${width.toFixed(0)} ${height.toFixed(0)}" font-family="'Noto Sans CJK SC','Noto Sans SC','PingFang SC','Microsoft YaHei',sans-serif">`);
  out.push(`<rect width="100%" height="100%" fill="${C.bg}"/>`);
  const ringPath = (rings: Point[][]) => rings.map((r) => `M${r.map((p) => `${px(p[0])},${py(p[1])}`).join('L')}Z`).join('');
  const line = (a: Point, b: Point, stroke: string, w: number, extra = '') =>
    `<line x1="${px(a[0])}" y1="${py(a[1])}" x2="${px(b[0])}" y2="${py(b[1])}" stroke="${stroke}" stroke-width="${w.toFixed(2)}" ${extra}/>`;

  // Title.
  const area = (mm2: number) => (mm2 / 1e6).toFixed(1);
  out.push(`<text x="${px(0)}" y="${(28).toFixed(0)}" font-size="22" font-weight="bold" fill="${C.text}">${esc(level.id)} ${esc(level.name)} - elevation ${level.elevation} mm, height ${level.height} mm - interior ${area(level.interiorArea)} m² (house ${area(house.interiorArea)} m²)</text>`);

  // Grid.
  for (const g of house.grid.x) {
    out.push(line([g.pos, -900], [g.pos, D + 900], C.grid, 1, 'stroke-dasharray="4 4"'));
    out.push(`<text x="${px(g.pos)}" y="${py(D + 1100)}" font-size="13" text-anchor="middle" fill="${C.gridText}">${esc(g.id)}</text>`);
    out.push(`<text x="${px(g.pos)}" y="${py(-1350)}" font-size="10" text-anchor="middle" fill="${C.gridText}">${g.pos}</text>`);
  }
  for (const g of house.grid.y) {
    out.push(line([-900, g.pos], [W + 900, g.pos], C.grid, 1, 'stroke-dasharray="4 4"'));
    out.push(`<text x="${px(-1150)}" y="${py(g.pos)}" font-size="13" text-anchor="middle" dominant-baseline="middle" fill="${C.gridText}">${esc(g.id)}</text>`);
    out.push(`<text x="${px(W + 1250)}" y="${py(g.pos)}" font-size="10" text-anchor="middle" dominant-baseline="middle" fill="${C.gridText}">${g.pos}</text>`);
  }
  // Plot and fence (ground level only).
  out.push(`<rect x="${px(0)}" y="${py(D)}" width="${(W * s).toFixed(1)}" height="${(D * s).toFixed(1)}" fill="none" stroke="${C.plot}" stroke-width="1" stroke-dasharray="8 4"/>`);
  if (level.index === 0 && house.site.fence) {
    out.push(`<rect x="${px(0)}" y="${py(D)}" width="${(W * s).toFixed(1)}" height="${(D * s).toFixed(1)}" fill="none" stroke="${C.fence}" stroke-width="${(150 * s).toFixed(1)}"/>`);
    for (const g of house.site.fence.gates) {
      const len = g.side === 'N' || g.side === 'S' ? W : D;
      const lo = g.at === 'center' ? (len - g.width) / 2 : g.at.from === 'start' ? g.at.offset : len - g.at.offset - g.width;
      const hi = lo + g.width;
      const [a, b]: [Point, Point] =
        g.side === 'S' ? [[lo, 0], [hi, 0]] : g.side === 'N' ? [[lo, D], [hi, D]] : g.side === 'W' ? [[0, lo], [0, hi]] : [[W, lo], [W, hi]];
      out.push(line(a, b, C.gate, 250 * s));
    }
  }

  // Spaces.
  for (const sp of level.spaces) {
    out.push(`<path d="${ringPath(sp.rings)}" fill="${DEBUG_FILL[sp.type]}" fill-rule="evenodd" stroke="none"/>`);
  }
  // Slab openings (stairwells from below) and stairs.
  for (const so of level.slabOpenings) {
    out.push(`<path d="${ringPath(so.rings)}" fill="none" stroke="${C.stair}" stroke-width="1" stroke-dasharray="2 3"/>`);
  }
  // Ghost of the level below.
  const below = house.levels[level.index - 1];
  if ((opts.ghostBelow ?? true) && below) {
    for (const wl of below.walls) out.push(line(wl.a, wl.b, C.ghost, 1.5, 'stroke-dasharray="6 4" opacity="0.6"'));
  }
  // Outdoor edges.
  for (const e of level.edges) {
    if (e.treatment === 'none') continue;
    out.push(line(e.a, e.b, C.rail, 80 * s, e.treatment === 'parapet' ? '' : 'stroke-dasharray="6 3"'));
  }
  // Walls.
  for (const wl of level.walls) {
    out.push(line(wl.a, wl.b, wl.exterior ? C.extWall : C.intWall, wl.thickness * s, 'stroke-linecap="square"'));
  }
  // Openings.
  for (const o of level.openings) {
    const wall = level.walls.find((w) => w.id === o.wall);
    const t = (wall?.thickness ?? 120) * s;
    out.push(line(o.a, o.b, C.bg, t + 1));
    const col = o.kind === 'window' ? C.window : o.kind === 'door' ? C.door : o.kind === 'sliding-door' ? C.sliding : C.void;
    if (o.kind === 'window') {
      out.push(line(o.a, o.b, col, Math.max(2, t * 0.6), o.spanLevels > 1 ? 'stroke-dasharray="5 2"' : ''));
    } else {
      out.push(line(o.a, o.b, col, Math.max(2.5, t * 0.45), o.kind === 'void' ? 'stroke-dasharray="3 3"' : ''));
      if (o.kind === 'door') {
        // Quarter-circle swing marker on the facing side (or north/east side).
        const dir = o.facing === 'S' || o.facing === 'W' ? -1 : 1;
        const r = o.width;
        if (o.orient === 'EW') {
          const p: Point = [o.a[0], o.a[1] + dir * r];
          out.push(`<path d="M${px(o.b[0])},${py(o.b[1])} A${(r * s).toFixed(1)},${(r * s).toFixed(1)} 0 0 ${dir > 0 ? 0 : 1} ${px(p[0])},${py(p[1])} L${px(o.a[0])},${py(o.a[1])}" fill="none" stroke="${col}" stroke-width="1"/>`);
        } else {
          const p: Point = [o.a[0] + dir * r, o.a[1]];
          out.push(`<path d="M${px(o.b[0])},${py(o.b[1])} A${(r * s).toFixed(1)},${(r * s).toFixed(1)} 0 0 ${dir > 0 ? 1 : 0} ${px(p[0])},${py(p[1])} L${px(o.a[0])},${py(o.a[1])}" fill="none" stroke="${col}" stroke-width="1"/>`);
        }
      }
    }
  }
  // Upper parts of tall openings from lower levels (spanLevels > 1).
  for (const lower of house.levels.slice(0, level.index)) {
    for (const o of lower.openings) {
      if (lower.index + o.spanLevels - 1 < level.index) continue;
      out.push(line(o.a, o.b, C.bg, 240 * s + 1));
      out.push(line(o.a, o.b, C.window, 240 * s * 0.6, 'stroke-dasharray="5 2"'));
    }
  }
  // Stairs: arrow in the up direction from the stair space centre.
  for (const st of level.stairs) {
    const sp = level.spaces.find((x) => x.id === st.space);
    if (!sp || sp.polygon.length === 0) continue;
    const xs = sp.polygon.map((p) => p[0]);
    const ys = sp.polygon.map((p) => p[1]);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const L = Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) * 0.35;
    const d: Point = st.up === 'N' ? [0, 1] : st.up === 'S' ? [0, -1] : st.up === 'E' ? [1, 0] : [-1, 0];
    const a: Point = [cx - d[0] * L, cy - d[1] * L];
    const b: Point = [cx + d[0] * L, cy + d[1] * L];
    out.push(line(a, b, C.stair, 2));
    const h1: Point = [b[0] - d[0] * 250 + d[1] * 180, b[1] - d[1] * 250 + d[0] * 180];
    const h2: Point = [b[0] - d[0] * 250 - d[1] * 180, b[1] - d[1] * 250 - d[0] * 180];
    out.push(`<path d="M${px(h1[0])},${py(h1[1])}L${px(b[0])},${py(b[1])}L${px(h2[0])},${py(h2[1])}" fill="none" stroke="${C.stair}" stroke-width="2"/>`);
    out.push(`<text x="${px(a[0])}" y="${py(a[1])}" dy="${d[1] > 0 ? 14 : -6}" font-size="11" text-anchor="middle" fill="${C.stair}">UP ${st.kind}</text>`);
  }
  // Roofs sitting on this level.
  for (const r of house.roofs) {
    if (r.onLevel !== level.id || !r.bbox) continue;
    out.push(`<path d="${ringPath(r.rings)}" fill="none" stroke="${C.roof}" stroke-width="2" stroke-dasharray="10 4"/>`);
    for (const sk of r.skylights) {
      out.push(`<rect x="${px(sk.at[0] - sk.width / 2)}" y="${py(sk.at[1] + sk.length / 2)}" width="${(sk.width * s).toFixed(1)}" height="${(sk.length * s).toFixed(1)}" fill="none" stroke="${C.roof}" stroke-width="1.5"/>`);
    }
    const label = `${r.id}: ${r.kind}${r.fall ? ` falls ${r.fall}` : ''}${r.pitchDeg !== undefined ? ` ${r.pitchDeg}°` : ''}`;
    const bb = r.bbox;
    const ly = r.fall === 'N' ? bb.y1 - 350 : r.fall === 'S' ? bb.y0 + 350 : (bb.y0 + bb.y1) / 2;
    out.push(`<text x="${px((bb.x0 + bb.x1) / 2)}" y="${py(ly)}" font-size="12" text-anchor="middle" fill="${C.roof}">${esc(label)}</text>`);
  }
  // Labels last so they stay on top.
  for (const sp of level.spaces) {
    const lp = labelPoint(sp.polygon);
    if (!lp) continue;
    const big = sp.area > 4e6;
    out.push(`<text x="${px(lp[0])}" y="${py(lp[1])}" font-size="${big ? 15 : 11}" text-anchor="middle" fill="${C.text}">${esc(sp.name)}</text>`);
    out.push(`<text x="${px(lp[0])}" y="${py(lp[1])}" dy="${big ? 15 : 12}" font-size="${big ? 10 : 8}" text-anchor="middle" fill="${C.subText}">${esc(sp.nameEn ?? sp.type)} ${area(sp.area)} m²</text>`);
  }
  // Legend.
  const legend: [string, string][] = [['window', C.window], ['door', C.door], ['sliding door', C.sliding], ['void', C.void], ['rail edge', C.rail], ['walls of level below', C.ghost], ['roof', C.roof]];
  legend.forEach(([name, col], i) => {
    const x = 20 + i * 135;
    const y = height - 14;
    out.push(`<rect x="${x}" y="${y - 9}" width="18" height="6" fill="${col}"/><text x="${x + 24}" y="${y}" font-size="11" fill="${C.subText}">${name}</text>`);
  });
  out.push('</svg>');
  return out.join('\n');
}

/** A point inside the polygon for the label: centre of the bbox if inside,
 *  otherwise the centre of the widest horizontal slice through the middle. */
function labelPoint(poly: Point[]): Point | null {
  if (poly.length === 0) return null;
  const xs = poly.map((p) => p[0]);
  const ys = poly.map((p) => p[1]);
  const c: Point = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
  if (inside(poly, c)) return c;
  const levels = [...new Set(ys)].sort((a, b) => a - b);
  let best: { p: Point; area: number } | null = null;
  for (let i = 0; i < levels.length - 1; i++) {
    const y = (levels[i]! + levels[i + 1]!) / 2;
    const cross: number[] = [];
    for (let n = 0; n < poly.length; n++) {
      const a = poly[n]!;
      const b = poly[(n + 1) % poly.length]!;
      if (a[0] === b[0] && (a[1] - y) * (b[1] - y) < 0) cross.push(a[0]);
    }
    cross.sort((p, q) => p - q);
    for (let k = 0; k + 1 < cross.length; k += 2) {
      const w = cross[k + 1]! - cross[k]!;
      const area = w * (levels[i + 1]! - levels[i]!);
      if (!best || area > best.area) best = { p: [(cross[k]! + cross[k + 1]!) / 2, y], area };
    }
  }
  return best?.p ?? c;
}

function inside(poly: Point[], p: Point): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) c = !c;
  }
  return c;
}
