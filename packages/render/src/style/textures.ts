import { CanvasTexture, LinearMipmapLinearFilter, RepeatWrapping, SRGBColorSpace } from 'three';
import { materials as m } from './tokens.js';

/**
 * Procedural, low-contrast surface patterns. Every texture covers 1 m x 1 m
 * of surface; geometry carries UVs in metres so patterns keep a true scale.
 */

const SIZE = 512;

function makeCanvas(): [HTMLCanvasElement | OffscreenCanvas, CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D] {
  const canvas: HTMLCanvasElement | OffscreenCanvas =
    typeof document !== 'undefined' ? Object.assign(document.createElement('canvas'), { width: SIZE, height: SIZE }) : new OffscreenCanvas(SIZE, SIZE);
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  return [canvas, ctx];
}

function finish(canvas: HTMLCanvasElement | OffscreenCanvas): CanvasTexture {
  const tex = new CanvasTexture(canvas as HTMLCanvasElement);
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.colorSpace = SRGBColorSpace;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.anisotropy = 8;
  tex.generateMipmaps = true;
  return tex;
}

/** Deterministic pseudo-random sequence for texture variation. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Small clay roof tiles laid in staggered rows (fish-scale profile).
 * U runs along the eave, V runs down the slope.
 */
export function createRoofTileTexture(): CanvasTexture {
  const [canvas, ctx] = makeCanvas();
  const rows = 6;
  const cols = 6;
  const rowH = SIZE / rows;
  const colW = SIZE / cols;
  ctx.fillStyle = m.roofTileLine;
  ctx.fillRect(0, 0, SIZE, SIZE);
  // Colour per tile from its wrapped grid position so the pattern tiles seamlessly.
  const shadeOf = (r: number, c: number) => {
    const rr = ((r % rows) + rows) % rows;
    const cc = ((c % cols) + cols) % cols;
    const h = Math.sin(rr * 12.9898 + cc * 78.233) * 43758.5453;
    return h - Math.floor(h);
  };
  const tile = (x0: number, y0: number, fill: string) => {
    const g = 3;
    const r = colW * 0.42;
    const x1 = x0 + colW - g;
    const xa = x0 + g;
    const y1 = y0 + rowH * 1.18;
    ctx.beginPath();
    ctx.moveTo(xa, y0);
    ctx.lineTo(x1, y0);
    ctx.lineTo(x1, y1 - r);
    ctx.quadraticCurveTo(x1, y1, x1 - r, y1);
    ctx.lineTo(xa + r, y1);
    ctx.quadraticCurveTo(xa, y1, xa, y1 - r);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    // Lighter exposed lower part of the tile (it catches the light).
    ctx.save();
    ctx.clip();
    ctx.fillStyle = m.roofTileHighlight;
    ctx.globalAlpha = 0.7;
    ctx.fillRect(xa, y0 + rowH * 0.55, colW, rowH * 0.45);
    ctx.restore();
    ctx.strokeStyle = m.roofTileLine;
    ctx.lineWidth = 5;
    ctx.stroke();
  };
  // Upper rows overlap the row below them: paint from the bottom row up.
  for (let r = rows; r >= -1; r--) {
    const y0 = r * rowH;
    const shift = (((r % 2) + 2) % 2) * colW * 0.5;
    for (let c = -1; c <= cols; c++) {
      const v = shadeOf(r, c);
      tile(c * colW + shift, y0, v > 0.75 ? m.roofTileShade : m.roofTile);
    }
  }
  return finish(canvas);
}

/**
 * Timber: faint boards along U. `deck` gives narrower boards with visible
 * joints (decking, slats); otherwise only a faint grain (panels, fascia).
 */
export function createWoodTexture(deck: boolean): CanvasTexture {
  const [canvas, ctx] = makeCanvas();
  ctx.fillStyle = m.wood;
  ctx.fillRect(0, 0, SIZE, SIZE);
  const rand = rng(deck ? 11 : 5);
  const boards = deck ? 8 : 5;
  const bw = SIZE / boards;
  for (let i = 0; i < boards; i++) {
    ctx.fillStyle = rand() > 0.5 ? m.woodHighlight : m.wood;
    ctx.globalAlpha = 0.5;
    ctx.fillRect(0, i * bw, SIZE, bw);
    ctx.globalAlpha = 1;
    // Grain streaks.
    ctx.strokeStyle = m.woodLine;
    ctx.globalAlpha = 0.25;
    ctx.lineWidth = 2;
    for (let g = 0; g < 4; g++) {
      const y = i * bw + rand() * bw;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(SIZE * 0.3, y + (rand() - 0.5) * 8, SIZE * 0.6, y + (rand() - 0.5) * 8, SIZE, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    if (deck) {
      ctx.fillStyle = m.woodLine;
      ctx.fillRect(0, i * bw, SIZE, 5);
    }
  }
  return finish(canvas);
}
