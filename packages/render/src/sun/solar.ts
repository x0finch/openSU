// Solar position (NOAA spreadsheet algorithm, after Meeus). Pure, no
// dependencies, no DOM. Accurate to well under 0.1 deg for dates between
// 1900 and 2100, which is plenty for shadows.

/** A calendar date: `YYYY-MM-DD` or explicit parts. */
export type SolarDate = string | { year: number; month: number; day: number };

export interface SolarInput {
  /** Degrees, north positive. */
  latitude: number;
  /** Degrees, east positive. */
  longitude: number;
  /** Local clock offset from UTC, hours (e.g. 8 for China). */
  utcOffsetHours: number;
  date: SolarDate;
  /** Local clock time in minutes after midnight. */
  minutes: number;
}

export interface SolarPosition {
  /** Compass bearing towards the sun, degrees clockwise from true north. */
  azimuthDeg: number;
  /** Apparent elevation above the horizon (with refraction), degrees. */
  elevationDeg: number;
}

export interface SunTimes {
  /** Local clock minutes after midnight; null when the sun does not rise / set (polar day or night). */
  sunrise: number | null;
  sunset: number | null;
  /** Local clock minutes of solar noon. */
  solarNoon: number;
  /** Set for polar day ('day') or polar night ('night'). */
  polar?: 'day' | 'night';
}

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

export function parseSolarDate(date: SolarDate): { year: number; month: number; day: number } {
  if (typeof date !== 'string') return date;
  const m = /^(-?\d{1,4})-(\d{1,2})-(\d{1,2})$/.exec(date.trim());
  if (!m) throw new Error(`solar: bad date "${date}" (expected YYYY-MM-DD)`);
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

/** Julian day at 0h UTC of a Gregorian calendar date. */
function julianDay0(year: number, month: number, day: number): number {
  let y = year, m = month;
  if (m <= 2) { y -= 1; m += 12; }
  const a = Math.floor(y / 100);
  const b = 2 - a + Math.floor(a / 4);
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + day + b - 1524.5;
}

/** Declination (deg) and equation of time (minutes) at a Julian day. */
function sunCoords(jd: number): { decl: number; eqTime: number } {
  const t = (jd - 2451545) / 36525;
  const l0 = (((280.46646 + t * (36000.76983 + t * 0.0003032)) % 360) + 360) % 360;
  const m = 357.52911 + t * (35999.05029 - 0.0001537 * t);
  const e = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
  const c = Math.sin(m * RAD) * (1.914602 - t * (0.004817 + 0.000014 * t)) + Math.sin(2 * m * RAD) * (0.019993 - 0.000101 * t) + Math.sin(3 * m * RAD) * 0.000289;
  const omega = 125.04 - 1934.136 * t;
  const lambda = l0 + c - 0.00569 - 0.00478 * Math.sin(omega * RAD);
  const eps0 = 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60;
  const eps = eps0 + 0.00256 * Math.cos(omega * RAD);
  const decl = Math.asin(Math.sin(eps * RAD) * Math.sin(lambda * RAD)) * DEG;
  const y = Math.tan((eps / 2) * RAD) ** 2;
  const eqTime = 4 * DEG * (
    y * Math.sin(2 * l0 * RAD) - 2 * e * Math.sin(m * RAD) + 4 * e * y * Math.sin(m * RAD) * Math.cos(2 * l0 * RAD)
    - 0.5 * y * y * Math.sin(4 * l0 * RAD) - 1.25 * e * e * Math.sin(2 * m * RAD)
  );
  return { decl, eqTime };
}

/** Atmospheric refraction (deg) for a true elevation (deg), NOAA approximation. */
function refraction(el: number): number {
  if (el > 85) return 0;
  const te = Math.tan(el * RAD);
  let r: number;
  if (el > 5) r = 58.1 / te - 0.07 / te ** 3 + 0.000086 / te ** 5;
  else if (el > -0.575) r = 1735 + el * (-518.2 + el * (103.4 + el * (-12.79 + el * 0.711)));
  else r = -20.772 / te;
  return r / 3600;
}

function jdOf(input: { utcOffsetHours: number; date: SolarDate }, minutes: number): number {
  const d = parseSolarDate(input.date);
  return julianDay0(d.year, d.month, d.day) + (minutes - input.utcOffsetHours * 60) / 1440;
}

/** Sun azimuth and apparent elevation for a place, local date and clock time. */
export function solarPosition(input: SolarInput): SolarPosition {
  const { latitude, longitude, utcOffsetHours, minutes } = input;
  const { decl, eqTime } = sunCoords(jdOf(input, minutes));
  const tst = minutes + eqTime + 4 * longitude - 60 * utcOffsetHours;
  let ha = tst / 4 - 180;
  ha = ((((ha + 180) % 360) + 360) % 360) - 180;
  const lat = latitude * RAD, dec = decl * RAD, h = ha * RAD;
  const cosZen = Math.min(1, Math.max(-1, Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(h)));
  const elTrue = 90 - Math.acos(cosZen) * DEG;
  const az = Math.atan2(Math.sin(h), Math.cos(h) * Math.sin(lat) - Math.tan(dec) * Math.cos(lat)) * DEG + 180;
  return { azimuthDeg: ((az % 360) + 360) % 360, elevationDeg: elTrue + refraction(elTrue) };
}

/**
 * Sunrise, sunset (upper limb on the horizon with standard refraction,
 * zenith 90.833 deg) and solar noon, in local clock minutes.
 */
export function sunriseSunset(input: Omit<SolarInput, 'minutes'>): SunTimes {
  const { latitude, longitude, utcOffsetHours } = input;
  const noonAt = (guess: number) => 720 - 4 * longitude - sunCoords(jdOf(input, guess)).eqTime + utcOffsetHours * 60;
  let solarNoon = noonAt(720);
  solarNoon = noonAt(solarNoon);
  const event = (rising: boolean): number | 'day' | 'night' => {
    let t = solarNoon;
    for (let i = 0; i < 4; i++) {
      const { decl, eqTime } = sunCoords(jdOf(input, t));
      const lat = latitude * RAD, dec = decl * RAD;
      const cosH = Math.cos(90.833 * RAD) / (Math.cos(lat) * Math.cos(dec)) - Math.tan(lat) * Math.tan(dec);
      if (cosH < -1) return 'day';
      if (cosH > 1) return 'night';
      const ha = Math.acos(cosH) * DEG;
      t = 720 - 4 * (longitude + (rising ? ha : -ha)) - eqTime + utcOffsetHours * 60;
    }
    return t;
  };
  const rise = event(true), set = event(false);
  if (typeof rise !== 'number' || typeof set !== 'number') {
    const polar = rise === 'night' || set === 'night' ? 'night' : 'day';
    return { sunrise: null, sunset: null, solarNoon, polar };
  }
  return { sunrise: rise, sunset: set, solarNoon };
}
