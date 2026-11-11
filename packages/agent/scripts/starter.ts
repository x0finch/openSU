// Validates the starter house and prints its description and issues.
//   pnpm --filter @opensu/agent starter
import { applyCommands, describeHouse, resolve, validate } from '@opensu/model';
import { blankHouse, STARTER_COMMANDS } from '../src/starter';

const r = applyCommands(blankHouse({ width: 16800, depth: 18000, name: 'Starter' }), STARTER_COMMANDS);
for (const i of r.issues) console.log(`${i.severity} ${i.code}: ${i.message}`);
if (!r.ok) process.exit(1);
const issues = validate(r.house);
const text = describeHouse(r.house, issues);
console.log(text);
const res = resolve(r.house);
console.log(`interior area ${(res.interiorArea / 1e6).toFixed(1)} m², description ${text.length} chars`);
