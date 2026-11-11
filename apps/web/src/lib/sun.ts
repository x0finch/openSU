// Sun study helpers for the UI. `@opensu/render/sun` is the renderer's
// solar module only (no three.js), so this stays in the initial chunk.
import { datePresets } from '@opensu/render/sun';
import type { SunDateId } from './store';

/** In the southern hemisphere the seasons swap calendar dates. */
const SOUTH: Partial<Record<SunDateId, SunDateId>> = { winter: 'summer', summer: 'winter', spring: 'autumn', autumn: 'spring' };

/**
 * Local calendar date (YYYY-MM-DD) of a sun study preset, this year. The
 * presets are seasons of the site: "winter" is the winter solstice where
 * the house stands (21 December in the north, 21 June in the south).
 */
export function sunDate(id: SunDateId, latitude = 30, now = new Date()): string {
  const key = latitude < 0 ? (SOUTH[id] ?? id) : id;
  const list = datePresets(now.getFullYear(), now);
  return (list.find((d) => d.id === key) ?? list[0]!).date;
}

/** "12月21日" / "Dec 21" of an ISO date. */
export function dayText(iso: string, lang: 'zh' | 'en'): string {
  const [, m, d] = iso.split('-').map(Number);
  if (lang === 'zh') return `${m}月${d}日`;
  return `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m! - 1]} ${d}`;
}

/** Clock time "HH:MM" from minutes after midnight. */
export function hhmm(minutes: number): string {
  const m = Math.round(minutes);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** Whole hours to label on a sunrise..sunset slider (every 2 h, or 3 h on long days). */
export function hourTicks(sunrise: number, sunset: number): number[] {
  const step = sunset - sunrise > 12 * 60 ? 3 : 2;
  const out: number[] = [];
  for (let h = Math.ceil(sunrise / 60 + 0.25); h * 60 <= sunset - 15; h++) if (h % step === 0) out.push(h);
  return out;
}

/** Compass point (8-wind, Chinese or English) of a bearing in degrees. */
export function compass(deg: number, lang: 'zh' | 'en'): string {
  const zh = ['北', '东北', '东', '东南', '南', '西南', '西', '西北'];
  const en = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const i = Math.round((((deg % 360) + 360) % 360) / 45) % 8;
  return (lang === 'zh' ? zh : en)[i]!;
}
