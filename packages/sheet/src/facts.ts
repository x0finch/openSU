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
 * Header facts, worded like the studio's info block: plot size as width x
 * depth ("宅基地：12 × 14 m"), interior floor area ("建筑面积：163.8 m²"), and
 * the style label when the preset has one.
 */
export function sheetFacts(house: ResolvedHouse): string[] {
  const { width, depth } = house.site;
  const area = (Math.round(house.interiorArea / 1e5) / 10).toFixed(1);
  const lines = [`宅基地：${metres(width)} × ${metres(depth)} m`, `建筑面积：${area} m²`];
  const style = STYLE_LABELS[house.style];
  if (style) lines.push(style);
  return lines;
}
