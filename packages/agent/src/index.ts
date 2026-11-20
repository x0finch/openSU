// Public API of @opensu/agent: the house-design assistant (prompt, tools,
// turn controller) and the built-in starting points. No DOM; the network is
// whatever adapter the caller passes in.
export { SYSTEM_PROMPT, houseContext } from './prompt';
export { createHouseTools, editHouseInputSchema, type AppliedBatch, type FindPlace, type PlaceMatch, type ToolHooks } from './tools';
export {
  HouseSession, runTurn, pastMessages, userContent, classifyError, summaryFromArgs, MAX_REPAIRS, HISTORY_TURNS,
  type AgentEvent, type PastTurn, type TurnError, type TurnImage, type TurnOptions, type TurnResult, type TurnStatus,
} from './turn';
export { describeDiff } from './diff';
export { createRelayAdapter, DEFAULT_MODEL, type RelayOptions } from './provider';
export {
  blankHouse, starterHouse, STARTER_COMMANDS, DEFAULT_TEMPLATE, TEMPLATES, TEMPLATE_IDS, TEMPLATE_META, templateHouse, isTemplateId,
  type BlankOptions, type Template, type TemplateId, type TemplateMeta,
} from './starter';
