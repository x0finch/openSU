// Snapshot-based undo / redo. Houses are treated as immutable values
// (`applyCommands` never mutates its input), so a snapshot is a reference.
import { applyCommands, type ApplyResult } from './commands';
import type { House } from './schema';

export class History {
  private past: House[] = [];
  private future: House[] = [];
  private now: House;

  /** @param limit maximum number of undo steps kept (oldest dropped first). */
  constructor(initial: House, readonly limit = 100) {
    if (!(limit >= 1)) throw new RangeError('History limit must be at least 1.');
    this.now = initial;
  }

  get current(): House { return this.now; }
  get canUndo(): boolean { return this.past.length > 0; }
  get canRedo(): boolean { return this.future.length > 0; }
  get undoDepth(): number { return this.past.length; }
  get redoDepth(): number { return this.future.length; }

  /** Record a new state (e.g. a successful edit). Clears redo. */
  push(house: House): void {
    if (house === this.now) return;
    this.past.push(this.now);
    if (this.past.length > this.limit) this.past.splice(0, this.past.length - this.limit);
    this.future = [];
    this.now = house;
  }

  /** Apply a command batch to the current state; on success the new state is pushed. */
  apply(commands: readonly unknown[]): ApplyResult {
    const r = applyCommands(this.now, commands);
    if (r.ok) this.push(r.house);
    return r;
  }

  /** Step back; returns the restored state, or null when there is nothing to undo. */
  undo(): House | null {
    const prev = this.past.pop();
    if (!prev) return null;
    this.future.push(this.now);
    this.now = prev;
    return prev;
  }

  /** Step forward again; null when there is nothing to redo. */
  redo(): House | null {
    const next = this.future.pop();
    if (!next) return null;
    this.past.push(this.now);
    this.now = next;
    return next;
  }
}
