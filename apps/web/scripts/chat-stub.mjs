// A scripted OpenAI-compatible Chat Completions server for tests and
// screenshots ONLY. It is not a model: it recognises a few fixed user
// messages and replays canned answers (SSE text deltas and tool-call
// deltas, as providers stream them). Nothing here says anything about how
// a real model behaves.
//
//   node scripts/chat-stub.mjs [port]      standalone, prints its base URL
//
// Endpoints: POST /v1/chat/completions, GET /__requests (what it received,
// for assertions), POST /__config {"delay": ms, "holdMs": ms}.
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';

/** Expected credentials from the relay (see chat-e2e.mjs). */
export const STUB_KEY = 'stub-key-not-a-secret';
export const STUB_MODEL = 'stub/scripted-model';

const cjk = (s) => /[一-鿿]/.test(s);

/**
 * Conversations. Each is a list of steps; the step is chosen by how many
 * tool results follow the last user message. A step is { text, tools } or
 * { status, body } (an HTTP error).
 */
const SCRIPTS = [
  {
    name: 'widen-living',
    match: /客厅.*加宽|living room.*wider/i,
    steps: (zh) => [
      {
        text: zh
          ? '好的，客厅向西加宽 600 mm：把西墙所在的轴线 1 外移。同一条轴线上的餐厅、厨房，以及二楼的主卧、卫生间和儿童房也会一起变宽。'
          : 'Sure: the living room grows 600 mm to the west by moving grid line 1. The dining room and kitchen on that line, and the master bedroom, bathroom and kids room upstairs, widen with it.',
        hold: true,
        tools: [{ name: 'edit_house', args: { summary: zh ? '客厅向西加宽 600 mm' : 'Living room 600 mm wider (west)', commands: [{ op: 'move_grid_line', line: '1', by: -600 }] } }],
      },
      {
        text: zh
          ? '改好了。客厅现在 **5.4 × 4.8 m**，约 25.9 m²；整栋房子的建筑面积增加约 12.2 m²。西侧院子从 2.4 m 收窄到 1.8 m，仍可通行。'
          : 'Done. The living room is now **5.4 × 4.8 m**, about 25.9 m²; the house gains about 12.2 m² in total. The west side yard narrows from 2.4 m to 1.8 m and stays passable.',
      },
    ],
  },
  {
    name: 'study-to-bedroom',
    match: /书房.*卧室|study.*bedroom/i,
    steps: (zh) => [
      // A deliberately wrong id: the validator answers with the nearest ids.
      { tools: [{ name: 'edit_house', args: { summary: zh ? '二楼书房改为卧室' : 'Upstairs study becomes a bedroom', commands: [{ op: 'update_space', space: 'l2-studyroom', type: 'bedroom', name: '卧室', nameEn: 'Bedroom' }] } }] },
      {
        text: zh ? '书房的编号是 l2-study，我改正后重新提交。' : 'The study id is l2-study; resubmitting with the right id.',
        tools: [{ name: 'edit_house', args: { summary: zh ? '二楼书房改为卧室' : 'Upstairs study becomes a bedroom', commands: [{ op: 'update_space', space: 'l2-study', type: 'bedroom', name: '卧室', nameEn: 'Bedroom' }] } }],
      },
      {
        text: zh
          ? '二楼书房已改成卧室：4.5 × 2.7 m，约 12.2 m²，北窗 1.8 m。它朝北，冬天没有直射阳光；如果更看重采光，可以和南侧的次卧对调。'
          : 'The upstairs study is now a bedroom: 4.5 × 2.7 m, about 12.2 m², with a 1.8 m north window. Facing north it gets no direct winter sun; swap it with the south bedroom if daylight matters more.',
      },
    ],
  },
  {
    name: 'roof-pitch',
    match: /坡度|flatter/i,
    steps: (zh) => [
      { tools: [{ name: 'edit_house', args: { summary: zh ? '屋顶坡度 26° 改为 20°' : 'Roof pitch 26° to 20°', commands: [{ op: 'update_roof', roof: 'roof-main', pitchDeg: 20 }] } }] },
      { text: zh ? '屋顶坡度从 26° 改为 20°，屋脊降低约 0.6 m，外观更舒展；坡度仍够排水。' : 'The roof pitch goes from 26° to 20°: the ridge drops by about 0.6 m and the house looks calmer; still steep enough to drain.' },
    ],
  },
  {
    name: 'new-house',
    match: /新房子|重新开始|start a new house|start over/i,
    steps: (zh) => [
      { tools: [{ name: 'new_house', args: { template: 'starter', summary: zh ? '新建两层样板房' : 'New two-storey starter house' } }] },
      { text: zh ? '新房子准备好了：两层，12 × 10.2 m，建筑面积约 245 m²。告诉我你的宅基地尺寸和房间需求，我来调整。' : 'A new house is ready: two storeys, 12 × 10.2 m, about 245 m². Tell me your plot size and the rooms you need and I will adapt it.' },
    ],
  },
  {
    name: 'give-up',
    match: /9 ?米|9 ?m door/i,
    steps: () => Array.from({ length: 6 }, () => ({ tools: [{ name: 'edit_house', args: { summary: '开 9 米的门', commands: [{ op: 'add_opening', kind: 'door', host: { space: 'l1-living', side: 'S' }, width: 9000 }] } }] })),
  },
  {
    name: 'rate-limit',
    match: /限流|rate limit/i,
    steps: () => [{ status: 429, body: { error: { message: 'Rate limit exceeded (stub)', code: 429 } } }],
  },
  {
    name: 'fallback',
    match: /[\s\S]*/,
    steps: (zh) => [{ text: zh ? '（测试桩）这是预设的回答，没有调用真实模型。' : '(Test stub) This is a canned answer; no real model was called.' }],
  },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function lastUser(messages) {
  let i = messages.length - 1;
  while (i >= 0 && messages[i].role !== 'user') i--;
  const content = messages[i]?.content;
  const text = typeof content === 'string' ? content : Array.isArray(content) ? content.map((p) => p.text ?? '').join('') : '';
  const toolResults = messages.slice(i + 1).filter((m) => m.role === 'tool').length;
  return { text, toolResults };
}

function* chunks(step, call) {
  const base = { id: `chatcmpl-stub-${call}`, object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000), model: STUB_MODEL };
  yield { ...base, choices: [{ index: 0, delta: { role: 'assistant', content: '' }, finish_reason: null }] };
  for (const part of (step.text ?? '').match(/[\s\S]{1,3}/g) ?? []) yield { ...base, choices: [{ index: 0, delta: { content: part }, finish_reason: null }] };
  if (step.hold) yield 'hold';
  for (const [i, t] of (step.tools ?? []).entries()) {
    const args = JSON.stringify(t.args);
    yield { ...base, choices: [{ index: 0, delta: { tool_calls: [{ index: i, id: `call_${call}_${i}`, type: 'function', function: { name: t.name, arguments: '' } }] }, finish_reason: null }] };
    for (const part of args.match(/[\s\S]{1,40}/g) ?? []) yield { ...base, choices: [{ index: 0, delta: { tool_calls: [{ index: i, function: { arguments: part } }] }, finish_reason: null }] };
  }
  yield { ...base, choices: [{ index: 0, delta: {}, finish_reason: step.tools?.length ? 'tool_calls' : 'stop' }] };
  yield { ...base, choices: [], usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 } };
}

export function startStub(port = 0) {
  const received = [];
  const config = { delay: 12, holdMs: 0 };
  let calls = 0;
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://stub');
    let raw = '';
    for await (const c of req) raw += c;
    if (url.pathname === '/__requests') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(received));
      return;
    }
    if (url.pathname === '/__config') {
      Object.assign(config, JSON.parse(raw || '{}'));
      res.writeHead(204).end();
      return;
    }
    if (req.method !== 'POST' || url.pathname !== '/v1/chat/completions') {
      res.writeHead(404).end();
      return;
    }
    const body = JSON.parse(raw);
    const { text, toolResults } = lastUser(body.messages ?? []);
    const script = SCRIPTS.find((s) => s.match.test(text));
    const steps = script.steps(cjk(text));
    const step = steps[Math.min(toolResults, steps.length - 1)];
    received.push({
      authorization: req.headers.authorization ?? null,
      headers: Object.keys(req.headers),
      model: body.model,
      stream: body.stream,
      max_tokens: body.max_tokens,
      script: script.name,
      step: toolResults,
      tools: (body.tools ?? []).map((t) => t.function?.name),
      messages: (body.messages ?? []).map((m) => ({ role: m.role, length: JSON.stringify(m.content ?? '').length })),
      toolResults: (body.messages ?? []).filter((m) => m.role === 'tool').map((m) => m.content),
      bytes: raw.length,
    });
    if (req.headers.authorization !== `Bearer ${STUB_KEY}`) {
      res.writeHead(401, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'stub: unexpected key' } }));
      return;
    }
    if ('status' in step) {
      res.writeHead(step.status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(step.body));
      return;
    }
    const call = ++calls;
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
    res.write(': OPENROUTER PROCESSING\n\n');
    for (const c of chunks(step, call)) {
      if (c === 'hold') {
        if (config.holdMs) await sleep(config.holdMs);
        continue;
      }
      res.write(`data: ${JSON.stringify(c)}\n\n`);
      if (config.delay) await sleep(config.delay);
    }
    res.end('data: [DONE]\n\n');
  });
  return new Promise((ok) => {
    server.listen(port, '127.0.0.1', () => {
      const { port: p } = server.address();
      ok({ url: `http://127.0.0.1:${p}/v1`, port: p, received, config, close: () => new Promise((r) => server.close(r)) });
    });
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const s = await startStub(Number(process.argv[2] ?? 0));
  console.log(`chat stub on ${s.url} (key "${STUB_KEY}", model "${STUB_MODEL}")`);
}
