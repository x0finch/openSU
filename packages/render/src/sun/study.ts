// Sun study: the physical sun for a site, a date and a clock time, in the
// model's bearings (the model may be rotated against true north).
import { physical } from '../style/tokens.js';
import { parseSolarDate, type SolarDate, solarPosition, sunriseSunset, type SunTimes } from './solar.js';

/** Site parameters of the sun study (as the kernel reports them). */
export interface StudySite {
  latitude: number;
  longitude: number;
  /** True north, degrees clockwise from model +Y. */
  northDeg: number;
  /** Local clock offset from UTC, hours (used when there is no `timeZone`). */
  utcOffsetHours: number;
  /** IANA time zone: the clock offset follows the date (daylight saving). */
  timeZone?: string;
}

export interface StudySun {
  /** Sun bearing in model axes (0 = model +Y, clockwise) and elevation used for lighting. */
  azimuthDeg: number;
  elevationDeg: number;
  /** True compass bearing and apparent elevation of the sun. */
  trueAzimuthDeg: number;
  trueElevationDeg: number;
  /** Clock time actually used (clamped to sunrise..sunset). */
  minutes: number;
  times: SunTimes;
  /** Clock offset from UTC used for this date, hours. */
  utcOffsetHours: number;
}

/**
 * Offset of a time zone's clock from UTC (hours) around local noon of a
 * date, from the platform's time-zone data (Intl), so daylight saving time
 * is included. Null when the zone is unknown or Intl has no time zones.
 */
export function zoneOffsetHours(timeZone: string, date: SolarDate): number | null {
  let fmt: Intl.DateTimeFormat;
  try {
    fmt = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' });
  } catch {
    return null;
  }
  const d = parseSolarDate(date);
  const offsetAt = (t: number) => {
    const p: Record<string, number> = {};
    for (const x of fmt.formatToParts(new Date(t))) if (x.type !== 'literal') p[x.type] = Number(x.value);
    return (Date.UTC(p.year!, p.month! - 1, p.day!, p.hour! % 24, p.minute!) - Math.floor(t / 60000) * 60000) / 3600000;
  };
  // Local noon of that date: start from UTC noon and correct once.
  const noonUtc = Date.UTC(d.year, d.month - 1, d.day, 12);
  const first = offsetAt(noonUtc);
  return offsetAt(noonUtc - first * 3600000);
}

/** The clock offset of a site for a date: its time zone's, else its fixed offset. */
export function siteOffsetHours(site: StudySite, date: SolarDate): number {
  return (site.timeZone ? zoneOffsetHours(site.timeZone, date) : null) ?? site.utcOffsetHours;
}

/** Clamps a clock time to the daylight span of the date (polar night: solar noon). */
export function clampToDaylight(times: SunTimes, minutes: number): number {
  if (times.polar === 'day') return Math.min(1439, Math.max(0, minutes));
  if (times.sunrise === null || times.sunset === null) return times.solarNoon;
  return Math.min(times.sunset, Math.max(times.sunrise, minutes));
}

export function studySun(site: StudySite, date: SolarDate, minutes: number): StudySun {
  const utcOffsetHours = siteOffsetHours(site, date);
  const base = { latitude: site.latitude, longitude: site.longitude, utcOffsetHours, date };
  const times = sunriseSunset(base);
  const m = clampToDaylight(times, minutes);
  const p = solarPosition({ ...base, minutes: m });
  return {
    azimuthDeg: (((p.azimuthDeg + site.northDeg) % 360) + 360) % 360,
    elevationDeg: Math.max(physical.minElevationDeg, p.elevationDeg),
    trueAzimuthDeg: p.azimuthDeg,
    trueElevationDeg: p.elevationDeg,
    minutes: m,
    times,
    utcOffsetHours,
  };
}

const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/** Date presets of the sun study for a year (local calendar dates). */
export function datePresets(year: number, today = new Date()): { id: string; label: string; date: string }[] {
  return [
    { id: 'winter', label: 'Winter solstice', date: iso(year, 12, 21) },
    { id: 'spring', label: 'Spring equinox', date: iso(year, 3, 20) },
    { id: 'summer', label: 'Summer solstice', date: iso(year, 6, 21) },
    { id: 'autumn', label: 'Autumn equinox', date: iso(year, 9, 23) },
    { id: 'today', label: 'Today', date: iso(today.getFullYear(), today.getMonth() + 1, today.getDate()) },
  ];
}
