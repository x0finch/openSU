// Scripted OpenAI-compatible model for tests: each model call answers with
// the next scripted step as a Chat Completions SSE stream (text deltas and
// tool-call deltas split into small chunks, as providers send them).
import { createRelayAdapter } from '../src/provider';

export type Step =
  | { text?: string; tools?: { name: string; args: unknown }[] }
  | { status: number; body: unknown };

const base = { id: 'chatcmpl-test', object: 'chat.completion.chunk', created: 1, model: 'scripted' };

function chunks(step: { text?: string; tools?: { name: string; args: unknown }[] }, call: number): unknown[] {
  const out: unknown[] = [{ ...base, choices: [{ index: 0, delta: { role: 'assistant', content: '' } }] }];
  for (const part of (step.text ?? '').match(/[\s\S]{1,6}/g) ?? []) out.push({ ...base, choices: [{ index: 0, delta: { content: part } }] });
  (step.tools ?? []).forEach((t, i) => {
    const args = JSON.stringify(t.args);
    out.push({ ...base, choices: [{ index: 0, delta: { tool_calls: [{ index: i, id: `call_${call}_${i}`, type: 'function', function: { name: t.name, arguments: '' } }] } }] });
    for (const part of args.match(/[\s\S]{1,24}/g) ?? []) out.push({ ...base, choices: [{ index: 0, delta: { tool_calls: [{ index: i, function: { arguments: part } }] } }] });
  });
  out.push({ ...base, choices: [{ index: 0, delta: {}, finish_reason: step.tools?.length ? 'tool_calls' : 'stop' }] });
  out.push({ ...base, choices: [], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } });
  return out;
}

export function sseBody(step: { text?: string; tools?: { name: string; args: unknown }[] }, call = 0): string {
  return chunks(step, call).map((c) => `data: ${JSON.stringify(c)}\n\n`).join('') + 'data: [DONE]\n\n';
}

export interface Scripted {
  adapter: ReturnType<typeof createRelayAdapter>;
  /** Parsed request bodies, one per model call. */
  requests: { messages: { role: string; content?: unknown; tool_calls?: unknown }[]; tools?: unknown[]; model: string }[];
  headers: Headers[];
  urls: string[];
}

export function scripted(steps: Step[], headers?: () => Record<string, string>): Scripted {
  const s: Scripted = { adapter: null as never, requests: [], headers: [], urls: [] };
  let call = 0;
  const fetchFn = async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    s.urls.push(String(input));
    s.requests.push(JSON.parse(String(init?.body)));
    s.headers.push(new Headers(init?.headers));
    const step = steps[call++];
    if (!step) throw new Error(`scripted model: no step for call ${call}`);
    if ('status' in step) return new Response(JSON.stringify(step.body), { status: step.status, headers: { 'content-type': 'application/json' } });
    return new Response(sseBody(step, call), { headers: { 'content-type': 'text/event-stream' } });
  };
  s.adapter = createRelayAdapter({ endpoint: '/api/chat', fetch: fetchFn as typeof fetch, headers });
  return s;
}
