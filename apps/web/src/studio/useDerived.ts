import { useEffect, useState } from 'react';
import { useStudio } from '../lib/store';
import type { Derived } from './house-data';

type HouseData = typeof import('./house-data');
let mod: Promise<HouseData> | null = null;
export const loadHouseData = () => (mod ??= import('./house-data'));

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
      if (!h) useStudio.getState().setHouse(m.loadSample());
      else setDerived(m.derive(h));
    });
    return () => {
      alive = false;
    };
  }, [house]);
  return derived;
}
