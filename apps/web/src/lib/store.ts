// Studio state. The house model is the single source of truth: everything
// drawn is derived from it (model -> resolve -> kernel -> render / plan).
import type { House } from '@opensu/model';
import { create } from 'zustand';
import type { Lang } from './i18n';
import { DEFAULT_VIEW, presetById, type ViewId } from './views';

export type Mode = '3d' | 'plan' | 'sheet';

/** Date presets of the sun study. */
export type SunDateId = 'winter' | 'spring' | 'summer' | 'autumn' | 'today';
export const SUN_DATES: SunDateId[] = ['winter', 'spring', 'summer', 'autumn', 'today'];

export interface SunState {
  /** Physical sun (sun study) instead of presentation lighting. */
  on: boolean;
  dateId: SunDateId;
  /** Local clock time, minutes after midnight. */
  minutes: number;
  /** Sweeping the day. */
  playing: boolean;
}

/** What the 3D engine reports for the current date and time. */
export interface SunInfo {
  date: string;
  sunrise: number;
  sunset: number;
  /** Time actually used (clamped to daylight). */
  minutes: number;
  /** True compass bearing and elevation of the sun, degrees. */
  azimuth: number;
  elevation: number;
}

export interface StudioState {
  lang: Lang;
  mode: Mode;
  view: ViewId;
  /** Bumped to re-apply the current view (reset after orbiting). */
  viewNonce: number;
  /** Plan level. */
  level: string | null;
  /** Level cutaway of the 3D view (null = whole house). */
  cut: string | null;
  sun: SunState;
  sunInfo: SunInfo | null;
  chatOpen: boolean;
  sheetOpen: boolean;
  house: House | null;
  setLang: (lang: Lang) => void;
  setMode: (mode: Mode) => void;
  setView: (view: ViewId) => void;
  resetView: () => void;
  setLevel: (level: string) => void;
  setCut: (level: string | null) => void;
  setSun: (patch: Partial<SunState>) => void;
  setSunInfo: (info: SunInfo | null) => void;
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

/** Cutaways are seen from an axonometric; other views show the whole house. */
const isAxo = (id: ViewId) => presetById(id).kind === 'axo';

export const useStudio = create<StudioState>((set) => ({
  lang: 'zh',
  mode: '3d',
  view: DEFAULT_VIEW,
  viewNonce: 0,
  level: null,
  cut: null,
  sun: { on: false, dateId: 'winter', minutes: 10 * 60, playing: false },
  sunInfo: null,
  chatOpen: false,
  // Phones start with the drawing large and the controls collapsed.
  sheetOpen: false,
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
  setView: (view) => set((s) => ({ view, viewNonce: s.viewNonce + 1, cut: isAxo(view) ? s.cut : null })),
  resetView: () => set((s) => ({ viewNonce: s.viewNonce + 1 })),
  setLevel: (level) => set({ level }),
  setCut: (cut) => set((s) => (cut && !isAxo(s.view) ? { cut, view: DEFAULT_VIEW, viewNonce: s.viewNonce + 1 } : { cut })),
  setSun: (patch) => set((s) => ({ sun: { ...s.sun, ...patch } })),
  setSunInfo: (sunInfo) => set({ sunInfo }),
  setChatOpen: (chatOpen) => set({ chatOpen }),
  setSheetOpen: (sheetOpen) => set({ sheetOpen }),
  setHouse: (house) => set((s) => ({ house, level: s.level ?? house.levels[0]?.id ?? null })),
}));

/** Applies a stored language preference after hydration. */
export function restoreLang(): void {
  const l = storedLang();
  if (l && l !== useStudio.getState().lang) useStudio.getState().setLang(l);
}
