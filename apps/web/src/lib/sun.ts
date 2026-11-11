// Sun study helpers for the UI. `@opensu/render/sun` is the renderer's
// solar module only (no three.js), so this stays in the initial chunk.
import { datePresets } from '@opensu/render/sun';
import type { SunDateId } from './store';

/** Local calendar date (YYYY-MM-DD) of a sun study preset, this year. */
export function sunDate(id: SunDateId, now = new Date()): string {
  const p = datePresets(now.getFullYear(), now).find((d) => d.id === id);
  return p?.date ?? datePresets(now.getFullYear(), now)[0]!.date;
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
