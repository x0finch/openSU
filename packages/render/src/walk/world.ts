// Walk-mode collision in plan: a body (disc of radius r) moves over the
// kernel's walk surfaces (floors, stair ramps) and is stopped by blockers
// (walls minus doorways, windows, rails, fence, furniture) whose height
// range overlaps the body. Pure (no three.js): metres, model axes.
import type { WalkBlocker, WalkData, WalkSurface } from '@opensu/kernel';

export interface WalkPose {
  /** Plan position, metres (model axes: x east, y north). */
  x: number;
  y: number;
  /** Height of the floor under the feet, metres. */
  z: number;
}

export interface WalkWorldOptions {
  radius: number;
  stepUp: number;
  /** Body height range checked against blockers, above the feet. */
  kneeHeight?: number;
  headHeight?: number;
}

const surfaceZ = (s: WalkSurface, x: number, y: number): number => {
  if (!s.ramp) return s.z;
  const v = s.ramp.axis === 'x' ? x : y;
  const span = s.ramp.to - s.ramp.from;
  const t = span === 0 ? 0 : Math.min(1, Math.max(0, (v - s.ramp.from) / span));
  return s.ramp.z0 + (s.ramp.z1 - s.ramp.z0) * t;
};

const inRect = (r: readonly number[], x: number, y: number) => x >= r[0]! - 1e-6 && x <= r[2]! + 1e-6 && y >= r[1]! - 1e-6 && y <= r[3]! + 1e-6;

/** Distance from a point to a rectangle (0 inside). */
const rectDistance = (r: readonly number[], x: number, y: number) => Math.hypot(Math.max(r[0]! - x, 0, x - r[2]!), Math.max(r[1]! - y, 0, y - r[3]!));

export class WalkWorld {
  readonly radius: number;
  readonly stepUp: number;
  private readonly knee: number;
  private readonly head: number;

  constructor(readonly data: WalkData, opts: WalkWorldOptions) {
    this.radius = opts.radius;
    this.stepUp = opts.stepUp;
    this.knee = opts.kneeHeight ?? 0.1;
    this.head = opts.headHeight ?? 1.7;
  }

  /**
   * Floor height under a plan point for someone whose feet are at `z`: the
   * highest surface within a step up or down, or null (no floor there).
   */
  groundAt(x: number, y: number, z: number): number | null {
    let best: number | null = null;
    for (const s of this.data.surfaces) {
      if (!inRect(s.rect, x, y)) continue;
      const h = surfaceZ(s, x, y);
      if (h > z + this.stepUp || h < z - this.stepUp) continue;
      if (best === null || h > best) best = h;
    }
    return best;
  }

  /** Blockers that stop a body standing at height z (feet). */
  private active(b: WalkBlocker, z: number): boolean {
    return b.z1 > z + this.knee && b.z0 < z + this.head;
  }

  /** The blocker a body at (x, y) with feet at z runs into, if any. */
  blockerAt(x: number, y: number, z: number): WalkBlocker | null {
    for (const b of this.data.blockers) {
      if (!this.active(b, z)) continue;
      if (rectDistance(b.rect, x, y) < this.radius - 1e-6) return b;
    }
    return null;
  }

  /** Where a body can stand at (x, y) coming from feet height z, or null. */
  standAt(x: number, y: number, z: number): number | null {
    const g = this.groundAt(x, y, z);
    if (g === null) return null;
    return this.blockerAt(x, y, g) ? null : g;
  }

  /**
   * Moves by (dx, dy), sliding along whatever stops the body. Long moves are
   * split into short sub-steps so nothing thin is tunnelled through.
   */
  move(p: WalkPose, dx: number, dy: number): WalkPose {
    const len = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.ceil(len / (this.radius * 0.4)));
    let cur = { ...p };
    for (let i = 0; i < steps; i++) {
      const sx = dx / steps, sy = dy / steps;
      const full = this.standAt(cur.x + sx, cur.y + sy, cur.z);
      if (full !== null) {
        cur = { x: cur.x + sx, y: cur.y + sy, z: full };
        continue;
      }
      const ax = this.standAt(cur.x + sx, cur.y, cur.z);
      const ay = this.standAt(cur.x, cur.y + sy, cur.z);
      // Slide along the axis that keeps more of the motion.
      if (ax !== null && (ay === null || Math.abs(sx) >= Math.abs(sy))) cur = { x: cur.x + sx, y: cur.y, z: ax };
      else if (ay !== null) cur = { x: cur.x, y: cur.y + sy, z: ay };
      else break;
    }
    return cur;
  }

  /**
   * A valid pose near (x, y) on the level whose floor is at `z` (searching
   * outward in rings), for starting and level jumps.
   */
  settle(x: number, y: number, z: number): WalkPose | null {
    const at = this.standAt(x, y, z);
    if (at !== null) return { x, y, z: at };
    for (let ring = 1; ring <= 30; ring++) {
      const d = ring * 0.1;
      const n = 8 + ring * 2;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2;
        const px = x + Math.cos(a) * d, py = y + Math.sin(a) * d;
        const g = this.standAt(px, py, z);
        if (g !== null) return { x: px, y: py, z: g };
      }
    }
    return null;
  }

  /** Storey a body with feet at z is on (highest level floor at or below z + a margin). */
  levelAt(z: number, levels: readonly { id: string; elevation: number }[]): string | null {
    let id: string | null = null;
    for (const l of levels) if (l.elevation <= z + 0.3) id = l.id;
    return id;
  }
}
