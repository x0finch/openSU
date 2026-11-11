// Fact lines of the sheet header, derived from the model.
import type { ResolvedHouse } from '@opensu/model';

/** Display labels of the style presets (Chinese is display data). */
export const STYLE_LABELS: Record<string, string> = {
  'modern-pitched': '现代坡顶',
  'modern-flat': '现代平顶',
  'new-chinese': '新中式',
};

/** Metres with at most one decimal, no trailing zero: 12000 -> "12", 12500 -> "12.5". */
export function metres(mm: number): string {
  return String(Math.round(mm / 100) / 10);
}

/**
 * Header facts: plot size (short side first, like "12x15M"), total interior
 * area rounded to m², and the style label when the preset has one.
 */
export function sheetFacts(house: ResolvedHouse): string[] {
  const { width, depth } = house.site;
  const [a, b] = width <= depth ? [width, depth] : [depth, width];
  const lines = [`宅基地：${metres(a)}x${metres(b)}M`, `总面积：${Math.round(house.interiorArea / 1e6)}㎡`];
  const style = STYLE_LABELS[house.style];
  if (style) lines.push(style);
  return lines;
}
