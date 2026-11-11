// North arrow and title block.
import { attrs, f } from '../svg';
import { escapeXml, textWidth } from '../text';
import { color, font, layout, stroke } from '../tokens';
import type { TextBox } from './labels';

/** North arrow centred at (cx, cy); `deg` = true north clockwise from plan up. */
export function northArrow(cx: number, cy: number, deg: number, boxes: TextBox[]): string {
  const r = layout.northRadius;
  const tip = r + 9;
  let g = `<circle${attrs({ cx: 0, cy: 0, r, fill: 'none', stroke: color.north, 'stroke-width': stroke.north })}/>`;
  // Needle: a slim kite, the east half filled.
  g += `<path${attrs({ d: `M0,${f(-tip)}L${f(r * 0.3)},${f(r * 0.62)}L0,${f(r * 0.36)}Z`, fill: color.north })}/>`;
  g += `<path${attrs({ d: `M0,${f(-tip)}L${f(-r * 0.3)},${f(r * 0.62)}L0,${f(r * 0.36)}Z`, fill: color.page, stroke: color.north, 'stroke-width': stroke.north * 0.8, 'stroke-linejoin': 'round' })}/>`;
  let s = `<g transform="translate(${f(cx)} ${f(cy)})${deg ? ` rotate(${f(deg)})` : ''}">${g}</g>`;
  // "N" stays upright, just beyond the tip.
  const a = (deg * Math.PI) / 180;
  const d = tip + 2 + font.northSize * 0.6;
  const nx = cx + Math.sin(a) * d, ny = cy - Math.cos(a) * d;
  s += `<text${attrs({ x: nx, y: ny + font.northSize * 0.36, 'text-anchor': 'middle', 'font-family': font.latin, 'font-size': font.northSize, 'font-weight': 500, fill: color.north })}>N</text>`;
  const w = textWidth('N', font.northSize);
  boxes.push({ x0: nx - w / 2, x1: nx + w / 2, y0: ny - font.northSize / 2, y1: ny + font.northSize / 2, text: 'N', kind: 'north' });
  return s;
}

export function titleBlock(cx: number, top: number, title: string, subtitle: string, boxes: TextBox[]): { svg: string; bottom: number } {
  const ts = font.titleSize;
  const tr = font.titleTracking * ts;
  const tw = textWidth(title, ts, font.titleTracking);
  let s = `<text${attrs({ x: cx + tr / 2, y: top + ts * 0.88, 'text-anchor': 'middle', 'font-family': font.cjk, 'font-size': ts, 'letter-spacing': f(tr), fill: color.title })}>${escapeXml(title)}</text>`;
  boxes.push({ x0: cx - tw / 2, x1: cx + tw / 2, y0: top, y1: top + ts, text: title, kind: 'title' });
  let bottom = top + ts;
  if (subtitle) {
    const ss = font.subtitleSize;
    const str = font.subtitleTracking * ss;
    const y = bottom + 9;
    const sw = textWidth(subtitle, ss, font.subtitleTracking);
    s += `<text${attrs({ x: cx + str / 2, y: y + ss * 0.78, 'text-anchor': 'middle', 'font-family': font.latin, 'font-size': ss, 'letter-spacing': f(str), fill: color.subtitle })}>${escapeXml(subtitle)}</text>`;
    boxes.push({ x0: cx - sw / 2, x1: cx + sw / 2, y0: y, y1: y + ss * 0.8, text: subtitle, kind: 'title' });
    bottom = y + ss;
  }
  return { svg: s, bottom };
}
