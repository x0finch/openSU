export type Severity = 'error' | 'warning';

export interface IssueWhere {
  level?: string;
  space?: string;
  opening?: string;
  stair?: string;
  roof?: string;
  gate?: string;
  /** Index of the command in an `applyCommands` batch that caused it. */
  command?: number;
  /** Path into the authored JSON, e.g. ["levels", 0, "spaces", 2, "cells", 0]. */
  path?: (string | number)[];
}

export interface Issue {
  /** Stable machine-readable rule id, e.g. "space-overlap". */
  code: string;
  severity: Severity;
  /** Written so an LLM can act on it: what is wrong and how to fix it. */
  message: string;
  where: IssueWhere;
}

export function hasErrors(issues: readonly Issue[]): boolean {
  return issues.some((i) => i.severity === 'error');
}
