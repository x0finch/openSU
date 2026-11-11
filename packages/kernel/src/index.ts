// Public API of @opensu/kernel: ResolvedHouse -> HouseGeometry (plain data).
export { buildHouse, buildHouseDetailed, type BuildDetails, type BuildOptions } from './build';
export type {
  EntourageKind, EntouragePlacement, FurnitureBox, HouseGeometry, LevelSpan, MaterialSlot, Part, PartRole, PlanRect, SiteInfo, WalkBlocker, WalkData,
  WalkSurface,
} from './types';
export * as kernelConstants from './constants';
