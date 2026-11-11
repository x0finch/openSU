// renderPlan: ResolvedHouse + level -> presentation floor plan as SVG.
import type { ResolvedHouse } from '@opensu/model';
import { analyseLevel, levelIndexOf, openingCanopy, type LevelPlan } from './analyse';
import { drawDims } from './draw/dims';
import { drawGates, drawOpenings, drawRails, drawSlabEdges, drawWalls } from './draw/building';
import { northArrow, titleBlock } from './draw/decor';
import { placeLabels, type TextBox } from './draw/labels';
import { drawStair } from './draw/stairs';
import { symbol } from './draw/symbols';
import { furnishLevel } from './furnish/index';
import { footprint, type Placement } from './furnish/types';
import { bboxOfPoints, inflate, unionBox, type Rect } from './geom';
import { attrs, f, pathOfRings, rectEl, View } from './svg';
import { color, layout, SCALE, stroke, typography } from './tokens';

export interface PlanOptions {
  /** px per mm (default `SCALE`). */
  scale?: number;
  /** Draw furniture and planting (default true). */
  furniture?: boolean;
  /** Title under the plan (default: level name + "平面图"). */
  title?: string;
  /** Small English line under the title; false to omit. */
  subtitle?: string | false;
  /**
   * Text size relative to the screen plan (default 1). Labels, dimension
   * figures and tiers, title and north arrow grow together (sheets use
   * ~1.6); the zero-overlap rules still hold.
   */
  textScale?: number;
}

export interface PlanReport {
  svg: string;
  width: number;
  height: number;
  /** Every text element's box in px. */
  texts: TextBox[];
  /** Furniture actually drawn (after labels made room). */
  furniture: Placement[];
  /** Door swing boxes, wall rectangles (mm). */
  swings: Rect[];
  walls: Rect[];
  /** Interior spaces that could not get a collision-free label. */
  missingLabels: string[];
  /** px per mm and the mm -> px transform parameters. */
  view: View;
}

const ORDINAL = ['GROUND FLOOR', 'SECOND FLOOR', 'THIRD FLOOR', 'FOURTH FLOOR', 'FIFTH FLOOR'];

function lowerCanopies(house: ResolvedHouse, idx: number): Rect[] {
  if (idx === 0) return [];
  const below = house.levels[idx - 1]!.id;
  const roofs = house.roofs
    .filter((r) => r.kind === ('canopy' as typeof r.kind) && r.onLevel === below && r.rings.length)
    .map((r) => inflate(bboxOfPoints(r.rings.flat()), r.overhang ?? 0));
  // Canopies over doors of the level below.
  const lower = analyseLevel(house, idx - 1);
  const doors = lower.openings.map((o) => openingCanopy(o.op, o.thickness)).filter((r): r is Rect => !!r);
  return [...roofs, ...doors];
}

const SURFACE: Record<string, string> = {
  deck: 'url(#deck)', paving: color.paving, gravel: 'url(#gravel)', lawn: 'url(#lawn)',
};

function groundFill(plan: LevelPlan, type: string, surface?: string): string | null {
  if (surface && SURFACE[surface]) return SURFACE[surface]!;
  switch (type) {
    case 'courtyard': return color.paving;
    case 'porch': return color.pavingLight;
    case 'carport': return null;
    case 'garden': return 'url(#lawn)';
    case 'terrace':
    case 'balcony': return 'url(#deck)';
    default: return plan.index === 0 ? null : color.pavingLight;
  }
}

export function renderPlanDetailed(house: ResolvedHouse, levelId: string, options: PlanOptions = {}): PlanReport {
  const idx = levelIndexOf(house, levelId);
  const plan = analyseLevel(house, idx);
  const s = options.scale ?? SCALE;
  const ty = typography(options.textScale ?? 1);
  const tl = ty.layout;
  const items0 = options.furniture === false ? [] : furnishLevel(plan);
  const own = inflate(plan.extent, 450);
  const canopies = lowerCanopies(house, idx).filter((c) => c.x0 >= own.x0 && c.x1 <= own.x1 && c.y0 >= own.y0 && c.y1 <= own.y1);

  // Extent of the drawing (mm): spaces and walls, the wall thickness, canopies below.
  const ext = unionBox([inflate(plan.extent, 130), ...canopies])!;
  const pad = tl.margin + tl.dimOffset1 + tl.dimTierGap + ty.font.dimSize + 10 * ty.scale;
  const v = new View(s, ext.x0, ext.y1, pad, pad);
  const extPx = v.rect(ext);
  const texts: TextBox[] = [];

  // --- Building parts that other layers need to know about.
  const walls = drawWalls(plan, v);
  const openings = drawOpenings(plan, v);
  let stairSvg = '';
  for (const st of plan.stairs) stairSvg += drawStair(st, v, texts, ty);

  // --- Labels first so furniture can yield; then draw what is left.
  const ownCanopies = plan.openings.map((o) => openingCanopy(o.op, o.thickness)).filter((r): r is Rect => !!r);
  // Labels keep clear of walls and of canopy outlines drawn over the floor.
  const labels = placeLabels(plan, v, items0, openings.swings, texts, [...walls.wallBoxes, ...ownCanopies], ty);
  const items = items0.filter((p) => !labels.removed.has(p.id));
  texts.push(...labels.boxes);

  // --- Dimensions, north arrow, title.
  const dims = drawDims(plan, v, extPx, texts, ty);
  texts.push(...dims.boxes);
  const north = northArrow(tl.margin + tl.northRadius + 6 * ty.scale, tl.margin + tl.northRadius + 14 * ty.scale, house.site.northDeg, texts, ty);
  const levelName = house.levels[idx]!.name;
  const title = options.title ?? `${levelName}平面图`;
  const subtitle = options.subtitle === false ? '' : (options.subtitle ?? `${ORDINAL[idx] ?? `LEVEL ${idx + 1}`} PLAN`);
  const width = Math.ceil(extPx.x1 + pad);
  // Title centred on the drawing's extents (plan plus dimension chains).
  const tb = titleBlock((dims.linesPx.x0 + dims.linesPx.x1) / 2, dims.extentPx.y1 + tl.titleGap, title, subtitle, texts, ty);
  const height = Math.ceil(tb.bottom + tl.margin);

  // --- Assemble, bottom to top.
  const out: string[] = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg"${attrs({ width, height, viewBox: `0 0 ${width} ${height}` })}>`);
  out.push(`<title>${title}</title>`);
  out.push('<defs>'
    + `<filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow${attrs({ dx: 0, dy: layout.furnitureShadowDy, stdDeviation: layout.furnitureShadowBlur, 'flood-color': color.shadow, 'flood-opacity': layout.furnitureShadowOpacity })}/></filter>`
    + `<pattern id="lawn" patternUnits="userSpaceOnUse" width="16" height="16"><rect width="16" height="16" fill="${color.lawn}"/><circle cx="4" cy="5" r="0.7" fill="${color.lawnDot}"/><circle cx="12" cy="13" r="0.7" fill="${color.lawnDot}"/></pattern>`
    + `<pattern id="deck" patternUnits="userSpaceOnUse" width="${f(v.len(600))}" height="${f(v.len(150))}"><rect width="${f(v.len(600))}" height="${f(v.len(150))}" fill="${color.deck}"/><path d="M0,0.25H${f(v.len(600))}" stroke="${color.deckLine}" stroke-width="${stroke.furnitureDetail}"/></pattern>`
    + `<pattern id="gravel" patternUnits="userSpaceOnUse" width="9" height="9"><rect width="9" height="9" fill="${color.gravel}"/><circle cx="2" cy="2.5" r="0.6" fill="${color.gravelDot}"/><circle cx="6.5" cy="6" r="0.5" fill="${color.gravelDot}"/></pattern>`
    + '</defs>');
  out.push(rectEl({ x0: 0, y0: 0, x1: width, y1: height }, { fill: color.page }));

  // Ground and canopies below.
  if (plan.plot) out.push(rectEl(v.rect(plan.plot), { fill: color.ground }));
  for (const c of canopies) out.push(rectEl(v.rect(c), { fill: color.canopyBelow, stroke: color.canopyLine, 'stroke-width': stroke.canopy }));

  // Floors.
  // One path per fill: adjacent rooms of the same tone show no anti-aliasing
  // seam. Outdoor ground first, then the outlines of door canopies (overhead:
  // only the part outside the house shows), then the room floors.
  const fills = (outdoor: boolean) => {
    const byFill = new Map<string, string>();
    for (const sp of plan.spaces) {
      if (sp.outdoor !== outdoor) continue;
      const fill = sp.outdoor ? groundFill(plan, sp.type, sp.surface) : (sp.type === 'bathroom' || sp.type === 'laundry' ? color.floorWet : color.floor);
      if (!fill) continue;
      byFill.set(fill, (byFill.get(fill) ?? '') + pathOfRings(sp.rings, v));
    }
    for (const [fill, d] of byFill) out.push(`<path${attrs({ d, fill })}/>`);
  };
  fills(true);
  for (const c of ownCanopies) out.push(rectEl(v.rect(c), { fill: 'none', stroke: color.canopyLine, 'stroke-width': stroke.canopy }));
  fills(false);
  out.push(drawSlabEdges(plan, v));

  // Furniture: floor layer, then pieces, then counter tops; soft shadow on each group.
  const sym = (p: Placement) => symbol(p, v.x(p.x), v.y(p.y), s);
  const floorItems = items.filter((p) => p.layer === 'floor');
  const pieces = items.filter((p) => p.layer === 'furniture');
  const tops = items.filter((p) => p.layer === 'top');
  const plants = items.filter((p) => p.layer === 'plant');
  if (floorItems.length) out.push(`<g filter="url(#soft)">${floorItems.map(sym).join('')}</g>`);
  if (plants.length) out.push(`<g filter="url(#soft)">${plants.map(sym).join('')}</g>`);
  if (pieces.length) out.push(`<g filter="url(#soft)">${pieces.map(sym).join('')}</g>`);
  if (tops.length) out.push(`<g>${tops.map(sym).join('')}</g>`);

  out.push(`<g>${stairSvg}</g>`);
  out.push(drawRails(plan, v));
  out.push(walls.fence);
  out.push(walls.poche);
  out.push(openings.below);
  out.push(walls.outline);
  out.push(drawGates(plan, v));
  out.push(openings.above);
  out.push(`<g>${labels.svg}</g>`);
  out.push(`<g>${dims.svg}</g>`);
  out.push(north);
  out.push(tb.svg);
  out.push('</svg>');

  return {
    svg: out.join(''), width, height, texts, furniture: items,
    swings: openings.swings, walls: walls.wallBoxes, missingLabels: labels.missing, view: v,
  };
}

export function renderPlan(house: ResolvedHouse, levelId: string, options: PlanOptions = {}): string {
  return renderPlanDetailed(house, levelId, options).svg;
}

export { footprint };
