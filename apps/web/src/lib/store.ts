// Studio state. The house model is the single source of truth: everything
// drawn is derived from it (model -> resolve -> kernel -> render / plan).
import type { House } from '@opensu/model';
import { create } from 'zustand';
import type { Lang } from './i18n';
import { DEFAULT_VIEW, presetById, type ViewId } from './views';

const isAxo = (id: ViewId) => presetById(id).kind === 'axo';

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
  /** The user has orbited / zoomed / panned away from the preset. */
  viewMoved: boolean;
  /** Plan level. */
  level: string | null;
  /** Level cutaway of the 3D view (null = whole house). */
  cut: string | null;
  sun: SunState;
  sunInfo: SunInfo | null;
  /** First-person walk through the 3D view. */
  walk: boolean;
  chatOpen: boolean;
  sheetOpen: boolean;
  house: House | null;
  /** How the 3D view should show the next house change (set with `setHouse`). */
  grow: GrowHint | null;
  setLang: (lang: Lang) => void;
  setMode: (mode: Mode) => void;
  setView: (view: ViewId) => void;
  resetView: () => void;
  setViewMoved: (moved: boolean) => void;
  setLevel: (level: string) => void;
  setCut: (level: string | null) => void;
  setSun: (patch: Partial<SunState>) => void;
  setSunInfo: (info: SunInfo | null) => void;
  setWalk: (on: boolean) => void;
  setChatOpen: (open: boolean) => void;
  setSheetOpen: (open: boolean) => void;
  /** Replaces the house; `grow` asks the 3D view to play the grow transition. */
  setHouse: (house: House, grow?: Omit<GrowHint, 'nonce'>) => void;
}

/** A requested grow transition: levels from `fromLevel` up rise in sequence. */
export interface GrowHint {
  fromLevel: number;
  nonce: number;
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
  viewMoved: false,
  level: null,
  cut: null,
  sun: { on: false, dateId: 'winter', minutes: 10 * 60, playing: false },
  sunInfo: null,
  walk: false,
  chatOpen: false,
  // Phones start with the drawing large and the controls collapsed.
  sheetOpen: false,
  house: null,
  grow: null,
  setLang: (lang) => {
    try {
      globalThis.localStorage?.setItem(LANG_KEY, lang);
    } catch {
      /* private mode: keep it in memory only */
    }
    if (typeof document !== 'undefined') document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    set({ lang });
  },
  setMode: (mode) => set(mode === '3d' ? { mode } : { mode, walk: false }),
  // The cutaway choice survives a change of view (eye level and elevations
  // show the whole house and the dock marks the cut as paused; see `shownCut`).
  setView: (view) => set((s) => ({ view, viewNonce: s.viewNonce + 1, viewMoved: false, walk: false })),
  resetView: () => set((s) => ({ viewNonce: s.viewNonce + 1, viewMoved: false, walk: false })),
  setViewMoved: (viewMoved) => set({ viewMoved }),
  setLevel: (level) => set({ level }),
  // Choosing a cut from an eye-level view or an elevation goes to the axonometric, where cuts show.
  setCut: (cut) => set((s) => (cut && !isAxo(s.view) ? { cut, view: DEFAULT_VIEW, viewNonce: s.viewNonce + 1, viewMoved: false, walk: false } : { cut, walk: false })),
  setSun: (patch) => set((s) => ({ sun: { ...s.sun, ...patch } })),
  setSunInfo: (sunInfo) => set({ sunInfo }),
  // Walking and the assistant panel take turns: entering walk mode tucks the chat away.
  // Entering walk also folds the phone sheet away, so the room fills the screen.
  setWalk: (walk) => set(walk ? { walk, mode: '3d', chatOpen: false, sheetOpen: false } : { walk }),
  setChatOpen: (chatOpen) => set(chatOpen ? { chatOpen, walk: false } : { chatOpen }),
  setSheetOpen: (sheetOpen) => set({ sheetOpen }),
  setHouse: (house, grow) =>
    set((s) => ({
      house,
      level: s.level && house.levels.some((l) => l.id === s.level) ? s.level : house.levels[0]?.id ?? null,
      cut: s.cut && !house.levels.some((l) => l.id === s.cut) ? null : s.cut,
      grow: grow ? { ...grow, nonce: (s.grow?.nonce ?? 0) + 1 } : s.grow,
    })),
}));

/** Applies a stored language preference after hydration. */
export function restoreLang(): void {
  const l = storedLang();
  if (l && l !== useStudio.getState().lang) useStudio.getState().setLang(l);
}
