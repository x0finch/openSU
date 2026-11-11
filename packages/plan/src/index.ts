// Public API of @opensu/plan: presentation floor plans as SVG strings.
export { renderPlan, renderPlanDetailed, type PlanOptions, type PlanReport } from './render';
export { checkPlan, type Overlap } from './check';
export { analyseLevel, type LevelPlan, type SpaceInfo, type OpeningInfo, type StairInfo } from '@opensu/furnish';
export { furnishLevel, footprint, isSolid, type FurnitureKind, type Placement } from '@opensu/furnish';
export { chainPositions } from './draw/dims';
export type { TextBox } from './draw/labels';
export * as tokens from './tokens';
