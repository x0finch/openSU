// Studio state. The house model is the single source of truth: everything
// drawn is derived from it (model -> resolve -> kernel -> render / plan).
import type { House } from '@opensu/model';
import { create } from 'zustand';
import type { Lang } from './i18n';
import { DEFAULT_VIEW, type ViewId } from './views';

export type Mode = '3d' | 'plan';

export interface StudioState {
  lang: Lang;
  mode: Mode;
  view: ViewId;
  /** Bumped to re-apply the current view (reset after orbiting). */
  viewNonce: number;
  level: string | null;
  chatOpen: boolean;
  sheetOpen: boolean;
  house: House | null;
  setLang: (lang: Lang) => void;
  setMode: (mode: Mode) => void;
  setView: (view: ViewId) => void;
  resetView: () => void;
  setLevel: (level: string) => void;
  setChatOpen: (open: boolean) => void;
  setSheetOpen: (open: boolean) => void;
  setHouse: (house: House) => void;
}

const LANG_KEY = 'opensu.lang';

function storedLang(): Lang | null {
  try {
    const v = globalThis.localStorage?.getItem(LANG_KEY);
    return v === 'en' || v === 'zh' ? v : null;
  } catch {
    return null;
  }
}

export const useStudio = create<StudioState>((set) => ({
  lang: 'zh',
  mode: '3d',
  view: DEFAULT_VIEW,
  viewNonce: 0,
  level: null,
  chatOpen: false,
  sheetOpen: true,
  house: null,
  setLang: (lang) => {
    try {
      globalThis.localStorage?.setItem(LANG_KEY, lang);
    } catch {
      /* private mode: keep it in memory only */
    }
    if (typeof document !== 'undefined') document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    set({ lang });
  },
  setMode: (mode) => set({ mode }),
  setView: (view) => set((s) => ({ view, viewNonce: s.viewNonce + 1 })),
  resetView: () => set((s) => ({ viewNonce: s.viewNonce + 1 })),
  setLevel: (level) => set({ level }),
  setChatOpen: (chatOpen) => set({ chatOpen }),
  setSheetOpen: (sheetOpen) => set({ sheetOpen }),
  setHouse: (house) => set((s) => ({ house, level: s.level ?? house.levels[0]?.id ?? null })),
}));

/** Applies a stored language preference after hydration. */
export function restoreLang(): void {
  const l = storedLang();
  if (l && l !== useStudio.getState().lang) useStudio.getState().setLang(l);
}
