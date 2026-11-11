// Public API of @opensu/kernel: ResolvedHouse -> HouseGeometry (plain data).
export { buildHouse, buildHouseDetailed, type BuildDetails, type BuildOptions } from './build';
export type {
  EntourageKind, EntouragePlacement, HouseGeometry, LevelSpan, MaterialSlot, Part, PartRole, SiteInfo,
} from './types';
export * as kernelConstants from './constants';
