// Checks the /api/chat relay function directly (Node, upstream mocked) and
// estimates its CPU time per request. workerd exposes no per-request CPU
// time locally, so this is a V8-in-Node approximation; the real limit
// (10 ms on the free plan) can only be checked on Cloudflare.
//
//   node --experimental-strip-types scripts/relay-check.mjs
import * as relay from '../src/server/chat-relay.ts';

// The quota (task 019) is checked in auth-check.ts; here it is off unless a
// test turns it on.
const relayChat = (r, env) => relay.relayChat(r, { QUOTA_ENABLED: 'false', ...env });
const relayStatus = (env) => relay.relayStatus(new Request('https://opensu.example/api/chat'), { QUOTA_ENABLED: 'false', ...env });

const failures = [];
const check = (cond, msg) => {
  if (!cond) failures.push(msg);
  console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${msg}`);
};

// Upstream mock: records the call, answers with a short SSE stream.
const sse = Array.from({ length: 60 }, (_, i) => `data: {"choices":[{"index":0,"delta":{"content":"chunk ${i} 客厅"}}]}\n\n`).join('') + 'data: [DONE]\n\n';
let last = null;
globalThis.fetch = async (url, init) => {
  last = { url: String(url), headers: new Headers(init.headers), body: JSON.parse(init.body) };
  return new Response(sse, { status: 200, headers: { 'content-type': 'text/event-stream', 'set-cookie': 'secret=1', 'x-upstream': 'leak' } });
};

const req = (headers = {}, body = { model: 'default', stream: false, max_tokens: 99999, messages: [{ role: 'user', content: 'hi' }] }) =>
  new Request('https://opensu.example/api/chat', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });

// No key anywhere.
{
  const r = await relayChat(req(), {});
  const j = await r.json();
  check(r.status === 401 && j.error.code === 'no_key', 'no key configured -> 401 no_key');
  const s = await (await relayStatus({})).json();
  check(s.serverKey === false && s.model === null, 'status without a key');
}

// Owner key (OpenRouter).
{
  const env = { OPENROUTER_API_KEY: 'sk-or-owner', OPENSU_MODEL: 'anthropic/claude-sonnet-5.5' };
  const r = await relayChat(req(), env);
  const text = await r.text();
  check(r.status === 200 && text === sse, 'owner key: the upstream stream comes back byte for byte');
  check(last.url === 'https://openrouter.ai/api/v1/chat/completions', 'owner key: OpenRouter chat/completions');
  check(last.headers.get('authorization') === 'Bearer sk-or-owner', 'owner key: Authorization added by the relay');
  check(last.body.model === 'anthropic/claude-sonnet-5.5' && last.body.stream === true && last.body.max_tokens === 4096, 'owner key: model, stream and output cap set by the relay');
  check(!r.headers.has('set-cookie') && !r.headers.has('x-upstream'), 'upstream headers are not passed to the browser');
  const s = await (await relayStatus(env)).text();
  check(!s.includes('sk-or-owner'), 'status does not reveal the key');
  const c = await relayChat(req({ 'x-opensu-key': '' }, { model: 'openai/gpt-6-astra-pro', messages: [] }), env);
  await c.text();
  check(last.body.model === 'anthropic/claude-sonnet-5.5', 'owner key: the client cannot pick another model');
}

// Owner key (OpenAI-compatible base URL).
{
  await (await relayChat(req(), { OPENAI_API_KEY: 'sk-owner', OPENAI_BASE_URL: 'http://127.0.0.1:9/v1', OPENSU_MODEL: 'm' })).text();
  check(last.url === 'http://127.0.0.1:9/v1/chat/completions' && last.headers.get('authorization') === 'Bearer sk-owner' && last.body.max_tokens === 99999, 'OPENAI_BASE_URL: custom server, no output cap rewrite');
  await (await relayChat(req(), { OPENAI_API_KEY: 'sk-owner' })).text();
  check(last.url === 'https://api.openai.com/v1/chat/completions' && last.body.max_completion_tokens === 4096 && !('max_tokens' in last.body), 'OpenAI: max_completion_tokens cap');
}

// Bring your own key.
{
  const env = { OPENROUTER_API_KEY: 'sk-or-owner' };
  await (await relayChat(req({ 'x-opensu-key': 'sk-user', 'x-opensu-base-url': 'https://api.example.com/v1/' }, { model: 'my/model', messages: [] }), env)).text();
  check(last.url === 'https://api.example.com/v1/chat/completions', 'BYO: the user base URL is used');
  check(last.headers.get('authorization') === 'Bearer sk-user', 'BYO: the user key replaces the owner key');
  check(last.body.model === 'my/model' && !('max_tokens' in last.body), 'BYO: the user model is kept, no cap');
  check(![...last.headers.keys()].some((k) => k.startsWith('x-opensu')), 'BYO: the key header itself is not forwarded');
  await (await relayChat(req({ 'x-opensu-key': 'sk-user' }, { model: 'default', messages: [] }), env)).text();
  check(last.url.startsWith('https://openrouter.ai/') && last.body.model === 'deepseek/deepseek-v4.1-flash', 'BYO without base URL: OpenRouter and the default model');
  const bad = await relayChat(req({ 'x-opensu-key': 'sk-user', 'x-opensu-base-url': 'http://169.254.169.254/latest' }), env);
  check(bad.status === 400, 'BYO: non-https base URLs are refused');
  const bad2 = await relayChat(req({ 'x-opensu-key': 'sk-user', 'x-opensu-base-url': 'https://u:p@evil.example/v1' }), env);
  check(bad2.status === 400, 'BYO: base URLs with credentials are refused');
}

// Quota on but no database bound: the owner's key is refused (fail closed), own keys work.
{
  const env = { OPENROUTER_API_KEY: 'sk-or-owner', QUOTA_ENABLED: 'true' };
  const r = await relayChat(req(), env);
  check(r.status === 503 && (await r.json()).error.code === 'quota_unavailable', 'quota without a database: owner key refused (503 quota_unavailable)');
  const own = await relayChat(req({ 'x-opensu-key': 'sk-user' }), env);
  await own.text();
  check(own.status === 200, 'quota without a database: own key still works');
  const s = await (await relayStatus(env)).json();
  check(s.serverKey === false, 'quota without a database: status says there is no usable server key');
}

// Oversized and malformed bodies.
{
  const big = await relayChat(req({}, 'x'.repeat(1600 * 1024)), { OPENROUTER_API_KEY: 'k' });
  check(big.status === 413, 'bodies over 1.5 MB are refused');
  const bad = await relayChat(req({}, '{nope'), { OPENROUTER_API_KEY: 'k' });
  check(bad.status === 400, 'non-JSON body -> 400');
}

// CPU estimate with a realistic request (system prompt + house description +
// trimmed history + tool traffic, about the largest seen in the e2e run).
{
  const env = { OPENROUTER_API_KEY: 'sk-or-owner' };
  const body = JSON.stringify({
    model: 'default',
    messages: [
      { role: 'system', content: 'S'.repeat(22000) + '\n' + 'LEVEL L1 "一层" height 3300 ...\n'.repeat(180) },
      ...Array.from({ length: 16 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: '把客厅加宽 600 '.repeat(20) })),
      { role: 'tool', tool_call_id: 'c1', content: JSON.stringify({ ok: true, applied: ['x'.repeat(200)], changed: '+ - l1-living living 1-2/B-C\n'.repeat(40) }) },
    ],
    tools: [{ type: 'function', function: { name: 'edit_house', description: 'd', parameters: { type: 'object', properties: { s: { type: 'string', description: 'x'.repeat(14000) } } } } }],
    stream: true,
  });
  const run = async () => {
    const r = await relayChat(req({}, body), env);
    return r;
  };
  for (let i = 0; i < 50; i++) await (await run()).arrayBuffer();
  const N = 300;
  let relayUs = 0;
  for (let i = 0; i < N; i++) {
    const r0 = req({}, body);
    const c0 = process.cpuUsage();
    const res = await relayChat(r0, env);
    const c = process.cpuUsage(c0);
    relayUs += c.user + c.system;
    await res.arrayBuffer();
  }
  const ms = relayUs / N / 1000;
  console.log(`  relay CPU per request (Node V8, ${(body.length / 1024).toFixed(1)} KB body, upstream mocked): ${ms.toFixed(3)} ms`);
  check(ms < 5, `relay CPU well under the 10 ms free-tier limit in this approximation (${ms.toFixed(2)} ms)`);
}

// The same with the images of one message (task 038): four JPEGs at the browser's cap (1024 px, 140 KB as base64).
// A CI runner measures about 1.7x a laptop; the limit is the Worker's 10 ms, checked here with room below it.
{
  const env = { OPENROUTER_API_KEY: 'sk-or-owner' };
  const image = (k) => ({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${String.fromCharCode(65 + k).repeat(140 * 1024)}` } });
  const body = JSON.stringify({
    model: 'default',
    messages: [
      { role: 'system', content: 'S'.repeat(22000) + '\n' + 'LEVEL L1 "一层" height 3300 ...\n'.repeat(180) },
      { role: 'user', content: [{ type: 'text', text: '照着图1改' }, ...[0, 1, 2, 3].map(image)] },
    ],
    stream: true,
  });
  for (let i = 0; i < 20; i++) await (await relayChat(req({}, body), env)).arrayBuffer();
  const N = 100;
  let relayUs = 0;
  for (let i = 0; i < N; i++) {
    const r0 = req({}, body);
    const c0 = process.cpuUsage();
    const res = await relayChat(r0, env);
    const c = process.cpuUsage(c0);
    relayUs += c.user + c.system;
    await res.arrayBuffer();
  }
  const ms = relayUs / N / 1000;
  console.log(`  relay CPU per request with four images (${(body.length / 1024).toFixed(0)} KB body, upstream mocked): ${ms.toFixed(3)} ms`);
  check(ms < 8, `relay CPU with images under the 10 ms free-tier limit in this approximation (${ms.toFixed(2)} ms)`);
}

if (failures.length) {
  console.error(`\n${failures.length} relay check(s) failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('\nAll relay checks passed.');
