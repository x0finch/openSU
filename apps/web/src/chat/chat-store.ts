// Chat state and the controller that connects it to the agent (lazy chunk)
// and to the studio's house. The agent loop and the tools run here, in the
// browser; the Worker only relays the model stream.
import type { AgentEvent, AppliedBatch, HouseSession, PastTurn, TurnError } from '@opensu/agent';
import type { House } from '@opensu/model';
import { countryName, loadPlaces } from '../lib/site';
import { create } from 'zustand';
import { useStudio } from '../lib/store';
import { accountKeyInUse, DEFAULT_MODELS, syncKeys, useKeys } from './keys';
import { type AiSettings, loadSettings, relayHeaders, requestModel, saveSettings, usesOwnKey } from './settings';
import { addCall, addChange, addText, type TurnPart } from './turn-parts';
import { buildRecord, download, postRecord, postUndo, recordJson, type ToolCallRecord, type TurnRecord, type TurnRun } from './turn-record';

export type { TurnPart } from './turn-parts';

/**
 * Progress of a turn, as it actually is: `thinking` (waiting for the model,
 * or it reads the house), `working` (an edit is being applied), `repairing`
 * (an edit was rejected and is being fixed), `writing` (reply text streams).
 */
export type Phase = 'thinking' | 'working' | 'repairing' | 'writing' | 'done';
/** Undo state of a turn's changes card. */
export type UndoState = 'can-undo' | 'can-redo' | 'undone' | 'kept';

/** What a running turn is doing now: the edit being sent, or the one just applied. */
export interface LiveStep {
  summary: string;
  applied: boolean;
}

export interface ChatItem {
  id: string;
  role: 'user' | 'assistant';
  /** The whole text (assistant: every segment of the turn, joined; also the model's memory). */
  text: string;
  /**
   * Assistant (task 018): the turn in order, text segments split at each
   * tool call and the changes they led to. Absent in saves made before it
   * (the turn then reads as plain `text`).
   */
  parts?: TurnPart[];
  /** Assistant, while running: the current step (not saved). */
  live?: LiveStep;
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
  /** An edit the user made in the UI (place, orientation, template): no model involved. */
  manual?: boolean;
  /** Assistant (task 020): the turn's tool calls, in order (`parts` says where they happened). */
  calls?: ToolCallRecord[];
  /** Assistant (task 020): how the turn ran (turn id, model, key, time), for its record. */
  run?: TurnRun;
}

/** The caller's credits on the site's key (task 019; GET /api/chat). */
export interface QuotaInfo {
  kind: 'user' | 'anon';
  limit: number;
  remaining: number;
  /** ISO 8601. */
  resetAt: string;
  reason: 'user' | 'anon' | 'ip' | 'site' | 'turn' | null;
}

export interface ServerStatus {
  serverKey: boolean;
  provider: string | null;
  model: string | null;
  /** Sign-in methods this server offers (none: sign-in is hidden). */
  auth?: { email: boolean; google: boolean };
  /** The signed-in account. */
  user?: { email: string; name?: string | null; image?: string | null } | null;
  /** Credits on the site's key; null when not metered. */
  quota?: QuotaInfo | null;
  /** Keys can be saved with the account here (task 022). */
  keys?: boolean;
}

interface ChatState {
  items: ChatItem[];
  /** This conversation's id (task 020 records); a new chat gets a new one. */
  conversation: string;
  running: boolean;
  settings: AiSettings;
  settingsOpen: boolean;
  server: ServerStatus | null;
  /** Unsent text of the prompt bar (kept while it moves between bar and panel). */
  draft: string;
  setDraft: (draft: string) => void;
  setSettings: (s: AiSettings) => void;
  setSettingsOpen: (open: boolean) => void;
}

/** A random id: turn and conversation ids (plain, 8-64 characters; see the server's TURN_ID). */
const randomId = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`);

/** The app version in records and exports (vite.config.ts defines it). */
export const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';

export const useChat = create<ChatState>((set) => ({
  items: [],
  conversation: randomId(),
  running: false,
  settings: loadSettings(),
  settingsOpen: false,
  server: null,
  draft: '',
  setDraft: (draft) => set({ draft }),
  setSettings: (settings) => {
    saveSettings(settings);
    set({ settings });
  },
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
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
/** The house before and after each step on those stacks (autosaved, see `undoHistory`). */
const steps = new Map<string, { before: House; after: House }>();
/** Undo steps kept across a reload (each holds two houses of a few kB). */
export const SAVED_STEPS = 12;

/** The undo / redo history as autosaved: bounded, oldest first. */
export interface SavedHistory {
  undo: { id: string; before: House; after: House }[];
  redo: { id: string; before: House; after: House }[];
}

/** A history restored from the autosave, rebuilt into a session once the agent chunk is there. */
let pendingHistory: { houseJson: string } | null = null;
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
  if (!session && pendingHistory) {
    // After a reload: the saved undo / redo steps, if the house is still the saved one.
    const ok = JSON.stringify(house) === pendingHistory.houseJson;
    pendingHistory = null;
    if (ok) session = rebuildSession(m, house);
  }
  if (!session || session.house !== house) {
    session = new m.HouseSession(house);
    committed.length = 0;
    redoable.length = 0;
    steps.clear();
    useChat.setState((s) => ({ items: s.items.map((it) => (it.undo === 'can-undo' || it.undo === 'can-redo' ? { ...it, undo: 'kept' } : it)) }));
  }
  return session;
}

/** The assistant's find_place tool: the built-in place list (lazy chunk), no network. */
async function findPlace(query: string) {
  const { searchPlaces } = await loadPlaces();
  return searchPlaces(query, 5).map((p) => ({
    name: p.zh || p.en,
    region: [p.regionZh || p.regionEn, countryName(p.cc, 'en')].filter(Boolean).join(', '),
    latitude: p.lat,
    longitude: p.lon,
    timeZone: p.tz,
  }));
}

/** A session whose undo / redo stacks hold the restored steps, `house` current. */
function rebuildSession(m: AgentModule, house: House): HouseSession {
  const undo = committed.map((id) => steps.get(id)!);
  const redo = redoable.map((id) => steps.get(id)!);
  const sess = new m.HouseSession(undo[0]?.before ?? house);
  for (const st of undo.slice(1)) sess.commit(st.before);
  if (undo.length) sess.commit(house);
  // Push the redo houses (next redo first), then step back over them.
  for (let i = redo.length - 1; i >= 0; i--) sess.commit(redo[i]!.after);
  for (let i = 0; i < redo.length; i++) sess.undo();
  return sess;
}

/** Marks a new undo step: earlier steps are kept, redo is gone. */
function pushCommitted(id: string, before: House, after: House): void {
  for (const k of committed) patch(k, { undo: 'kept' });
  for (const k of redoable) {
    patch(k, { undo: 'undone' });
    steps.delete(k);
  }
  redoable.length = 0;
  committed.push(id);
  steps.set(id, { before, after });
}

/** The undo / redo history for the autosave (the newest `SAVED_STEPS` steps). */
export function undoHistory(): SavedHistory {
  const pick = (ids: string[]) => ids.slice(-SAVED_STEPS).flatMap((id) => {
    const st = steps.get(id);
    return st ? [{ id, ...st }] : [];
  });
  return { undo: pick(committed), redo: pick(redoable) };
}

/**
 * An edit made in the UI (location, orientation): applied with the model's
 * commands, validated, one undo step on the same history as the assistant's
 * turns, and listed in the conversation. Returns false when rejected.
 */
export async function applyEdit(commands: unknown[], summary: string): Promise<boolean> {
  if (useChat.getState().running) return false;
  // Never on the server: keeps the model chunk out of the Worker bundle.
  const [m, model] = await Promise.all([loadAgent(), import.meta.env.SSR ? new Promise<typeof import('@opensu/model')>(() => {}) : import('@opensu/model')]);
  const sess = syncSession(m);
  const r = model.applyCommands(sess.house, commands);
  if (!r.ok) {
    console.warn('edit rejected', r.issues);
    return false;
  }
  commitManual(sess, r.house, { summary, details: r.applied.map((a) => a.summary) });
  useStudio.getState().setHouse(r.house);
  return true;
}

/** Replaces the whole house from the UI (a template), as one undo step. */
export async function replaceHouse(house: House, summary: string): Promise<void> {
  if (useChat.getState().running) return;
  const m = await loadAgent();
  const sess = syncSession(m);
  commitManual(sess, house, { summary, details: [`New house "${house.name}"`] });
  useStudio.getState().setHouse(house, { fromLevel: 0 });
}

function commitManual(sess: HouseSession, house: House, batch: AppliedBatch): void {
  const before = sess.house;
  sess.commit(house);
  const id = nextId();
  pushCommitted(id, before, house);
  useChat.setState((s) => ({ items: [...s.items, { id, role: 'assistant', text: '', phase: 'done', changes: [batch], undo: 'can-undo', manual: true }] }));
  past.set(id, { user: '(The user edited the house in the studio, not in this chat.)', assistant: '', changes: [batch.summary] });
}

export async function fetchServerStatus(): Promise<void> {
  try {
    const res = await fetch(endpoint(), { headers: { accept: 'application/json' } });
    if (res.ok) useChat.setState({ server: (await res.json()) as ServerStatus });
  } catch {
    /* shown as unknown */
  }
  await syncKeys();
}

/** A turn on the user's own key (in this browser or saved with the account): never metered. */
export const ownKeyInUse = (s: AiSettings = useChat.getState().settings) => usesOwnKey(s) || !!accountKeyInUse();

/** True when the next turn would use the site's key and no credit is left. */
export function outOfCredits(): boolean {
  const s = useChat.getState();
  return !ownKeyInUse(s.settings) && !!s.server?.serverKey && s.server.quota?.remaining === 0;
}

/** A turn id: one user message = one credit on the site's key, however many model calls it makes. */
const turnId = randomId;

/** Sends the record of a finished turn (task 020). Never throws, never waits. */
function recordTurn(id: string, prompt: string): void {
  try {
    const s = useChat.getState();
    const item = s.items.find((it) => it.id === id);
    const rec = item && buildRecord(item, prompt, { conversation: s.conversation, app: APP_VERSION }, useStudio.getState().house);
    if (rec) postRecord(recordJson(rec, s.settings.key));
  } catch {
    /* a record is never worth an error */
  }
}

export async function send(text: string): Promise<void> {
  const prompt = text.trim();
  if (!prompt || useChat.getState().running) return;
  const userId = nextId();
  const id = nextId();
  // Known to be out of credits: say so at once instead of asking the server.
  if (outOfCredits()) {
    useChat.setState((s) => ({
      items: [...s.items, { id: userId, role: 'user', text: prompt }, { id, role: 'assistant', text: '', parts: [], phase: 'done', prompt, error: { kind: 'quota', code: 'quota_exhausted', message: 'No credits left for today.' } }],
    }));
    // No turn ran, so no after-turn note: show the exchange with what to do.
    if (!useStudio.getState().pinned) useStudio.getState().setRecent(true);
    return;
  }
  useChat.setState((s) => ({
    running: true,
    items: [...s.items, { id: userId, role: 'user', text: prompt }, { id, role: 'assistant', text: '', parts: [], phase: 'thinking', prompt }],
  }));
  abort = new AbortController();
  const settings = useChat.getState().settings;
  const startedAt = Date.now();
  try {
    const m = await loadAgent();
    const sess = syncSession(m);
    const turn = turnId();
    // A key saved with the account (task 022): the relay decrypts it; the browser only names the provider.
    const account = usesOwnKey(settings) ? null : accountKeyInUse();
    const saved = account ? useKeys.getState().keys.find((k) => k.provider === account) : undefined;
    const ownKey = usesOwnKey(settings) || !!account;
    const model = account ? saved?.model || DEFAULT_MODELS[account] : usesOwnKey(settings) ? requestModel(settings) : (useChat.getState().server?.model ?? 'default');
    patch(id, { run: { turn, ownKey, model, startedAt } });
    /** Tool call id -> index in the item's `calls`. */
    const callIndex = new Map<string, number>();
    const keyHeaders = account ? { 'x-opensu-account-key': account } : relayHeaders(settings);
    const adapter = m.createRelayAdapter({ endpoint: endpoint(), model: account ? 'default' : requestModel(settings), headers: () => ({ ...keyHeaders, 'x-opensu-turn': turn }) });
    const onEvent = (e: AgentEvent) => {
      if (e.type === 'text') patch(id, (it) => ({ text: it.text + e.delta, parts: addText(it.parts ?? [], e.delta), phase: 'writing' }));
      else if (e.type === 'tool-call') {
        patch(id, (it) => {
          const calls = [...(it.calls ?? []), { name: e.name }];
          callIndex.set(e.id, calls.length - 1);
          return { calls, parts: addCall(it.parts ?? [], calls.length - 1), phase: e.name === 'get_house' ? 'thinking' : 'working' };
        });
      } else if (e.type === 'tool-result') {
        const k = callIndex.get(e.id);
        if (k !== undefined) patch(id, (it) => ({ calls: (it.calls ?? []).map((c, i) => (i === k ? { name: e.name, args: e.args, result: e.result } : c)) }));
      }
      else if (e.type === 'step') patch(id, { live: { summary: e.summary, applied: false } });
      else if (e.type === 'rejected') patch(id, { phase: 'repairing', lastErrors: e.errors });
      else if (e.type === 'house') {
        patch(id, (it) => {
          const changes = [...(it.changes ?? []), e.batch];
          return { changes, parts: addChange(it.parts ?? [], changes.length - 1), live: { summary: e.batch.summary, applied: true }, phase: 'working' };
        });
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
      findPlace,
    });
    if (r.committed) pushCommitted(id, r.before, r.after);
    past.set(id, { user: prompt, assistant: r.text, changes: r.changes.map((c) => c.summary) });
    patch(id, {
      text: r.text,
      phase: 'done',
      live: undefined,
      changes: r.changes,
      undo: r.committed ? 'can-undo' : undefined,
      error: r.error,
      gaveUp: r.status === 'gave-up',
      aborted: r.status === 'aborted',
    });
  } catch (err) {
    patch(id, { phase: 'done', live: undefined, error: { kind: 'network', message: String(err) } });
  } finally {
    abort = null;
    patch(id, (it) => (it.run ? { run: { ...it.run, durationMs: Date.now() - startedAt } } : {}));
    useChat.setState({ running: false });
    recordTurn(id, prompt);
    // The site's key: the credits changed (or ran out); show what is left.
    if (!ownKeyInUse(settings)) void fetchServerStatus();
  }
}

export function stop(): void {
  abort?.abort();
}

/** Undo the latest turn's changes (one step per turn). */
export function undoTurn(id: string): void {
  if (!session && pendingHistory) {
    // Restored after a reload: the session is rebuilt with the agent chunk.
    void loadAgent().then((m) => {
      syncSession(m);
      if (session) undoTurn(id);
    });
    return;
  }
  if (!session || committed[committed.length - 1] !== id) return;
  const before = session.house;
  const house = session.undo();
  if (!house) return;
  committed.pop();
  redoable.push(id);
  patch(id, { undo: 'can-redo' });
  flagUndo(id, true);
  const prev = committed[committed.length - 1];
  if (prev) patch(prev, { undo: 'can-undo' });
  const p = past.get(id);
  if (p) past.set(id, { ...p, changes: [], assistant: `${p.assistant}\n(The user undid the edits of this turn.)` });
  // The studio stores this exact object, so the session stays in step.
  useStudio.getState().setHouse(house, growFrom(before, house));
}

export function redoTurn(id: string): void {
  if (!session && pendingHistory) {
    void loadAgent().then((m) => {
      syncSession(m);
      if (session) redoTurn(id);
    });
    return;
  }
  if (!session || redoable[redoable.length - 1] !== id) return;
  const before = session.house;
  const house = session.redo();
  if (!house) return;
  redoable.pop();
  const prev = committed[committed.length - 1];
  if (prev) patch(prev, { undo: 'kept' });
  committed.push(id);
  patch(id, { undo: 'can-undo' });
  flagUndo(id, false);
  useStudio.getState().setHouse(house, growFrom(before, house));
}

/** Tells the server a recorded turn was undone or redone (task 020; the strongest sign of a mismatch). */
function flagUndo(id: string, undone: boolean): void {
  const turn = useChat.getState().items.find((it) => it.id === id)?.run?.turn;
  if (turn) postUndo(turn, undone);
}

/** How an undo / redo should grow the 3D view: from the first changed level; not at all when no level changed (a site edit). */
function growFrom(a: House, b: House): { fromLevel: number } | undefined {
  const same = (x: unknown, y: unknown) => JSON.stringify(x) === JSON.stringify(y);
  if (a.levels.length !== b.levels.length || !same(a.grid, b.grid)) return { fromLevel: 0 };
  const i = b.levels.findIndex((l, k) => !same(l, a.levels[k]));
  if (i >= 0) return { fromLevel: i };
  return same(a.roofs, b.roofs) ? undefined : { fromLevel: 0 };
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
 * Puts a saved transcript back (after a reload), with the saved undo / redo
 * steps of `house` (the saved house) when there are any: the changes cards
 * then still offer undo and redo. Without them the cards read as kept. The
 * model gets the earlier turns as text memory again.
 */
export function restoreItems(items: ChatItem[], history?: SavedHistory | null, house?: House, conversation?: string): void {
  if (useChat.getState().items.length) return;
  if (conversation) useChat.setState({ conversation });
  past.clear();
  committed.length = 0;
  redoable.length = 0;
  steps.clear();
  const ids = new Set(items.map((it) => it.id));
  if (history && house) {
    for (const st of history.undo) if (ids.has(st.id)) committed.push(st.id), steps.set(st.id, { before: st.before, after: st.after });
    for (const st of history.redo) if (ids.has(st.id)) redoable.push(st.id), steps.set(st.id, { before: st.before, after: st.after });
    pendingHistory = committed.length || redoable.length ? { houseJson: JSON.stringify(house) } : null;
  }
  const top = committed[committed.length - 1];
  const next = redoable[redoable.length - 1];
  const restored = items.map((it): ChatItem => ({
    ...it,
    // Saves made before task 018 have no `parts`: the turn reads as its plain text.
    parts: Array.isArray(it.parts) ? it.parts : undefined,
    live: undefined,
    phase: it.role === 'assistant' ? 'done' : it.phase,
    undo: it.id === top ? 'can-undo' : it.id === next ? 'can-redo' : redoable.includes(it.id) || it.undo === 'can-redo' ? 'undone' : it.undo === 'can-undo' ? 'kept' : it.undo,
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
  steps.clear();
  pendingHistory = null;
  session = null;
  useChat.setState({ items: [], conversation: randomId() });
}

/** The conversation's turns as records (no house each), for the export. */
export function conversationTurns(items: ChatItem[], conversation: string): (TurnRecord | { manual: true; changes: AppliedBatch[] })[] {
  const out: (TurnRecord | { manual: true; changes: AppliedBatch[] })[] = [];
  items.forEach((it, i) => {
    if (it.role !== 'assistant') return;
    if (it.manual) {
      out.push({ manual: true, changes: it.changes ?? [] });
      return;
    }
    const prev = items[i - 1];
    const rec = buildRecord(it, prev?.role === 'user' ? prev.text : (it.prompt ?? ''), { conversation, app: APP_VERSION });
    if (rec) out.push({ ...rec, undone: it.undo === 'undone' || it.undo === 'can-redo' });
  });
  return out;
}

/**
 * "Export conversation" (task 020): one JSON file built here, no server
 * call: the turns as in their records, the current house and the app version.
 */
export function exportConversation(): void {
  const s = useChat.getState();
  if (!s.items.length) return;
  const now = new Date();
  const data = {
    app: APP_VERSION,
    exportedAt: now.toISOString(),
    conversation: s.conversation,
    turns: conversationTurns(s.items, s.conversation),
    house: useStudio.getState().house,
  };
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  download(`opensu-conversation-${stamp}.json`, recordJson(data, s.settings.key));
}
