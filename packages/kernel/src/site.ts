// Site: plot fence with coping, small openings and gates, entrance pier,
// ground surfaces of outdoor spaces.
import type { PartSpec } from './mesh';
import type { Gate } from '@opensu/model';
import {
  COPING, COPING_OUT, FENCE_HOLE, FENCE_THICKNESS, PAVING, PIER_DEPTH, PIER_LENGTH,
} from './constants';
import type { Ctx, Rect } from './context';
import { flat } from './massing';

type Side = 'N' | 'S' | 'E' | 'W';

/** Plan rect of a stretch [a, b] along a side, `d0..d1` measured inwards from the boundary. */
function along(ctx: Ctx, side: Side, a: number, b: number, d0: number, d1: number): Rect {
  const W = ctx.house.site.width, D = ctx.house.site.depth;
  switch (side) {
    case 'S': return [a, d0, b, d1];
    case 'N': return [a, D - d1, b, D - d0];
    case 'W': return [d0, a, d1, b];
    case 'E': return [W - d1, a, W - d0, b];
  }
}

function sideLength(ctx: Ctx, side: Side): number {
  return side === 'N' || side === 'S' ? ctx.house.site.width : ctx.house.site.depth;
}

export function gateRange(ctx: Ctx, g: Gate): [number, number] {
  const len = sideLength(ctx, g.side);
  const lo = g.at === 'center' ? (len - g.width) / 2 : g.at.from === 'start' ? g.at.offset : len - g.at.offset - g.width;
  return [lo, lo + g.width];
}

/** Stretches of each side not occupied by the ground floor of the house. */
function fenceRuns(ctx: Ctx, side: Side): [number, number][] {
  const lv = ctx.levels[0]!;
  const len = sideLength(ctx, side);
  const blocked: [number, number][] = [];
  const { nx, ny } = ctx;
  const n = side === 'N' || side === 'S' ? nx : ny;
  for (let k = 0; k < n; k++) {
    const i = side === 'W' ? 0 : side === 'E' ? nx - 1 : k;
    const j = side === 'S' ? 0 : side === 'N' ? ny - 1 : k;
    const s = lv.owner[i * ny + j];
    // Only cells that actually touch the boundary.
    const edge = side === 'W' ? ctx.xs[0] === 0 : side === 'E' ? ctx.xs[nx] === ctx.house.site.width : side === 'S' ? ctx.ys[0] === 0 : ctx.ys[ny] === ctx.house.site.depth;
    if (!s || s.outdoor || !edge) continue;
    const a = side === 'N' || side === 'S' ? ctx.xs[i]! : ctx.ys[j]!;
    const b = side === 'N' || side === 'S' ? ctx.xs[i + 1]! : ctx.ys[j + 1]!;
    blocked.push([a - 120, b + 120]);
  }
  let runs: [number, number][] = [[0, len]];
  for (const [a, b] of blocked) {
    runs = runs.flatMap(([p, q]) => (b <= p || a >= q ? [[p, q] as [number, number]] : [[p, a] as [number, number], [b, q] as [number, number]].filter(([u, v]) => v - u > 1)));
  }
  return runs;
}

export function buildSite(ctx: Ctx): void {
  const fence = ctx.house.site.fence;
  if (fence) buildFence(ctx, fence.height, fence.gates);
  // Ground surfaces of ground-floor outdoor spaces.
  const paving = { id: 'site:paving', role: 'ground' as const, material: 'paving' as const };
  const gravel = { id: 'site:gravel', role: 'ground' as const, material: 'gravel' as const };
  const lv = ctx.levels[0]!;
  for (const s of lv.level.spaces) {
    if (!s.outdoor) continue;
    const part = s.type === 'garden' ? gravel : paving;
    for (const r of ctx.rects(ctx.cellsOf(0, (o) => o.id === s.id))) {
      ctx.massing.add({ x0: r[0], y0: r[1], x1: r[2], y1: r[3], z0: lv.elev, top: flat(lv.elev + PAVING), part, prio: 5, tag: 'ground' });
    }
  }
}

function buildFence(ctx: Ctx, height: number, gates: Gate[]): void {
  const wall = { id: 'site:fence', role: 'fence' as const, material: 'wall' as const };
  const coping = { id: 'site:fence-coping', role: 'fence' as const, material: 'slab' as const };
  const T = FENCE_THICKNESS;
  const add = (part: PartSpec, r: Rect, z0: number, z1: number, prio: number, tag: string) =>
    ctx.massing.add({ x0: r[0], y0: r[1], x1: r[2], y1: r[3], z0, top: flat(z1), part, prio, tag });
  for (const side of ['S', 'E', 'N', 'W'] as const) {
    const runs = fenceRuns(ctx, side);
    for (const [a, b] of runs) {
      add(wall, along(ctx, side, a, b, 0, T), 0, height, 10, 'fence');
      add(coping, along(ctx, side, a, b, -COPING_OUT, T + COPING_OUT), height, height + COPING, 30, 'fence');
    }
    // Gates cut the fence.
    const gs = gates.filter((g) => g.side === side).map((g) => ({ g, r: gateRange(ctx, g) }));
    for (const { g, r } of gs) {
      const v = along(ctx, side, r[0], r[1], -COPING_OUT - 1, T + COPING_OUT + 1);
      ctx.massing.cut({ x0: v[0], y0: v[1], x1: v[2], y1: v[3], z0: -1, z1: height + COPING + 1, tags: ['fence'] });
      buildGate(ctx, g, side, r[0], r[1], height);
    }
    // A group of three small square openings on the longest open stretch;
    // none on the side opposite the main gate (the neighbour's side).
    const main = [...gates].sort((p, q) => q.width - p.width)[0];
    const opposite = main ? ({ N: 'S', S: 'N', E: 'W', W: 'E' } as const)[main.side] : null;
    const free = runs.flatMap(([p, q]) => {
      let parts: [number, number][] = [[p, q]];
      for (const { r } of gs) parts = parts.flatMap(([u, v]) => (r[1] <= u || r[0] >= v ? [[u, v] as [number, number]] : [[u, r[0]] as [number, number], [r[1], v] as [number, number]].filter(([s, t]) => t - s > 1)));
      return parts;
    });
    const longest = free.reduce<[number, number] | null>((m, r) => (!m || r[1] - r[0] > m[1] - m[0] ? r : m), null);
    if (longest && longest[1] - longest[0] >= 3000 && side !== opposite) {
      const c = Math.min(longest[1] - 1200, Math.max(longest[0] + 1200, longest[0] + 0.75 * (longest[1] - longest[0])));
      for (const k of [-1, 0, 1]) {
        const m = c + k * (FENCE_HOLE + 380);
        const v = along(ctx, side, m - FENCE_HOLE / 2, m + FENCE_HOLE / 2, -1, T + 1);
        ctx.massing.cut({ x0: v[0], y0: v[1], x1: v[2], y1: v[3], z0: 650, z1: 650 + FENCE_HOLE, tags: ['fence'] });
      }
    }
  }
  // Entrance pier with a house-number plate at the start of the widest gate.
  const main = [...gates].sort((p, q) => q.width - p.width)[0];
  if (main) {
    const [lo] = gateRange(ctx, main);
    const pier = { id: 'site:pier', role: 'fence' as const, material: 'wall' as const };
    add(pier, along(ctx, main.side, lo - PIER_LENGTH, lo, 0, PIER_DEPTH), 0, height * 2, 15, 'pier');
    const plate = { id: 'site:plate', role: 'fence' as const, material: 'wood' as const };
    const m = lo - PIER_LENGTH / 2;
    add(plate, along(ctx, main.side, m - 220, m + 220, -30, 0), height * 1.05, height * 1.05 + 160, 40, 'pier');
  }
}

function buildGate(ctx: Ctx, g: Gate, side: Side, lo: number, hi: number, height: number): void {
  const T = FENCE_THICKNESS;
  if ((g.kind ?? 'swing') === 'sliding') {
    const rails = { id: `site:gate:${g.id}`, role: 'gate' as const, material: 'metal' as const };
    const top = height + 250;
    const railR = (z0: number, z1: number) => {
      const r = along(ctx, side, lo, hi, T / 2 - 32, T / 2 + 32);
      ctx.massing.add({ x0: r[0], y0: r[1], x1: r[2], y1: r[3], z0, top: flat(z1), part: rails, prio: 40, tag: 'gate' });
    };
    railR(30, 80);
    railR(top - 40, top);
    for (const [a, b] of [[lo, lo + 60], [hi - 60, hi]] as const) {
      const r = along(ctx, side, a, b, T / 2 - 32, T / 2 + 32);
      ctx.massing.add({ x0: r[0], y0: r[1], x1: r[2], y1: r[3], z0: 30, top: flat(top), part: rails, prio: 40, tag: 'gate' });
    }
    const bars = ctx.parts.get({ id: `site:gate:${g.id}:bars`, role: 'gate', material: 'metal', castsEdges: false });
    const bw = 40, spacing = 95;
    const n = Math.floor((hi - lo - 120) / spacing);
    const off = (hi - lo - n * spacing) / 2;
    for (let k = 0; k <= n; k++) {
      const m = lo + off + k * spacing;
      if (m - bw / 2 < lo + 60 || m + bw / 2 > hi - 60) continue;
      const r = along(ctx, side, m - bw / 2, m + bw / 2, T / 2 - bw / 2, T / 2 + bw / 2);
      bars.box(r[0], r[1], 80, r[2], r[3], top - 40);
    }
  } else {
    const slats = ctx.parts.get({ id: `site:gate:${g.id}`, role: 'gate', material: 'wood' });
    const sw = 60, gap = 45;
    const n = Math.floor((hi - lo + gap) / (sw + gap));
    const off = (hi - lo - (n * (sw + gap) - gap)) / 2;
    for (let k = 0; k < n; k++) {
      const a = lo + off + k * (sw + gap);
      const r = along(ctx, side, a, a + sw, T / 2 - 20, T / 2 + 20);
      slats.box(r[0], r[1], 30, r[2], r[3], height + 150);
    }
  }
}
