// Public API of @opensu/model.
export * from './schema';
export type { Issue, IssueWhere, Severity } from './issues';
export { hasErrors } from './issues';
export {
  resolve,
  type ResolvedHouse, type ResolvedLevel, type ResolvedSpace, type ResolvedWall,
  type ResolvedEdge, type ResolvedOpening, type ResolvedStair, type ResolvedRoof,
  type SlabOpening, type Orient,
} from './resolve';
export type { Point } from './grid';
export { validate } from './validate';
export * from './constants';
export { debugSvg } from './debug-svg';
export { golden } from './samples/golden';
export { applyCommands, nearestIds, type ApplyResult, type AppliedCommand } from './commands';
export {
  Command, COMMAND_OPS, EditHouseInput, EDIT_HOUSE_DESCRIPTION, commandsJsonSchema, editHouseTool,
  type CommandOp,
} from './command-schema';
export { History } from './history';
export { describeHouse } from './describe';
