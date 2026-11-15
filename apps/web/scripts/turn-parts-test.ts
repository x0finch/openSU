// Unit tests of an assistant turn's structure (task 018; node --test, types stripped).
//   node --experimental-strip-types --no-warnings --test scripts/turn-parts-test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addCall, addChange, addText, type TurnPart, turnView } from '../src/chat/turn-parts.ts';

/** Replays agent events the way the chat store does. */
function build(events: (string | { call: true } | { change: number })[]): TurnPart[] {
  let parts: TurnPart[] = [];
  for (const e of events) {
    if (typeof e === 'string') parts = addText(parts, e);
    else if ('call' in e) parts = addCall(parts);
    else parts = addChange(parts, e.change);
  }
  return parts;
}

test('a multi-step build: each sentence is followed by the change it led to, then the final text', () => {
  const parts = build([
    '先搭', '一层。', '\n\n', { call: true }, { change: 0 },
    '一层已经搭好。接下来加二层。', '\n\n', { call: true }, { change: 1 },
    '三层已建好，', '总建筑面积约 329 m²。',
  ]);
  const v = turnView({ text: 'ignored', parts, changes: [{}, {}] });
  assert.deepEqual(v.timeline, [
    { type: 'text', text: '先搭一层。' },
    { type: 'change', change: 0 },
    { type: 'text', text: '一层已经搭好。接下来加二层。' },
    { type: 'change', change: 1 },
  ]);
  assert.equal(v.final, '三层已建好，总建筑面积约 329 m²。');
  assert.equal(v.structured, true);
  assert.equal(v.calledTools, true);
});

test('a call before any text, and several calls in one response', () => {
  const parts = build([{ call: true }, { call: true }, { change: 0 }, { change: 1 }, '完成。']);
  const v = turnView({ text: '完成。', parts });
  assert.deepEqual(v.timeline, [{ type: 'change', change: 0 }, { type: 'change', change: 1 }]);
  assert.equal(v.final, '完成。');
});

test('the final text is the text after the LAST tool call, even when that call changed nothing', () => {
  // An edit, then a rejected batch (no change), then a repaired one, then get_house, then the reply.
  const parts = build(['改一下。', { call: true }, { change: 0 }, '有一处不对，我修正。', { call: true }, { call: true }, { change: 1 }, { call: true }, '好了。']);
  const v = turnView({ text: '', parts });
  assert.equal(v.final, '好了。');
  assert.deepEqual(v.timeline.map((e) => (e.type === 'text' ? e.text : `#${e.change}`)), ['改一下。', '#0', '有一处不对，我修正。', '#1']);
});

test('a turn without tool calls is just its text', () => {
  const v = turnView({ text: '你好！', parts: build(['你好', '！']) });
  assert.deepEqual(v.timeline, []);
  assert.equal(v.final, '你好！');
  assert.equal(v.calledTools, false);
});

test('a turn that ended on a tool call (stopped, gave up) has no final text', () => {
  const v = turnView({ text: '我来改。', parts: build(['我来改。', { call: true }]) });
  assert.equal(v.final, '');
  assert.deepEqual(v.timeline, [{ type: 'text', text: '我来改。' }]);
});

test('an older autosave without the structure renders as plain text', () => {
  const legacy = JSON.parse(JSON.stringify({ id: 'm2', role: 'assistant', text: '先搭一层。\n\n三层已建好。', phase: 'done', changes: [{ summary: 'a', details: [] }] }));
  const v = turnView(legacy);
  assert.equal(v.structured, false);
  assert.deepEqual(v.timeline, []);
  assert.equal(v.final, '先搭一层。\n\n三层已建好。');
  assert.equal(v.calledTools, true);
});

test('the structure survives the autosave (JSON round trip)', () => {
  const parts = build(['先搭一层。', { call: true }, { change: 0 }, '好了。']);
  const back = JSON.parse(JSON.stringify({ text: '先搭一层。\n\n好了。', parts }));
  assert.deepEqual(turnView(back), turnView({ text: '先搭一层。\n\n好了。', parts }));
});

test('building never mutates the previous parts (the store keeps old snapshots)', () => {
  const a = build(['x']);
  const b = addCall(a);
  const c = addChange(b, 0);
  addText(c, 'y');
  assert.deepEqual(a, [{ type: 'text', text: 'x' }]);
  assert.deepEqual(b, [{ type: 'text', text: 'x' }, { type: 'text', text: '' }]);
  assert.deepEqual(c, [{ type: 'text', text: 'x' }, { type: 'change', change: 0 }, { type: 'text', text: '' }]);
});

test('with call indexes (task 020): calls stay in place, the view is unchanged', () => {
  const events: (string | { call: number } | { change: number })[] = ['改一下。', { call: 0 }, { change: 0 }, '有一处不对，我修正。', { call: 1 }, { call: 2 }, { change: 1 }, { call: 3 }, '好了。'];
  let parts: TurnPart[] = [];
  let plain: TurnPart[] = [];
  for (const e of events) {
    if (typeof e === 'string') (parts = addText(parts, e)), (plain = addText(plain, e));
    else if ('call' in e) (parts = addCall(parts, e.call)), (plain = addCall(plain));
    else (parts = addChange(parts, e.change)), (plain = addChange(plain, e.change));
  }
  assert.deepEqual(parts.filter((p) => p.type === 'call').map((p) => (p as { call: number }).call), [0, 1, 2, 3]);
  assert.deepEqual(parts.filter((p) => p.type !== 'call'), plain);
  assert.deepEqual(parts.map((p) => (p.type === 'text' ? p.text : p.type === 'call' ? `c${p.call}` : `#${p.change}`)), ['改一下。', 'c0', '#0', '有一处不对，我修正。', 'c1', 'c2', '#1', 'c3', '好了。']);
  assert.deepEqual(turnView({ text: '', parts }), turnView({ text: '', parts: plain }));
  assert.equal(turnView({ text: '', parts: addCall([], 0) }).calledTools, true);
});
