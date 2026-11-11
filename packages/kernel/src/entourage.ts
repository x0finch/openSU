// Deterministic entourage placement rules (seeded from the house). Explicit
// `entourage` entries in the model replace the rules entirely.
import type { PartSpec } from './mesh';
import type { ResolvedSpace } from '@opensu/model';
import { DECK, GROUND_DECK, OUTDOOR_SLAB_OUT, PAVING } from './constants';
import type { Ctx, Rect } from './context';
import { flat } from './massing';
import { gateRange } from './site';
import type { EntourageKind, EntouragePlacement } from './types';

const MM = 0.001;

function rand(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9) >>> 0;
    s ^= s >>> 13;
    return (s >>> 0) / 4294967296;
  };
}

/** Largest rectangle of grid cells owned by a space. */
function largestRect(ctx: Ctx, li: number, s: ResolvedSpace): Rect | null {
  const own = (i: number, j: number) => ctx.levels[li]!.owner[i * ctx.ny + j]?.id === s.id;
  let best: Rect | null = null;
  let bestA = 0;
  for (let i0 = 0; i0 < ctx.nx; i0++) for (let j0 = 0; j0 < ctx.ny; j0++) {
    if (!own(i0, j0)) continue;
    for (let i1 = i0; i1 < ctx.nx && own(i1, j0); i1++) {
      for (let j1 = j0; j1 < ctx.ny; j1++) {
        let ok = true;
        for (let i = i0; i <= i1 && ok; i++) if (!own(i, j1)) ok = false;
        if (!ok) break;
        const r: Rect = [ctx.xs[i0]!, ctx.ys[j0]!, ctx.xs[i1 + 1]!, ctx.ys[j1 + 1]!];
        const a = (r[2] - r[0]) * (r[3] - r[1]);
        if (a > bestA) { bestA = a; best = r; }
      }
    }
  }
  return best;
}

/**
 * `occupied(level, x, y, r)` tells whether a person of radius r (mm) at a
 * plan point of a level would stand in furniture.
 */
export function placeEntourage(ctx: Ctx, covered: (x: number, y: number) => boolean, occupied: (li: number, x: number, y: number, r: number) => boolean = () => false): EntouragePlacement[] {
  const out: EntouragePlacement[] = [];
  const rnd = rand(ctx.seed);
  // Ground plants keep low foliage inside the fence's inner faces; terrace
  // plants inside the rails.
  const site0 = ctx.house.site;
  const fenceTop = (site0.fence?.height ?? 0) + 300;
  const clipFor = (x: number, y: number, z: number): EntouragePlacement['clip'] => {
    for (const lv of ctx.levels.slice(1)) {
      const s = ctx.spaceAt(lv.index, x, y);
      if (s && s.outdoor && Math.abs(z - lv.elev) < 1000) {
        const r = largestRect(ctx, lv.index, s);
        if (r) return { min: [(r[0] + 60) * MM, (r[1] + 60) * MM], max: [(r[2] - 60) * MM, (r[3] - 60) * MM], below: (lv.elev + 1500) * MM };
      }
    }
    if (!site0.fence) return undefined;
    const t = 260;
    return { min: [t * MM, t * MM], max: [(site0.width - t) * MM, (site0.depth - t) * MM], below: fenceTop * MM };
  };
  const put = (kind: EntourageKind, x: number, y: number, z: number, scale: number, rotation = 0) => {
    const e: EntouragePlacement = { kind, position: [x * MM, y * MM, z * MM], rotation, scale, seed: Math.floor(rnd() * 1e6) };
    if (kind !== 'car' && !kind.startsWith('person')) {
      const c = clipFor(x, y, z);
      if (c) e.clip = c;
    }
    out.push(e);
  };

  const explicit = ctx.house.entourage;
  if (explicit.length) {
    const kinds: Record<string, EntourageKind> = { tree: 'ginkgo', shrub: 'maple-green', bamboo: 'bamboo', car: 'car', person: 'person-walk' };
    const heights: Record<string, number> = { tree: 6.5, shrub: 3, bamboo: 3.5, car: 1, person: 1.7 };
    for (const e of explicit) put(kinds[e.kind]!, e.at[0], e.at[1], 0, heights[e.kind]!, ((e.rotationDeg ?? 0) * Math.PI) / 180);
    return out;
  }

  const site = ctx.house.site;
  const mainSide = site.latitude >= 0 ? 'S' : 'N';
  const gf = ctx.levels[0]!;
  const outdoor = gf.level.spaces.filter((s) => s.outdoor);
  /** True when walls of the level the point stands on (or above) lie between it and a camera in direction (dx, dy). */
  let standLevel = 0;
  const houseInFront = (x: number, y: number, dx: number, dy: number) => {
    for (let t = 1500; t <= 15000; t += 500) {
      const sp = ctx.spaceAt(standLevel, x + dx * t, y + dy * t);
      if (sp && !sp.outdoor) return true;
    }
    return false;
  };
  const surface = (s: ResolvedSpace) => gf.elev + (s.surface === 'deck' ? GROUND_DECK : PAVING);

  // 1. A large tree in the most open courtyard / garden (clear sky above).
  const candidates = outdoor
    .filter((s) => s.type === 'courtyard' || s.type === 'garden')
    .map((s) => ({ s, r: largestRect(ctx, 0, s) }))
    .filter((c): c is { s: ResolvedSpace; r: Rect } => !!c.r && Math.min(c.r[2] - c.r[0], c.r[3] - c.r[1]) >= 2500)
    .sort((a, b) => (b.r[2] - b.r[0]) * (b.r[3] - b.r[1]) - (a.r[2] - a.r[0]) * (a.r[3] - a.r[1]));
  const big = candidates.find((c) => !covered((c.r[0] + c.r[2]) / 2, (c.r[1] + c.r[3]) / 2));
  if (big) {
    // On the court's open (sunny) side, at the corner away from the plot
    // fence: the tree frames the facade from the garden instead of standing
    // against the fence or in front of the windows.
    const r = big.r;
    const fenceDist = (x: number, y: number) => Math.min(x, y, site.width - x, site.depth - y);
    const sunny = ([[r[0], r[1], 1, 1], [r[2], r[1], -1, 1], [r[2], r[3], -1, -1], [r[0], r[3], 1, -1]] as const)
      .filter((c) => (mainSide === 'S' ? c[1] === r[1] : c[1] === r[3]));
    const corner = sunny.reduce((m, c) => (fenceDist(c[0], c[1]) > fenceDist(m[0], m[1]) ? c : m));
    const inset = Math.min(900, 0.3 * Math.min(r[2] - r[0], r[3] - r[1]));
    put('ginkgo', corner[0] + corner[2] * inset, corner[1] + corner[3] * inset, surface(big.s), 7.6);
  }

  // 1b. A small green maple in a garden beside the entrance porch.
  for (const porch of outdoor.filter((o) => o.type === 'porch')) {
    const pc = ctx.cellsOf(0, (o) => o.id === porch.id);
    for (const g of outdoor.filter((o) => o.type === 'garden')) {
      const gc = ctx.cellsOf(0, (o) => o.id === g.id);
      const adjacent = gc.some((k) => pc.some((q) => {
        const i = Math.floor(k / ctx.ny), j = k % ctx.ny, a = Math.floor(q / ctx.ny), b = q % ctx.ny;
        return Math.abs(i - a) + Math.abs(j - b) === 1;
      }));
      const r = adjacent ? largestRect(ctx, 0, g) : null;
      if (!r) continue;
      const cx = (r[0] + r[2]) / 2, cy = (r[1] + r[3]) / 2;
      if (!covered(cx, cy)) put('maple-green', cx, cy, surface(g), 3.4);
    }
  }

  // 2. Strips along the fence (gardens and courtyards up to 2 m deep):
  //    bamboo clumps along the fence, clear of gates, the pier and doors,
  //    except on the main (sunny) side, where low grass keeps the facade
  //    free. Garden strips in front of large glazing get a small maple.
  const touches = (r: Rect, side: string) =>
    side === 'S' ? r[1] <= 0 : side === 'N' ? r[3] >= site.depth : side === 'W' ? r[0] <= 0 : r[2] >= site.width;
  const gates = site.fence?.gates ?? [];
  const mainGate = [...gates].sort((p, q) => q.width - p.width)[0];
  const blockedOn = (side: string): [number, number][] => [
    ...gates.filter((g) => g.side === side).map((g) => { const [lo, hi] = gateRange(ctx, g); return [lo - 700, hi + 700] as [number, number]; }),
    ...(mainGate && mainGate.side === side ? [[gateRange(ctx, mainGate)[0] - 600 - 700, gateRange(ctx, mainGate)[0]] as [number, number]] : []),
  ];
  for (const s of outdoor.filter((o) => o.type === 'garden' || o.type === 'courtyard')) {
    const rects = ctx.rects(ctx.cellsOf(0, (o) => o.id === s.id));
    const front = s.type === 'garden' && gf.level.openings.some((o) => (o.kind === 'sliding-door' || o.width >= 2400) && o.sides.includes(s.id));
    const doorsHere = gf.level.openings.filter((o) => o.kind !== 'window' && o.sides.includes(s.id));
    for (const r of rects) {
      const w = r[2] - r[0], h = r[3] - r[1];
      if (Math.min(w, h) > 2000) continue;
      const alongX = w >= h;
      const lenR = alongX ? w : h;
      const z = surface(s);
      if (front) put('maple-red', alongX ? r[0] + lenR * 0.7 : (r[0] + r[2]) / 2, alongX ? (r[1] + r[3]) / 2 : r[1] + lenR * 0.7, z, 2.9);
      const side = (alongX ? (['S', 'N'] as const) : (['W', 'E'] as const)).find((sd) => touches(r, sd));
      if (side && side !== mainSide && !front) {
        const lo = alongX ? r[0] : r[1];
        let free: [number, number][] = [[lo + 300, lo + lenR - 300]];
        const blocks = [...blockedOn(side), ...doorsHere.map((d) => { const c = alongX ? d.center[0] : d.center[1]; return [c - 1200, c + 1200] as [number, number]; })];
        for (const [b0, b1] of blocks) free = free.flatMap(([u, v]) => (b1 <= u || b0 >= v ? [[u, v] as [number, number]] : [[u, b0] as [number, number], [b1, v] as [number, number]].filter(([p, q]) => q - p >= 900)));
        for (const [u, v] of free) {
          const n = Math.max(1, Math.round((v - u) / 1500));
          for (let k = 0; k < n; k++) {
            const t = u + ((v - u) * (k + 0.5)) / n;
            const inset = 650;
            const x = alongX ? t : side === 'W' ? r[0] + inset : r[2] - inset;
            const y = alongX ? (side === 'S' ? r[1] + inset : r[3] - inset) : t;
            put('bamboo', x, y, z, 3.2 + rnd() * 0.5);
          }
        }
      } else if (s.type === 'garden') {
        const n = Math.max(2, Math.floor(lenR / 900));
        for (let k = 0; k < n; k++) {
          const t = (k + 0.3 + rnd() * 0.4) / n;
          const x = alongX ? r[0] + w * t : r[0] + w * (0.3 + rnd() * 0.4);
          const y = alongX ? r[1] + h * (0.3 + rnd() * 0.4) : r[1] + h * t;
          put('grass', x, y, z, 0.45 + rnd() * 0.15);
        }
      }
    }
  }

  // 3. A small tree in a planter on the largest terrace, in the corner away
  //    from the access door and from the main side; a runner on the deck.
  let terrace: { li: number; s: ResolvedSpace; r: Rect } | null = null;
  for (const lv of ctx.levels.slice(1)) {
    for (const s of lv.level.spaces.filter((o) => o.type === 'terrace')) {
      const r = largestRect(ctx, lv.index, s);
      if (r && (!terrace || (r[2] - r[0]) * (r[3] - r[1]) > (terrace.r[2] - terrace.r[0]) * (terrace.r[3] - terrace.r[1]))) terrace = { li: lv.index, s, r };
    }
  }
  if (terrace) {
    const lv = ctx.levels[terrace.li]!;
    const { r, s } = terrace;
    const door = lv.level.openings.find((o) => o.kind !== 'window' && o.sides.includes(s.id));
    const dc = door?.center ?? [r[0], r[1]];
    const corners: [number, number, number, number][] = [[r[0], r[1], 1, 1], [r[2], r[1], -1, 1], [r[2], r[3], -1, -1], [r[0], r[3], 1, -1]];
    const away = corners
      .filter(([, y]) => (mainSide === 'S' ? y > r[1] : y < r[3]))
      .sort((a, b) => Math.hypot(b[0] - dc[0], b[1] - dc[1]) - Math.hypot(a[0] - dc[0], a[1] - dc[1]))[0]!;
    // Corner on an edge with a rail: keep clear of the kerb; on a wall: of the wall.
    const px = away[0] + away[2] * (away[2] > 0 ? 220 : 100) + away[2] * 500;
    const py = away[1] + away[3] * 100 + away[3] * 400;
    const z = lv.elev + DECK;
    planter(ctx, lv.level.id, px - 500, py - 400, px + 500, py + 400, z);
    put('ginkgo', px, py, z + 380, 2.6);
    const prefer: [number, number] = [(r[0] + r[2]) / 2 - (r[2] - r[0]) * 0.1, (r[1] + r[3]) / 2 - (r[3] - r[1]) * 0.1];
    const cands: [number, number][] = [];
    for (let x = r[0] + 700; x <= r[2] - 600; x += 300) for (let y = r[1] + 600; y <= r[3] - 600; y += 300) {
      if (Math.abs(x - px) < 1100 && Math.abs(y - py) < 1000) continue;
      if (occupied(terrace.li, x, y, 450)) continue;
      cands.push([x, y]);
    }
    standLevel = terrace.li;
    const spot = pickSpot(cands, prefer, z, out, houseInFront);
    standLevel = 0;
    if (spot) put('person-run', spot[0], spot[1], z, 1.72, Math.PI * 0.15);
    void OUTDOOR_SLAB_OUT;
  }

  // 5. A car in each carport, along its long axis, nose to the nearer gate.
  for (const s of outdoor.filter((o) => o.type === 'carport')) {
    const r = largestRect(ctx, 0, s);
    if (!r) continue;
    const alongX = r[2] - r[0] >= r[3] - r[1];
    let cx = (r[0] + r[2]) / 2, cy = (r[1] + r[3]) / 2;
    const gate = site.fence?.gates.find((g) => (alongX ? g.side === 'E' || g.side === 'W' : g.side === 'N' || g.side === 'S'));
    let rot = alongX ? 0 : Math.PI / 2;
    if (gate) {
      const toward = gate.side === 'E' || gate.side === 'N' ? 1 : -1;
      if (alongX) cx += toward * 300; else cy += toward * 300;
      if (toward < 0) rot += Math.PI;
    }
    put('car', cx, cy, gf.elev + PAVING, 1, rot);
  }
  void flat;
  // 4. A person at the main entrance (door onto a porch, else the widest exterior door).
  const doors = gf.level.openings.filter((o) => (o.kind === 'door' || o.kind === 'sliding-door') && o.wall && gf.level.walls.find((w) => w.id === o.wall)?.exterior);
  const spaceOf = (id: string | null) => (id ? gf.level.spaces.find((s) => s.id === id) ?? null : null);
  const entry = doors.find((o) => o.sides.some((id) => spaceOf(id)?.type === 'porch')) ?? [...doors].sort((a, b) => b.width - a.width)[0];
  if (entry) {
    const k = entry.sides.findIndex((id) => !spaceOf(id) || spaceOf(id)!.outdoor);
    const sgn = k === 0 ? -1 : 1;
    const [cx, cy] = entry.center;
    // In the open (never under or cut by a canopy edge), on an outdoor space.
    const cands: [number, number][] = [];
    for (let d = 1300; d <= 4000; d += 200) {
      for (const off of [500, 0, 1000, -500, 1500, -1000]) {
        const x = entry.orient === 'NS' ? cx + sgn * d : cx + off;
        const y = entry.orient === 'NS' ? cy + off : cy + sgn * d;
        const sp = ctx.spaceAt(0, x, y);
        if (!sp || !sp.outdoor || sp.type === 'garden') continue;
        if ([[0, 0], [400, 0], [-400, 0], [0, 400], [0, -400]].some(([a, b]) => covered(x + a!, y + b!))) continue;
        // Clear of parked cars (4.9 x 1.9 m plus a margin).
        if (out.some((e) => e.kind === 'car' && Math.abs(e.position[0] / MM - x) < 2850 && Math.abs(e.position[1] / MM - y) < 1350)) continue;
        if (occupied(0, x, y, 450)) continue;
        cands.push([x, y]);
      }
    }
    const spot = pickSpot(cands, cands[0] ?? [cx, cy], gf.elev + PAVING, out, houseInFront);
    if (spot) put('person-walk', spot[0], spot[1], gf.elev + PAVING, 1.7, entry.orient === 'NS' ? 0 : Math.PI / 2);
  }

  return out;
}

/**
 * Presentation view directions (compass bearing towards the camera, view
 * elevation): the fixed axonometric, eye-level and elevation views. People
 * must not stand inside or behind a tree crown in any of them.
 */
const VIEWS: [number, number][] = [[148, 35], [50, 35], [212, 35], [222, 0], [180, 0]];

/** Rough crown of a placed plant: radius and vertical extent (metres). */
function crown(e: EntouragePlacement): { r: number; z0: number; z1: number } | null {
  const h = e.scale, z = e.position[2];
  switch (e.kind) {
    case 'ginkgo': return { r: 0.36 * h, z0: z + 0.3 * h, z1: z + h };
    case 'maple-red': case 'maple-green': return { r: 0.55 * h, z0: z + 0.35 * h, z1: z + h };
    case 'bamboo': return { r: 0.7, z0: z + 0.2 * h, z1: z + h };
    default: return null;
  }
}

/** True when a person at (x, y, z) mm is inside or hidden behind a crown in some view. */
function hiddenByTree(x: number, y: number, z: number, placed: EntouragePlacement[], houseInFront: (x: number, y: number, dx: number, dy: number) => boolean): boolean {
  const px = x * MM, py = y * MM, pz = z * MM, ph = 1.75;
  for (const e of placed) {
    const c = crown(e);
    if (!c) continue;
    const vx = e.position[0] - px, vy = e.position[1] - py;
    if (Math.hypot(vx, vy) < c.r + 0.5) return true;
    for (const [az, el] of VIEWS) {
      const a = (az * Math.PI) / 180, t = (el * Math.PI) / 180;
      const dx = Math.sin(a), dy = Math.cos(a);
      // Views in which the house already hides the spot do not count.
      if (houseInFront(x, y, dx, dy)) continue;
      const along = vx * dx + vy * dy;
      const perp = Math.abs(vx * dy - vy * dx);
      // Far in front, something else (usually the house) decides visibility.
      if (perp > c.r + 0.4 || along > 2.5 * (c.z1 - e.position[2])) continue;
      // Depth towards the camera and screen height in a parallel view.
      const front = along * Math.cos(t) + ((c.z0 + c.z1) / 2 - (pz + ph / 2)) * Math.sin(t) > 0;
      if (!front) continue;
      const s0 = c.z0 * Math.cos(t) - along * Math.sin(t), s1 = c.z1 * Math.cos(t) - along * Math.sin(t);
      if (s1 > pz * Math.cos(t) && s0 < (pz + ph) * Math.cos(t)) return true;
    }
  }
  return false;
}

/** The candidate nearest to `prefer` where a person stays visible. */
function pickSpot(cands: [number, number][], prefer: [number, number], z: number, placed: EntouragePlacement[], houseInFront: (x: number, y: number, dx: number, dy: number) => boolean): [number, number] | null {
  const ok = cands.filter(([x, y]) => !hiddenByTree(x, y, z, placed, houseInFront));
  const pool = ok.length ? ok : cands;
  return pool.reduce<[number, number] | null>((m, c) => (!m || Math.hypot(c[0] - prefer[0], c[1] - prefer[1]) < Math.hypot(m[0] - prefer[0], m[1] - prefer[1]) ? c : m), null);
}

/** A planter box (thin dark walls, soil fill) in the massing. */
function planter(ctx: Ctx, levelId: string, x0: number, y0: number, x1: number, y1: number, z: number): void {
  const box = { id: `${levelId}:planter`, level: levelId, role: 'planter' as const, material: 'slab' as const };
  const soil = { id: `${levelId}:planter-soil`, level: levelId, role: 'planter' as const, material: 'soil' as const };
  const t = 60, h = 420;
  const add = (part: PartSpec, a: number, b: number, c: number, d: number, top: number, prio: number) =>
    ctx.massing.add({ x0: a, y0: b, x1: c, y1: d, z0: z, top: flat(z + top), part, prio, tag: 'planter' });
  add(box, x0, y0, x1, y0 + t, h, 30);
  add(box, x0, y1 - t, x1, y1, h, 30);
  add(box, x0, y0 + t, x0 + t, y1 - t, h, 30);
  add(box, x1 - t, y0 + t, x1, y1 - t, h, 30);
  add(soil, x0 + t, y0 + t, x1 - t, y1 - t, h - 40, 25);
}
