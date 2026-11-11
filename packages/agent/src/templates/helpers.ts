// Small helpers for writing template command scripts. The scripts are plain
// `edit_house` commands (the same ones the assistant sends).
import type { CellRect } from '@opensu/model';

/** A cell rectangle between two X and two Y grid lines (ids). */
export const c = (x0: string, x1: string, y0: string, y1: string): CellRect => ({ x0, x1, y0, y1 });
/** Offset from the west / south end of an edge or span. */
export const start = (offset: number) => ({ from: 'start' as const, offset });
/** Offset from the east / north end of an edge or span. */
export const end = (offset: number) => ({ from: 'end' as const, offset });
/** The stretch of a boundary between two grid lines. */
export const span = (from: string, to: string) => ({ from, to });

/** `add_grid_line` commands for a list of [id, position] pairs. */
export const gridLines = (axis: 'x' | 'y', lines: readonly (readonly [string, number])[]) =>
  lines.map(([id, pos]) => ({ op: 'add_grid_line', axis, id, pos }));
