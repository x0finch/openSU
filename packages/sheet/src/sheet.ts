// Shareable sheets: a portrait page with the house name and facts, a hero
// 3D view, a hairline divider and a coloured floor plan (or two 3D views),
// composed on a 2D canvas at device resolution and encoded as PNG.
import { type House, type ResolvedHouse, resolve } from '@opensu/model';
import { buildHouse } from '@opensu/kernel';
import { plantSite } from '@opensu/furnish';
import { renderPlanDetailed } from '@opensu/plan';
import { OffscreenView, type ViewPreset } from '@opensu/render';
import { sheetFacts } from './facts.js';
import { type InkMask, inkMask, placeDrawing, type Rect } from './layout.js';
import { color, font, inkThreshold, layout, page } from './tokens.js';

/** Hero views the sheets use (compass bearing from the house to the camera). */
export const SHEET_VIEWS = {
  'axo-se': { id: 'axo-se', label: 'Axo SE', kind: 'axo', azimuthDeg: 148 },
  'axo-ne': { id: 'axo-ne', label: 'Axo NE', kind: 'axo', azimuthDeg: 50 },
  'axo-sw': { id: 'axo-sw', label: 'Axo SW', kind: 'axo', azimuthDeg: 212 },
  'eye-sw': { id: 'eye-sw', label: 'Eye SW', kind: 'eye', azimuthDeg: 222 },
  'eye-se': { id: 'eye-se', label: 'Eye SE', kind: 'eye', azimuthDeg: 140 },
  'elev-south': { id: 'elev-south', label: 'South', kind: 'elevation', azimuthDeg: 180 },
} as const satisfies Record<string, ViewPreset>;

export type SheetViewId = keyof typeof SHEET_VIEWS;
export type SheetView = SheetViewId | ViewPreset;

/** Hero views of the level sheets of a set, in level order (cycled). */
export const LEVEL_HERO_VIEWS: readonly SheetViewId[] = ['axo-se', 'eye-sw', 'axo-ne'];

/**
 * True when a tree of the site planting stands between an eye-level camera
 * (compass bearing `azimuthDeg` from the house) and the middle third of the
 * house as seen from there: the hero would show a crown instead of the
 * facade's centre.
 */
export function treeHidesFacade(house: ResolvedHouse, azimuthDeg: number): boolean {
  const pts = house.levels[0]!.spaces.filter((s) => !s.outdoor).flatMap((s) => s.rings.flat());
  if (!pts.length) return false;
  const a = (azimuthDeg * Math.PI) / 180;
  const d: [number, number] = [Math.sin(a), Math.cos(a)];
  const r: [number, number] = [-Math.cos(a), Math.sin(a)];
  const along = (p: readonly number[]) => p[0]! * r[0] + p[1]! * r[1];
  const toward = (p: readonly number[]) => p[0]! * d[0] + p[1]! * d[1];
  const xs = pts.map(along);
  const lo = Math.min(...xs), hi = Math.max(...xs);
  const c0 = lo + (hi - lo) / 3, c1 = hi - (hi - lo) / 3;
  const front = Math.max(...pts.map(toward));
  return plantSite(house).some((p) => {
    if (p.kind !== 'ginkgo' && p.kind !== 'maple-red' && p.kind !== 'maple-green') return false;
    if (p.level !== house.levels[0]!.id || toward([p.x, p.y]) < front - 6000) return false;
    // Crown radius of the 3D generators (about a third of the height).
    const R = (p.kind === 'ginkgo' ? 0.36 : 0.5) * p.height * 1000;
    const x = along([p.x, p.y]);
    return x + R > c0 && x - R < c1;
  });
}

/**
 * Hero views of the level sheets of this house: like `LEVEL_HERO_VIEWS`,
 * but the eye-level view turns to the south-east when a tree would hide the
 * facade's centre from the south-west (and not from the south-east).
 */
export function levelHeroViews(house: House | ResolvedHouse): SheetViewId[] {
  const r = isResolved(house) ? house : resolve(house);
  return LEVEL_HERO_VIEWS.map((v) => (v === 'eye-sw' && treeHidesFacade(r, SHEET_VIEWS['eye-sw'].azimuthDeg) && !treeHidesFacade(r, SHEET_VIEWS['eye-se'].azimuthDeg) ? 'eye-se' : v));
}
/** The two views of the views sheet of a set. */
export const VIEWS_SHEET_VIEWS: readonly [SheetViewId, SheetViewId] = ['axo-sw', 'elev-south'];

interface CommonOptions {
  /** Large header text; defaults to the house name. */
  title?: string;
  /** Show the fact lines (plot, area, style) under the title. Default true. */
  facts?: boolean;
  /** Resolution multiplier: 1 = 1500 x 2000 px, 2 = 3000 x 4000 px. */
  scale?: number;
}

export type SheetOptions =
  | (CommonOptions & { kind: 'level'; levelId: string; view?: SheetView })
  | (CommonOptions & { kind: 'views'; views: readonly [SheetView, SheetView] });

export interface SheetSetOptions {
  title?: string;
  scale?: number;
  /** Called as each sheet is ready (index, count, PNG), e.g. to show thumbnails progressively. */
  onSheet?: (index: number, count: number, png: Blob) => void;
}

/** Lets the page paint between heavy steps (the export runs on the main thread). */
const breathe = () => new Promise<void>((ok) => {
  if (typeof requestAnimationFrame !== 'function') return ok();
  // rAF pauses in hidden tabs: a timer keeps the export going there.
  const t = setTimeout(ok, 50);
  requestAnimationFrame(() => setTimeout(() => { clearTimeout(t); ok(); }, 0));
});

function isResolved(h: House | ResolvedHouse): h is ResolvedHouse {
  return 'interiorArea' in h;
}

function presetOf(v: SheetView): ViewPreset {
  return typeof v === 'string' ? SHEET_VIEWS[v] : v;
}

/** Shared state of one export: the resolved model and one offscreen WebGL context. */
class SheetContext {
  readonly house: ResolvedHouse;
  readonly scale: number;
  private view: OffscreenView | null = null;
  private readonly plans = new Map<string, Promise<PlanProbe>>();
  /** When set, every plan is drawn at most at this scale (one drawing scale across a set). */
  planScale: number | undefined;
  /** Divider of the level sheets (page px); chosen with the plan scale. */
  dividerY: number = Math.round(page.height * layout.dividerLevel);

  constructor(house: House | ResolvedHouse, scale: number) {
    this.house = isResolved(house) ? house : resolve(house);
    this.scale = scale;
  }

  get offscreen(): OffscreenView {
    this.view ??= new OffscreenView(buildHouse(this.house), { pixelRatio: this.scale });
    return this.view;
  }

  /** The level's plan SVG and where its ink is (rasterised once at its nominal size). */
  plan(levelId: string): Promise<PlanProbe> {
    let p = this.plans.get(levelId);
    if (!p) {
      p = probePlan(this.house, levelId);
      this.plans.set(levelId, p);
    }
    return p;
  }

  dispose(): void {
    this.view?.dispose();
    this.view = null;
  }
}

function newPage(scale: number): { canvas: HTMLCanvasElement; g: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(page.width * scale);
  canvas.height = Math.round(page.height * scale);
  const g = canvas.getContext('2d')!;
  g.fillStyle = page.background;
  g.fillRect(0, 0, canvas.width, canvas.height);
  return { canvas, g };
}

function setFont(g: CanvasRenderingContext2D, size: number, weight: number, trackingEm = 0): void {
  g.font = `${weight} ${size}px ${font.family}`;
  (g as { letterSpacing?: string }).letterSpacing = `${(trackingEm * size).toFixed(2)}px`;
}

/**
 * Title and fact lines; returns the block no hero ink may enter (page px).
 * With `draw` false it only measures (text is painted last, over the views).
 */
function header(g: CanvasRenderingContext2D, s: number, title: string, facts: readonly string[], draw: boolean): Rect[] {
  g.setTransform(s, 0, 0, s, 0, 0);
  g.textBaseline = 'alphabetic';
  g.textAlign = 'left';
  g.fillStyle = color.title;
  // Long names shrink (down to a floor) rather than run across the hero.
  setFont(g, font.titleSize, font.titleWeight, font.titleTracking);
  const fit = Math.max(font.titleMinSize, Math.min(font.titleSize, (font.titleSize * font.titleMaxWidth) / g.measureText(title).width));
  setFont(g, fit, font.titleWeight, font.titleTracking);
  if (draw) g.fillText(title, layout.marginX, layout.titleBaseline);
  const pad = layout.headerClearance;
  // One block per line, each anchored at the page corner: together a staircase.
  const blocks: Rect[] = [{ x0: 0, y0: 0, x1: layout.marginX + g.measureText(title).width + pad, y1: layout.titleBaseline + fit * 0.22 + pad }];
  g.fillStyle = color.fact;
  setFont(g, font.factSize, font.factWeight);
  facts.forEach((line, i) => {
    const y = layout.firstFactBaseline + i * font.factLeading;
    if (draw) g.fillText(line, layout.marginX, y);
    blocks.push({ x0: 0, y0: 0, x1: layout.marginX + g.measureText(line).width + pad, y1: y + font.factSize * 0.22 + pad });
  });
  g.setTransform(1, 0, 0, 1, 0, 0);
  return blocks;
}

function drawDivider(g: CanvasRenderingContext2D, s: number, y: number): void {
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = color.divider;
  const h = Math.max(1, Math.round(layout.divider * s));
  g.fillRect(0, Math.round(y * s), Math.round(page.width * s), h);
}

function drawFooter(g: CanvasRenderingContext2D, s: number): void {
  g.setTransform(s, 0, 0, s, 0, 0);
  g.fillStyle = color.footer;
  g.textAlign = 'right';
  setFont(g, font.footerSize, 400, font.footerTracking);
  // Trailing tracking would push the mark off the margin.
  g.fillText('openSU', page.width - layout.marginX + font.footerTracking * font.footerSize, layout.footerBaseline);
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.textAlign = 'left';
}

/** Draws an image 1:1 in device pixels, multiplied onto the page (its white never covers anything). */
function blit(g: CanvasRenderingContext2D, paint: () => void): void {
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = 'multiply';
  paint();
  g.globalCompositeOperation = 'source-over';
}

function maskOf(c: HTMLCanvasElement): InkMask {
  const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
  return inkMask(d, c.width, c.height, inkThreshold);
}

/**
 * A thin ground line under an elevation: along the ink's base, running a
 * little past the drawing on both sides (page px).
 */
function drawGroundLine(g: CanvasRenderingContext2D, s: number, ink: Rect, baseY: number): void {
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = color.groundLine;
  const h = Math.max(1, Math.round(layout.groundLine * s));
  const x0 = Math.round((ink.x0 - layout.groundLineOverhang) * s);
  const x1 = Math.round((ink.x1 + layout.groundLineOverhang) * s);
  g.fillRect(x0, baseY - Math.floor(h / 2), x1 - x0, h);
}

/**
 * Device row of an elevation's base: among the lowest rows of the render,
 * the one with the most dark line pixels (the outline along the ground).
 */
function baseRow(img: HTMLCanvasElement, bottomPad: number): number {
  const rows = Math.min(img.height, bottomPad + 24);
  const d = img.getContext('2d')!.getImageData(0, img.height - rows, img.width, rows).data;
  let best = rows - 1, bestCount = -1;
  for (let r = 0; r < rows; r++) {
    let n = 0;
    for (let x = 0, i = r * img.width * 4; x < img.width; x++, i += 4) if (d[i]! < 110 && d[i + 1]! < 110 && d[i + 2]! < 110) n++;
    if (n >= bestCount) { bestCount = n; best = r; }
  }
  return img.height - rows + best;
}

/** Renders a 3D view so its ink fills `region` as well as it can (page px); returns where the ink landed. */
function drawView(g: CanvasRenderingContext2D, ctx: SheetContext, preset: ViewPreset, region: Rect, maxWidth: number, alignY: 'bottom' | 'center', keepout?: readonly Rect[]): Rect {
  const s = ctx.scale;
  const aspect = (region.x1 - region.x0) / (region.y1 - region.y0);
  const pw = aspect >= 1 ? layout.probeSize : Math.round(layout.probeSize * aspect);
  const ph = aspect >= 1 ? Math.round(layout.probeSize / aspect) : layout.probeSize;
  let margin: number = layout.probeMargin;
  let mask: InkMask;
  let framed: ViewPreset;
  for (let attempt = 0; ; attempt++) {
    framed = { ...preset, margin };
    // Probe at 1x: only the ink outline matters.
    mask = maskOf(ctx.offscreen.render(framed, { width: pw / s, height: ph / s }));
    if (!mask.touchesBorder || attempt >= 3) break;
    margin += 0.08;
  }
  const bw = mask.bbox.x1 - mask.bbox.x0;
  const p = placeDrawing(mask, region, { centerX: page.width / 2, alignY, keepout, maxScale: bw > 0 ? maxWidth / bw : undefined });
  const k = p.scale;
  const pad = layout.inkPad;
  const x = Math.round(p.x) - pad;
  const y = Math.round(p.y) - pad;
  const w = Math.round((mask.bbox.x1 - mask.bbox.x0) * k) + 2 * pad;
  const h = Math.round((mask.bbox.y1 - mask.bbox.y0) * k) + 2 * pad;
  const fx0 = (mask.bbox.x0 - pad / k) / mask.width;
  const fy0 = (mask.bbox.y0 - pad / k) / mask.height;
  const win = { x0: fx0, y0: fy0, x1: fx0 + w / (k * mask.width), y1: fy0 + h / (k * mask.height) };
  const img = ctx.offscreen.render(framed, { width: w, height: h, frameAspect: mask.width / mask.height, window: win });
  blit(g, () => g.drawImage(img, Math.round(x * s), Math.round(y * s)));
  const ink = { x0: x + pad, y0: y + pad, x1: x + w - pad, y1: y + h - pad };
  if (preset.kind === 'elevation') drawGroundLine(g, s, ink, Math.round(y * s) + baseRow(img, Math.ceil(pad * s)));
  return ink;
}

async function rasterSvg(svg: string, width: number, height: number, scale: number): Promise<HTMLImageElement> {
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const sized = svg.replace(/<svg\b[^>]*>/, (tag) => tag.replace(/\swidth="[^"]*"/, ` width="${w}"`).replace(/\sheight="[^"]*"/, ` height="${h}"`));
  const url = URL.createObjectURL(new Blob([sized], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

interface PlanProbe {
  svg: string;
  /** Nominal SVG size (px). */
  width: number;
  height: number;
  /** Ink of the plan rasterised at its nominal size. */
  mask: InkMask;
}

async function probePlan(house: ResolvedHouse, levelId: string): Promise<PlanProbe> {
  // Sheet-sized text: labels, dimensions, title and north arrow read at the
  // reference sheets' relative size once the plan is fitted to the page.
  const plan = renderPlanDetailed(house, levelId, { textScale: layout.planTextScale });
  const img = await rasterSvg(plan.svg, plan.width, plan.height, 1);
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  c.getContext('2d')!.drawImage(img, 0, 0);
  return { svg: plan.svg, width: plan.width, height: plan.height, mask: maskOf(c) };
}

function planRegion(dividerY: number): Rect {
  return { x0: layout.marginX, y0: dividerY + layout.gapBelowDivider, x1: page.width - layout.marginX, y1: layout.bottom };
}

/** Draws the level's floor plan (with its own title) to fill `region`. */
async function drawPlan(g: CanvasRenderingContext2D, ctx: SheetContext, levelId: string, region: Rect): Promise<void> {
  const s = ctx.scale;
  const plan = await ctx.plan(levelId);
  const { mask } = plan;
  const p = placeDrawing(mask, region, { centerX: page.width / 2, alignY: 'center', maxScale: ctx.planScale });
  const k = (p.scale * mask.width) / plan.width; // page px per SVG px
  const img = await rasterSvg(plan.svg, plan.width, plan.height, k * s);
  const pad = layout.inkPad;
  const f = img.width / mask.width; // device px per probe px
  const sx = Math.max(0, Math.floor((mask.bbox.x0 - pad) * f));
  const sy = Math.max(0, Math.floor((mask.bbox.y0 - pad) * f));
  const sw = Math.min(img.width - sx, Math.ceil((mask.bbox.x1 - mask.bbox.x0 + 2 * pad) * f));
  const sh = Math.min(img.height - sy, Math.ceil((mask.bbox.y1 - mask.bbox.y0 + 2 * pad) * f));
  const dx = Math.round((p.x - (mask.bbox.x0 - sx / f) * p.scale) * s);
  const dy = Math.round((p.y - (mask.bbox.y0 - sy / f) * p.scale) * s);
  blit(g, () => g.drawImage(img, sx, sy, sw, sh, dx, dy, sw, sh));
}

function toPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((ok, fail) => canvas.toBlob((b) => (b ? ok(b) : fail(new Error('PNG encoding failed'))), 'image/png'));
}

async function composeSheet(ctx: SheetContext, o: SheetOptions): Promise<Blob> {
  await document.fonts?.ready;
  const s = ctx.scale;
  const { canvas, g } = newPage(s);
  const facts = o.facts === false ? [] : sheetFacts(ctx.house);
  const title = o.title ?? ctx.house.name;
  const keepout = header(g, s, title, facts, false);
  const heroTop = layout.heroTop;
  const x0 = layout.marginX;
  const x1 = page.width - layout.marginX;
  if (o.kind === 'level') {
    if (!ctx.house.levels.some((l) => l.id === o.levelId)) throw new Error(`renderSheet: no level ${o.levelId}`);
    const dividerY = ctx.dividerY;
    drawView(g, ctx, presetOf(o.view ?? LEVEL_HERO_VIEWS[0]!), { x0, y0: heroTop, x1, y1: dividerY - layout.gapAboveDivider }, layout.heroMaxWidth, 'bottom', keepout);
    drawDivider(g, s, dividerY);
    await breathe();
    await drawPlan(g, ctx, o.levelId, planRegion(dividerY));
  } else {
    const dividerY = Math.round(page.height * layout.dividerViews);
    drawView(g, ctx, presetOf(o.views[0]), { x0, y0: heroTop, x1, y1: dividerY - layout.gapAboveDivider }, layout.heroMaxWidth, 'bottom', keepout);
    drawDivider(g, s, dividerY);
    await breathe();
    drawView(g, ctx, presetOf(o.views[1]), { x0, y0: dividerY + layout.gapBelowDivider, x1, y1: layout.bottom }, layout.lowerViewMaxWidth, 'center');
  }
  header(g, s, title, facts, true);
  drawFooter(g, s);
  return toPng(canvas);
}

/**
 * One sheet as a PNG: `{ kind: 'level', levelId, view }` (hero view and that
 * level's plan) or `{ kind: 'views', views: [a, b] }` (two views stacked).
 * Runs in the browser; uses its own offscreen WebGL context and releases it.
 */
export async function renderSheet(house: House | ResolvedHouse, options: SheetOptions): Promise<Blob> {
  const ctx = new SheetContext(house, options.scale ?? 1);
  try {
    if (options.kind === 'level' && ctx.house.levels.some((l) => l.id === options.levelId)) await choosePlanScale(ctx, [options.levelId]);
    return await composeSheet(ctx, options);
  } finally {
    ctx.dispose();
  }
}

/**
 * One drawing scale for the plans of `levelIds`: the widest level spans
 * `planWidthTarget` of the page width when the plans fit below a divider
 * no higher than `dividerLevelMin`; otherwise the tallest level fills the
 * height there. Smaller levels are drawn at the same scale (never shrunk
 * further), and the divider sits just above the tallest plan.
 */
async function choosePlanScale(ctx: SheetContext, levelIds: readonly string[]): Promise<void> {
  const masks = await Promise.all(levelIds.map(async (id) => (await ctx.plan(id)).mask));
  const bw = Math.max(...masks.map((m) => m.bbox.x1 - m.bbox.x0));
  const bh = Math.max(...masks.map((m) => m.bbox.y1 - m.bbox.y0));
  if (bw <= 0 || bh <= 0) return;
  const maxW = page.width - 2 * layout.marginX;
  const minTop = Math.round(page.height * layout.dividerLevelMin) + layout.gapBelowDivider;
  const k = Math.min((layout.planWidthTarget * page.width) / bw, maxW / bw, (layout.bottom - minTop) / bh);
  ctx.planScale = k;
  // The divider sits just above the plans (centred in their region), no lower than the default.
  const top = layout.bottom - bh * k;
  ctx.dividerY = Math.round(Math.min(page.height * layout.dividerLevel, Math.max(page.height * layout.dividerLevelMin, top - layout.gapBelowDivider)));
}

/**
 * The full set: one sheet per level (each with a different hero view; the
 * first one carries the facts), then one views sheet. Shares one offscreen
 * WebGL context across the set.
 */
export async function renderSheetSet(house: House | ResolvedHouse, options: SheetSetOptions = {}): Promise<Blob[]> {
  const ctx = new SheetContext(house, options.scale ?? 1);
  try {
    // One drawing scale for all plans of the set.
    await choosePlanScale(ctx, ctx.house.levels.map((l) => l.id));
    const heroes = levelHeroViews(ctx.house);
    const out: Blob[] = [];
    const count = ctx.house.levels.length + 1;
    const done = (png: Blob) => {
      out.push(png);
      options.onSheet?.(out.length - 1, count, png);
    };
    for (const [i, level] of ctx.house.levels.entries()) {
      await breathe();
      const view = heroes[i % heroes.length]!;
      done(await composeSheet(ctx, { kind: 'level', levelId: level.id, view, title: options.title, facts: i === 0 }));
    }
    await breathe();
    done(await composeSheet(ctx, { kind: 'views', views: VIEWS_SHEET_VIEWS, title: options.title, facts: false }));
    return out;
  } finally {
    ctx.dispose();
  }
}
