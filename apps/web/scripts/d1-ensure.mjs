// Deploy helper (task 019): finds the D1 database named in wrangler.jsonc
// on the Cloudflare account, creates it when missing, and writes its id into
// wrangler.jsonc (replacing the placeholder used for local runs). The deploy
// workflow runs it before migrations and the build; it needs
// CLOUDFLARE_API_TOKEN (with D1 edit) and CLOUDFLARE_ACCOUNT_ID.
//
//   node scripts/d1-ensure.mjs
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const configPath = resolve(appRoot, 'wrangler.jsonc');
const PLACEHOLDER = '00000000-0000-0000-0000-000000000000';
const wrangler = (...args) => execFileSync(process.execPath, [resolve(appRoot, 'node_modules/wrangler/bin/wrangler.js'), ...args], { cwd: appRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });

const config = readFileSync(configPath, 'utf8');
const name = /"database_name"\s*:\s*"([^"]+)"/.exec(config)?.[1];
if (!name) throw new Error('wrangler.jsonc has no d1_databases[].database_name');

const find = () => {
  const list = JSON.parse(wrangler('d1', 'list', '--json'));
  return list.find((d) => d.name === name)?.uuid ?? null;
};
let id = find();
if (!id) {
  console.log(`D1 database "${name}" not found; creating it.`);
  wrangler('d1', 'create', name);
  id = find();
}
if (!id || !/^[0-9a-f-]{36}$/.test(id)) throw new Error(`Could not find or create the D1 database "${name}".`);
writeFileSync(configPath, config.replace(PLACEHOLDER, id));
console.log(`D1 database "${name}": ${id} (written to wrangler.jsonc for this build)`);
