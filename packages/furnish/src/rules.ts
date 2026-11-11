// Rule-based furniture by space type and size. Deterministic: candidates are
// tried in a fixed order and the first that fits wins.
import type { Side } from '@opensu/model';
import type { SpaceInfo } from './analyse';
import { center, contains, height, overlaps, width, type Rect } from './geom';
import {
  depthFrom, frontOf, isPerp, opposite, rankSides, sideLength, type Group, type LocalItem, type Room,
} from './engine';

const sideScore = (room: Room, s: Side, need: 'solid' | 'low') => {
  const st = room.sideStats(s, need);
  return st.longest - (st.door ? 2500 : 0) - (st.tall ? 1500 : 0);
};

// ---------------------------------------------------------------------------
// Bedroom

function bedGroup(bedW: number, nightstands: boolean, rug: boolean): Group {
  const ns = nightstands ? 450 : 0;
  const gap = nightstands ? 40 : 0;
  const W = bedW + 2 * (ns + gap);
  const items: LocalItem[] = [{ kind: 'bed', u: ns + gap, v: 0, w: bedW, d: 2000, priority: 9, variant: bedW >= 1500 ? 'double' : 'single' }];
  if (nightstands) {
    items.push({ kind: 'nightstand', u: 0, v: 0, w: ns, d: 420, priority: 3 });
    items.push({ kind: 'nightstand', u: W - ns, v: 0, w: ns, d: 420, priority: 3 });
  }
  if (rug) items.unshift({ kind: 'rug', u: ns + gap - 400, v: 900, w: bedW + 800, d: 1500, layer: 'floor', priority: 1 });
  return { items, W, D: 2000, clear: 600, back: 'low', backLo: ns + gap, backHi: ns + gap + bedW };
}

function bedroom(room: Room): void {
  const { sp, R } = room;
  const master = /master/i.test(sp.nameEn ?? '') || sp.area >= 15e6;
  const sizes = master ? [1800, 1500] : [1500, 1350, 1200];
  const sides = rankSides((s) => sideScore(room, s, 'solid') - (room.sideStats(s, 'low').window ? 900 : 0) + (sideLength(R, s) >= 3000 ? 300 : 0));
  let bedSide: Side | null = null;
  outer: for (const bw of sizes) {
    for (const [ns, rug] of [[true, true], [true, false], [false, false]] as const) {
      bedSide = room.place(bedGroup(bw, ns, rug), sides, 'center');
      if (bedSide) break outer;
    }
  }
  // Wardrobe on a solid wall, preferring a side wall, tucked into a corner.
  const wSides = rankSides((s) => {
    const st = room.sideStats(s, 'solid');
    return st.longest + (bedSide && isPerp(s, bedSide) ? 800 : 0) - (bedSide === s ? 5000 : 0);
  });
  for (const len of [2400, 2000, 1800, 1500, 1200]) {
    const g: Group = { items: [{ kind: 'wardrobe', u: 0, v: 0, w: len, d: 600, priority: 6 }], W: len, D: 600, clear: 650, back: 'solid' };
    if (room.place(g, wSides, ['end', 'start'])) break;
  }
}

// ---------------------------------------------------------------------------
// Living / family

interface LoungeSpec { sofaW: number; chairs: boolean; chairW: number; gap: number; tableW: number; toTable: number }

/**
 * Sofa group facing a TV unit on a solid wall: the TV against the wall, the
 * coffee table, the sofa facing the TV, armchairs either side of the table
 * facing each other, and a rug under the table sized to the group. Group
 * frame: u along the TV wall, v away from it.
 */
function tvLounge(o: LoungeSpec): Group {
  const tvW = Math.min(1800, o.sofaW);
  const chairsW = o.chairs ? o.tableW + 2 * (o.gap + o.chairW) : 0;
  const W = Math.max(o.sofaW, chairsW, tvW);
  const c = W / 2;
  const tableV = 420 + o.toTable;
  const sofaV = tableV + 600 + 420;
  const items: LocalItem[] = [
    { kind: 'tv-unit', u: c - tvW / 2, v: 0, w: tvW, d: 420, priority: 6 },
    { kind: 'coffee-table', u: c - o.tableW / 2, v: tableV, w: o.tableW, d: 600, priority: 4 },
    { kind: 'sofa', u: c - o.sofaW / 2, v: sofaV, w: o.sofaW, d: 880, turn: 'back', priority: 9, variant: o.sofaW >= 2200 ? '3' : '2' },
  ];
  let rugHalf = o.tableW / 2 + 450;
  if (o.chairs) {
    const off = o.tableW / 2 + o.gap;
    const cv = tableV + 300 - o.chairW / 2;
    items.push({ kind: 'armchair', u: c - off - o.chairW, v: cv, w: o.chairW, d: o.chairW, turn: 'u+', priority: 3 });
    items.push({ kind: 'armchair', u: c + off, v: cv, w: o.chairW, d: o.chairW, turn: 'u-', priority: 3 });
    rugHalf = off + o.chairW * 0.45;
  }
  rugHalf = Math.max(rugHalf, o.sofaW / 2 - 100);
  items.unshift({ kind: 'rug', u: c - rugHalf, v: tableV - 380, w: 2 * rugHalf, d: sofaV + 300 - (tableV - 380), layer: 'floor', priority: 1 });
  return { items, W, D: sofaV + 880, clear: 0, back: 'solid', backLo: c - tvW / 2, backHi: c + tvW / 2 };
}

function livingRoom(room: Room, compact: boolean): void {
  // TV wall: a long solid wall, preferably without a door or tall glazing,
  // with enough depth in front of it for the whole group.
  const sides = rankSides((s) => {
    const st = room.sideStats(s, 'solid');
    return st.longest - (st.door ? 2000 : 0) - (st.tall ? 800 : 0) + Math.min(depthFrom(room.R, s), 5000) / 5;
  });
  const specs: LoungeSpec[] = compact
    ? [
      { sofaW: 2100, chairs: true, chairW: 700, gap: 250, tableW: 1000, toTable: 800 },
      { sofaW: 2100, chairs: false, chairW: 0, gap: 0, tableW: 1000, toTable: 800 },
      { sofaW: 1800, chairs: false, chairW: 0, gap: 0, tableW: 900, toTable: 700 },
    ]
    : [
      { sofaW: 2400, chairs: true, chairW: 820, gap: 350, tableW: 1200, toTable: 900 },
      { sofaW: 2400, chairs: true, chairW: 760, gap: 300, tableW: 1100, toTable: 850 },
      { sofaW: 2200, chairs: true, chairW: 700, gap: 250, tableW: 1000, toTable: 800 },
      { sofaW: 2200, chairs: false, chairW: 0, gap: 0, tableW: 1100, toTable: 800 },
      { sofaW: 1800, chairs: false, chairW: 0, gap: 0, tableW: 900, toTable: 700 },
    ];
  for (const sp of specs) if (room.place(tvLounge(sp), sides, 'center')) return;
  // No TV wall with room in front of it (open plans, glazed rooms): a
  // free-standing sofa group, facing the sunny glazing first.
  const facings = rankSides((s) => (room.sideStats(s, 'any').tall ? 2 : 0) + (s === 'S' ? 1 : 0));
  for (const sp of specs) for (const f of facings) if (freeLounge(room, sp, f)) return;
  for (const f of facings) if (freeLounge(room, { sofaW: 1800, chairs: false, chairW: 0, gap: 0, tableW: 900, toTable: 400 }, f, 150)) return;
}

const VEC: Record<Side, [number, number]> = { N: [0, 1], S: [0, -1], E: [1, 0], W: [-1, 0] };
const sideOfVec = (x: number, y: number): Side => (Math.abs(x) > Math.abs(y) ? (x > 0 ? 'E' : 'W') : y > 0 ? 'N' : 'S');

/** A free-standing sofa group: sofa facing `facing`, coffee table in front, armchairs either side. */
function freeLounge(room: Room, o: LoungeSpec, facing: Side, clearance = 300): boolean {
  const [fx, fy] = VEC[facing];
  const [sx, sy] = [fy, -fx];
  const at = (fwd: number, lat: number) => ({ dx: fx * fwd + sx * lat, dy: fy * fwd + sy * lat });
  const tableF = 440 + Math.max(350, o.toTable - 400) + 300;
  const items: Parameters<Room['placeFree']>[0] = [
    { kind: 'sofa', ...at(0, 0), w: o.sofaW, d: 880, facing, priority: 9, variant: o.sofaW >= 2200 ? '3' : '2' },
    { kind: 'coffee-table', ...at(tableF, 0), w: o.tableW, d: 600, facing, priority: 4 },
  ];
  let rugHalf = Math.max(o.tableW / 2 + 450, o.sofaW / 2 - 100);
  if (o.chairs) {
    const lat = o.tableW / 2 + o.gap + o.chairW / 2;
    items.push({ kind: 'armchair', ...at(tableF, lat), w: o.chairW, d: o.chairW, facing: sideOfVec(-sx, -sy), priority: 3 });
    items.push({ kind: 'armchair', ...at(tableF, -lat), w: o.chairW, d: o.chairW, facing: sideOfVec(sx, sy), priority: 3 });
    rugHalf = Math.max(rugHalf, lat + o.chairW * 0.05);
  }
  const rugF0 = 200, rugF1 = tableF + 300 + 450;
  const rugAt = at((rugF0 + rugF1) / 2, 0);
  items.unshift({ kind: 'rug', ...rugAt, w: 2 * rugHalf, d: rugF1 - rugF0, facing, layer: 'floor', priority: 1 });
  const c = center(room.R);
  // Centre the group (sofa plus table) on the room.
  const prefer: [number, number] = [c[0] - fx * tableF / 2, c[1] - fy * tableF / 2];
  return room.placeFree(items, clearance, prefer);
}

// ---------------------------------------------------------------------------
// Halls

/** A ground-floor hall with a front door (an exterior door at least 900 wide). */
export function isEntryHall(plan: Room['plan'], id: string): boolean {
  return plan.index === 0 && plan.byId.get(id)?.type === 'hall' && plan.openings.some((o) => o.op.kind === 'door' && o.op.width >= 900 && o.op.sides.includes(id)
    && o.op.sides.some((x) => x !== id && (x === null || plan.byId.get(x)?.outdoor)));
}

/**
 * Entry halls get a shoe cabinet beside the front door and a plant; other
 * halls big enough to sit in get a console and a plant. Corridors stay empty.
 */
function hall(room: Room): void {
  const { sp, R } = room;
  const short = Math.min(width(R), height(R));
  const entry = isEntryHall(room.plan, sp.id);
  if (!entry && short < 2200) return;
  const sides = rankSides((s) => room.sideStats(s, 'solid').longest - (room.sideStats(s, 'solid').door ? 600 : 0));
  const cab = entry ? [1500, 1200, 900] : [1200, 900];
  for (const len of cab) {
    const g: Group = { items: [{ kind: entry ? 'shelves' : 'side-table', u: 0, v: 0, w: len, d: entry ? 380 : 400, priority: 6 }], W: len, D: entry ? 380 : 400, clear: 700, back: 'solid' };
    if (room.place(g, sides, ['start', 'end', 'center'])) break;
  }
  if (short >= 1500) cornerPlant(room, R, Math.min(600, short * 0.3), 'pot-plant');
}

// ---------------------------------------------------------------------------
// Dining

function diningRoom(room: Room): void {
  const { R } = room;
  const w = width(R), h = height(R);
  const c = center(R);
  const short = Math.min(w, h);
  if (short >= 2900) {
    const dia = short >= 3300 ? 1300 : 1100;
    const n = dia >= 1300 ? 8 : 6;
    const items: Parameters<Room['placeFree']>[0] = [{ kind: 'dining-table-round', dx: 0, dy: 0, w: dia, d: dia, facing: 'S', priority: 9, variant: String(n) }];
    const r = dia / 2 + 160;
    for (let k = 0; k < n; k++) {
      const a = (k + 0.5) * (2 * Math.PI / n);
      items.push({ kind: 'chair', dx: Math.cos(a) * r, dy: Math.sin(a) * r, w: 440, d: 440, facing: 'S', priority: 7, variant: `rot:${90 - (a * 180) / Math.PI}` });
    }
    if (room.placeFree(items, 250, c)) return;
  }
  const long = Math.max(w, h);
  const alongX = w >= h;
  for (const [tl, tw, per] of [[1800, 900, 3], [1600, 900, 2], [1200, 800, 2]] as const) {
    if (tl + 1100 > long) continue;
    const items: Parameters<Room['placeFree']>[0] = [];
    const facingA: Side = alongX ? 'S' : 'W';
    items.push({ kind: 'dining-table', dx: 0, dy: 0, w: tl, d: tw, facing: facingA, priority: 9 });
    for (let k = 0; k < per; k++) {
      const t = (k - (per - 1) / 2) * (tl / per);
      const off = tw / 2 + 230;
      if (alongX) {
        items.push({ kind: 'chair', dx: t, dy: off, w: 440, d: 440, facing: 'S', priority: 7 });
        items.push({ kind: 'chair', dx: t, dy: -off, w: 440, d: 440, facing: 'N', priority: 7 });
      } else {
        items.push({ kind: 'chair', dx: off, dy: t, w: 440, d: 440, facing: 'W', priority: 7 });
        items.push({ kind: 'chair', dx: -off, dy: t, w: 440, d: 440, facing: 'E', priority: 7 });
      }
    }
    if (room.placeFree(items, 300, c)) return;
  }
}

// ---------------------------------------------------------------------------
// Kitchen

function kitchen(room: Room): void {
  const { R } = room;
  // Primary run: longest stretch where a counter may stand; prefer windows (sink).
  type Cand = { side: Side; lo: number; hi: number; win: boolean };
  const cands: Cand[] = [];
  for (const side of ['N', 'E', 'S', 'W'] as Side[]) {
    for (const [lo, hi] of room.intervals(side, 'low')) {
      if (hi - lo < 1200) continue;
      const win = room.profile[side].some((s) => s.kind === 'window-low' && s.lo >= lo - 1 && s.hi <= hi + 1);
      cands.push({ side, lo, hi, win });
    }
  }
  cands.sort((a, b) => (b.hi - b.lo + (b.win ? 600 : 0)) - (a.hi - a.lo + (a.win ? 600 : 0)));
  let primary: Cand | null = null;
  let run: [number, number] | null = null;
  for (const c of cands) {
    // Shrink from the ends until the run clears door swings.
    for (let cut = 0; cut <= c.hi - c.lo - 1200; cut += 100) {
      for (const [a, b] of [[c.lo, c.hi - cut], [c.lo + cut, c.hi], [c.lo + cut / 2, c.hi - cut / 2]] as const) {
        const len = Math.min(b - a, 4200);
        const g: Group = { items: [{ kind: 'counter', u: 0, v: 0, w: len, d: 600, priority: 9 }], W: len, D: 600, clear: 900, back: 'low' };
        if (room.tryGroup(g, c.side, a)) { primary = c; run = [a, a + len]; break; }
      }
      if (primary) break;
    }
    if (primary) break;
  }
  if (!primary || !run) return;
  const front = frontOf(primary.side);
  const alongX = primary.side === 'N' || primary.side === 'S';
  // Sink under a window when there is one, hob towards the other end.
  const win = room.profile[primary.side].find((s) => s.kind === 'window-low' && s.hi > run![0] + 400 && s.lo < run![1] - 400);
  const runLen = run[1] - run[0];
  let sinkC = win ? Math.min(Math.max((win.lo + win.hi) / 2, run[0] + 450), run[1] - 450) : run[0] + runLen * 0.3;
  let hobC = sinkC - run[0] > runLen / 2 ? run[0] + Math.max(450, (sinkC - run[0]) * 0.35) : run[1] - Math.max(450, (run[1] - sinkC) * 0.35);
  if (Math.abs(hobC - sinkC) < 900 && runLen < 1900) hobC = NaN;
  const putTop = (kind: 'sink' | 'hob', cAlong: number, w: number, d: number) => {
    const v = 300; // centre depth from the wall
    const [x, y] = alongX
      ? [cAlong, primary!.side === 'S' ? R.y0 + v : R.y1 - v]
      : [primary!.side === 'W' ? R.x0 + v : R.x1 - v, cAlong];
    room.add({ kind, x, y, w, d, facing: front, layer: 'top', priority: 8, ...(kind === 'sink' && runLen >= 2400 ? { variant: 'double' } : {}) });
  };
  putTop('sink', sinkC, runLen >= 2400 ? 820 : 560, 440);
  if (Number.isFinite(hobC)) putTop('hob', hobC, 700, 460);
  // Runs along the adjacent walls (L or U), starting at the corners.
  const perpSides = (['N', 'E', 'S', 'W'] as Side[]).filter((x) => isPerp(x, primary!.side))
    .sort((p, q) => Number(room.sideStats(q, 'low').window) - Number(room.sideStats(p, 'low').window));
  const maxRuns = sideLength(R, primary.side) >= 2 * 600 + 1100 ? 2 : 1;
  let extra = 0;
  for (const side of perpSides) {
    if (extra >= maxRuns) break;
    const [lo, hi] = room.range(side);
    const startNearPrimary = primary.side === 'S' || primary.side === 'W';
    const from = startNearPrimary ? lo + 600 : lo;
    const to = startNearPrimary ? hi : hi - 600;
    for (let len = Math.min(to - from, 2400); len >= 900; len -= 100) {
      const u0 = startNearPrimary ? from : to - len;
      const g: Group = { items: [{ kind: 'counter', u: 0, v: 0, w: len, d: 600, priority: 7 }], W: len, D: 600, clear: 900, back: 'low', shareClear: true };
      if (room.tryGroup(g, side, u0)) {
        extra++;
        // No room for the hob on the main run: it goes on this one.
        if (!Number.isFinite(hobC) && len >= 900) {
          hobC = 0;
          const v = 300;
          const along = u0 + len / 2;
          const [x, y] = side === 'N' || side === 'S'
            ? [along, side === 'S' ? R.y0 + v : R.y1 - v]
            : [side === 'W' ? R.x0 + v : R.x1 - v, along];
          room.add({ kind: 'hob', x, y, w: 700, d: 460, facing: frontOf(side), layer: 'top', priority: 8 });
        }
        break;
      }
    }
  }
  // Island towards an open side for open kitchens.
  const openSide = (['N', 'E', 'S', 'W'] as Side[]).find((x) => room.profile[x].every((sp) => sp.kind === 'open'));
  if (openSide && depthFrom(R, openSide) >= 650 + 900 + 600) {
    // An island must read as one (at least 1600 long); otherwise there is none.
    for (let len = Math.min(2000, sideLength(R, openSide) - 900); len >= 1600; len -= 200) {
      const g: Group = { items: [{ kind: 'island', u: 0, v: 120, w: len, d: 650, priority: 5 }], W: len, D: 770, clear: 900, back: 'any', shareClear: true };
      if (room.place(g, [openSide], ['center', 'start', 'end'])) break;
    }
  }
  // Fridge on a solid wall when there is room left.
  const fr: Group = { items: [{ kind: 'fridge', u: 0, v: 0, w: 700, d: 680, priority: 6 }], W: 700, D: 680, clear: 800, back: 'solid' };
  room.place(fr, rankSides((s) => room.sideStats(s, 'solid').longest), ['end', 'start']);
}

// ---------------------------------------------------------------------------
// Bathroom, laundry

function bathroom(room: Room): void {
  const { R } = room;
  const short = Math.min(width(R), height(R));
  const sides = rankSides((x) => room.sideStats(x, 'low').longest - (room.sideStats(x, 'low').door ? 3000 : 0));
  // Compact bathrooms (the basin is often outside, in a vanity nook) get a
  // smaller shower and no vanity so the room keeps a readable floor.
  const compact = width(R) * height(R) < 3.5e6;
  // Shower in a corner away from the door.
  for (const s of short >= 1600 && !compact ? [900, 800, 750] : [800, 750]) {
    if (room.place({ items: [{ kind: 'shower', u: 0, v: 0, w: s, d: s, priority: 6 }], W: s, D: s, clear: 0, back: 'low' }, sides, ['end', 'start'])) break;
  }
  room.place({ items: [{ kind: 'toilet', u: 0, v: 0, w: 400, d: 680, priority: 8 }], W: 400, D: 680, clear: 450, back: 'low' }, sides, ['start', 'end']);
  for (const vw of compact ? [] : [800, 650, 550]) {
    if (room.place({ items: [{ kind: 'vanity', u: 0, v: 0, w: vw, d: 480, priority: 7 }], W: vw, D: 480, clear: 500, back: 'low' }, sides, ['start', 'end', 'center'])) break;
  }
}

function laundry(room: Room): void {
  const sides = rankSides((x) => room.sideStats(x, 'low').longest);
  const depth = Math.min(...(['N', 'E', 'S', 'W'] as Side[]).map((s) => depthFrom(room.R, s)));
  const d = Math.min(500, depth - 200);
  if (d < 380) return;
  room.place({ items: [{ kind: 'vanity', u: 0, v: 0, w: 600, d, priority: 7 }], W: 600, D: d, clear: 0, back: 'low' }, sides, ['end', 'start']);
  room.place({ items: [{ kind: 'washer', u: 0, v: 0, w: 600, d: Math.min(600, d + 40), priority: 6 }], W: 600, D: Math.min(600, d + 40), clear: 0, back: 'low' }, sides, ['start', 'end']);
}

// ---------------------------------------------------------------------------
// Study, storage

function study(room: Room): void {
  const sides = rankSides((s) => room.sideStats(s, 'low').longest + (room.sideStats(s, 'low').window ? 600 : 0) - (room.sideStats(s, 'low').door ? 3000 : 0));
  const desk: Group = {
    items: [
      { kind: 'desk', u: 0, v: 0, w: 1400, d: 700, priority: 9 },
      { kind: 'desk-chair', u: 450, v: 760, w: 500, d: 500, turn: 'back', priority: 7 },
    ],
    W: 1400, D: 1260, clear: 300, back: 'low',
  };
  const ds = room.place(desk, sides, 'center');
  const bs = rankSides((s) => room.sideStats(s, 'solid').longest - (s === ds ? 5000 : 0));
  for (const len of [2400, 1800, 1200]) {
    if (room.place({ items: [{ kind: 'bookshelf', u: 0, v: 0, w: len, d: 350, priority: 5 }], W: len, D: 350, clear: 600, back: 'solid' }, bs, ['start', 'end', 'center'])) break;
  }
}

function storage(room: Room): void {
  const sides = rankSides((s) => room.sideStats(s, 'solid').longest);
  let placed = 0;
  for (const side of sides) {
    for (const [lo, hi] of room.intervals(side, 'solid')) {
      const len = Math.min(hi - lo, 3000);
      if (len < 900) continue;
      const g: Group = { items: [{ kind: 'shelves', u: 0, v: 0, w: len, d: 400, priority: 5 }], W: len, D: 400, clear: 700, back: 'solid' };
      for (const u0 of [lo, hi - len, (lo + hi - len) / 2]) if (room.tryGroup(g, side, u0)) { placed++; break; }
      if (placed >= 2) return;
    }
  }
}

// ---------------------------------------------------------------------------
// Outdoor

function outdoorTableSet(room: Room, R: Rect): boolean {
  const w = width(R), h = height(R);
  const alongX = w >= h;
  const items: Parameters<Room['placeFree']>[0] = [];
  const tl = Math.min(2000, (alongX ? w : h) - 1400);
  if (tl < 1200) return false;
  const per = tl >= 1800 ? 3 : 2;
  items.push({ kind: 'outdoor-table', dx: 0, dy: 0, w: tl, d: 800, facing: alongX ? 'S' : 'W', priority: 8 });
  for (let k = 0; k < per; k++) {
    const t = (k - (per - 1) / 2) * (tl / per);
    const off = 400 + 230;
    if (alongX) {
      items.push({ kind: 'outdoor-chair', dx: t, dy: off, w: 460, d: 460, facing: 'S', priority: 6 });
      items.push({ kind: 'outdoor-chair', dx: t, dy: -off, w: 460, d: 460, facing: 'N', priority: 6 });
    } else {
      items.push({ kind: 'outdoor-chair', dx: off, dy: t, w: 460, d: 460, facing: 'W', priority: 6 });
      items.push({ kind: 'outdoor-chair', dx: -off, dy: t, w: 460, d: 460, facing: 'E', priority: 6 });
    }
  }
  // Slightly off-centre towards the far end leaves room for a tree.
  const c = center(R);
  const pref: [number, number] = alongX ? [c[0] + w * 0.12, c[1]] : [c[0], c[1] + h * 0.14];
  return room.placeFree(items, 250, pref);
}

function bistro(room: Room, R: Rect, prefer: [number, number]): boolean {
  const alongX = width(R) >= height(R);
  const items: Parameters<Room['placeFree']>[0] = [
    { kind: 'bistro-table', dx: 0, dy: 0, w: 640, d: 640, facing: 'S', priority: 6 },
    alongX
      ? { kind: 'outdoor-chair', dx: -600, dy: 0, w: 460, d: 460, facing: 'E', priority: 5 }
      : { kind: 'outdoor-chair', dx: 0, dy: -600, w: 460, d: 460, facing: 'N', priority: 5 },
    alongX
      ? { kind: 'outdoor-chair', dx: 600, dy: 0, w: 460, d: 460, facing: 'W', priority: 5 }
      : { kind: 'outdoor-chair', dx: 0, dy: 600, w: 460, d: 460, facing: 'S', priority: 5 },
  ];
  return room.placeFree(items, 150, prefer);
}

function cornerPlant(room: Room, R: Rect, dia0: number, kind: 'pot-plant'): boolean {
  const corners: [number, number][] = [[R.x1, R.y1], [R.x0, R.y1], [R.x1, R.y0], [R.x0, R.y0]];
  // Planting may stand in front of glazing but not in a door swing or on furniture.
  for (const dia of [dia0, dia0 * 0.8, dia0 * 0.65]) {
    for (const [cx, cy] of corners) {
      const x = cx === R.x1 ? cx - dia / 2 - 60 : cx + dia / 2 + 60;
      const y = cy === R.y1 ? cy - dia / 2 - 60 : cy + dia / 2 + 60;
      const r = { x0: x - dia / 2, y0: y - dia / 2, x1: x + dia / 2, y1: y + dia / 2 };
      const ok = contains(room.R, r) && !room.hard.some((b) => overlaps(b, r)) && !room.solids.some((b) => overlaps(b, r));
      if (!ok) continue;
      room.add({ kind, x, y, w: dia, d: dia, facing: 'S', layer: 'plant', priority: 2, variant: '3' });
      room.solids.push(r);
      return true;
    }
  }
  return false;
}

// Trees, bamboo and grass come from the shared site planting (`planting.ts`);
// the rules here only furnish outdoor rooms around them.
function courtyard(room: Room): void {
  const { R } = room;
  const short = Math.min(width(R), height(R)), long = Math.max(width(R), height(R));
  if (short >= 2400 && long >= 3600) {
    outdoorTableSet(room, R);
  } else if (short >= 1150 && long >= 2200) {
    const c = center(R);
    bistro(room, R, [c[0] - width(R) * 0.2, c[1]]);
  }
}

function carport(room: Room): void {
  const { R } = room;
  const alongX = width(R) >= height(R);
  const long = alongX ? width(R) : height(R), short = alongX ? height(R) : width(R);
  const bayL = Math.min(5300, long - 150), bayW = Math.min(2400, short - 300);
  const c = center(R);
  const facing: Side = alongX ? 'E' : 'N';
  room.add({ kind: 'parking-bay', x: c[0], y: c[1], w: bayW, d: bayL, facing, layer: 'floor', priority: 1, variant: `${Math.round(bayL)}*${Math.round(bayW)}` });
  const carL = Math.min(4700, bayL - 300), carW = Math.min(1850, bayW - 300);
  if (carL < 3000) return;
  room.add({ kind: 'car', x: c[0], y: c[1], w: carW, d: carL, facing, layer: 'furniture', priority: 9 });
  room.solids.push(alongX ? { x0: c[0] - carL / 2, x1: c[0] + carL / 2, y0: c[1] - carW / 2, y1: c[1] + carW / 2 } : { x0: c[0] - carW / 2, x1: c[0] + carW / 2, y0: c[1] - carL / 2, y1: c[1] + carL / 2 });
}

function terrace(room: Room): void {
  const { R } = room;
  cornerPlant(room, R, Math.min(1300, Math.min(width(R), height(R)) * 0.35), 'pot-plant');
  const short = Math.min(width(R), height(R));
  if (short >= 2600) {
    // Two loungers side by side plus a bistro set.
    const g: Group = {
      items: [
        { kind: 'lounger', u: 0, v: 0, w: 700, d: 1900, priority: 4 },
        { kind: 'side-table', u: 780, v: 150, w: 420, d: 420, priority: 2 },
        { kind: 'lounger', u: 1280, v: 0, w: 700, d: 1900, priority: 4 },
      ],
      W: 1980, D: 1900, clear: 300, back: 'any',
    };
    room.place(g, rankSides((s) => room.sideStats(s, 'any').longest - (room.sideStats(s, 'any').door ? 4000 : 0)), ['end', 'start', 'center']);
  }
  const c = center(R);
  bistro(room, R, c);
}

function balcony(room: Room): void {
  const { R } = room;
  const short = Math.min(width(R), height(R)), long = Math.max(width(R), height(R));
  cornerPlant(room, R, Math.min(900, short * 0.65), 'pot-plant');
  if (short >= 1250 && long >= 2600) {
    const c = center(R);
    bistro(room, R, [c[0] + width(R) * 0.15, c[1]]);
  }
}

export function furnishRoom(room: Room, sp: SpaceInfo): void {
  switch (sp.type) {
    case 'bedroom': return bedroom(room);
    case 'living': return livingRoom(room, false);
    case 'family': return livingRoom(room, true);
    case 'hall': return hall(room);
    case 'dining': return diningRoom(room);
    case 'kitchen': return kitchen(room);
    case 'bathroom': return bathroom(room);
    case 'laundry': return laundry(room);
    case 'study': return study(room);
    case 'storage': return storage(room);
    case 'courtyard': return courtyard(room);
    case 'carport': return carport(room);
    case 'terrace': return terrace(room);
    case 'balcony': return balcony(room);
    default: return;
  }
}
