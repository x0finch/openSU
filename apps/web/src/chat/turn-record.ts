// Turn records (task 020): what the browser sends to `/api/turns` when an
// assistant turn ends, and what "Export conversation" downloads. Built
// from what the chat store holds; never the visitor's API key. Pure
// functions except `postRecord` / `postUndo` (fire-and-forget) and
// `download`.
import type { TurnError } from '@opensu/agent';
import type { House } from '@opensu/model';
import { type TurnPart, turnView } from './turn-parts';

/** One tool call of a turn: its arguments and what the tool returned (absent while it runs). */
export interface ToolCallRecord {
  name: string;
  args?: unknown;
  result?: unknown;
}

/** How a turn ran: kept on the chat item so a record can be rebuilt (export after a reload). */
export interface TurnRun {
  /** The id sent in `x-opensu-turn`. */
  turn: string;
  model: string;
  ownKey: boolean;
  /** ms since the epoch. */
  startedAt: number;
  durationMs?: number;
}

export type RecordPart =
  | { type: 'text'; text: string }
  | { type: 'call'; name: string; args?: unknown; result?: unknown }
  | { type: 'change'; summary: string; details: string[] };

export type TurnStatus = 'ok' | 'gave-up' | 'aborted' | 'error';

export interface TurnRecord {
  v: 1;
  turn: string;
  /** One per conversation in the browser (a new chat starts a new one). */
  conversation: string;
  /** App version (package version + commit). */
  app: string;
  /** The model asked for: the site's model on its key; on an own key the user's choice ("default": the relay's). */
  model: string;
  ownKey: boolean;
  /** ISO 8601. */
  startedAt: string;
  durationMs: number | null;
  status: TurnStatus;
  /** The user's message. */
  user: string;
  /** The turn in order: text pieces, tool calls with arguments and results, applied changes. */
  parts: RecordPart[];
  /** The text after the last tool call. */
  final: string;
  error?: TurnError;
  /** Gave up: validation errors of the last rejected batch. */
  lastErrors?: string[];
  /** Export only: the turn's changes were undone. */
  undone?: boolean;
  /** The house after the turn (sent records; the export carries the current house once instead). */
  house?: House;
}

/** What a finished assistant item holds (a subset of the chat store's `ChatItem`). */
export interface RecordSource {
  text: string;
  parts?: TurnPart[];
  calls?: ToolCallRecord[];
  changes?: { summary: string; details: string[] }[];
  error?: TurnError;
  gaveUp?: boolean;
  aborted?: boolean;
  lastErrors?: string[];
  run?: TurnRun;
  undo?: string;
}

export function turnStatus(item: RecordSource): TurnStatus {
  return item.aborted ? 'aborted' : item.error ? 'error' : item.gaveUp ? 'gave-up' : 'ok';
}

/** The record of one finished turn, or null when it never ran (no turn id). */
export function buildRecord(item: RecordSource, user: string, meta: { conversation: string; app: string }, house?: House | null): TurnRecord | null {
  const run = item.run;
  if (!run) return null;
  const calls = item.calls ?? [];
  const changes = item.changes ?? [];
  const parts: RecordPart[] = [];
  if (Array.isArray(item.parts)) {
    for (const p of item.parts) {
      if (p.type === 'text') {
        if (p.text.trim()) parts.push({ type: 'text', text: p.text });
      } else if (p.type === 'call') {
        const c = calls[p.call];
        if (c) parts.push({ type: 'call', name: c.name, args: c.args, result: c.result });
      } else {
        const c = changes[p.change];
        if (c) parts.push({ type: 'change', summary: c.summary, details: c.details });
      }
    }
  } else if (item.text.trim()) parts.push({ type: 'text', text: item.text });
  const status = turnStatus(item);
  const rec: TurnRecord = {
    v: 1,
    turn: run.turn,
    conversation: meta.conversation,
    app: meta.app,
    model: run.model,
    ownKey: run.ownKey,
    startedAt: new Date(run.startedAt).toISOString(),
    durationMs: run.durationMs ?? null,
    status,
    user,
    parts,
    final: turnView(item).final,
  };
  if (item.error) rec.error = item.error;
  if (status === 'gave-up' && item.lastErrors?.length) rec.lastErrors = item.lastErrors;
  if (house) rec.house = house;
  return rec;
}

/**
 * JSON of a record with the visitor's key replaced, should any tool result
 * or error message ever echo it.
 */
export function recordJson(rec: unknown, key: string): string {
  const json = JSON.stringify(rec);
  const k = key.trim();
  return k.length >= 8 ? json.split(k).join('[key]') : json;
}

const TURNS = '/api/turns';

/** Sends a record. Fire-and-forget: a failure is never shown and never blocks the chat. */
export function postRecord(json: string): void {
  try {
    void fetch(TURNS, { method: 'POST', headers: { 'content-type': 'application/json' }, body: json }).catch(() => {});
  } catch {
    /* no fetch: nothing to do */
  }
}

/** Flags a recorded turn as undone (or redone). Fire-and-forget. */
export function postUndo(turn: string, undone: boolean): void {
  try {
    void fetch(TURNS, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ turn, undone }) }).catch(() => {});
  } catch {
    /* no fetch: nothing to do */
  }
}

/** Saves `text` as a file through the browser (no server call). */
export function download(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
