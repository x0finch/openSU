// The turn controller: one user message -> TanStack AI's agent loop with the
// house tools -> streamed text, live house updates, one undo step.
import { describeHouse, History, type House, validate } from '@opensu/model';
import { type AnyTextAdapter, chat, combineStrategies, maxIterations, type ModelMessage } from '@tanstack/ai';
import { houseContext, SYSTEM_PROMPT } from './prompt';
import { type AppliedBatch, createHouseTools, type FindPlace } from './tools';

/** Repair attempts per user message after a rejected edit. */
export const MAX_REPAIRS = 3;
/** Earlier turns sent with a new message (text only; tool traffic is dropped). */
export const HISTORY_TURNS = 8;

/** One finished exchange, as remembered for later turns. */
export interface PastTurn {
  user: string;
  assistant: string;
  /** One-line summaries of the batches applied in that turn. */
  changes: string[];
}

/** The house and its undo history; one undo step per user turn. */
export class HouseSession {
  readonly history: History;
  constructor(house: House) {
    this.history = new History(house);
  }
  get house(): House {
    return this.history.current;
  }
  /** Records the result of a turn (no-op when unchanged). */
  commit(house: House): void {
    this.history.push(house);
  }
  /** Steps back one turn; returns the restored house or null. */
  undo(): House | null {
    return this.history.undo();
  }
  redo(): House | null {
    return this.history.redo();
  }
  /** Replaces the house outside a turn (e.g. load a template) as one undo step. */
  replace(house: House): void {
    this.history.push(house);
  }
}

export type AgentEvent =
  | { type: 'text'; delta: string }
  | { type: 'tool-call'; name: string }
  | { type: 'house'; house: House; reason: 'edit' | 'new'; fromLevel: number; batch: AppliedBatch }
  | { type: 'rejected'; errors: string[]; repairsLeft: number };

export type TurnStatus = 'ok' | 'gave-up' | 'aborted' | 'error';

export interface TurnError {
  /** `no-key`: the server has no provider key and none was given; `auth`: the key was refused. */
  kind: 'no-key' | 'auth' | 'rate-limit' | 'upstream' | 'network';
  message: string;
  status?: number;
}

export interface TurnResult {
  status: TurnStatus;
  /** Assistant text of the whole turn. */
  text: string;
  /** Batches applied (and kept) in this turn. */
  changes: AppliedBatch[];
  before: House;
  after: House;
  /** True when the house changed and the change was committed as one undo step. */
  committed: boolean;
  /** Rejected batches in this turn. */
  rejected: number;
  error?: TurnError;
}

export interface TurnOptions {
  adapter: AnyTextAdapter;
  session: HouseSession;
  text: string;
  past?: readonly PastTurn[];
  signal?: AbortSignal;
  onEvent?: (e: AgentEvent) => void;
  threadId?: string;
  maxRepairs?: number;
  /** Place lookup for the `find_place` tool (the tool is offered only with it). */
  findPlace?: FindPlace;
}

/** Earlier turns as plain messages (newest `HISTORY_TURNS`). */
export function pastMessages(past: readonly PastTurn[]): ModelMessage[] {
  const out: ModelMessage[] = [];
  for (const t of past.slice(-HISTORY_TURNS)) {
    out.push({ role: 'user', content: t.user });
    const note = t.changes.length ? `\n\n(Edits applied: ${t.changes.join('; ')})` : '';
    out.push({ role: 'assistant', content: `${t.assistant}${note}`.trim() || '(no reply)' });
  }
  return out;
}

/** Maps an error from the provider call to what the UI tells the user. */
export function classifyError(err: unknown): TurnError {
  const e = err as { status?: number; code?: string; message?: string; error?: { code?: string; message?: string } } | undefined;
  const code = e?.error?.code ?? e?.code;
  // Errors inside a 200 stream carry the HTTP-like status as their code (OpenRouter).
  const status = typeof e?.status === 'number' ? e.status : Number(code) >= 400 && Number(code) < 600 ? Number(code) : undefined;
  const message = e?.error?.message ?? e?.message ?? String(err);
  if (code === 'no_key' || /no_key/.test(message)) return { kind: 'no-key', message, status };
  if (status === 401 || status === 403) return { kind: 'auth', message, status };
  if (status === 429) return { kind: 'rate-limit', message, status };
  if (status !== undefined) return { kind: 'upstream', message, status };
  return { kind: 'network', message };
}

/**
 * Runs one user turn. Tool calls execute here, on the working copy of the
 * house; every kept batch is reported at once (`house` event) so the drawing
 * follows the conversation. At the end the final house is committed as one
 * undo step. After `maxRepairs` rejected repairs the loop stops and the
 * house stays at the last valid state.
 */
export async function runTurn(opts: TurnOptions): Promise<TurnResult> {
  const { session, onEvent } = opts;
  const maxRepairs = opts.maxRepairs ?? MAX_REPAIRS;
  const before = session.house;
  let working = before;
  const changes: AppliedBatch[] = [];
  let rejected = 0;
  let gaveUp = false;
  let text = '';
  let error: TurnError | undefined;

  const tools = createHouseTools(() => working, {
    onEdit(house, batch, fromLevel) {
      working = house;
      changes.push(batch);
      onEvent?.({ type: 'house', house, reason: 'edit', fromLevel, batch });
    },
    onReject(errors) {
      rejected++;
      const left = maxRepairs - rejected;
      if (left < 0) gaveUp = true;
      onEvent?.({ type: 'rejected', errors, repairsLeft: Math.max(0, left) });
      return left;
    },
    onNewHouse(house, summary) {
      working = house;
      const batch = { summary, details: [`New house "${house.name}"`] };
      changes.push(batch);
      onEvent?.({ type: 'house', house, reason: 'new', fromLevel: 0, batch });
    },
  }, opts.findPlace);

  // HTTP errors of the relay, read before the SDK turns them into exceptions.
  let httpError: { status: number; body: unknown } | null = null;
  const wrapFetch = (next: typeof fetch): typeof fetch => async (input, init) => {
    const res = await next(input, init);
    if (!res.ok) {
      let body: unknown = null;
      try {
        body = await res.clone().json();
      } catch {
        /* not JSON */
      }
      httpError = { status: res.status, body };
    }
    return res;
  };
  const abort = new AbortController();
  const onAbort = () => abort.abort();
  opts.signal?.addEventListener('abort', onAbort);
  try {
    const stream = chat({
      adapter: opts.adapter,
      threadId: opts.threadId ?? 'house',
      systemPrompts: [SYSTEM_PROMPT, houseContext(describeHouse(before, validate(before)))],
      messages: [...pastMessages(opts.past ?? []), { role: 'user', content: opts.text }],
      tools,
      toolExecution: 'sequential',
      abortController: abort,
      // Edits, repairs and the closing reply; the repair limit stops it earlier.
      agentLoopStrategy: combineStrategies([maxIterations(maxRepairs + 6)]),
      middleware: [{ name: 'opensu-repair-limit', onShouldContinue: () => (gaveUp ? false : undefined) }],
      debug: false,
      wrapFetch,
    });
    for await (const ev of stream) {
      if (ev.type === 'TEXT_MESSAGE_CONTENT') {
        text += ev.delta;
        onEvent?.({ type: 'text', delta: ev.delta });
      } else if (ev.type === 'TOOL_CALL_START') {
        // Paragraph break between the text before and after a tool call.
        if (text && !text.endsWith('\n')) {
          text += '\n\n';
          onEvent?.({ type: 'text', delta: '\n\n' });
        }
        onEvent?.({ type: 'tool-call', name: ev.toolCallName });
      } else if (ev.type === 'RUN_ERROR') {
        error = classifyError(ev.error ?? { message: ev.message, code: ev.code });
      }
    }
  } catch (err) {
    if (abort.signal.aborted) error = undefined;
    else error = classifyError(err);
  } finally {
    opts.signal?.removeEventListener('abort', onAbort);
  }

  if (error && httpError) {
    const { status, body } = httpError as { status: number; body: unknown };
    error = classifyError({ status, ...(body && typeof body === 'object' ? body : {}) });
  }
  const committed = working !== before;
  if (committed) session.commit(working);
  const status: TurnStatus = abort.signal.aborted ? 'aborted' : error ? 'error' : gaveUp ? 'gave-up' : 'ok';
  return { status, text: text.trim(), changes, before, after: working, committed, rejected, error };
}
