// "Grow" transition: the house rises level by level after an edit. The
// viewer sweeps a horizontal clip plane (the same plane the level cutaway
// uses) from a level's floor up past the roof; this module holds only the
// timing, so it is pure and testable.

/** A storey for the grow timing (metres, scene Y up). */
export interface GrowLevel {
  elevation: number;
  top: number;
}

export interface GrowOptions {
  /** Total duration in ms (default 1500). */
  duration?: number;
  /** Index of the first level that grows; lower levels stay whole (default 0). */
  fromLevel?: number;
}

export const GROW_DURATION = 1500;

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/**
 * Height of the clip plane at progress `t` (0..1): the levels from
 * `fromLevel` up each get an equal time slot in which the plane rises from
 * their floor to their top, eased so the sweep settles at every floor line;
 * the last slot runs on to `ceiling` (the roof ridge). Returns `ceiling`
 * at t = 1.
 */
export function growHeight(levels: readonly GrowLevel[], ceiling: number, t: number, fromLevel = 0): number {
  const ls = levels.slice(Math.max(0, Math.min(fromLevel, levels.length - 1)));
  if (!ls.length) return ceiling;
  const k = Math.min(1, Math.max(0, t)) * ls.length;
  const i = Math.min(ls.length - 1, Math.floor(k));
  const lv = ls[i]!;
  const top = i === ls.length - 1 ? Math.max(ceiling, lv.top) : ls[i + 1]!.elevation;
  return lv.elevation + (top - lv.elevation) * easeInOut(k - i);
}
