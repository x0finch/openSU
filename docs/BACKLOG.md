# Backlog

Accepted findings that are not scheduled yet. Lead maintains this file.

## Model schema (do before the AI milestone)
- Opening offsets are measured from the space's overall extent, so editing a
  space's cells silently moves its openings. Anchor openings to the hosting
  edge instead (edge named by its bounding grid lines; offset from that
  edge's start, or `center`).
- `host: { space, side }` is ambiguous when a space has several edges on
  that side (L-shaped rooms). The explicit edge reference above fixes it.
- Cross-level coupling is implicit (stair spaces must align; `spanLevels`
  windows use the wall above). Make validation messages name the other level
  and consider a house-level `stairs` element spanning levels.
- Cascading errors: after `space-overlap`, suppress follow-on errors caused
  by the same overlap ("spans 0 wall segments").
- `outdoor-only` warning has no test.

## Golden sample fidelity
- Carport should extend to the east fence (x 9530-14830 on the drawing).
- Entrance pier / wall between planter and porch (x 11200-11580).
- Canopy over the ground-floor courtyard door on the west side.
- Stair spaces are used differently on the ground floor and above.

## Schema proposals from the kernel task (decide before the AI milestone)
- Corner windows wrapping two faces.
- Canopy voids and off-grid canopies.
- Surface material for outdoor spaces (deck / paving / gravel / lawn).
- Explicit eave / knee-wall height for attic levels (level height currently
  means two things).
- Explicit placement of fence openings and entrance pier.

## Process
- Parallel implementers must not share a working tree (a shared git index
  caused cross-commits once). Use isolated worktrees and let the lead merge.

## Web app (from task 005 review)
- Phone layout: the bottom sheet takes half the screen and the drawing is
  small; default the sheet to a collapsed height.
- The Worker bundle contains the lazy three.js chunk; keep viewer code out
  of the server bundle.
- View-rail icons need tooltips; landing hero should be a real render of
  our own (non-reference) house.
- `packages/render` demo: OrbitControls re-aims the camera before
  `focusPoint()` is read (two-line reorder in `demo/main.ts`).
- Kernel runs on the main thread (~200 ms); move to a worker if it grows.

## Model, after task 009 (resolved: opening anchoring, ambiguous hosts,
## cascading errors, cross-level messages)
Still error-prone for an LLM author:
- Exterior walls split where the outdoor space beyond changes; an opening
  must fit one segment of what is physically one wall.
- Copying a level collides with multi-level windows (manual fix needed).
- Stair flights are implicit; gates, skylights, entourage use absolute mm.
- Attic level height doubles as eave height.
- Ids cannot be renamed; `openTo` is one-sided; new rooms get no roof
  automatically (only warnings).
- `describeHouse(golden)` is ~8.9k characters; measure real token counts
  when the AI is connected and trim if needed.
