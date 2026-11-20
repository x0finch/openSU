// The compose field's part of images (task 038), in the first load: the
// image button, paste and drop, and the "@" trigger. What they open (the
// strip of attachments, the "@" list, shrinking and storing images) loads
// on first use (attach.tsx).
import { type ClipboardEvent, type DragEvent, type KeyboardEvent, lazy, type RefObject, Suspense, useLayoutEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Button } from '@opensu/ui';
import { useT } from '../lib/i18n';
import { useChat } from './chat-store';
import { ImageIcon } from './icons';

const attach = () => import('./attach');
const Strip = lazy(() => attach().then((m) => ({ default: m.AttachStrip })));
const Picker = lazy(() => attach().then((m) => ({ default: m.MentionPicker })));

function useAdd() {
  const t = useT();
  return (files: File[]) => {
    if (files.some((f) => f.type.startsWith('image/'))) void attach().then((m) => m.addFiles(files, t as never));
  };
}

/** Paste and drop of images onto the compose field. */
export function useImageDrop(): { onPaste: (e: ClipboardEvent) => void; onDrop: (e: DragEvent) => void; onDragOver: (e: DragEvent) => void } {
  const add = useAdd();
  return {
    onPaste: (e) => {
      const files = [...e.clipboardData.files];
      if (!files.some((f) => f.type.startsWith('image/'))) return;
      e.preventDefault();
      add(files);
    },
    onDragOver: (e) => {
      if ([...e.dataTransfer.items].some((i) => i.kind === 'file')) e.preventDefault();
    },
    onDrop: (e) => {
      const files = [...e.dataTransfer.files];
      if (!files.length) return;
      e.preventDefault();
      add(files);
    },
  };
}

/** The compose field's image button (opens the file chooser; several images at once). */
export function AttachButton({ dim, disabled }: { dim: number; disabled?: boolean }) {
  const t = useT();
  const add = useAdd();
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <Button variant="quiet" dim={dim} disabled={disabled} label={t('chat.attach')} icon={<ImageIcon width={18} height={18} />} onClick={() => input.current?.click()} data-testid="chat-attach" />
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          add([...(e.target.files ?? [])]);
          e.target.value = '';
        }}
        data-testid="chat-attach-input"
      />
    </>
  );
}

/** The attachments above the text (loaded with the first one). */
export function AttachStrip() {
  const n = useChat((s) => s.attachments.length);
  return n ? (
    <Suspense fallback={null}>
      <Strip />
    </Suspense>
  ) : null;
}

/**
 * Typing "@" (at the caret, not inside a word) opens a list of the
 * conversation's images and the attached ones; choosing one writes "图N"
 * after the "@". The list leaves the focus in the text: `onKey` takes the
 * arrows, Enter and Escape while it is open.
 */
export function useMention(text: string, setText: (s: string) => void, field: RefObject<HTMLTextAreaElement | null>) {
  const [at, setAt] = useState<number | null>(null);
  const [active, setActive] = useState(0);
  const numbers = useChat(useShallow((s) => {
    const sent = s.items.flatMap((it) => it.images ?? []).map((im) => im.n);
    const next = sent.reduce((m, n) => Math.max(m, n), 0) + 1;
    return [...sent, ...s.attachments.map((_, i) => next + i)];
  }));
  const onInput = (value: string, caret: number) => {
    const typed = value.length > text.length && value[caret - 1] === '@' && !/[\w@]/.test(value[caret - 2] ?? '');
    if (typed && numbers.length) {
      setAt(caret);
      setActive(0);
    } else if (at !== null && (caret < at || value[at - 1] !== '@')) setAt(null);
  };
  // The caret after the inserted name, put back as soon as the new text is in the field (before the next key).
  const caret = useRef<number | null>(null);
  useLayoutEffect(() => {
    const el = field.current, pos = caret.current;
    if (!el || pos === null) return;
    caret.current = null;
    el.focus();
    el.setSelectionRange(pos, pos);
  }, [text, field]);
  const choose = (n: number) => {
    if (at === null) return;
    caret.current = at + `图${n} `.length;
    setText(`${text.slice(0, at)}图${n} ${text.slice(at)}`);
    setAt(null);
  };
  /** Keys while the list is open: true when taken. */
  const onKey = (e: KeyboardEvent): boolean => {
    if (at === null) return false;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      setActive((a) => (a + (e.key === 'ArrowDown' ? 1 : numbers.length - 1)) % numbers.length);
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      const n = numbers[active];
      if (n !== undefined) choose(n);
    } else if (e.key === 'Escape') setAt(null);
    else return false;
    e.preventDefault();
    return true;
  };
  const picker = at !== null ? (
    <Suspense fallback={null}>
      <Picker active={active} onChoose={choose} anchor={() => field.current} />
    </Suspense>
  ) : null;
  return { onInput, onKey, picker, open: at !== null };
}
