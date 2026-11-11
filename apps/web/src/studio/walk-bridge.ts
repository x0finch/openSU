// Connects the walk HUD to the lazily loaded 3D engine without importing it
// (three.js stays in its own chunk). The viewer attaches the engine; the HUD
// listens to the walker and sends joystick input and level jumps.
import { useEffect, useState } from 'react';
import type { WalkState } from '@opensu/render';
import type { Engine } from './engine';

type Listener = (s: WalkState | null) => void;

class WalkBridge {
  private engine: Engine | null = null;
  private off: (() => void) | null = null;
  private readonly listeners = new Set<Listener>();
  private last: WalkState | null = null;

  attach(e: Engine | null): void {
    this.off?.();
    this.off = null;
    this.engine = e;
    if (e) this.off = e.onWalk((s) => this.emit(s));
    else this.emit(null);
  }

  private emit(s: WalkState | null): void {
    this.last = s;
    for (const l of this.listeners) l(s);
  }

  /** Current walker state (null when not walking). */
  get state(): WalkState | null {
    return this.last;
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  move(forward: number, strafe: number): void {
    this.engine?.walkMove(forward, strafe);
  }

  toLevel(id: string): void {
    this.engine?.walkToLevel(id);
  }
}

export const walkBridge = new WalkBridge();

/** The walker's level (re-renders only when it changes). */
export function useWalkLevel(): string | null {
  const [level, setLevel] = useState<string | null>(() => walkBridge.state?.level ?? null);
  useEffect(() => walkBridge.subscribe((s) => setLevel(s?.level ?? null)), []);
  return level;
}
