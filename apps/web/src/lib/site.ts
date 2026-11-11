// Where the house stands and which way it faces: display helpers for the
// site (initial chunk; the place list itself is a lazy chunk, see places/).
import type { House } from '@opensu/model';
import type { Lang } from './i18n';
import type { Place } from './places';

/** The site every template starts with: near Hangzhou, plan-up = north, UTC+8. */
export const DEFAULT_SITE = { latitude: 30.3, longitude: 120.2 } as const;

type Site = House['site'];

/** True while the site still has the default location nobody chose. */
export function isDefaultPlace(site: Site): boolean {
  return !site.placeName && !site.timeZone && site.latitude === DEFAULT_SITE.latitude && site.longitude === DEFAULT_SITE.longitude;
}

const fmtCoord = (v: number, pos: string, neg: string) => `${Math.abs(v).toFixed(2)}°${v >= 0 ? pos : neg}`;

export function coordText(lat: number, lon: number): string {
  return `${fmtCoord(lat, 'N', 'S')} ${fmtCoord(lon, 'E', 'W')}`;
}

/** Short label of the site's place: "成都", "Berlin", "杭州附近（默认）", or coordinates. */
export function placeText(site: Site, lang: Lang): string {
  if (isDefaultPlace(site)) return lang === 'zh' ? '杭州附近（默认）' : 'Near Hangzhou (default)';
  return site.placeName ?? coordText(site.latitude, site.longitude);
}

/** Name of a listed place in the UI language. */
export function placeName(p: Place, lang: Lang): string {
  return lang === 'zh' ? p.zh || p.en : p.en || p.zh;
}

let regionNames: Partial<Record<Lang, Intl.DisplayNames | null>> = {};

/** Country name from the platform (Intl), else the ISO code. */
export function countryName(cc: string, lang: Lang): string {
  if (!(lang in regionNames)) {
    try {
      regionNames = { ...regionNames, [lang]: new Intl.DisplayNames([lang === 'zh' ? 'zh-CN' : 'en'], { type: 'region' }) };
    } catch {
      regionNames = { ...regionNames, [lang]: null };
    }
  }
  try {
    return regionNames[lang]?.of(cc) ?? cc;
  } catch {
    return cc;
  }
}

/** "四川 · 中国", "Bavaria · Germany". */
export function placeRegion(p: Place, lang: Lang): string {
  const region = lang === 'zh' ? p.regionZh || p.regionEn : p.regionEn || p.regionZh;
  return [region, countryName(p.cc, lang)].filter(Boolean).join(' · ');
}

const DIRS: Record<Lang, string[]> = { zh: ['北', '东', '南', '西'], en: ['north', 'east', 'south', 'west'] };

/** Bearing (deg clockwise from true north) the front of the plot faces: its plan-bottom edge. */
export function frontBearing(northDeg: number): number {
  return (((180 - northDeg) % 360) + 360) % 360;
}

/** northDeg that makes the front face a bearing. */
export function northForBearing(bearing: number): number {
  let n = 180 - bearing;
  n = ((((n + 180) % 360) + 360) % 360) - 180;
  return n === -180 ? 180 : n;
}

/**
 * A bearing in compass words: "南（180°）", "南偏东 15°"; "south (180°)",
 * "15° east of south". Plain compass facts: no "正南" / "due south", which
 * read as the ideal orientation even where the sun is in the north.
 */
export function bearingText(bearing: number, lang: Lang): string {
  const b = ((bearing % 360) + 360) % 360;
  const k = Math.round(b / 90) % 4;
  let d = Math.round(b - k * 90);
  if (d > 180) d -= 360;
  const names = DIRS[lang];
  if (d === 0) return lang === 'zh' ? `${names[k]}（${k * 90}°）` : `${names[k]} (${k * 90}°)`;
  const side = names[(k + (d > 0 ? 1 : 3)) % 4];
  return lang === 'zh' ? `${names[k]}偏${side} ${Math.abs(d)}°` : `${Math.abs(d)}° ${side} of ${names[k]}`;
}

/** A bearing in compass words without the degrees of a cardinal point: "南", "南偏东 15°"; "south", "15° east of south". */
export function bearingWords(bearing: number, lang: Lang): string {
  return bearingText(bearing, lang).replace(/[（(]\d+°[）)]$/, '').trim();
}

/** Which way the sunny side lies at a latitude (the noon sun): south north of the tropics, north in the south. */
export function sunnyBearing(latitude: number): number {
  return latitude >= 0 ? 180 : 0;
}

/** UTC offset as "UTC+8", "UTC-4", "UTC+5:30". */
export function utcText(hours: number): string {
  const sign = hours < 0 ? '-' : '+';
  const a = Math.abs(hours);
  const h = Math.floor(a);
  const m = Math.round((a - h) * 60);
  return `UTC${sign}${h}${m ? `:${String(m).padStart(2, '0')}` : ''}`;
}

type PlacesModule = typeof import('./places');
let placesMod: Promise<PlacesModule> | null = null;
/** The place list (lazy chunk). */
export const loadPlaces = () => (placesMod ??= import.meta.env.SSR ? new Promise<PlacesModule>(() => {}) : import('./places'));
