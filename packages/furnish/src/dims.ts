// Plan-space sizes (mm) that both the furniture placement and the plan
// drawing rely on: the plot fence and the rails along outdoor edges narrow
// the usable floor. `@opensu/plan` draws with these same values.
export const planDims = {
  /** Plot fence thickness as drawn on the plan. */
  fence: 140,
  /** Parapet thickness along outdoor edges. */
  parapet: 120,
  /** Rails stand this far inside the outdoor edge line. */
  railInset: 50,
  /** Glass balustrade thickness. */
  glassRail: 50,
} as const;
