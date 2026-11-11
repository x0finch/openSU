// Chat state and the controller that connects it to the agent (lazy chunk)
// and to the studio's house. The agent loop and the tools run here, in the
// browser; the Worker only relays the model stream.
import type { AgentEvent, AppliedBatch, HouseSession, PastTurn, TurnError } from '@opensu/agent';
import { create } from 'zustand';
import { useStudio } from '../lib/store';
import { type AiSettings, loadSettings, relayHeaders, requestModel, saveSettings } from './settings';

export type Phase = 'thinking' | 'working' | 'repairing' | 'done';
/** Undo state of a turn's changes card. */
export type UndoState = 'can-undo' | 'can-redo' | 'undone' | 'kept';

export interface ChatItem {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  /** Assistant: progress of the turn. */
  phase?: Phase;
  changes?: AppliedBatch[];
  undo?: UndoState;
  error?: TurnError;
  gaveUp?: boolean;
  aborted?: boolean;
  /** Assistant: the user message this answers (retry). */
  prompt?: string;
  /** Assistant: validation errors of the last rejected batch (shown when giving up). */
  lastErrors?: string[];
}

export interface ServerStatus {
  serverKey: boolean;
  provider: string | null;
  model: string | null;
}

interface ChatState {
  items: ChatItem[];
  running: boolean;
  settings: AiSettings;
  settingsOpen: boolean;
  server: ServerStatus | null;
  /** Phone: the chat sheet covers the drawing (`full`) or shows a strip (`peek`). */
  sheet: 'full' | 'peek';
  setSettings: (s: AiSettings) => void;
  setSettingsOpen: (open: boolean) => void;
  setSheet: (sheet: 'full' | 'peek') => void;
}

export const useChat = create<ChatState>((set) => ({
  items: [],
  running: false,
  settings: loadSettings(),
  settingsOpen: false,
  server: null,
  sheet: 'full',
  setSettings: (settings) => {
    saveSettings(settings);
    set({ settings });
  },
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setSheet: (sheet) => set({ sheet }),
}));

type AgentModule = typeof import('@opensu/agent');
let agentMod: Promise<AgentModule> | null = null;
/** The agent chunk (TanStack AI, the OpenAI-compatible adapter, prompt, tools). */
export const loadAgent = () => (agentMod ??= import.meta.env.SSR ? new Promise<AgentModule>(() => {}) : import('@opensu/agent'));

/** The relay route of this app (src/routes/api/chat.ts). */
const endpoint = () => '/api/chat';

let session: HouseSession | null = null;
/** Text-only memory of earlier turns, by assistant item id. */
const past = new Map<string, PastTurn>();
/** Assistant item ids whose changes are on the undo stack, oldest first. */
const committed: string[] = [];
/** Assistant item ids undone and still redoable, most recent last. */
const redoable: string[] = [];
let abort: AbortController | null = null;
let seq = 0;
const nextId = () => `m${++seq}`;

function patch(id: string, p: Partial<ChatItem> | ((it: ChatItem) => Partial<ChatItem>)): void {
  useChat.setState((s) => ({ items: s.items.map((it) => (it.id === id ? { ...it, ...(typeof p === 'function' ? p(it) : p) } : it)) }));
}

/** The session follows the studio's house (other tools may have replaced it). */
function syncSession(m: AgentModule): HouseSession {
  const house = useStudio.getState().house;
  if (!house) throw new Error('No house loaded yet.');
  if (!session || session.house !== house) {
    session = new m.HouseSession(house);
    committed.length = 0;
    redoable.length = 0;
    useChat.setState((s) => ({ items: s.items.map((it) => (it.undo === 'can-undo' || it.undo === 'can-redo' ? { ...it, undo: 'kept' } : it)) }));
  }
  return session;
}

export async function fetchServerStatus(): Promise<void> {
  try {
    const res = await fetch(endpoint(), { headers: { accept: 'application/json' } });
    if (res.ok) useChat.setState({ server: (await res.json()) as ServerStatus });
  } catch {
    /* shown as unknown */
  }
}

export async function send(text: string): Promise<void> {
  const prompt = text.trim();
  if (!prompt || useChat.getState().running) return;
  const userId = nextId();
  const id = nextId();
  useChat.setState((s) => ({
    running: true,
    // Phones: drop to the peek strip so the drawing shows the house change.
    sheet: 'peek',
    items: [...s.items, { id: userId, role: 'user', text: prompt }, { id, role: 'assistant', text: '', phase: 'thinking', prompt }],
  }));
  abort = new AbortController();
  try {
    const m = await loadAgent();
    const sess = syncSession(m);
    const settings = useChat.getState().settings;
    const adapter = m.createRelayAdapter({ endpoint: endpoint(), model: requestModel(settings), headers: () => relayHeaders(settings) });
    const onEvent = (e: AgentEvent) => {
      if (e.type === 'text') patch(id, (it) => ({ text: it.text + e.delta }));
      else if (e.type === 'tool-call') patch(id, { phase: e.name === 'get_house' ? 'thinking' : 'working' });
      else if (e.type === 'rejected') patch(id, { phase: 'repairing', lastErrors: e.errors });
      else if (e.type === 'house') {
        patch(id, (it) => ({ changes: [...(it.changes ?? []), e.batch], phase: 'working' }));
        useStudio.getState().setHouse(e.house, { fromLevel: e.fromLevel });
      }
    };
    const r = await m.runTurn({
      adapter,
      session: sess,
      text: prompt,
      past: [...past.values()],
      signal: abort.signal,
      onEvent,
      threadId: 'studio',
    });
    if (r.committed) {
      for (const k of committed) patch(k, { undo: 'kept' });
      for (const k of redoable) patch(k, { undo: 'undone' });
      redoable.length = 0;
      committed.push(id);
    }
    past.set(id, { user: prompt, assistant: r.text, changes: r.changes.map((c) => c.summary) });
    patch(id, {
      text: r.text,
      phase: 'done',
      changes: r.changes,
      undo: r.committed ? 'can-undo' : undefined,
      error: r.error,
      gaveUp: r.status === 'gave-up',
      aborted: r.status === 'aborted',
    });
  } catch (err) {
    patch(id, { phase: 'done', error: { kind: 'network', message: String(err) } });
  } finally {
    abort = null;
    useChat.setState({ running: false });
  }
}

export function stop(): void {
  abort?.abort();
}

/** Undo the latest turn's changes (one step per turn). */
export function undoTurn(id: string): void {
  if (!session || committed[committed.length - 1] !== id) return;
  const before = session.house;
  const house = session.undo();
  if (!house) return;
  committed.pop();
  redoable.push(id);
  patch(id, { undo: 'can-redo' });
  const prev = committed[committed.length - 1];
  if (prev) patch(prev, { undo: 'can-undo' });
  const p = past.get(id);
  if (p) past.set(id, { ...p, changes: [], assistant: `${p.assistant}\n(The user undid the edits of this turn.)` });
  // The studio stores this exact object, so the session stays in step.
  useStudio.getState().setHouse(house, { fromLevel: firstDifferentLevel(before, house) });
}

export function redoTurn(id: string): void {
  if (!session || redoable[redoable.length - 1] !== id) return;
  const before = session.house;
  const house = session.redo();
  if (!house) return;
  redoable.pop();
  const prev = committed[committed.length - 1];
  if (prev) patch(prev, { undo: 'kept' });
  committed.push(id);
  patch(id, { undo: 'can-undo' });
  useStudio.getState().setHouse(house, { fromLevel: firstDifferentLevel(before, house) });
}

function firstDifferentLevel(a: { levels: unknown[]; grid: unknown }, b: { levels: unknown[]; grid: unknown }): number {
  if (a.levels.length !== b.levels.length || JSON.stringify(a.grid) !== JSON.stringify(b.grid)) return 0;
  const i = b.levels.findIndex((l, k) => JSON.stringify(l) !== JSON.stringify(a.levels[k]));
  return Math.max(0, i);
}

/** Send the failed turn's message again (the failed exchange is removed). */
export function retry(id: string): void {
  const s = useChat.getState();
  const i = s.items.findIndex((it) => it.id === id);
  const item = s.items[i];
  if (!item?.prompt || s.running) return;
  past.delete(id);
  useChat.setState({ items: s.items.filter((_, k) => k !== i && k !== i - 1) });
  void send(item.prompt);
}

/**
 * Puts a saved transcript back (after a reload). The undo history did not
 * survive, so its changes cards read as kept; the model gets the earlier
 * turns as text memory again.
 */
export function restoreItems(items: ChatItem[]): void {
  if (useChat.getState().items.length) return;
  past.clear();
  const restored = items.map((it): ChatItem => ({
    ...it,
    phase: it.role === 'assistant' ? 'done' : it.phase,
    undo: it.undo === 'can-undo' || it.undo === 'can-redo' ? 'kept' : it.undo,
  }));
  for (let i = 1; i < restored.length; i++) {
    const a = restored[i]!, u = restored[i - 1]!;
    if (a.role === 'assistant' && u.role === 'user' && a.phase === 'done' && !a.error) {
      past.set(a.id, { user: u.text, assistant: a.text, changes: a.undo === 'undone' ? [] : (a.changes ?? []).map((c) => c.summary) });
    }
  }
  // New ids continue after the restored ones.
  for (const it of restored) seq = Math.max(seq, Number(it.id.slice(1)) || 0);
  useChat.setState({ items: restored });
}

/** Clears the conversation (the house and its undo history stay). */
export function newChat(): void {
  if (useChat.getState().running) stop();
  past.clear();
  committed.length = 0;
  redoable.length = 0;
  session = null;
  useChat.setState({ items: [] });
}
