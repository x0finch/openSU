// Lazy chunk: the built-in place list (places-data.ts, ~370 KB gzip) and its
// search. Loaded on first use of the location picker, "use my location" or
// the assistant's find_place tool. No network: everything is in the bundle.
import { ROWS, ZONES } from './places-data';

export interface Place {
  /** Chinese name ('' for most places outside China). */
  zh: string;
  /** English / local name. */
  en: string;
  /** ISO 3166 country code. */
  cc: string;
  regionZh: string;
  regionEn: string;
  lat: number;
  lon: number;
  /** IANA time zone. */
  tz: string;
}

interface Entry extends Place {
  /** Lower-case ASCII forms to match whole: English name, pinyin, initials. */
  keys: string[];
  /** The words of the English name ("new york city" -> new, york, city), matched by prefix. */
  words: string[];
  rank: number;
}

/** Lower case, accents removed, only letters and digits ("Zürich" -> "zurich", "Xi'an" -> "xian"). */
export function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9一-鿿]/g, '');
}

let entries: Entry[] | null = null;

function all(): Entry[] {
  if (entries) return entries;
  entries = ROWS.split('\n').map((line, rank) => {
    const f = line.split('|');
    const en = f[1]!;
    return {
      zh: f[0]!, en, cc: f[4]!, regionZh: f[5]!, regionEn: f[6]!, lat: Number(f[7]), lon: Number(f[8]), tz: ZONES[Number(f[9])]!,
      keys: [fold(en), f[2]!, f[3]!].filter(Boolean),
      words: en.split(/[\s\-'’()/]+/).map(fold).filter((w) => w.length > 1),
      rank,
    };
  });
  return entries;
}

/**
 * Places matching a query in Chinese ("成都", "成"), pinyin ("chengdu",
 * "cd") or English / ASCII ("Berlin", "sao paulo"). Exact names first, then
 * prefixes, then the rest; within a class China first, then larger places.
 */
export function searchPlaces(query: string, limit = 8): Place[] {
  const q = fold(query);
  if (!q) return [];
  const cjk = /[一-鿿]/.test(q);
  const scored: [number, Entry][] = [];
  for (const e of all()) {
    let s = -1;
    if (cjk) {
      const name = e.zh.replace(/(特别行政区|市|地区|盟|县)$/, '');
      if (!e.zh) continue;
      if (name === q || e.zh === q) s = 0;
      else if (e.zh.startsWith(q)) s = 1;
      else if (e.zh.includes(q) || (e.regionZh && `${e.regionZh}${e.zh}`.includes(q))) s = 2;
    } else {
      for (const k of e.keys) {
        if (k === q) s = 0;
        else if (k.startsWith(q) && (s < 0 || s > 1)) s = 1;
      }
      // "york" finds New York City; no matches inside words ("berl" is not Uberlandia).
      if (s < 0 && e.words.some((w) => w.startsWith(q))) s = 2;
    }
    if (s >= 0) scored.push([s, e]);
  }
  scored.sort((a, b) => a[0] - b[0] || a[1].rank - b[1].rank);
  return scored.slice(0, limit).map(([, e]) => strip(e));
}

const strip = ({ keys: _k, words: _w, rank: _r, ...p }: Entry): Place => p;

/** Great-circle distance, km. */
export function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const r = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lon - a.lon) * r) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** The listed place nearest to a point. */
export function nearestPlace(lat: number, lon: number): { place: Place; km: number } {
  let best = all()[0]!;
  let bestKm = Infinity;
  for (const e of all()) {
    const d = distanceKm({ lat, lon }, e);
    if (d < bestKm) {
      best = e;
      bestKm = d;
    }
  }
  return { place: strip(best), km: bestKm };
}

export const PLACE_COUNT = () => all().length;
