import { describe, expect, it } from 'vitest';
import { type House } from '@opensu/model';
import { type AgentEvent, HouseSession, MAX_REPAIRS, runTurn, starterHouse } from '../src/index';
import { scripted } from './scripted';

const widen = { summary: '客厅向东加宽 600 mm', commands: [{ op: 'move_grid_line', line: '2', by: 600 }] };
const pos = (h: House, id: string) => h.grid.x.find((g) => g.id === id)?.pos;

type Msg = { role: string; content?: unknown; tool_calls?: unknown };
const toolResults = (messages: Msg[]) => messages.filter((m) => m.role === 'tool').map((m) => JSON.parse(String(m.content)) as Record<string, unknown>);
const systemText = (messages: Msg[]) => messages.filter((m) => m.role === 'system').map((m) => String(m.content)).join('\n');

describe('runTurn', () => {
  it('happy path: streams text, applies the edit, commits one undo step', async () => {
    const session = new HouseSession(starterHouse());
    const before = session.house;
    const m = scripted([
      { text: '好的，我把客厅向东加宽 600 mm。', tools: [{ name: 'edit_house', args: widen }] },
      { text: '客厅现在宽 5.4 m，面积约 25.9 m²。' },
    ]);
    const events: AgentEvent[] = [];
    const r = await runTurn({ adapter: m.adapter, session, text: '把客厅加宽 600', onEvent: (e) => events.push(e) });

    expect(r.status).toBe('ok');
    expect(r.committed).toBe(true);
    expect(pos(session.house, '2')).toBe(7800);
    expect(r.changes).toEqual([{ summary: '客厅向东加宽 600 mm', details: [expect.stringContaining('2')] }]);
    expect(r.text).toContain('客厅现在宽 5.4 m');
    expect(events.filter((e) => e.type === 'text').length).toBeGreaterThan(4);
    expect(events.some((e) => e.type === 'house' && e.reason === 'edit')).toBe(true);

    // Two model calls through the relay; the house description is in the system prompt once.
    expect(m.urls).toEqual(['/api/chat', '/api/chat']);
    expect(m.requests[0]!.model).toBe('default');
    expect(systemText(m.requests[0]!.messages)).toContain('CURRENT HOUSE');
    expect(systemText(m.requests[0]!.messages).match(/LEVEL L1 /g)).toHaveLength(1);
    expect(m.requests[0]!.tools).toHaveLength(3);
    const [res] = toolResults(m.requests[1]!.messages);
    expect(res!.ok).toBe(true);
    // Only the changed lines go back to the model, not the whole description again.
    expect(String(res!.changed)).toContain('GRID X');
    expect(String(res!.changed).length).toBeLessThan(4000);
    expect(m.headers[0]!.get('authorization')).toBeNull();

    expect(session.undo()).toBe(before);
    expect(session.history.canUndo).toBe(false);
  });

  it('repair round: a rejected batch goes back with errors, the fix is applied', async () => {
    const session = new HouseSession(starterHouse());
    const m = scripted([
      { tools: [{ name: 'edit_house', args: { summary: '加宽客厅', commands: [{ op: 'update_space', space: 'l1-livingroom', name: '大客厅' }] } }] },
      { tools: [{ name: 'edit_house', args: { summary: '客厅改名', commands: [{ op: 'update_space', space: 'l1-living', name: '大客厅' }] } }] },
      { text: '已改名。' },
    ]);
    const events: AgentEvent[] = [];
    const r = await runTurn({ adapter: m.adapter, session, text: '客厅改名为大客厅', onEvent: (e) => events.push(e) });
    expect(r.status).toBe('ok');
    expect(r.rejected).toBe(1);
    expect(session.house.levels[0]!.spaces.find((s) => s.id === 'l1-living')!.name).toBe('大客厅');
    const [bad] = toolResults(m.requests[1]!.messages);
    expect(bad!.ok).toBe(false);
    // The model package's message names the nearest valid id.
    expect(JSON.stringify(bad!.errors)).toContain('l1-living');
    expect(String(bad!.note)).toContain('2 repair attempts left');
    expect(events.find((e) => e.type === 'rejected')).toMatchObject({ repairsLeft: 2 });
  });

  it('gives up after the repair limit; the house stays at the last valid state', async () => {
    const session = new HouseSession(starterHouse());
    const before = session.house;
    const bad = { name: 'edit_house', args: { commands: [{ op: 'add_opening', kind: 'door', host: { space: 'l1-living', side: 'S' }, width: 9000 }] } };
    const m = scripted([
      { tools: [{ name: 'edit_house', args: widen }] },
      ...Array.from({ length: MAX_REPAIRS + 1 }, () => ({ tools: [bad] })),
      { text: 'never reached' },
    ]);
    const r = await runTurn({ adapter: m.adapter, session, text: '加宽客厅，再开一扇 9 米的门' });
    expect(r.status).toBe('gave-up');
    expect(r.rejected).toBe(MAX_REPAIRS + 1);
    expect(m.requests).toHaveLength(MAX_REPAIRS + 2);
    // The first, valid batch is kept.
    expect(pos(session.house, '2')).toBe(7800);
    expect(r.committed).toBe(true);
    expect(session.undo()).toBe(before);
  });

  it('several batches in one turn are one undo step', async () => {
    const session = new HouseSession(starterHouse());
    const before = session.house;
    const m = scripted([
      { tools: [{ name: 'edit_house', args: widen }] },
      { tools: [{ name: 'edit_house', args: { summary: '书房改名', commands: [{ op: 'update_space', space: 'l1-study', name: '茶室' }] } }] },
      { text: '完成。' },
    ]);
    const r = await runTurn({ adapter: m.adapter, session, text: '加宽客厅，书房改茶室' });
    expect(r.changes.map((c) => c.summary)).toEqual(['客厅向东加宽 600 mm', '书房改名']);
    expect(session.history.undoDepth).toBe(1);
    expect(session.undo()).toBe(before);
  });

  it('describes the house once per turn and sends earlier turns as text only', async () => {
    const session = new HouseSession(starterHouse());
    const m1 = scripted([{ tools: [{ name: 'edit_house', args: widen }] }, { text: '好了。' }]);
    const r1 = await runTurn({ adapter: m1.adapter, session, text: '把客厅加宽 600' });
    const m2 = scripted([{ text: '客厅现在 5.4 m 宽。' }]);
    await runTurn({ adapter: m2.adapter, session, text: '客厅多宽？', past: [{ user: '把客厅加宽 600', assistant: r1.text, changes: r1.changes.map((c) => c.summary) }] });
    const msgs = m2.requests[0]!.messages;
    expect(msgs.map((x) => x.role)).toEqual(['system', 'user', 'assistant', 'user']);
    expect(msgs.some((x) => x.tool_calls)).toBe(false);
    expect(String(msgs[2]!.content)).toContain('客厅向东加宽 600 mm');
    // The new turn sees the edited grid.
    expect(systemText(msgs)).toContain('2=7800');
  });

  it('new_house replaces the house as one undo step', async () => {
    const session = new HouseSession(starterHouse());
    const m = scripted([
      { tools: [{ name: 'new_house', args: { template: 'blank', plotWidth: 12000, plotDepth: 20000, summary: '新建空地块' } }] },
      { text: '空地块已准备好。' },
    ]);
    const events: AgentEvent[] = [];
    const r = await runTurn({ adapter: m.adapter, session, text: '重新开始，地块 12 x 20 米', onEvent: (e) => events.push(e) });
    expect(r.committed).toBe(true);
    expect(session.house.site.width).toBe(12000);
    expect(events.find((e) => e.type === 'house')).toMatchObject({ reason: 'new' });
    expect(r.changes[0]!.summary).toBe('新建空地块');
  });

  it.each([
    [401, { error: { code: 'no_key', message: 'No provider key configured.' } }, 'no-key'],
    [401, { error: { message: 'Invalid API key' } }, 'auth'],
    [429, { error: { message: 'Rate limit exceeded' } }, 'rate-limit'],
    [502, { error: { message: 'Upstream unavailable' } }, 'upstream'],
  ] as const)('reports HTTP %i as %s and leaves the house alone', async (status, body, kind) => {
    const session = new HouseSession(starterHouse());
    const before = session.house;
    const m = scripted([{ status, body }]);
    const r = await runTurn({ adapter: m.adapter, session, text: '你好' });
    expect(r.status).toBe('error');
    expect(r.error?.kind).toBe(kind);
    expect(session.house).toBe(before);
    expect(r.committed).toBe(false);
  });

  it('passes per-request headers (bring-your-own key) to the relay', async () => {
    const session = new HouseSession(starterHouse());
    const m = scripted([{ text: 'hi' }], () => ({ 'x-opensu-key': 'sk-test' }));
    await runTurn({ adapter: m.adapter, session, text: 'hi' });
    expect(m.headers[0]!.get('x-opensu-key')).toBe('sk-test');
  });
});
