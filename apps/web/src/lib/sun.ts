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

/**
 * Clock time of a sun-study minute that may fall on the day before or after
 * (sunset after midnight in a northern summer): "次日 00:04" / "00:04 next
 * day". Never "24:04".
 */
export function clock(minutes: number, lang: 'zh' | 'en'): string {
  const m = Math.round(minutes);
  if (m >= 1440) return lang === 'zh' ? `次日 ${hhmm(m - 1440)}` : `${hhmm(m - 1440)} next day`;
  if (m < 0) return lang === 'zh' ? `前日 ${hhmm(m + 1440)}` : `${hhmm(m + 1440)} day before`;
  return hhmm(m);
}

/**
 * Whole hours to label on a lo..hi slider `width` CSS px wide, leaving
 * `endGap` px free next to each end label and at least `minGap` px between
 * two labels (every 1, 2, 3, 4 or 6 h, the first step that fits). Hours
 * past midnight are labelled 0, 1, ...
 */
export function hourTicks(lo: number, hi: number, width = 260, endGap = 44, minGap = 26): number[] {
  const span = Math.max(1, hi - lo);
  const x = (m: number) => ((m - lo) / span) * width;
  for (const step of [1, 2, 3, 4, 6, 12]) {
    if ((step * 60 * width) / span < minGap) continue;
    const out: number[] = [];
    for (let h = Math.ceil(lo / 60); h * 60 <= hi; h++) {
      if (h % step !== 0) continue;
      if (x(h * 60) < endGap || width - x(h * 60) < endGap) continue;
      out.push(h);
    }
    return out;
  }
  return [];
}

/** Compass point (8-wind, Chinese or English) of a bearing in degrees. */
export function compass(deg: number, lang: 'zh' | 'en'): string {
  const zh = ['北', '东北', '东', '东南', '南', '西南', '西', '西北'];
  const en = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const i = Math.round((((deg % 360) + 360) % 360) / 45) % 8;
  return (lang === 'zh' ? zh : en)[i]!;
}
