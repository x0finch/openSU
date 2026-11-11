// Validates the template houses and prints their issues, areas and (with
// --describe) the full description the assistant sees.
//   pnpm --filter @opensu/agent starter [t1|t2|t3] [--describe]
import { applyCommands, describeHouse, resolve, validate } from '@opensu/model';
import { blankHouse, TEMPLATES } from '../src/starter';

const ids = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const describe = process.argv.includes('--describe');
let failed = false;
for (const t of TEMPLATES.filter((x) => !ids.length || ids.includes(x.id))) {
  const r = applyCommands(blankHouse({ width: t.plot.width, depth: t.plot.depth, name: t.name }), t.commands);
  console.log(`== ${t.id} ${t.name}: ${r.ok ? 'ok' : 'REJECTED'}`);
  for (const i of r.issues) console.log(`  ${i.severity} ${i.code}: ${i.message}`);
  if (!r.ok) {
    failed = true;
    continue;
  }
  const issues = validate(r.house);
  const text = describeHouse(r.house, issues);
  if (describe) console.log(text);
  const res = resolve(r.house);
  const perLevel = res.levels.map((l) => `${l.id} ${(l.spaces.filter((s) => !s.outdoor).reduce((a, s) => a + s.area, 0) / 1e6).toFixed(1)}`).join(', ');
  console.log(`  interior ${(res.interiorArea / 1e6).toFixed(1)} m² (${perLevel}), ${issues.length} issues, description ${text.length} chars`);
}
process.exit(failed ? 1 : 0);
