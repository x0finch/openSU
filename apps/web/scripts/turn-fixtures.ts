// Realistic turn records for size and CPU checks (task 020): real turns of
// the agent (its tools, the model package's validation and descriptions)
// against a scripted model, turned into records the way the chat store
// does. Not a model: the steps below are fixed.
//
// Needs the workspace sources, so run the importing script with
//   node --experimental-transform-types --import ./scripts/ts-resolve.mjs
import { type AgentEvent, HouseSession, runTurn } from '@opensu/agent';
import { blankHouse, TEMPLATES, templateHouse } from '@opensu/agent/starter';
import type { AppliedBatch } from '@opensu/agent';
import { scripted } from '../../../packages/agent/test/scripted.ts';
import { buildRecord, type ToolCallRecord, type TurnRun } from '../src/chat/turn-record.ts';
import { addCall, addChange, addText, type TurnPart } from '../src/chat/turn-parts.ts';

type Step = { text?: string; tools?: { name: string; args: unknown }[] };

/** Runs one scripted turn on `house` and returns its record as JSON (as the browser sends it). */
async function recordOf(house: ReturnType<typeof blankHouse>, user: string, steps: Step[], turn: string): Promise<string> {
  const session = new HouseSession(house);
  const item: { text: string; parts: TurnPart[]; calls: ToolCallRecord[]; changes: AppliedBatch[]; run: TurnRun } = {
    text: '', parts: [], calls: [], changes: [],
    run: { turn, model: 'anthropic/claude-sonnet-5.5', ownKey: false, startedAt: Date.UTC(2026, 10, 15, 2), durationMs: 41_000 },
  };
  const index = new Map<string, number>();
  // The chat store's handling of the agent's events (chat-store.ts `send`).
  const onEvent = (e: AgentEvent) => {
    if (e.type === 'text') (item.text += e.delta), (item.parts = addText(item.parts, e.delta));
    else if (e.type === 'tool-call') {
      item.calls.push({ name: e.name });
      index.set(e.id, item.calls.length - 1);
      item.parts = addCall(item.parts, item.calls.length - 1);
    } else if (e.type === 'tool-result') item.calls[index.get(e.id)!] = { name: e.name, args: e.args, result: e.result };
    else if (e.type === 'house') {
      item.changes.push(e.batch);
      item.parts = addChange(item.parts, item.changes.length - 1);
    }
  };
  const m = scripted(steps);
  const r = await runTurn({ adapter: m.adapter, session, text: user, onEvent });
  if (r.status !== 'ok') throw new Error(`fixture turn "${turn}" ended ${r.status}: ${JSON.stringify(r.error)}`);
  const rec = buildRecord({ ...item, text: r.text, changes: r.changes }, user, { conversation: 'conv-fixture-0001', app: '0.0.0+fixture' }, session.house);
  return JSON.stringify(rec);
}

/**
 * small: one edit on the sample house (T1), as in the studio's first
 * suggestion. large: the largest template (T3, three wings, two storeys)
 * built from a blank plot in one turn: new_house, all its commands in one
 * batch (rejected once for a wrong id, then repaired), a get_house, the
 * closing reply.
 */
export async function fixtureRecords(): Promise<{ small: string; large: string }> {
  const small = await recordOf(templateHouse('t1'), '北侧房间再加深一点', [
    { text: '好的，北侧房间加深 600 mm：把北墙所在的轴线 F 外移。同一条轴线上的厨房、楼梯和洗衣房会一起变深。', tools: [{ name: 'edit_house', args: { summary: '北侧房间加深 600 mm', commands: [{ op: 'move_grid_line', line: 'F', by: 600 }] } }] },
    { text: '改好了。厨房现在 3.6 × 3.3 m，约 11.9 m²；整栋房子的建筑面积增加约 13.3 m²。' },
  ], 'fixture-small-0001');
  const t3 = TEMPLATES.find((t) => t.id === 't3')!;
  // The first attempt names one space wrongly (rejected with the validator's errors), the repair is the whole batch again.
  const typo = structuredClone(t3.commands) as { op: string; host?: { space?: string } }[];
  const bad = typo.find((c) => c.op === 'add_opening' && c.host?.space)!;
  bad.host!.space += '-x';
  const large = await recordOf(blankHouse(), '帮我设计一个 15 × 15 米的三合院，北边两层主屋，东西两侧单层厢房，中间是院子。', [
    { text: '好的，先换成一块 15 × 15 m 的空地。', tools: [{ name: 'new_house', args: { template: 'blank', plotWidth: t3.plot.width, plotDepth: t3.plot.depth, name: '三合院', summary: '新建 15 × 15 m 空地' } }] },
    { text: '现在一次搭好主屋、两侧厢房、院子、门窗、楼梯和屋顶。', tools: [{ name: 'edit_house', args: { summary: '搭建三合院', commands: typo } }] },
    { text: '有一个房间编号写错了，我改正后重新提交。', tools: [{ name: 'edit_house', args: { summary: '搭建三合院', commands: t3.commands } }] },
    { text: '最后整体检查一遍。', tools: [{ name: 'get_house', args: {} }] },
    { text: '三合院建好了：北侧两层主屋，东西两侧单层厢房，中间是庭院，南侧有前院和大门。' },
  ], 'fixture-large-0001');
  return { small, large };
}
