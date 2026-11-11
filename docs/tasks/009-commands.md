# Task 009 - Edit commands and schema hardening (`packages/model`)

## Goal
Make the model safe and convenient for an LLM to edit, before any AI is
connected: (1) fix the schema hazards found in review, (2) add a command
layer with atomic apply + validation + rollback, (3) a compact text
description of a house for LLM context. No AI calls in this task.

## Part A - schema hardening
1. Openings are anchored to a concrete edge. Replace the ambiguous host:
   `host: { space, side, span?: { from: gridId, to: gridId } }`
   - `span` names the stretch of that side between two grid lines (lines
     perpendicular to the side). Offsets in `at` are measured from the
     start of that span (west or south end); `center` centres on it.
   - `span` may be omitted only when the space has exactly one edge on that
     side; otherwise validation returns `ambiguous-host` listing the
     available spans.
   - `{ between: [a, b], span? }` works the same way for shared walls.
   - Editing a space's cells must not silently move openings whose span is
     unchanged; if the span no longer exists on that side the opening
     becomes an error naming the opening and the valid spans.
2. Cross-level clarity: validation messages for stair alignment and
   `spanLevels` name both levels and the fix.
3. No cascading noise: when spaces overlap, report the overlap and suppress
   follow-on errors caused by it.
4. Add the missing test for the `outdoor-only` warning.
5. Migrate the golden sample. `resolve(golden)` must produce exactly the
   same resolved output as before the migration (commit a snapshot test
   that proves it), so kernel, plan and sheet output do not change.

## Part B - commands
`applyCommands(house, commands) -> { house, issues, applied }`
- Pure and atomic: all commands apply to a copy; then `validate`. If any
  issue has severity `error`, return the ORIGINAL house plus the issues
  (rollback). Warnings do not block.
- Commands (plain JSON, zod schemas, discriminated on `op`):
  - grid: `add_grid_line`, `move_grid_line` (the main way to resize:
    everything on the line follows), `remove_grid_line` (error if
    referenced).
  - levels: `add_level`, `remove_level`, `update_level`.
  - spaces: `add_space`, `update_space`, `remove_space` (removes its
    openings and stairs, reported in `applied`).
  - openings: `add_opening`, `update_opening`, `remove_opening`.
  - stairs: `add_stair`, `remove_stair`.
  - roofs: `add_roof`, `update_roof`, `remove_roof`.
  - site and style: `update_site`, `set_style`, `rename_house`.
- Ids: caller may supply ids; otherwise generated deterministically
  (readable, e.g. `l2-bedroom-3`). Unknown ids produce errors that list the
  nearest valid ids.
- `commandsJsonSchema()` exports JSON Schema for all commands, suitable as
  LLM tool input schemas (one tool `edit_house` taking `commands[]`), with
  field descriptions written for an LLM author.
- `History` helper: snapshot-based undo/redo with a bounded stack.

## Part C - description for LLM context
`describeHouse(house) -> string`: compact, deterministic plain text (not
JSON): site, grid lines with ids and positions, then per level a table of
spaces (id, name, type, cells as grid ranges, size in m, area) and
openings (id, kind, host with span, position, size), stairs, roofs, and
current validation issues. Target: the golden sample in under ~2,500
tokens (report the character count). An LLM reading only this text must be
able to write correct commands.

## Part D - scripted edit scenarios (no AI)
Tests that apply realistic edit sequences to the golden sample and assert
the result validates and resolves:
- "widen the living room by 600 mm" (move a grid line),
- "add a bedroom with a window on level 2" in free cells,
- "move the kitchen window 300 mm east",
- "turn the study into a bedroom with an ensuite" (split with a new grid
  line, add door),
- "add a third full storey" (copy level 2 layout),
- a deliberately bad batch (bedroom without window + door wider than wall)
  rolls back and returns actionable errors.
For two of the scenarios also render the plan PNG and the 3D shot and
check them visually (copy to the scratchpad path in your brief).

## Acceptance criteria
- Build, typecheck, tests pass in the whole workspace; golden resolved
  snapshot identical; `pnpm shots` output unchanged within noise.
- Every command has tests for success and for at least one failure.
- Error messages are specific and actionable (ids, numbers, valid options).
- README documents the commands and the description format.
- No dependency on three.js or the DOM.

## Process
Work only in `packages/model` (plus tests/fixtures). Commit locally in your
worktree, do not push. Report: API summary, describeHouse length, the edit
scenarios' results, and anything about the schema that still seems
error-prone for an LLM.
