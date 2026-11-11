// Lazy chunk: the model package (schema, resolver, samples).
import { isTemplateId, starterHouse, templateHouse } from '@opensu/agent/starter';
import { golden, resolve, type House, type ResolvedHouse } from '@opensu/model';

export interface LevelInfo {
  id: string;
  name: string;
  index: number;
  isAttic: boolean;
}

export interface Derived {
  resolved: ResolvedHouse;
  plot: { width: number; depth: number };
  /** Interior floor area, m². */
  area: number;
  /** Full storeys (an attic is reported separately). */
  storeys: number;
  attic: boolean;
  levels: LevelInfo[];
}

/** Below this storey height (mm) a top level under a pitched roof reads as an attic. */
const ATTIC_HEIGHT = 2200;

/**
 * The house the studio opens with: our own default design (template T1);
 * `?sample=t2` / `t3` open the other templates. The golden reference house
 * is an internal benchmark, reachable with `?sample=golden`.
 */
export function loadSample(): House {
  const q = typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('sample');
  if (q === 'golden') return golden;
  return isTemplateId(q) ? templateHouse(q) : starterHouse();
}

export function derive(house: House): Derived {
  const resolved = resolve(house);
  const pitchedOn = new Set(house.roofs.filter((r) => r.kind !== 'flat' && r.kind !== 'canopy').map((r) => r.onLevel));
  const levels = house.levels.map((l, index) => ({
    id: l.id,
    name: l.name,
    index,
    isAttic: index === house.levels.length - 1 && index > 0 && pitchedOn.has(l.id) && l.height < ATTIC_HEIGHT,
  }));
  const attic = levels.some((l) => l.isAttic);
  return {
    resolved,
    plot: { width: house.site.width / 1000, depth: house.site.depth / 1000 },
    area: resolved.interiorArea / 1e6,
    storeys: levels.length - (attic ? 1 : 0),
    attic,
    levels,
  };
}
