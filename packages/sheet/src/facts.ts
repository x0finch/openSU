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
  const place = placeFact(house.site);
  if (place) lines.push(place);
  return lines;
}

/** The default site every template starts with (near Hangzhou, plot north up). */
const DEFAULT_SITE = { latitude: 30.3, longitude: 120.2 };

/**
 * Where the house stands and which way it faces, once the user has set
 * either ("成都 · 朝南偏东 15°"); nothing for the untouched default.
 */
export function placeFact(site: ResolvedHouse['site']): string | null {
  const located = !!site.placeName || site.latitude !== DEFAULT_SITE.latitude || site.longitude !== DEFAULT_SITE.longitude;
  const turned = Math.round(site.northDeg) % 360 !== 0;
  if (!located && !turned) return null;
  const where = located ? site.placeName ?? `${Math.abs(site.latitude).toFixed(2)}°${site.latitude >= 0 ? 'N' : 'S'} ${Math.abs(site.longitude).toFixed(2)}°${site.longitude >= 0 ? 'E' : 'W'}` : null;
  const facing = `朝${facingZh(site.northDeg)}`;
  return where ? `${where} · ${facing}` : facing;
}

/**
 * Compass direction the front of the plot (its south side in model axes,
 * the bottom edge of the plan) faces, in everyday Chinese: 正南, 南偏东 15°.
 */
export function facingZh(northDeg: number): string {
  const b = ((((180 - northDeg) % 360) + 360) % 360);
  const names = ['北', '东', '南', '西'];
  const k = Math.round(b / 90) % 4;
  const d = Math.round(b - k * 90 > 180 ? b - k * 90 - 360 : b - k * 90);
  if (d === 0) return `正${names[k]}`;
  return `${names[k]}偏${names[(k + (d > 0 ? 1 : 3)) % 4]} ${Math.abs(d)}°`;
}
