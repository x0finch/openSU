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
  const rows = 4;
  const cols = 5;
  const rowH = SIZE / rows;
  const colW = SIZE / cols;
  ctx.fillStyle = m.roofTile;
  ctx.fillRect(0, 0, SIZE, SIZE);
  const rand = rng(7);
  for (let r = 0; r < rows; r++) {
    const y0 = r * rowH;
    const shift = (r % 2) * colW * 0.5;
    for (let c = -1; c <= cols; c++) {
      const x0 = c * colW + shift;
      // Upper part of each tile catches a little more light.
      ctx.fillStyle = rand() > 0.5 ? m.roofTileHighlight : m.roofTile;
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      ctx.moveTo(x0 + 3, y0);
      ctx.lineTo(x0 + colW - 3, y0);
      ctx.lineTo(x0 + colW - 3, y0 + rowH * 0.62);
      ctx.quadraticCurveTo(x0 + colW * 0.5, y0 + rowH * 1.02, x0 + 3, y0 + rowH * 0.62);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
      // Rounded lower edge of the tile.
      ctx.strokeStyle = m.roofTileLine;
      ctx.lineWidth = 9;
      ctx.beginPath();
      ctx.moveTo(x0, y0 + rowH * 0.55);
      ctx.quadraticCurveTo(x0 + colW * 0.5, y0 + rowH * 1.06, x0 + colW, y0 + rowH * 0.55);
      ctx.stroke();
      // Joint between neighbouring tiles.
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x0, y0 + rowH * 0.55);
      ctx.stroke();
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
