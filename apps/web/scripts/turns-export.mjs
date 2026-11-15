// Owner export of the saved conversation turns (task 020): reads the
// `turn_record` table with wrangler and writes JSON Lines (one turn per
// line) to artifacts/turns/ (git-ignored). Needs the same Cloudflare login
// or API token as a deploy (`wrangler login`, or CLOUDFLARE_API_TOKEN with
// D1 read access).
//
//   node scripts/turns-export.mjs                         the last 7 days, remote database
//   node scripts/turns-export.mjs --from 2026-11-01 --to 2026-11-15
//   node scripts/turns-export.mjs --only undone,error,gave-up
//   node scripts/turns-export.mjs --local [--persist-to <dir>]   the local (dev / test) database
//   node scripts/turns-export.mjs --out <file.jsonl>
//
// Dates are UTC days; --to is inclusive. --only keeps turns that were
// undone, ended with an error, or gave up (any of those given). Each line:
// {turn, at, who, conversation, ownKey, model, undone, record}.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const fail = (msg) => {
  console.error(msg);
  process.exit(2);
};

const day = (s, name) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(`${s}T00:00:00Z`))) fail(`${name}: expected YYYY-MM-DD, got "${s}"`);
  return Date.parse(`${s}T00:00:00Z`);
};
const today = new Date().toISOString().slice(0, 10);
const toDay = opt('--to') ?? today;
const fromDay = opt('--from') ?? new Date(day(toDay, '--to') - 6 * 86_400_000).toISOString().slice(0, 10);
const from = day(fromDay, '--from');
const to = day(toDay, '--to') + 86_400_000;
if (from >= to) fail('--from must not be after --to');

const FILTERS = { undone: 'undone = 1', error: "json_extract(record, '$.status') = 'error'", 'gave-up': "json_extract(record, '$.status') = 'gave-up'" };
const only = (opt('--only') ?? '').split(',').filter(Boolean);
for (const o of only) if (!FILTERS[o]) fail(`--only: one or more of ${Object.keys(FILTERS).join(', ')}`);
const where = [`at >= ${from}`, `at < ${to}`, ...(only.length ? [`(${only.map((o) => FILTERS[o]).join(' OR ')})`] : [])].join(' AND ');

const local = args.includes('--local');
const persist = opt('--persist-to');
const target = local ? ['--local', ...(persist ? ['--persist-to', resolve(persist)] : [])] : ['--remote'];
const out = resolve(opt('--out') ?? resolve(appRoot, '../../artifacts/turns', `turns-${fromDay}-${toDay}${only.length ? `-${only.join('-')}` : ''}${local ? '-local' : ''}.jsonl`));

function query(sql) {
  const raw = execFileSync(process.execPath, [resolve(appRoot, 'node_modules/wrangler/bin/wrangler.js'), 'd1', 'execute', 'DB', ...target, '--json', '--command', sql], {
    cwd: appRoot,
    encoding: 'utf8',
    maxBuffer: 512 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'inherit'],
    env: { ...process.env, CI: '1' },
  });
  const res = JSON.parse(raw);
  return (Array.isArray(res) ? res[0] : res)?.results ?? [];
}

// Pages of 50 rows (records are up to 256 KB each).
const PAGE = 50;
const lines = [];
for (let offset = 0; ; offset += PAGE) {
  const rows = query(`SELECT turn, at, who, conversation, own_key, model, undone, record FROM turn_record WHERE ${where} ORDER BY at, turn LIMIT ${PAGE} OFFSET ${offset}`);
  for (const r of rows) {
    let record;
    try {
      record = JSON.parse(r.record);
    } catch {
      record = r.record;
    }
    lines.push(JSON.stringify({ turn: r.turn, at: new Date(r.at).toISOString(), who: r.who, conversation: r.conversation, ownKey: r.own_key === 1, model: r.model, undone: r.undone === 1, record }));
  }
  if (rows.length < PAGE) break;
}
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, lines.length ? `${lines.join('\n')}\n` : '');
console.log(`${lines.length} turn(s) from ${fromDay} to ${toDay}${only.length ? ` (only ${only.join(', ')})` : ''} -> ${out}`);
