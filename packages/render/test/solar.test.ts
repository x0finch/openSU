import { describe, expect, it } from 'vitest';
import { solarPosition, sunriseSunset } from '../src/sun/solar';

const near = (a: number, b: number, tol: number) => expect(Math.abs(a - b), `${a} vs ${b}`).toBeLessThan(tol);
const angleNear = (a: number, b: number, tol: number) => near(Math.abs(((a - b + 540) % 360) - 180), 0, tol);

/** Highest elevation over the day (minute steps) and the azimuth there. */
function noonPeak(lat: number, lon: number, tz: number, date: string) {
  let best = { minutes: 0, azimuthDeg: 0, elevationDeg: -90 };
  for (let m = 0; m < 1440; m++) {
    const p = solarPosition({ latitude: lat, longitude: lon, utcOffsetHours: tz, date, minutes: m });
    if (p.elevationDeg > best.elevationDeg) best = { minutes: m, ...p };
  }
  return best;
}

describe('solarPosition', () => {
  it('matches the NREL SPA reference example (Golden, CO, 2003-10-17 12:30:30 UTC-7)', () => {
    // Reda & Andreas, Solar Position Algorithm for Solar Radiation
    // Applications (NREL/TP-560-34302): zenith 50.11162, azimuth 194.34024.
    const p = solarPosition({ latitude: 39.742476, longitude: -105.1786, utcOffsetHours: -7, date: '2003-10-17', minutes: 12 * 60 + 30.5 });
    near(p.elevationDeg, 90 - 50.11162, 0.5);
    angleNear(p.azimuthDeg, 194.34024, 0.5);
  });

  it('Beijing, summer solstice 2024: noon altitude 90 - lat + 23.44, due south', () => {
    const p = noonPeak(39.9042, 116.4074, 8, '2024-06-21');
    near(p.elevationDeg, 90 - 39.9042 + 23.44, 0.5);
    angleNear(p.azimuthDeg, 180, 0.5);
    // Solar noon in Beijing is about 12:14 local (116.4 E on a 120 E clock, EoT -1.6 min).
    near(p.minutes, 12 * 60 + 16, 3);
  });

  it('Hangzhou (golden sample site), winter solstice 2026: noon altitude 90 - lat - 23.44', () => {
    const p = noonPeak(30.3, 120.2, 8, '2026-12-21');
    near(p.elevationDeg, 90 - 30.3 - 23.44, 0.5);
    angleNear(p.azimuthDeg, 180, 0.5);
  });

  it('Sydney, winter solstice 2024: low noon sun due north', () => {
    const p = noonPeak(-33.8688, 151.2093, 10, '2024-06-21');
    near(p.elevationDeg, 90 - 33.8688 - 23.44, 0.5);
    angleNear(p.azimuthDeg, 0, 0.5);
  });

  it('equator at the March equinox 2024: the sun is overhead at noon', () => {
    const p = noonPeak(0, 0, 0, '2024-03-20');
    near(p.elevationDeg, 89.85, 0.5);
  });

  it('morning sun is east, afternoon sun is west (northern hemisphere)', () => {
    const am = solarPosition({ latitude: 30.3, longitude: 120.2, utcOffsetHours: 8, date: '2026-12-21', minutes: 9 * 60 });
    const pm = solarPosition({ latitude: 30.3, longitude: 120.2, utcOffsetHours: 8, date: '2026-12-21', minutes: 15 * 60 });
    expect(am.azimuthDeg).toBeGreaterThan(110);
    expect(am.azimuthDeg).toBeLessThan(160);
    expect(pm.azimuthDeg).toBeGreaterThan(200);
    expect(pm.azimuthDeg).toBeLessThan(250);
    expect(am.elevationDeg).toBeGreaterThan(10);
    expect(pm.elevationDeg).toBeGreaterThan(10);
  });
});

describe('sunriseSunset', () => {
  const hm = (h: number, m: number) => h * 60 + m;

  it('Beijing, solstices (published almanac times, +-3 min)', () => {
    const summer = sunriseSunset({ latitude: 39.9042, longitude: 116.4074, utcOffsetHours: 8, date: '2024-06-21' });
    near(summer.sunrise!, hm(4, 46), 3);
    near(summer.sunset!, hm(19, 46), 3);
    const winter = sunriseSunset({ latitude: 39.9042, longitude: 116.4074, utcOffsetHours: 8, date: '2024-12-21' });
    near(winter.sunrise!, hm(7, 33), 3);
    near(winter.sunset!, hm(16, 53), 3);
  });

  it('equinox at the equator: about 12 h 7 min of daylight centred on noon', () => {
    const t = sunriseSunset({ latitude: 0, longitude: 0, utcOffsetHours: 0, date: '2024-03-20' });
    near(t.sunset! - t.sunrise!, 727, 3);
    near((t.sunset! + t.sunrise!) / 2, t.solarNoon, 1);
  });

  it('the sun is on the horizon at sunrise and sunset', () => {
    // Geometric centre 0.833 deg below the horizon; NOAA's refraction model
    // gives an apparent elevation of about -0.44 deg there.
    const q = { latitude: 30.3, longitude: 120.2, utcOffsetHours: 8, date: '2026-06-21' };
    const t = sunriseSunset(q);
    near(solarPosition({ ...q, minutes: t.sunrise! }).elevationDeg, -0.44, 0.1);
    near(solarPosition({ ...q, minutes: t.sunset! }).elevationDeg, -0.44, 0.1);
  });

  it('polar night and polar day (Tromso)', () => {
    expect(sunriseSunset({ latitude: 69.65, longitude: 18.96, utcOffsetHours: 1, date: '2024-12-21' }).polar).toBe('night');
    expect(sunriseSunset({ latitude: 69.65, longitude: 18.96, utcOffsetHours: 2, date: '2024-06-21' }).polar).toBe('day');
  });
});
