import { describe, expect, it } from 'vitest';
import { siteOffsetHours, studySun, zoneOffsetHours } from '../src/sun/study';

const near = (a: number, b: number, tol: number) => expect(Math.abs(a - b), `${a} vs ${b}`).toBeLessThan(tol);
const angleNear = (a: number, b: number, tol: number) => near(Math.abs(((a - b + 540) % 360) - 180), 0, tol);

const site = (latitude: number, longitude: number, extra: { northDeg?: number; utcOffsetHours?: number; timeZone?: string } = {}) => ({
  latitude, longitude, northDeg: 0, utcOffsetHours: 8, ...extra,
});
/** The sun at the site's solar noon. */
const atNoon = (s: ReturnType<typeof site>, date: string) => {
  const noon = studySun(s, date, 720).times.solarNoon;
  return studySun(s, date, noon);
};

describe('sun study by place (winter solstice, solar noon)', () => {
  // Coordinates as in the built-in place list (Wikidata, 0.01 deg).
  it('Harbin: about 20.8 deg', () => near(atNoon(site(45.75, 126.63), '2026-12-21').trueElevationDeg, 20.8, 0.2));
  it('near Hangzhou (the default site): about 36.3 deg', () => near(atNoon(site(30.3, 120.2), '2026-12-21').trueElevationDeg, 36.3, 0.2));
  it('Guangzhou: about 43.4 deg', () => near(atNoon(site(23.13, 113.26), '2026-12-21').trueElevationDeg, 43.4, 0.2));
  it('Urumqi on Beijing time: solar noon is around 14:00 clock time', () => {
    const t = studySun(site(43.82, 87.61), '2026-12-21', 720).times.solarNoon;
    near(t, 14 * 60, 20);
  });
});

describe('orientation', () => {
  it('rotating true north by 90 deg rotates the sun (and the shadows) by 90 deg in model axes', () => {
    for (const minutes of [9 * 60, 12 * 60, 15 * 60]) {
      const a = studySun(site(30.3, 120.2), '2026-12-21', minutes);
      const b = studySun(site(30.3, 120.2, { northDeg: 90 }), '2026-12-21', minutes);
      angleNear(b.azimuthDeg - a.azimuthDeg, 90, 1e-9);
      near(b.elevationDeg, a.elevationDeg, 1e-9);
      // The true sun does not move with the plot.
      angleNear(b.trueAzimuthDeg, a.trueAzimuthDeg, 1e-9);
    }
  });
});

describe('time zones (Intl)', () => {
  it('Berlin: UTC+1 in December, UTC+2 in June (daylight saving)', () => {
    expect(zoneOffsetHours('Europe/Berlin', '2026-12-21')).toBe(1);
    expect(zoneOffsetHours('Europe/Berlin', '2026-06-21')).toBe(2);
  });

  it('New York: UTC-5 in December, UTC-4 in June; around the March transition', () => {
    expect(zoneOffsetHours('America/New_York', '2026-12-21')).toBe(-5);
    expect(zoneOffsetHours('America/New_York', '2026-06-21')).toBe(-4);
    // DST starts on the second Sunday of March 2026 (8 March).
    expect(zoneOffsetHours('America/New_York', '2026-03-07')).toBe(-5);
    expect(zoneOffsetHours('America/New_York', '2026-03-09')).toBe(-4);
  });

  it('solar noon in Berlin is about 12:06 in winter and 13:06 in summer (clock time)', () => {
    const berlin = site(52.52, 13.41, { timeZone: 'Europe/Berlin' });
    near(studySun(berlin, '2026-12-21', 720).times.solarNoon, 12 * 60 + 6, 5);
    near(studySun(berlin, '2026-06-21', 720).times.solarNoon, 13 * 60 + 8, 5);
    expect(studySun(berlin, '2026-06-21', 720).utcOffsetHours).toBe(2);
  });

  it('a fixed offset is used when there is no time zone, or the zone is unknown', () => {
    expect(siteOffsetHours(site(30.3, 120.2), '2026-06-21')).toBe(8);
    expect(siteOffsetHours(site(30.3, 120.2, { timeZone: 'Not/AZone' }), '2026-06-21')).toBe(8);
    expect(siteOffsetHours(site(30.3, 120.2, { timeZone: 'Asia/Shanghai', utcOffsetHours: 3 }), '2026-06-21')).toBe(8);
  });

  it('Sydney: summer in December (high sun to the north at noon), winter in June; DST', () => {
    const sydney = site(-33.87, 151.21, { timeZone: 'Australia/Sydney' });
    expect(zoneOffsetHours('Australia/Sydney', '2026-12-21')).toBe(11);
    expect(zoneOffsetHours('Australia/Sydney', '2026-06-21')).toBe(10);
    const dec = atNoon(sydney, '2026-12-21');
    const jun = atNoon(sydney, '2026-06-21');
    near(dec.trueElevationDeg, 90 - 33.87 + 23.44, 0.3);
    near(jun.trueElevationDeg, 90 - 33.87 - 23.44, 0.3);
    angleNear(dec.trueAzimuthDeg, 0, 1);
    angleNear(jun.trueAzimuthDeg, 0, 1);
    // Solar noon on the summer (daylight saving) clock is past 13:00.
    expect(dec.times.solarNoon).toBeGreaterThan(12 * 60 + 50);
  });
});
