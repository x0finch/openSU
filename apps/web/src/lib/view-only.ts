// The studio's one view-only switch (task 028). A shared address
// (`/studio?s=<token>`) opens the studio for viewing: every viewing tool
// works, editing is absent. This flag is set from the address once, before
// the first render, and never changes for the page; the few places that
// differ read it (see docs/tasks/028-notes.md "View-only: one flag"):
// the prompt (replaced by the view-only bar), autosave, the saved house on
// load, the project sync, the project menu, the sun panel's place rows, the
// title and the share button.
import { create } from 'zustand';

/** A share token in the address, else null (server-side rendering: null). */
function tokenFromUrl(): string | null {
  if (typeof location === 'undefined' || location.pathname.replace(/\.html$/, '') !== '/studio') return null;
  const s = new URLSearchParams(location.search).get('s');
  return s ? s.slice(0, 64) : null;
}

export interface SharedState {
  /** The token of the shared project on screen; null: the studio as usual (editing). */
  token: string | null;
  status: 'loading' | 'ready' | 'gone' | 'error';
  /** The name the owner gave it ('' = the house's own title). */
  name: string;
  /** When the owner last changed it (the version on screen). */
  updatedAt: number;
}

export const useShared = create<SharedState>(() => ({ token: tokenFromUrl(), status: 'loading', name: '', updatedAt: 0 }));

/** True while the studio shows a shared project (read outside React). */
export const isViewOnly = (): boolean => !!useShared.getState().token;
/** True while the studio shows a shared project. */
export const useViewOnly = (): boolean => useShared((s) => !!s.token);
