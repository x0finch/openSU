import { describe, expect, it } from 'vitest';
import { golden, resolve } from '@opensu/model';
import { buildHouse } from '@opensu/kernel';
import { WalkWorld, type WalkPose } from '../src/walk/world';

const geo = buildHouse(resolve(golden));
const world = new WalkWorld(geo.walk, { radius: 0.25, stepUp: 0.45 });
const levels = geo.levels;

/** Walks in small steps towards a bearing (degrees, 0 = north). */
function walk(p: WalkPose, bearingDeg: number, metres: number): WalkPose {
  const a = (bearingDeg * Math.PI) / 180;
  let cur = p;
  for (let d = 0; d < metres; d += 0.05) cur = world.move(cur, Math.sin(a) * 0.05, Math.cos(a) * 0.05);
  return cur;
}

const start = (): WalkPose => {
  const s = geo.walk.start;
  const p = world.settle(s.position[0], s.position[1], 0);
  expect(p).not.toBeNull();
  return p!;
};

describe('walk world (golden sample)', () => {
  it('starts inside the main entrance, in the living room, facing south', () => {
    const s = geo.walk.start;
    expect(s.level).toBe('L1');
    expect(s.headingDeg).toBe(180);
    // Living room: x 9.1-13.8, y 1.8-6.9.
    expect(s.position[0]).toBeGreaterThan(9.1);
    expect(s.position[0]).toBeLessThan(13.8);
    expect(s.position[1]).toBeGreaterThan(1.8);
    expect(s.position[1]).toBeLessThan(6.9);
  });

  it('walking forward changes the position', () => {
    const p = start();
    const q = walk(p, 270, 1);
    expect(Math.hypot(q.x - p.x, q.y - p.y)).toBeGreaterThan(0.9);
  });

  it('a wall stops the body', () => {
    // Living room, walking east into the exterior wall at x = 13.8.
    const p = world.settle(12.5, 4.5, 0)!;
    const q = walk(p, 90, 4);
    expect(q.x).toBeLessThan(13.8 - 0.12 - 0.24);
    expect(q.x).toBeGreaterThan(13.0);
  });

  it('a window stops the body (south glazing of the dining room)', () => {
    const p = world.settle(7.3, 3.0, 0)!;
    const q = walk(p, 180, 4);
    expect(q.y).toBeGreaterThan(1.8);
  });

  it('a door lets the body through (living room -> porch through the main entrance)', () => {
    const s = geo.walk.start;
    const p = world.settle(s.position[0], s.position[1], 0)!;
    const q = walk(p, 0, 3);
    // North wall of the living room is on y = 6.9.
    expect(q.y).toBeGreaterThan(7.2);
  });

  it('climbs the stair to level 2 and on to the attic', () => {
    // Hall north of the stairwell, east half (first flight climbs south).
    let p = world.settle(4.9, 5.8, 0)!;
    p = walk(p, 180, 3.0); // up the first flight to the landing
    expect(p.z).toBeGreaterThan(1.2);
    p = walk(p, 270, 1.1); // across the landing to the second flight
    p = walk(p, 0, 4.0); // up the second flight onto level 2
    expect(world.levelAt(p.z, levels)).toBe('L2');
    expect(p.z).toBeCloseTo(levels[1]!.elevation, 2);
    // Level 2: back into the east half and up again to the attic.
    p = walk(p, 90, 1.1);
    p = walk(p, 180, 4.0);
    p = walk(p, 270, 1.1);
    p = walk(p, 0, 4.0);
    expect(world.levelAt(p.z, levels)).toBe('L3');
  });

  it('clearance measures open floor and openHeading turns away from a close wall', () => {
    const p = start();
    // Walk west until a wall stops the body: little room ahead, more behind.
    const atWall = walk(p, 270, 8);
    expect(world.clearance(atWall, 270)).toBeLessThan(1);
    expect(world.clearance(atWall, 90)).toBeGreaterThan(1.5);
    const h = world.openHeading(atWall, 270);
    expect(world.clearance(atWall, h)).toBeGreaterThan(1.5);
    // With open floor ahead the preferred bearing is kept.
    expect(world.openHeading(atWall, 90, 1.5)).toBe(90);
  });

  it('tells a room from the roof terrace (roof boards read as ceiling indoors only)', () => {
    expect(world.enclosed(start())).toBe(true);
    const l3 = levels.find((l) => l.id === 'L3')!;
    const terrace = world.settle(13.3, 2.2, l3.elevation);
    expect(terrace).not.toBeNull();
    expect(world.enclosed(terrace!)).toBe(false);
  });
});
