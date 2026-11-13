// Evaluation only. An OpenAI-compatible /v1/chat/completions server that
// answers with Claude through the local `claude -p` CLI (the CLI's own login,
// no API key in the repo). The app's system prompt, history and tool schemas
// go to the model; it answers with one JSON turn, which is streamed back as
// OpenAI SSE (text and tool-call deltas). Every call is logged; a replay
// directory serves logged turns again without calling the model.
//
//   node tools/eval/bridge.mjs [port] [--log dir] [--replay dir] [--model opus]
// or startBridge({...}) from run.mjs.
import { createServer } from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync, readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** True when the `claude` CLI is on PATH. */
export function hasClaudeCli() {
  return spawnSync('claude', ['--version'], { stdio: 'ignore' }).status === 0;
}

let LOG = 'artifacts/eval/log';
let REPLAY = null;
let MODEL = 'opus';
// The CLI runs in an empty directory so no project CLAUDE.md or settings leak in.
const EMPTY = mkdtempSync(join(tmpdir(), 'opensu-eval-'));
let n = 0;

const text = (c) => (typeof c === 'string' ? c : Array.isArray(c) ? c.map((p) => p.text ?? '').join('') : c == null ? '' : JSON.stringify(c));

function buildPrompts(body) {
  const sys = body.messages.filter((m) => m.role === 'system').map((m) => text(m.content)).join('\n\n');
  const tools = (body.tools ?? []).map((t) => t.function ?? t);
  const bridge = `\n\n---\nYou are the language model behind this app's chat. You cannot run anything yourself. The app runs the functions below when you call them and sends the results back on the next turn.\n\nAnswer with ONLY one JSON object, no prose around it, no code fence:\n{"content": "<text shown to the user, may be empty>", "tool_calls": [{"name": "<function>", "arguments": {...}}]}\nUse "tool_calls": [] when you are not calling a function. Arguments must follow the function's JSON schema exactly.\n\nFunctions:\n${JSON.stringify(tools, null, 1)}`;
  const turns = body.messages
    .filter((m) => m.role !== 'system')
    .map((m) => {
      if (m.role === 'user') return `### user\n${text(m.content)}`;
      if (m.role === 'tool') return `### result of function call ${m.tool_call_id ?? ''}\n${text(m.content)}`;
      const calls = (m.tool_calls ?? []).map((c) => `[called ${c.function.name} id=${c.id} with ${c.function.arguments}]`).join('\n');
      return `### assistant\n${text(m.content)}${calls ? '\n' + calls : ''}`;
    });
  return { system: sys + bridge, user: turns.join('\n\n') + '\n\nWrite the next assistant turn now, as the JSON object.' };
}

function runClaude(system, user) {
  return new Promise((resolve, reject) => {
    const p = spawn('claude', ['-p', '--model', MODEL, '--output-format', 'json', '--no-session-persistence', '--tools', '', '--system-prompt', system], { cwd: EMPTY, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (err += d));
    p.on('close', (code) => {
      try {
        resolve(JSON.parse(out));
      } catch {
        reject(new Error(`claude exit ${code}: ${err || out}`.slice(0, 2000)));
      }
    });
    p.stdin.end(user);
  });
}

function parseTurn(s) {
  const t = s.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const a = t.indexOf('{');
  const b = t.lastIndexOf('}');
  try {
    const j = JSON.parse(t.slice(a, b + 1));
    return { content: j.content ?? '', tool_calls: j.tool_calls ?? [] };
  } catch {
    return { content: s, tool_calls: [], unparsed: true };
  }
}

const handler = async (req, res) => {
  if (req.method !== 'POST' || !req.url.endsWith('/chat/completions')) {
    res.writeHead(404);
    return res.end();
  }
  let raw = '';
  for await (const c of req) raw += c;
  const body = JSON.parse(raw);
  const id = ++n;
  const t0 = Date.now();
  const tag = String(id).padStart(3, '0');
  const { system, user } = buildPrompts(body);
  let turn;
  let meta = {};
  try {
    const r = REPLAY
      ? { result: JSON.stringify(JSON.parse(readFileSync(join(REPLAY, `${tag}.json`), 'utf8')).turn), total_cost_usd: 0, modelUsage: { replay: 1 } }
      : await runClaude(system, user);
    turn = parseTurn(r.result ?? '');
    meta = { cost: r.total_cost_usd, ms: Date.now() - t0, model: Object.keys(r.modelUsage ?? {}) };
  } catch (e) {
    writeFileSync(join(LOG, `${tag}-error.txt`), String(e));
    res.writeHead(502, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ error: { message: String(e).slice(0, 500) } }));
  }
  writeFileSync(join(LOG, `${tag}.json`), JSON.stringify({ meta, request: body, turn }, null, 1));
  console.log(`#${id} ${meta.ms}ms $${meta.cost?.toFixed(3)} tools=${turn.tool_calls.map((c) => c.name).join(',') || '-'} ${turn.unparsed ? 'UNPARSED' : ''}`);
  const calls = turn.tool_calls.map((c, i) => ({ id: `call_${id}_${i}`, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.arguments ?? {}) } }));
  const finish = calls.length ? 'tool_calls' : 'stop';
  const base = { id: `chatcmpl-bridge-${id}`, object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000), model: 'claude-opus-5-5' };
  if (!body.stream) {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ ...base, object: 'chat.completion', choices: [{ index: 0, message: { role: 'assistant', content: turn.content, ...(calls.length ? { tool_calls: calls } : {}) }, finish_reason: finish }] }));
  }
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
  const send = (o) => res.write(`data: ${JSON.stringify(o)}\n\n`);
  send({ ...base, choices: [{ index: 0, delta: { role: 'assistant', content: '' }, finish_reason: null }] });
  for (const part of turn.content.match(/[\s\S]{1,8}/g) ?? []) send({ ...base, choices: [{ index: 0, delta: { content: part }, finish_reason: null }] });
  calls.forEach((c, i) => {
    send({ ...base, choices: [{ index: 0, delta: { tool_calls: [{ index: i, id: c.id, type: 'function', function: { name: c.function.name, arguments: '' } }] }, finish_reason: null }] });
    for (const part of c.function.arguments.match(/[\s\S]{1,200}/g) ?? []) send({ ...base, choices: [{ index: 0, delta: { tool_calls: [{ index: i, function: { arguments: part } }] }, finish_reason: null }] });
  });
  send({ ...base, choices: [{ index: 0, delta: {}, finish_reason: finish }] });
  res.end('data: [DONE]\n\n');
};

/** Starts the bridge; resolves to { url, close }. */
export function startBridge({ port = 8788, log = LOG, replay = null, model = MODEL } = {}) {
  LOG = log;
  REPLAY = replay;
  MODEL = model;
  n = 0;
  mkdirSync(LOG, { recursive: true });
  if (!REPLAY && !hasClaudeCli()) throw new Error('The `claude` CLI is not on PATH: install Claude Code and log in, or pass a replay directory.');
  return new Promise((ok) => {
    const server = createServer(handler).listen(port, '127.0.0.1', () => ok({ url: `http://127.0.0.1:${port}/v1`, close: () => server.close() }));
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
  try {
    const b = await startBridge({ port: Number(args[0]) || 8788, log: opt('--log') ?? LOG, replay: opt('--replay') ?? null, model: opt('--model') ?? MODEL });
    console.log(`bridge on ${b.url}`);
  } catch (e) {
    console.error(String(e.message ?? e));
    process.exit(1);
  }
}
