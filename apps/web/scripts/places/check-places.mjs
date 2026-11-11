// Spot check of the built-in place list against a second, independent
// source for each part of it:
// - places in China (from Wikidata) against GeoNames "cities15000"
//   (CC BY 4.0, https://www.geonames.org);
// - places elsewhere (from GeoNames) against Wikidata's coordinate (P625)
//   of the item with the same GeoNames id (P1566).
// Neither comparison source is bundled.
//
//   curl -O https://download.geonames.org/export/dump/cities15000.zip && unzip cities15000.zip
//   node --experimental-strip-types scripts/places/check-places.mjs path/to/cities15000.txt
//
// A Chinese place matches the GeoNames city (country CN/HK/MO, a seat of
// government first: feature code PPLC / PPLA / PPLA2, else the most
// populous) whose names include its Chinese name with or without the
// administrative suffix. Exits non-zero unless every sampled place is
// within 50 km of the other source.
import { readFileSync } from 'node:fs';
import { ROWS } from '../../src/lib/places/places-data.ts';

const file = process.argv[2];
if (!file) {
  console.error('usage: check-places.mjs cities15000.txt');
  process.exit(1);
}

const SAMPLE_CN = [
  '北京市', '上海市', '广州市', '深圳市', '成都市', '重庆市', '哈尔滨市', '乌鲁木齐市', '拉萨市', '昆明市',
  '杭州市', '南京市', '西安市', '兰州市', '西宁市', '呼和浩特市', '长春市', '沈阳市', '海口市', '三亚市',
  '喀什地区', '银川市', '厦门市', '桂林市', '山南市', '齐齐哈尔市',
];
/** [name in the list, country]. */
const SAMPLE_WORLD = [
  ['London', 'GB'], ['Paris', 'FR'], ['Berlin', 'DE'], ['Madrid', 'ES'], ['Stockholm', 'SE'],
  ['New York City', 'US'], ['Los Angeles', 'US'], ['Toronto', 'CA'], ['Vancouver', 'CA'],
  ['Sydney', 'AU'], ['Melbourne', 'AU'], ['Auckland', 'NZ'], ['Cape Town', 'ZA'], ['Santiago', 'CL'], ['Buenos Aires', 'AR'],
];

const places = ROWS.split('\n').map((l) => {
  const f = l.split('|');
  return { zh: f[0], en: f[1], cc: f[4], region: f[5] || f[6], lat: Number(f[7]), lon: Number(f[8]) };
});

const geo = [];
for (const line of readFileSync(file, 'utf8').split('\n')) {
  const f = line.split('\t');
  if (f.length < 15) continue;
  geo.push({ gid: f[0], name: f[1], alt: new Set(f[3].split(',')), lat: Number(f[4]), lon: Number(f[5]), code: f[7], cc: f[8], pop: Number(f[14]) });
}

const km = (a, b) => {
  const R = 6371, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
const rank = { PPLC: 0, PPLA: 1, PPLA2: 2 };

function geoMatch(zh) {
  const base = zh.replace(/(特别行政区|市|地区|盟)$/, '');
  const cands = geo.filter((g) => ['CN', 'HK', 'MO'].includes(g.cc) && (g.alt.has(zh) || g.alt.has(base) || g.alt.has(`${base}市`)));
  cands.sort((a, b) => (rank[a.code] ?? 9) - (rank[b.code] ?? 9) || b.pop - a.pop);
  return cands[0] ?? null;
}

const results = [];
console.log('China (Wikidata, rounded to 0.01 deg) vs GeoNames:');
const cnRows = [];
for (const p of places.filter((x) => ['CN', 'HK', 'MO'].includes(x.cc))) {
  const g = geoMatch(p.zh);
  if (g) cnRows.push({ p, g, d: km(p, g) });
}
for (const zh of SAMPLE_CN) {
  const r = cnRows.find((x) => x.p.zh === zh);
  if (!r) {
    console.log(`  ${zh}: no GeoNames match`);
    results.push(Infinity);
    continue;
  }
  results.push(r.d);
  console.log(`  ${zh} (${r.p.region}): ${r.p.lat.toFixed(2)}, ${r.p.lon.toFixed(2)} vs ${r.g.lat.toFixed(3)}, ${r.g.lon.toFixed(3)} (${r.g.name}): ${r.d.toFixed(1)} km`);
}
const ds = cnRows.map((r) => r.d).sort((a, b) => a - b);
const q = (k) => ds[Math.min(ds.length - 1, Math.floor(k * ds.length))].toFixed(1);
console.log(`  all Chinese matches: ${cnRows.length}; median ${q(0.5)} km, 90% ${q(0.9)} km; largest:`);
for (const r of cnRows.sort((a, b) => b.d - a.d).slice(0, 4)) console.log(`    ${r.p.zh} ${r.d.toFixed(0)} km (GeoNames ${r.g.name}${r.d > 500 ? ', a different place of the same name' : ''})`);

console.log('\nElsewhere (GeoNames, rounded to 0.01 deg) vs Wikidata P625:');
const gids = new Map();
for (const [en, cc] of SAMPLE_WORLD) {
  const g = geo.filter((x) => x.cc === cc && x.name === en).sort((a, b) => b.pop - a.pop)[0];
  if (g) gids.set(g.gid, [en, cc]);
}
const query = `SELECT ?gid ?coord WHERE { VALUES ?gid { ${[...gids.keys()].map((g) => `"${g}"`).join(' ')} } ?item wdt:P1566 ?gid ; wdt:P625 ?coord . }`;
const res = await fetch(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`, {
  headers: { accept: 'application/sparql-results+json', 'user-agent': 'opensu-data-check/0.1 (open-source build script)' },
});
const wd = new Map();
for (const b of (await res.json()).results.bindings) {
  const m = /Point\(([-\d.]+) ([-\d.]+)\)/.exec(b.coord.value);
  if (m && !wd.has(b.gid.value)) wd.set(b.gid.value, { lon: Number(m[1]), lat: Number(m[2]) });
}
for (const [en, cc] of SAMPLE_WORLD) {
  const p = places.find((x) => x.en === en && x.cc === cc);
  const gid = [...gids].find(([, v]) => v[0] === en && v[1] === cc)?.[0];
  const w = gid && wd.get(gid);
  if (!p || !w) {
    console.log(`  ${en} (${cc}): ${p ? 'no Wikidata coordinate' : 'not in the list'}`);
    results.push(Infinity);
    continue;
  }
  const d = km(p, w);
  results.push(d);
  console.log(`  ${en}${p.zh ? ` ${p.zh}` : ''} (${p.region}, ${cc}): ${p.lat.toFixed(2)}, ${p.lon.toFixed(2)} vs ${w.lat.toFixed(3)}, ${w.lon.toFixed(3)}: ${d.toFixed(1)} km`);
}

const ok = results.length >= 20 && results.every((d) => d < 50);
console.log(`\n${results.length} sampled places, ${SAMPLE_WORLD.length} outside China; largest distance ${Math.max(...results).toFixed(1)} km: ${ok ? 'ok' : 'FAIL'}`);
process.exit(ok ? 0 : 1);
