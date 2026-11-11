// Sun study: the physical sun for a site, a date and a clock time, in the
// model's bearings (the model may be rotated against true north).
import { physical } from '../style/tokens.js';
import { type SolarDate, solarPosition, sunriseSunset, type SunTimes } from './solar.js';

/** Site parameters of the sun study (as the kernel reports them). */
export interface StudySite {
  latitude: number;
  longitude: number;
  /** True north, degrees clockwise from model +Y. */
  northDeg: number;
  /** Local clock offset from UTC, hours. */
  utcOffsetHours: number;
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
}

/** Clamps a clock time to the daylight span of the date (polar night: solar noon). */
export function clampToDaylight(times: SunTimes, minutes: number): number {
  if (times.polar === 'day') return Math.min(1439, Math.max(0, minutes));
  if (times.sunrise === null || times.sunset === null) return times.solarNoon;
  return Math.min(times.sunset, Math.max(times.sunrise, minutes));
}

export function studySun(site: StudySite, date: SolarDate, minutes: number): StudySun {
  const base = { latitude: site.latitude, longitude: site.longitude, utcOffsetHours: site.utcOffsetHours, date };
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
