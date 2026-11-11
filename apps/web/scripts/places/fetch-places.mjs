// Builds the studio's built-in place list (src/lib/places/places-data.ts).
//
//   node scripts/places/fetch-places.mjs
//
// Two open sources, fetched here (never at runtime):
// - China: Wikidata (CC0 1.0, https://www.wikidata.org/wiki/Wikidata:Licensing).
//   Every prefecture-level division of mainland China (prefecture-level
//   cities, autonomous prefectures, leagues, prefectures), the county-level
//   units that provinces administer directly (Hainan, Xinjiang, Hubei,
//   Henan), the four municipalities and the two SARs, each with its
//   Wikidata coordinate (P625), or its seat's where the item's point is the
//   centroid of a large prefecture. Chinese and English names from Wikidata;
//   pinyin derived with pinyin-pro (MIT, a dev dependency of this script
//   only; nothing of it is bundled). Time zone Asia/Shanghai (China uses
//   UTC+8 everywhere; HK and Macau their own zones).
// - The rest of the world: GeoNames "cities15000" (CC BY 4.0,
//   https://www.geonames.org), its 18 000 largest places (down to about
//   30 000 inhabitants, to keep the lazy chunk under ~400 KB gzip), with the
//   first-level region names of admin1CodesASCII.txt and the IANA time
//   zone GeoNames gives each place. GeoNames' Chinese places are left out
//   (the Wikidata list covers China). Simplified Chinese names of the larger
//   world cities (> 100 000 inhabitants) come from Wikidata labels, matched
//   by GeoNames id (P1566).
//
// The output is committed; re-run by hand to refresh it.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pinyin } from 'pinyin-pro';

const out = resolve(dirname(fileURLToPath(import.meta.url)), '../../src/lib/places/places-data.ts');
const UA = 'opensu-data-fetch/0.1 (open-source build script)';

async function sparql(q) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(q)}`, {
      headers: { accept: 'application/sparql-results+json', 'user-agent': UA },
    });
    if (res.ok) return (await res.json()).results.bindings;
    if (attempt >= 3) throw new Error(`Wikidata: HTTP ${res.status}`);
    await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
  }
}
const point = (v) => {
  const m = /Point\(([-\d.]+) ([-\d.]+)\)/.exec(v);
  return m ? { lon: Number(m[1]), lat: Number(m[2]) } : null;
};

/* ---------------------------------------------------------------- China -- */

// Divisions that provinces and autonomous regions contain directly (P150).
const BY_PROVINCE = `
SELECT ?item ?provZh ?provEn ?zh ?zhAny ?en ?coord ?capCoord WHERE {
  VALUES ?ptype { wd:Q1615742 wd:Q57362 }
  ?prov wdt:P31 ?ptype .
  ?prov wdt:P150 ?item .
  ?item wdt:P625 ?coord .
  OPTIONAL { ?item wdt:P36 ?cap . ?cap wdt:P625 ?capCoord }
  FILTER NOT EXISTS { ?item wdt:P576 ?dissolved }
  OPTIONAL { ?prov rdfs:label ?provZh FILTER(lang(?provZh) = 'zh-hans') }
  OPTIONAL { ?prov rdfs:label ?provEn FILTER(lang(?provEn) = 'en') }
  OPTIONAL { ?item rdfs:label ?zh FILTER(lang(?zh) = 'zh-hans') }
  OPTIONAL { ?item rdfs:label ?zhAny FILTER(lang(?zhAny) = 'zh') }
  OPTIONAL { ?item rdfs:label ?en FILTER(lang(?en) = 'en') }
}`;
// The four municipalities and the two SARs.
const SELF_ITEMS = `
SELECT ?item ?zh ?zhAny ?en ?coord WHERE {
  VALUES ?item { wd:Q956 wd:Q8686 wd:Q11736 wd:Q11725 wd:Q8646 wd:Q14773 }
  ?item wdt:P625 ?coord .
  OPTIONAL { ?item rdfs:label ?zh FILTER(lang(?zh) = 'zh-hans') }
  OPTIONAL { ?item rdfs:label ?zhAny FILTER(lang(?zhAny) = 'zh') }
  OPTIONAL { ?item rdfs:label ?en FILTER(lang(?en) = 'en') }
}`;
const SELF = {
  Q956: ['北京', 'Beijing', 'CN', 'Asia/Shanghai'],
  Q8686: ['上海', 'Shanghai', 'CN', 'Asia/Shanghai'],
  Q11736: ['天津', 'Tianjin', 'CN', 'Asia/Shanghai'],
  Q11725: ['重庆', 'Chongqing', 'CN', 'Asia/Shanghai'],
  Q8646: ['香港', 'Hong Kong', 'HK', 'Asia/Hong_Kong'],
  Q14773: ['澳门', 'Macau', 'MO', 'Asia/Macau'],
};

// Items whose P625 is the centroid of a large prefecture and that have no
// seat (P36) on Wikidata: the seat district's own Wikidata item is used.
// Found with scripts/places/check-places.mjs (distance to GeoNames > 25 km).
const SEATS = {
  山南市: 'Q1364668', // 乃东区
  大兴安岭地区: 'Q1283517', // 加格达奇区
  陇南市: 'Q477646', // 武都区
  鄂尔多斯市: 'Q6362644', // 康巴什区
  海东市: 'Q1202880', // 乐都区
};
const SEAT_COORDS = `
SELECT ?item ?coord WHERE {
  VALUES ?item { ${Object.values(SEATS).map((q) => `wd:${q}`).join(' ')} }
  ?item wdt:P625 ?coord .
}`;

const shortProvince = (p) => (p ? p.replace(/(壮族|回族|维吾尔)?(自治区|省)$/, '') : '');
const shortProvinceEn = (p) => (p ? p.replace(/ (Province|Autonomous Region)$/, '').replace(/ Zhuang| Hui| Uyghur/, '') : '');

const cn = new Map();
for (const r of [...(await sparql(SELF_ITEMS)), ...(await sparql(BY_PROVINCE))]) {
  const id = r.item.value.split('/').pop();
  if (cn.has(id)) continue;
  let p = point(r.coord.value);
  const cap = r.capCoord && point(r.capCoord.value);
  if (!p) continue;
  // Where the seat of government (P36) is far from the item's point, the
  // point is a centroid: use the seat (people build where people live).
  if (cap && Math.hypot(cap.lon - p.lon, cap.lat - p.lat) > 0.3) p = cap;
  const zh = r.zh?.value ?? r.zhAny?.value;
  if (!zh || !/[一-鿿]/.test(zh)) continue;
  const self = SELF[id];
  cn.set(id, {
    zh,
    en: self?.[1] ?? r.en?.value ?? '',
    cc: self?.[2] ?? 'CN',
    adminZh: self ? '' : shortProvince(r.provZh?.value),
    adminEn: self ? '' : shortProvinceEn(r.provEn?.value),
    ...p,
    tz: self?.[3] ?? 'Asia/Shanghai',
  });
}
const seatCoord = new Map((await sparql(SEAT_COORDS)).map((r) => [r.item.value.split('/').pop(), point(r.coord.value)]));
for (const p of cn.values()) {
  const s = SEATS[p.zh] && seatCoord.get(SEATS[p.zh]);
  if (s) Object.assign(p, s);
}
const china = [...cn.values()].map((p) => {
  // Pinyin of the name without its administrative suffix, for search.
  const syll = pinyin(p.zh.replace(/(特别行政区|市|地区|盟|县)$/, ''), { toneType: 'none', type: 'array' }).map((s) => s.replace(/ü/g, 'v'));
  return { ...p, py: syll.join(''), ini: syll.map((s) => s[0]).join('') };
});
// Provincial capitals and big cities first is not needed: China stays in pinyin order.
china.sort((a, b) => a.py.localeCompare(b.py) || a.zh.localeCompare(b.zh, 'zh'));

/* ---------------------------------------------------------------- World -- */

const tmp = mkdtempSync(join(tmpdir(), 'opensu-geonames-'));
async function download(url, file) {
  const res = await fetch(url, { headers: { 'user-agent': UA } });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  writeFileSync(join(tmp, file), Buffer.from(await res.arrayBuffer()));
}
await download('https://download.geonames.org/export/dump/cities15000.zip', 'cities15000.zip');
await download('https://download.geonames.org/export/dump/admin1CodesASCII.txt', 'admin1.txt');
execFileSync('unzip', ['-o', '-q', join(tmp, 'cities15000.zip'), '-d', tmp]);
const admin1 = new Map(readFileSync(join(tmp, 'admin1.txt'), 'utf8').split('\n').map((l) => l.split('\t')).filter((f) => f.length > 2).map((f) => [f[0], f[2]]));
const world = [];
for (const line of readFileSync(join(tmp, 'cities15000.txt'), 'utf8').split('\n')) {
  const f = line.split('\t');
  if (f.length < 18 || ['CN', 'HK', 'MO'].includes(f[8])) continue;
  world.push({ gid: f[0], zh: '', en: f[1], cc: f[8], adminZh: '', adminEn: admin1.get(`${f[8]}.${f[10]}`) ?? '', lat: Number(f[4]), lon: Number(f[5]), tz: f[17], pop: Number(f[14]) });
}
rmSync(tmp, { recursive: true, force: true });
world.sort((a, b) => b.pop - a.pop);
// The lazy chunk stays under ~400 KB gzip: the largest places only
// (about 20 bytes gzip per place; the cut lands near 25 000 inhabitants).
const WORLD_MAX = 18000;
const cutPop = world[Math.min(world.length, WORLD_MAX) - 1]?.pop;
world.length = Math.min(world.length, WORLD_MAX);

// Simplified Chinese names of the larger cities, from Wikidata by GeoNames id.
const big = world.filter((w) => w.pop >= 100000);
const zhByGid = new Map();
for (let i = 0; i < big.length; i += 400) {
  const ids = big.slice(i, i + 400).map((w) => `"${w.gid}"`).join(' ');
  const rows = await sparql(`SELECT ?gid ?zh WHERE { VALUES ?gid { ${ids} } ?item wdt:P1566 ?gid . ?item rdfs:label ?zh FILTER(lang(?zh) = 'zh-hans') }`);
  for (const r of rows) if (!zhByGid.has(r.gid.value) && /^[一-鿿·]+$/.test(r.zh.value)) zhByGid.set(r.gid.value, r.zh.value);
}
for (const w of world) w.zh = zhByGid.get(w.gid) ?? '';

/* --------------------------------------------------------------- Output -- */

const zones = [...new Set([...china, ...world].map((p) => p.tz))].sort();
const zi = new Map(zones.map((z, i) => [z, i]));
const r2 = (x) => String(Math.round(x * 100) / 100);
const clean = (s) => s.replace(/[|\n]/g, ' ');
// One row per line: zh|en|pinyin|initials|country|regionZh|regionEn|lat|lon|zone index
const rows = [...china, ...world].map((p) => [p.zh, p.en, p.py ?? '', p.ini ?? '', p.cc, p.adminZh, p.adminEn, r2(p.lat), r2(p.lon), zi.get(p.tz)].map((v) => clean(String(v))).join('|'));
const today = new Date().toISOString().slice(0, 10);
writeFileSync(
  out,
  `// GENERATED by scripts/places/fetch-places.mjs on ${today}. Do not edit by hand.
//
// Sources (see the script and apps/web/README.md, "Place list"):
// - China: Wikidata (https://www.wikidata.org), CC0 1.0.
// - Other countries: GeoNames (https://www.geonames.org) cities15000 and
//   admin1CodesASCII, licensed under CC BY 4.0
//   (https://creativecommons.org/licenses/by/4.0/). Chinese names of the
//   larger cities: Wikidata labels (CC0). Coordinates rounded to 0.01 deg.
//
// ${china.length} places in China (pinyin order), then ${world.length} elsewhere (largest first).
// Rows: zh|en|pinyin|initials|country|regionZh|regionEn|lat|lon|zone

export const ZONES: readonly string[] = ${JSON.stringify(zones)};

export const ROWS = ${JSON.stringify(rows.join('\n'))};
`,
);
console.log(`cut at ${cutPop} inhabitants; ${china.length} + ${world.length} places (${zhByGid.size} world cities with Chinese names), ${zones.length} zones -> ${out}`);
