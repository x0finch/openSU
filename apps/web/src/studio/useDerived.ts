import { useEffect, useState } from 'react';
import { clearSaved, savedHouse } from '../lib/autosave';
import { useStudio } from '../lib/store';
import { isViewOnly } from '../lib/view-only';
import type { Derived } from './house-data';

type HouseData = typeof import('./house-data');
let mod: Promise<HouseData> | null = null;
export const loadHouseData = () => (mod ??= import.meta.env.SSR ? new Promise<HouseData>(() => {}) : import('./house-data'));

/**
 * Loads the model chunk, puts the sample house into the store (once) and
 * returns what the UI derives from it.
 */
export function useDerived(): Derived | null {
  const house = useStudio((s) => s.house);
  const [derived, setDerived] = useState<Derived | null>(null);
  useEffect(() => {
    let alive = true;
    void loadHouseData().then((m) => {
      if (!alive) return;
      const h = useStudio.getState().house;
      if (!h) {
        // A shared project (task 028) is put on screen by its loader (src/lib/share.ts), nothing else.
        if (isViewOnly()) return;
        // The autosaved house when there is one that still resolves, else the template.
        const saved = savedHouse();
        let ok = false;
        if (saved) {
          try {
            m.derive(saved);
            ok = true;
          } catch {
            clearSaved();
          }
        }
        useStudio.getState().setHouse(ok && saved ? saved : m.loadSample());
      } else setDerived(m.derive(h));
    });
    return () => {
      alive = false;
    };
  }, [house]);
  return derived;
}
