// The structure of an assistant turn (task 018): its text segments and the
// changes they led to, in the order they happened. The chat store builds it
// from the agent's events; the turn component reads it through `turnView`.
// Pure functions, no imports: unit-tested in scripts/turn-parts-test.ts.

/**
 * One piece of a turn. Text pieces are split at every tool call, so the
 * last text piece is always the text after the last tool call (the final
 * message). `change` is an index into the turn's `changes`.
 */
export type TurnPart = { type: 'text'; text: string } | { type: 'change'; change: number };

/** Reply text streamed in: it extends the current text piece. */
export function addText(parts: readonly TurnPart[], delta: string): TurnPart[] {
  const last = parts[parts.length - 1];
  if (last?.type === 'text') return [...parts.slice(0, -1), { type: 'text', text: last.text + delta }];
  return [...parts, { type: 'text', text: delta }];
}

/**
 * A tool call started: text from now on is a new piece (calls in a row
 * share one). A call before any text leaves an empty first piece.
 */
export function addCall(parts: readonly TurnPart[]): TurnPart[] {
  if (!parts.length) return [{ type: 'text', text: '' }, { type: 'text', text: '' }];
  const last = parts[parts.length - 1];
  if (parts.length > 1 && last?.type === 'text' && !last.text) return [...parts];
  return [...parts, { type: 'text', text: '' }];
}

/** A change was applied: it follows the text that led to it (before the still-empty piece of the call). */
export function addChange(parts: readonly TurnPart[], change: number): TurnPart[] {
  const last = parts[parts.length - 1];
  const part: TurnPart = { type: 'change', change };
  if (last?.type === 'text' && !last.text) return [...parts.slice(0, -1), part, last];
  return [...parts, part];
}

/** One line of a turn's timeline. */
export type TimelineEntry = { type: 'text'; text: string } | { type: 'change'; change: number };

export interface TurnView {
  /** Intermediate sentences and the changes they led to, in order (without the final text). */
  timeline: TimelineEntry[];
  /** The text after the last tool call; the whole text when the turn has no structure (an older save). */
  final: string;
  /** True when the turn has its structure (saved before task 018: false). */
  structured: boolean;
  /** True when a tool was called in this turn. */
  calledTools: boolean;
}

/** How a turn reads: what the compact and the full density show. */
export function turnView(item: { text: string; parts?: readonly TurnPart[] | null; changes?: readonly unknown[] | null }): TurnView {
  const parts = Array.isArray(item.parts) ? item.parts : null;
  if (!parts) {
    // An older autosave: one concatenated string, rendered as plain text.
    return { timeline: [], final: item.text.trim(), structured: false, calledTools: !!item.changes?.length };
  }
  const last = parts[parts.length - 1];
  const finalIndex = last?.type === 'text' ? parts.length - 1 : -1;
  const timeline: TimelineEntry[] = [];
  parts.forEach((p, i) => {
    if (i === finalIndex) return;
    if (p.type === 'change') timeline.push(p);
    else if (p.text.trim()) timeline.push({ type: 'text', text: p.text.trim() });
  });
  const textPieces = parts.filter((p) => p.type === 'text').length;
  return {
    timeline,
    final: finalIndex >= 0 ? (last as { text: string }).text.trim() : '',
    structured: true,
    calledTools: textPieces > 1 || parts.some((p) => p.type === 'change'),
  };
}
